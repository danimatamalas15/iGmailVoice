import React, { useState, useEffect, useRef } from 'react';
import { View, FlatList, StyleSheet, RefreshControl } from 'react-native';
import { Appbar, List, Avatar, FAB, useTheme, Button, Text } from 'react-native-paper';
import { AuthService } from '../services/AuthService';
import { GmailService, EmailData } from '../services/GmailService';
import * as Notifications from 'expo-notifications';
import { NotificationsService } from '../services/NotificationsService';
import { GoogleSignin } from '@react-native-google-signin/google-signin';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

export function HomeScreen({ navigation }: any) {
  const [emails, setEmails] = useState<EmailData[]>([]);
  const [loading, setLoading] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const theme = useTheme();

  const isAgentActive = useRef<boolean>(false);

  const handleLogin = async () => {
    const t = await AuthService.signIn();
    if (t) {
      setToken(t);
      loadEmails(t);
    }
  };

  const loadEmails = async (currentToken: string | null = token) => {
    if (!currentToken) return;
    setLoading(true);
    try {
      // Activar la suscripción Push en la API de Gmail
      await GmailService.startWatch(currentToken);

      const client = await (GmailService as any).getClient(currentToken);
      const res = await client.get('/messages?maxResults=10&labelIds=INBOX');
      const messages = res.data.messages || [];

      const detailedEmails = [];
      for (const msg of messages) {
        const details = await GmailService.getMessage(currentToken, msg.id);
        if (details) detailedEmails.push(details);
      }
      setEmails(detailedEmails);

      // Registrar para Push Notifications si tenemos el email
      try {
        const user = await GoogleSignin.getCurrentUser();
        const email = user?.user.email;
        if (email) {
          const pushToken = await NotificationsService.registerForPushNotificationsAsync();
          if (pushToken) {
            await NotificationsService.sendTokenToBackend(email, pushToken);
          }
        }
      } catch (e) {
        console.warn("Could not register push token", e);
      }
    } catch (e) {
      console.error('Failed to load emails', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    AuthService.checkExistingLogin().then(t => {
      setToken(t);
      if (t) loadEmails(t);
    });
  }, []);

  // Foreground Push Notification Listener
  useEffect(() => {
    if (!token) return;

    const notificationListener = Notifications.addNotificationReceivedListener(async (notification) => {
      // Check if it's our new email push
      const data = notification.request.content.data;
      if (data?.type === 'GMAIL_NEW_MESSAGE' && data?.historyId) {
        if (isAgentActive.current) return;
        
        try {
          // Fetch exact newest email from Gmail
          const client = await (GmailService as any).getClient(token);
          const res = await client.get('/messages?maxResults=1&labelIds=INBOX');
          const messages = res.data.messages || [];
          
          if (messages.length > 0) {
            isAgentActive.current = true;
            const newEmailDetails = await GmailService.getMessage(token, messages[0].id);
            if (newEmailDetails) {
              loadEmails(token);
              const { VoiceAgent } = await import('../services/VoiceAgent');
              await VoiceAgent.handleIncomingEmail(token, newEmailDetails);
            }
            isAgentActive.current = false;
          }
        } catch (e) {
          console.warn('Push processing failed', e);
          isAgentActive.current = false;
        }
      }
    });

    return () => {
      notificationListener.remove();
    };
  }, [token]);

  if (!token) {
    return (
      <View style={styles.centerContainer}>
        <Text variant="titleLarge" style={styles.title}>iGmailVoice</Text>
        <Text variant="bodyMedium" style={{marginBottom: 30, textAlign: 'center'}}>Inicia sesión para conceder acceso a tu Gmail.</Text>
        <Button mode="contained" onPress={handleLogin} icon="google">Login con Google</Button>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Appbar.Header style={{ backgroundColor: theme.colors.surface }}>
        <Appbar.Content title="Bandeja de Entrada" />
        <Appbar.Action icon="cog" onPress={() => navigation.navigate('Settings')} />
      </Appbar.Header>

      <FlatList
        data={emails}
        keyExtractor={item => item.id}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={loadEmails} />}
        renderItem={({ item }) => (
          <List.Item
            title={item.subject}
            description={item.snippet}
            left={props => <Avatar.Text {...props} label={item.from.charAt(0).toUpperCase()} size={40} />}
            onPress={() => console.log('Tapped', item.id)}
            titleNumberOfLines={1}
            descriptionNumberOfLines={2}
          />
        )}
      />

      <FAB
        style={[styles.fab, { backgroundColor: theme.colors.primaryContainer }]}
        icon="microphone"
        onPress={async () => {
          // Manual trigger for Mode 2 or manual test
          if (emails.length > 0 && !isAgentActive.current) {
              isAgentActive.current = true;
              const { VoiceAgent } = await import('../services/VoiceAgent');
              await VoiceAgent.handleIncomingEmail(token, emails[0]);
              isAgentActive.current = false;
          }
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  centerContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 },
  title: { marginBottom: 10, fontWeight: 'bold' },
  fab: { position: 'absolute', margin: 16, right: 0, bottom: 0 },
});
