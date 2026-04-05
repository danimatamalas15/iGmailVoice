import messaging from '@react-native-firebase/messaging';
import { VoiceAgent } from '../services/VoiceAgent';
import { AuthService } from '../services/AuthService';
import { GmailService } from '../services/GmailService';
import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Configure Firebase Cloud Messaging to receive push notifications
 * Wakes up the app and delegates to VoiceAgent.
 */
export class MessagingHandler {
  static async setup() {
    // Solicitar permisos nativos (IOS req, Android >=13)
    const authStatus = await messaging().requestPermission();
    const enabled =
      authStatus === messaging.AuthorizationStatus.AUTHORIZED ||
      authStatus === messaging.AuthorizationStatus.PROVISIONAL;

    if (enabled) {
      console.log('Authorization status:', authStatus);
      // Suscribir al backend a través de temas o recolectar token FCM
      await messaging().subscribeToTopic('new_emails');
      console.log('Subscribed to "new_emails" topic');

      // Escuchador en Background / App Cerrada
      messaging().setBackgroundMessageHandler(async remoteMessage => {
        console.log('Message handled in the background!', remoteMessage);
        await this.handlePush(remoteMessage);
      });

      // Escuchador cuando la App está abierta o en Foreground
      messaging().onMessage(async remoteMessage => {
        console.log('Message arrived in foreground', remoteMessage);
        await this.handlePush(remoteMessage);
      });
    }
  }

  /**
   * Lógica interna cuando llega un push desde la Cloud Function
   */
  private static async handlePush(remoteMessage: any) {
    try {
      const mode = await AsyncStorage.getItem('app_mode') || '1'; // Default: Mode 1 (Inmediato)
      
      if (mode === '2') {
        console.log('El usuario está en Modo 2 (On-demand). No se lee automáticamente.');
        return;
      }

      // 1. Obtener Token
      const token = await AuthService.getLocalAccessToken();
      if (!token) {
        console.log('No Google Access Token found, cannot process mail');
        return;
      }

      // 2. Extraer datos del payload del Push (historyId p. ej.)
      // Para efectos de prototipo, haremos fetch del último mensaje de correo.
      // Ya que el push de Pub/Sub notifica de cambios, llamamos a list messages.
      const client = await (GmailService as any).getClient(token);
      const res = await client.get('/messages?maxResults=1&labelIds=INBOX');
      if (res.data.messages && res.data.messages.length > 0) {
        const messageId = res.data.messages[0].id;
        const emailData = await GmailService.getMessage(token, messageId);

        if (emailData) {
           // 3. Ejecutar agente conversacional
           await VoiceAgent.handleIncomingEmail(token, emailData);
        }
      }
    } catch (e) {
      console.error('Error handling Background Push', e);
    }
  }
}
