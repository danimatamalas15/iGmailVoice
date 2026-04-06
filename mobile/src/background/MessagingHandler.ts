// import messaging from '@react-native-firebase/messaging';
import { VoiceAgent } from '../services/VoiceAgent';
import { AuthService } from '../services/AuthService';
import { GmailService } from '../services/GmailService';
import AsyncStorage from '@react-native-async-storage/async-storage';

export class MessagingHandler {
  static async setup() {
    console.log('Firebase Cloud Messaging temporariamente desactivado para prebenir Developer_Error en Sign-In');
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
