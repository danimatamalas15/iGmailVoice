import React, { useState, useEffect, useRef } from 'react';
import { View, FlatList, StyleSheet, RefreshControl } from 'react-native';
import { Appbar, List, Card, Avatar, FAB, useTheme, Button, Text } from 'react-native-paper';
import { AuthService } from '../services/AuthService';
import { GmailService, EmailData } from '../services/GmailService';

export function HomeScreen({ navigation }: any) {
  const [emails, setEmails] = useState<EmailData[]>([]);
  const [loading, setLoading] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const theme = useTheme();

  // Polling trackers
  const lastSeenMessageId = useRef<string | null>(null);
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
      await GmailService.startWatch(currentToken);

      const client = await (GmailService as any).getClient(currentToken);
      const res = await client.get('/messages?maxResults=10&labelIds=INBOX');
      const messages = res.data.messages || [];

      if (messages.length > 0) {
        const latestMsgId = messages[0].id;
        if (lastSeenMessageId.current && lastSeenMessageId.current !== latestMsgId) {
          // Detectado en carga manual, lanzamos Asistente
          if (!isAgentActive.current) {
            isAgentActive.current = true;
            const newEmailDetails = await GmailService.getMessage(currentToken, latestMsgId);
            if (newEmailDetails) {
              const { VoiceAgent } = await import('../services/VoiceAgent');
              await VoiceAgent.handleIncomingEmail(currentToken, newEmailDetails);
            }
            isAgentActive.current = false;
          }
        }
        lastSeenMessageId.current = latestMsgId;
      }

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

  // Foreground Polling Effect (Reverted from Expo Notifications)
  useEffect(() => {
    if (!token) return;

    const pollNewEmails = async () => {
      if (isAgentActive.current) return;
      
      try {
        const client = await (GmailService as any).getClient(token);
        // maxResults=1 gets the absolute latest email in the INBOX
        const res = await client.get('/messages?maxResults=1&labelIds=INBOX');
        const messages = res.data.messages || [];
        
        if (messages.length > 0) {
          const latestMsgId = messages[0].id;
          
          if (lastSeenMessageId.current && lastSeenMessageId.current !== latestMsgId) {
            // New email arrived!
            isAgentActive.current = true;
            lastSeenMessageId.current = latestMsgId;
            
            const newEmailDetails = await GmailService.getMessage(token, latestMsgId);
            if (newEmailDetails) {
              // Reload visual list silently
              loadEmails(token);
              // Trigger Assistant directly! "Notificaciones directas y preguntas"
              const { VoiceAgent } = await import('../services/VoiceAgent');
              await VoiceAgent.handleIncomingEmail(token, newEmailDetails);
            }
            isAgentActive.current = false;
          } else if (!lastSeenMessageId.current) {
             // In case it wasn't populated yet
             lastSeenMessageId.current = latestMsgId;
          }
        }
      } catch (e) {
        console.warn('Polling check failed', e);
        isAgentActive.current = false; // Release lock on error
      }
    };

    const intervalId = setInterval(pollNewEmails, 15000); // Check exactly every 15s
    
    return () => clearInterval(intervalId);
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
        contentContainerStyle={{ padding: 10, paddingBottom: 80 }}
        renderItem={({ item }) => (
          <Card 
            style={styles.emailCard} 
            mode="elevated" 
            elevation={2}
            onPress={async () => {
              if (!isAgentActive.current) {
                  isAgentActive.current = true;
                  const { VoiceAgent } = await import('../services/VoiceAgent');
                  await VoiceAgent.handleIncomingEmail(token, item);
                  isAgentActive.current = false;
              }
            }}
          >
            <Card.Title
              title={item.from.split('<')[0].trim() || item.from}
              titleStyle={{ fontWeight: 'bold' }}
              subtitle={item.subject}
              subtitleStyle={{ fontWeight: 'bold', color: theme.colors.primary }}
              left={props => <Avatar.Text {...props} label={item.from.charAt(0).toUpperCase()} size={40} />}
            />
            <Card.Content>
              <Text numberOfLines={4} style={{ color: '#444' }}>{item.snippet}</Text>
            </Card.Content>
          </Card>
        )}
      />

      <FAB
        style={[styles.fab, { backgroundColor: theme.colors.primaryContainer }]}
        icon="microphone"
        onPress={async () => {
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
  container: { flex: 1, backgroundColor: '#f9f9f9' },
  centerContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 },
  title: { marginBottom: 10, fontWeight: 'bold' },
  fab: { position: 'absolute', margin: 16, right: 0, bottom: 0 },
  emailCard: { marginBottom: 15, backgroundColor: '#ffffff' },
});
