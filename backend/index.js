const express = require('express');
const bodyParser = require('body-parser');
const dotenv = require('dotenv');
const fs = require('fs');
const path = require('path');
const { Expo } = require('expo-server-sdk');

dotenv.config();

const app = express();
app.use(bodyParser.json());

const tmpTokensPath = path.join(__dirname, 'tokens.json');
let expo = new Expo();

// Load tokens
const getTokens = () => {
  if (fs.existsSync(tmpTokensPath)) {
    try {
      return JSON.parse(fs.readFileSync(tmpTokensPath, 'utf8'));
    } catch(e) {
      return {};
    }
  }
  return {};
};

const saveTokens = (data) => {
  fs.writeFileSync(tmpTokensPath, JSON.stringify(data, null, 2), 'utf8');
};

// Root endpoint
app.get('/', (req, res) => {
  res.send(`<h2>iGmailVoice Endpoint is Online.</h2>`);
});

// Endpoint for the mobile app to register its push token
app.post('/api/register-token', (req, res) => {
  const { email, token } = req.body;
  if (!email || !token) {
    return res.status(400).send('Email and Expo push token are required');
  }
  if (!Expo.isExpoPushToken(token)) {
    return res.status(400).send('Invalid Expo push token');
  }

  const db = getTokens();
  db[email] = token; // Stores {"email": "token"}
  saveTokens(db);
  
  console.log(`Registered Push Token for ${email}`);
  res.status(200).send({ success: true });
});

// Webhook endpoint for Gmail Pub/Sub Push
app.post('/webhook', async (req, res) => {
  try {
    const message = req.body.message;
    if (!message) return res.status(400).send('No message provided');

    const dataString = Buffer.from(message.data, 'base64').toString('utf-8');
    const data = JSON.parse(dataString);

    console.log('Received Gmail webhook for email:', data.emailAddress, 'HistoryId:', data.historyId);
    
    // Always acknowledge Gmail Webhook immediately to prevent retries
    res.status(200).send('OK');

    // Get the push token mapped to this user's email address
    const db = getTokens();
    const pushToken = db[data.emailAddress];

    if (!pushToken) {
      console.log(`No Push token found for ${data.emailAddress}. Aborting push.`);
      return;
    }

    // Prepare push notification payload
    let messages = [{
      to: pushToken,
      sound: 'default',
      title: 'Nuevo correo detectado',
      body: 'Recuperando contenido...',
      data: {
        type: 'GMAIL_NEW_MESSAGE',
        emailAddress: data.emailAddress,
        historyId: data.historyId
      },
      priority: 'high'
    }];

    let chunks = expo.chunkPushNotifications(messages);
    for (let chunk of chunks) {
      try {
        let ticketChunk = await expo.sendPushNotificationsAsync(chunk);
        console.log("Expo Push sent successfully:", ticketChunk);
      } catch (error) {
        console.error("Error sending Expo chunk:", error);
      }
    }
  } catch (error) {
    console.error('Error processing webhook:', error);
    if (!res.headersSent) res.status(500).send('Internal Server Error');
  }
});

if (process.env.NODE_ENV !== 'production') {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Gmail Webhook Server listening on port ${PORT}`);
  });
}

module.exports = app;
