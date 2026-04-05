import * as Print from 'expo-print';
import * as FileSystem from 'expo-file-system';
import { Share, Platform } from 'react-native';
import { EmailData } from '../services/GmailService';

export class PdfExporter {
  /**
   * Generates a PDF of the email and the sent reply, and saves it to device's Downloads or via Share dialog
   */
  static async exportEmailAndReply(email: EmailData, replyText: string): Promise<boolean> {
    try {
      // 1. Prepare HTML Content
      const htmlContent = `
        <html>
          <body style="font-family: Arial, sans-serif; padding: 20px;">
            <h2>Registro de Correo iGmailVoice</h2>
            <hr/>
            <p><strong>De (Remitente):</strong> ${email.from}</p>
            <p><strong>Asunto:</strong> ${email.subject}</p>
            <p><strong>Cuerpo:</strong></p>
            <div style="background-color: #f1f1f1; padding: 10px; border-radius: 5px;">
              ${email.bodyText.replace(/\n/g, '<br/>')}
            </div>
            
            <h3 style="color: green; margin-top: 30px;">Tu Respuesta:</h3>
            <div style="background-color: #e8f5e9; padding: 10px; border-radius: 5px; border-left: 4px solid green;">
              ${replyText.replace(/\n/g, '<br/>')}
            </div>
            <hr/>
            <p style="font-size: 10px; color: gray;">Generado automáticamente por iGmailVoice</p>
          </body>
        </html>
      `;

      // 2. Generate PDF File
      const { uri } = await Print.printToFileAsync({
        html: htmlContent,
        base64: false
      });

      // 3. Format Filename: [email_destinatario]_[asunto]_[ddmmaa]_[hh:mm].pdf
      const now = new Date();
      const ddmmaa = \`\${String(now.getDate()).padStart(2, '0')}\${String(now.getMonth()+1).padStart(2, '0')}\${String(now.getFullYear()).slice(2)}\`;
      const hhmm = \`\${String(now.getHours()).padStart(2, '0')}-\${String(now.getMinutes()).padStart(2, '0')}\`; // Cannot use ':' in filename
      
      const emailMatch = email.from.match(/<([^>]+)>/);
      const emailPlain = emailMatch ? emailMatch[1] : email.from;
      const safeEmail = emailPlain.replace(/[^a-zA-Z0-9@.-]/g, '_');
      const safeSubject = email.subject.substring(0, 15).replace(/[^a-zA-Z0-9]/g, '_');

      const fileName = \`\${safeEmail}_\${safeSubject}_\${ddmmaa}_\${hhmm}.pdf\`;

      // 4. Save to Downloads
      if (Platform.OS === 'android') {
        const permissions = await FileSystem.StorageAccessFramework.requestDirectoryPermissionsAsync();
        if (permissions.granted) {
          try {
            // We use StorageAccessFramework to save cleanly to external storage
            const destUri = await FileSystem.StorageAccessFramework.createFileAsync(
              permissions.directoryUri,
              fileName,
              'application/pdf'
            );
            // Copy file by reading binary
            const base64Data = await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 });
            await FileSystem.writeAsStringAsync(destUri, base64Data, { encoding: FileSystem.EncodingType.Base64 });
            return true;
          } catch (e) {
            console.error('SAF Write error', e);
            // Fallback to sharing
            await Share.share({ url: uri, title: fileName });
          }
        } else {
             // Fallback
             await Share.share({ url: uri, title: fileName });
        }
      } else {
        // iOS: We use sharing dialog directly as direct access to Downloads is restricted without explicit user 'Save to Files' interaction
        await Share.share({
          url: uri,
          title: fileName
        });
      }

      return true;
    } catch (error) {
      console.error('Error generating PDF:', error);
      return false;
    }
  }
}
