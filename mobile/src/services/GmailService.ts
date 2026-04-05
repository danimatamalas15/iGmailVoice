import axios from 'axios';

export interface EmailData {
  id: string;
  threadId: string;
  historyId: string;
  snippet: string;
  subject: string;
  from: string;
  bodyText: string;
}

export class GmailService {
  static BASE_URL = 'https://gmail.googleapis.com/gmail/v1/users/me';

  /**
   * Helper request object pre-configured with Access Token
   */
  private static async getClient(token: string) {
    return axios.create({
      baseURL: this.BASE_URL,
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    });
  }

  /**
   * Fetch full details of an email by ID
   */
  static async getMessage(token: string, messageId: string): Promise<EmailData | null> {
    try {
      const client = await this.getClient(token);
      const res = await client.get(`/messages/${messageId}?format=full`);
      const payload = res.data.payload;

      let subject = 'Sin asunto';
      let from = 'Desconocido';

      const headers = payload.headers;
      if (headers) {
        const subjectHeader = headers.find((h: any) => h.name.toLowerCase() === 'subject');
        const fromHeader = headers.find((h: any) => h.name.toLowerCase() === 'from');
        if (subjectHeader) subject = subjectHeader.value;
        if (fromHeader) from = fromHeader.value;
      }

      // Extract body
      let bodyText = '';
      if (payload.parts) {
        // Try to find plain text body part
        const textPart = payload.parts.find((p: any) => p.mimeType === 'text/plain');
        if (textPart && textPart.body && textPart.body.data) {
          bodyText = this.decodeBase64UrlSafe(textPart.body.data);
        } else {
          // If no plaintext part, find html part and strip tags (rough fallback)
          const htmlPart = payload.parts.find((p: any) => p.mimeType === 'text/html');
          if (htmlPart && htmlPart.body && htmlPart.body.data) {
            const htmlText = this.decodeBase64UrlSafe(htmlPart.body.data);
            bodyText = htmlText.replace(/<[^>]*>?/gm, ''); // Strip html tags
          }
        }
      } else if (payload.body && payload.body.data) {
        bodyText = this.decodeBase64UrlSafe(payload.body.data);
        if (payload.mimeType === 'text/html') {
          bodyText = bodyText.replace(/<[^>]*>?/gm, '');
        }
      }

      bodyText = bodyText.trim() === '' ? res.data.snippet : bodyText;

      return {
        id: res.data.id,
        threadId: res.data.threadId,
        historyId: res.data.historyId,
        snippet: res.data.snippet,
        subject,
        from,
        bodyText
      };
    } catch (error) {
      console.error('Error fetching message details:', error);
      return null;
    }
  }

  /**
   * Envía un email. Para responder se debe incluir In-Reply-To y References.
   */
  static async sendReply(token: string, to: string, subject: string, replyText: string, threadId?: string, messageIdToReply?: string): Promise<boolean> {
    try {
      const client = await this.getClient(token);
      
      const emailLines = [];
      emailLines.push(`To: ${to}`);
      emailLines.push('Content-Type: text/plain; charset=utf-8');
      emailLines.push('MIME-Version: 1.0');
      emailLines.push(`Subject: ${subject.startsWith('Re:') ? subject : 'Re: ' + subject}`);
      
      if (messageIdToReply) {
        emailLines.push(`In-Reply-To: ${messageIdToReply}`);
        emailLines.push(`References: ${messageIdToReply}`);
      }
      
      emailLines.push('');
      emailLines.push(replyText);

      const email = emailLines.join('\r\n');
      const base64EncodedEmail = btoa(unescape(encodeURIComponent(email)))
                                .replace(/\+/g, '-')
                                .replace(/\//g, '_')
                                .replace(/=+$/, '');
      
      const res = await client.post('/messages/send', {
        raw: base64EncodedEmail,
        threadId: threadId,
      });
      return !!res.data.id;
    } catch (error) {
      console.error('Error sending reply:', error);
      return false;
    }
  }

  /**
   * Marca como leído
   */
  static async markAsRead(token: string, messageId: string): Promise<boolean> {
    try {
      const client = await this.getClient(token);
      await client.post(`/messages/${messageId}/modify`, {
        removeLabelIds: ['UNREAD']
      });
      return true;
    } catch (error) {
      console.error('Error marking as read:', error);
      return false;
    }
  }

  /**
   * Mueve a la papelera
   */
  static async trashMessage(token: string, messageId: string): Promise<boolean> {
    try {
      const client = await this.getClient(token);
      await client.post(`/messages/${messageId}/trash`);
      return true;
    } catch (error) {
      console.error('Error trashing message:', error);
      return false;
    }
  }

  /**
   * Registra el buzón para enviar notificaciones push a nuestro topic de Pub/Sub
   */
  static async startWatch(token: string): Promise<boolean> {
    try {
      const client = await this.getClient(token);
      const res = await client.post('/watch', {
        labelIds: ['INBOX'],
        labelFilterAction: 'include',
        topicName: 'projects/project-4b1c8225-1b94-4007-831/topics/gmail-push-topic'
      });
      console.log('Watch response:', res.data);
      return !!res.data.historyId;
    } catch (error) {
      console.error('Error starting Gmail watch:', error);
      return false;
    }
  }

  /**
   * Base64UrlSafe Decoder Helper
   */
  private static decodeBase64UrlSafe(data: string) {
    const base64 = data.replace(/-/g, '+').replace(/_/g, '/');
    try {
      return decodeURIComponent(escape(atob(base64))); // basic latin conversion
    } catch (e) {
      // polyfill for RN if needed
      return base64; // In pure RN you'd use a buffer or native base64 decoder
    }
  }
}
