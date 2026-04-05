import { AudioServices } from './AudioServices';
import { GmailService, EmailData } from './GmailService';
import { PdfExporter } from '../utils/PdfExporter';

export class VoiceAgent {
  /**
   * Orchestrates the entire hands-free flow for a newly received email (Modo 1).
   */
  static async handleIncomingEmail(token: string, email: EmailData): Promise<void> {
    const senderName = email.from.split('<')[0].trim() || email.from;

    // --- Paso A: Notificación y Pregunta Inicial ---
    await AudioServices.speak(`CORREO RECIBIDO DE ${senderName}. ¿QUIERES ESCUCHAR EL CORREO?`);
    
    let userIntent = await this.listenAndDetectIntent();

    if (userIntent === 'TIMEOUT' || userIntent === 'NO') {
      await AudioServices.speak("CORREO RECIBIDO. SI QUIERES ESCUCHARLO AHORA.");
      const retryIntent = await this.listenAndDetectIntent();
      if (retryIntent === 'TIMEOUT' || retryIntent === 'NO') {
        await AudioServices.speak("EL CORREO QUEDA PENDIENTE DE PROCESAR.");
        return; 
      } else if (retryIntent === 'YES') {
        userIntent = 'YES';
      } else {
        await AudioServices.speak("EL CORREO QUEDA PENDIENTE DE PROCESAR.");
        return;
      }
    }

    if (userIntent !== 'YES') return;

    // --- Paso B: Lectura de Correo ---
    const readScript = `
      REMITENTE: ${senderName}.
      ASUNTO: ${email.subject}.
      CONTENIDO: ${email.bodyText.substring(0, 1000)} // Limitar si es muy largo
    `;
    await AudioServices.speak(readScript);

    // --- Paso C: Confirmar Respuesta ---
    await AudioServices.speak("¿QUIERES RESPONDER EL EMAIL?");
    const wantsToReply = await this.listenAndDetectIntent();
    
    let hasSentReply = false;

    if (wantsToReply === 'YES') {
      // --- Paso D: Dictar, Confirmar y Enviar Respuesta ---
      await AudioServices.speak("A CONTINUACIÓN, DI EN VOZ ALTA TU RESPUESTA.");
      
      let finalReplyText = '';
      let confirmed = false;

      while (!confirmed) {
        const dictatedText = await this.listenAndTranscribe();
        if (!dictatedText || dictatedText.trim() === '') {
           await AudioServices.speak("NO HE ESCUCHADO BIEN, REPITE TU RESPUESTA.");
           continue;
        }

        // Generate context-aware reply
        const polishedReply = await AudioServices.analyzeIntentOrGenerateReply(dictatedText, email.bodyText, 'reply');

        await AudioServices.speak(`ESTA ES TU RESPUESTA: ${polishedReply}. ¿ES CORRECTO?`);
        const confirmIntent = await this.listenAndDetectIntent();

        if (confirmIntent === 'YES') {
          confirmed = true;
          finalReplyText = polishedReply;
        } else {
          await AudioServices.speak("Eliminando el texto previo. REPITE TU RESPUESTA.");
        }
      }

      // Send the email using Gmail API
      const success = await GmailService.sendReply(
        token, 
        email.from, 
        email.subject, 
        finalReplyText, 
        email.threadId, 
        email.id
      );

      if (success) {
        await AudioServices.speak("CORREO ENVIADO.");
        hasSentReply = true;
      } else {
        await AudioServices.speak("HUBO UN ERROR AL ENVIAR EL CORREO.");
      }
    } else {
      await AudioServices.speak("PERFECTO, QUEDA PENDIENTE DE RESPUESTA.");
    }

    // --- Paso E: Exportación a PDF ---
    if (hasSentReply) {
      await AudioServices.speak("¿QUIERES QUE IMPRIMA EL EMAIL ENVIADO?");
      const wantsToPdf = await this.listenAndDetectIntent();
      if (wantsToPdf === 'YES') {
         await PdfExporter.exportEmailAndReply(email, "Respuesta enviada (placeholder)"); // TODO: pass actual reply text 
         await AudioServices.speak("GUARDADO EN DESCARGAS.");
      } else {
         await AudioServices.speak("GRACIAS.");
      }
    }

    // --- Paso F: Limpieza ---
    await AudioServices.speak("FINALMENTE, ¿QUIERES MARCAR EL MENSAJE COMO LEÍDO O ELIMINAR EL CORREO?");
    const cleanupIntent = await this.listenAndDetectIntent();
    
    if (cleanupIntent === 'READ') {
      await GmailService.markAsRead(token, email.id);
      await AudioServices.speak("MARCADO COMO LEÍDO. FIN DE LA INTERACCIÓN.");
    } else if (cleanupIntent === 'DELETE') {
      await GmailService.trashMessage(token, email.id);
      await AudioServices.speak("CORREO ELIMINADO. FIN DE LA INTERACCIÓN.");
    } else {
      await AudioServices.speak("IGNORANDO ACCIÓN DE LIMPIEZA. FIN DE LA INTERACCIÓN.");
    }
  }

  /**
   * Helper function: Listen for 5 seconds max and return intent
   */
  private static async listenAndDetectIntent(timeoutMs = 3000): Promise<'YES' | 'NO' | 'DELETE' | 'READ' | 'TIMEOUT' | 'UNKNOWN'> {
    const recording = await AudioServices.startRecording();
    if (!recording) return 'UNKNOWN';

    // Wait for the timeout or a silence detector.
    // Simplifying: we record for `timeoutMs` + 1000.
    // In a real scenario we use expo-av meter levels to stop early on silence.
    return new Promise((resolve) => {
      setTimeout(async () => {
        const uri = await AudioServices.stopRecording(recording);
        if (uri) {
          const transcribed = await AudioServices.transcribeAudio(uri);
          if (transcribed.trim() === '') return resolve('TIMEOUT');
          const intent = await AudioServices.analyzeIntentOrGenerateReply(transcribed, undefined, 'intent');
          resolve(intent as any);
        } else {
          resolve('UNKNOWN');
        }
      }, timeoutMs);
    });
  }

  /**
   * Helper function: Listen and return raw text
   */
  private static async listenAndTranscribe(timeoutMs = 6000): Promise<string> {
    const recording = await AudioServices.startRecording();
    if (!recording) return '';

    return new Promise((resolve) => {
      setTimeout(async () => {
        const uri = await AudioServices.stopRecording(recording);
        if (uri) {
          const transcribed = await AudioServices.transcribeAudio(uri);
          resolve(transcribed);
        } else {
          resolve('');
        }
      }, timeoutMs);
    });
  }
}
