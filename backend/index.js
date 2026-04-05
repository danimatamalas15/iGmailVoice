const express = require('express');
const bodyParser = require('body-parser');
const admin = require('firebase-admin');
const dotenv = require('dotenv');

dotenv.config();

// Initialize Firebase Admin (Requires serviceAccountKey.json if in prod, 
// but for local dev with application default credentials or just mock for now)
try {
  // admin.initializeApp({ credential: admin.credential.cert(require('./serviceAccountKey.json')) });
  console.log("Firebase admin initializing (dummy without credentials for now, needs setup for real FCM)");
} catch (e) {
  console.error("Firebase admin initialization failed:", e);
}

const app = express();
app.use(bodyParser.json());

// Webhook endpoint for Gmail Pub/Sub Push
app.post('/webhook', async (req, res) => {
  try {
    const message = req.body.message;
    if (!message) {
      return res.status(400).send('No message provided');
    }

    // Gmail Pub/Sub encodes data in base64
    const dataBuffer = Buffer.from(message.data, 'base64');
    const dataString = dataBuffer.toString('utf-8');
    const data = JSON.parse(dataString);

    console.log('Received Gmail webhook for email:', data.emailAddress, 'HistoryId:', data.historyId);

    // Enviar Push Silente a FCM
    const payload = {
      topic: 'new_emails',
      data: {
        type: 'GMAIL_NEW_MESSAGE',
        emailAddress: data.emailAddress,
        historyId: data.historyId.toString()
      }
    };

    /*
    // Uncomment once Firebase Admin is configured
    await admin.messaging().send(payload);
    console.log('FCM Push sent successfully');
    */
   
    console.log('[MOCK] FCM Push sent to topic "new_emails"');

    // Acknowledge the message (200 OK)
    res.status(200).send('OK');
  } catch (error) {
    console.error('Error processing webhook:', error);
    res.status(500).send('Internal Server Error');
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Gmail Webhook Server listening on port ${PORT}`);
});
