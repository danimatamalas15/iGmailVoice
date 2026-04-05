import axios from 'axios';
import { Audio } from 'expo-av';

const OPENAI_API_KEY = process.env.EXPO_PUBLIC_OPENAI_API_KEY || '';
const ELEVENLABS_API_KEY = process.env.EXPO_PUBLIC_ELEVENLABS_API_KEY || '';

export class AudioServices {
  /**
   * Transcribe audio file using OpenAI Whisper
   * @param fileUri Local URI of the audio file recorded
   */
  static async transcribeAudio(fileUri: string): Promise<string> {
    try {
      const formData = new FormData();
      formData.append('file', {
        uri: fileUri,
        type: 'audio/m4a', // Make sure to match the recording format
        name: 'audio.m4a',
      } as any);
      formData.append('model', 'whisper-1');

      const response = await axios.post('https://api.openai.com/v1/audio/transcriptions', formData, {
        headers: {
          'Authorization': `Bearer ${OPENAI_API_KEY}`,
          'Content-Type': 'multipart/form-data',
        },
      });

      return response.data.text.trim();
    } catch (error) {
      console.error('Error in Whisper transcription:', error);
      return '';
    }
  }

  /**
   * LLM Intent Parser and Response Generator
   * Uses OpenAI GPT to understand yes/no/delete etc and translate context based on original email lang.
   */
  static async analyzeIntentOrGenerateReply(prompt: string, context?: string, mode: 'intent' | 'reply' = 'intent'): Promise<string> {
    try {
      let systemInstruction = "Eres el cerebro de iGmailVoice. El usuario te habla. Responde textualmente.";
      
      if (mode === 'intent') {
        systemInstruction = `
          Clasifica la intención del usuario. 
          Opciones permitidas (DEBES RESPONDER EXCLUSIVAMENTE CON UNA DE ESTAS PALABRAS): 
          "YES", "NO", "DELETE", "READ", "UNKNOWN". 
          Ejemplos: "sí" -> YES, "por supuesto" -> YES, "marcar como leído" -> READ, "borrar" -> DELETE.
        `;
      } else if (mode === 'reply') {
        systemInstruction = `
          El usuario te acaba de dictar una respuesta a un correo. 
          Genera el texto final educado en el MISMO IDIOMA en que está el CORREO ORIGINAL.
          Por ejemplo, si el correo original es en francés y el usuario dictó en español, traduce al francés y dale tono formal/natural.
          Correo original de contexto: "${context}".
          Solo devuelve la respuesta final a enviar, sin comillas adicionales.
        `;
      }

      const response = await axios.post('https://api.openai.com/v1/chat/completions', {
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemInstruction },
          { role: 'user', content: prompt }
        ],
        temperature: 0.2,
      }, {
        headers: {
          'Authorization': `Bearer ${OPENAI_API_KEY}`,
          'Content-Type': 'application/json'
        }
      });

      return response.data.choices[0].message.content.trim();
    } catch (error) {
      console.error('Error calling LLM:', error);
      return mode === 'intent' ? 'UNKNOWN' : '';
    }
  }

  /**
   * Generates Text-to-Speech audio and plays it immediately via expo-av
   */
  static async speak(text: string): Promise<void> {
    return new Promise(async (resolve, reject) => {
      try {
        // Implementation with ElevenLabs using default voice ID
        const voiceId = "21m00Tcm4TlvDq8ikWAM"; // Rachel dummy ID
        
        const response = await axios.post(
          `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}?output_format=mp3_44100_128`,
          {
            text: text,
            model_id: "eleven_multilingual_v2"
          },
          {
            headers: {
              'xi-api-key': ELEVENLABS_API_KEY,
              'Content-Type': 'application/json',
              'Accept': 'audio/mpeg'
            },
            responseType: 'arraybuffer' // We need binary data for Audio playback
          }
        );

        // Save binary data to a temporary file in FileSystem to play it
        const FileSystem = (await import('expo-file-system')).default;
        const fileUri = FileSystem.cacheDirectory + 'tts_temp.mp3';
        
        // base64 encode the response
        const base64Audio = btoa(new Uint8Array(response.data).reduce((data, byte) => data + String.fromCharCode(byte), ''));
        
        await FileSystem.writeAsStringAsync(fileUri, base64Audio, { encoding: FileSystem.EncodingType.Base64 });

        const { sound } = await Audio.Sound.createAsync(
          { uri: fileUri },
          { shouldPlay: true }
        );

        sound.setOnPlaybackStatusUpdate((status) => {
          if (status.isLoaded && status.didJustFinish) {
            sound.unloadAsync();
            resolve();
          }
        });

      } catch (error) {
        console.error('Error generating/playing TTS:', error);
        resolve(); // resolve anyway so standard flow continues
      }
    });
  }

  /**
   * Starts recording audio
   */
  static async startRecording(): Promise<Audio.Recording | null> {
    try {
      await Audio.requestPermissionsAsync();
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
      });

      const { recording } = await Audio.Recording.createAsync(Audio.RecordingOptionsPresets.HIGH_QUALITY);
      return recording;
    } catch (err) {
      console.error('Failed to start recording', err);
      return null;
    }
  }

  /**
   * Stop recording and get URI
   */
  static async stopRecording(recording: Audio.Recording): Promise<string | null> {
    try {
      await recording.stopAndUnloadAsync();
      await Audio.setAudioModeAsync({ allowsRecordingIOS: false });
      return recording.getURI();
    } catch (error) {
      console.error('Error stopping recording:', error);
      return null;
    }
  }
}
