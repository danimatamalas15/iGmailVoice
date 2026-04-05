import React, { useState, useEffect } from 'react';
import { View, FlatList, StyleSheet, RefreshControl } from 'react-native';
import { Appbar, List, Avatar, FAB, useTheme, Button, Text } from 'react-native-paper';
import { AuthService } from '../services/AuthService';
import { GmailService, EmailData } from '../services/GmailService';

export function HomeScreen({ navigation }: any) {
  const [emails, setEmails] = useState<EmailData[]>([]);
  const [loading, setLoading] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const theme = useTheme();

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
        onPress={() => {
          // Manual trigger for Mode 2 or manual test
          if (emails.length > 0) {
              import('../services/VoiceAgent').then(module => {
                  module.VoiceAgent.handleIncomingEmail(token, emails[0]);
              });
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
