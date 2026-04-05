import {
  GoogleSignin,
  statusCodes,
} from '@react-native-google-signin/google-signin';
import AsyncStorage from '@react-native-async-storage/async-storage';

const WEB_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID || 'dummy_client_id_for_typechecking';
const SCOPES = ['https://mail.google.com/']; 
const ASYNC_STORAGE_TOKEN_KEY = 'gmail_access_token';

// Configure Google Sign in
GoogleSignin.configure({
  webClientId: WEB_CLIENT_ID, // client ID of type WEB for your server
  offlineAccess: true, // if you want to access Google API on behalf of the user FROM YOUR SERVER
  forceCodeForRefreshToken: true, // [Android] related to `serverAuthCode`, read the docs link below *.
  scopes: SCOPES,
});

export class AuthService {
  /**
   * Verifica si hay un token válido guardado o intenta obtenerlo por Sign In Silencioso
   */
  static async checkExistingLogin(): Promise<string | null> {
    try {
      const isSignedIn = await GoogleSignin.hasPreviousSignIn();
      if (isSignedIn) {
        const currentUser = await GoogleSignin.getCurrentUser();
        if (currentUser) {
          const tokens = await GoogleSignin.getTokens();
          await AsyncStorage.setItem(ASYNC_STORAGE_TOKEN_KEY, tokens.accessToken);
          return tokens.accessToken;
        }
      }
      return null;
    } catch (error) {
      console.error('Error checking existing login', error);
      return null;
    }
  }

  /**
   * Inicia el flujo de autenticación de Google con intervención del usuario
   */
  static async signIn(): Promise<string | null> {
    try {
      await GoogleSignin.hasPlayServices();
      const userInfo = await GoogleSignin.signIn();
      const tokens = await GoogleSignin.getTokens();
      
      if (tokens.accessToken) {
        await AsyncStorage.setItem(ASYNC_STORAGE_TOKEN_KEY, tokens.accessToken);
        return tokens.accessToken;
      }
      return null;
    } catch (error: any) {
      if (error.code === statusCodes.SIGN_IN_CANCELLED) {
        console.log('User cancelled sign in');
      } else if (error.code === statusCodes.IN_PROGRESS) {
        console.log('Sign in already in progress');
      } else if (error.code === statusCodes.PLAY_SERVICES_NOT_AVAILABLE) {
        console.log('Play services not available');
      } else {
        console.error('Sign in error', error);
      }
      return null;
    }
  }

  /**
   * Realiza un logout de Google
   */
  static async signOut(): Promise<void> {
    try {
      await GoogleSignin.signOut();
      await AsyncStorage.removeItem(ASYNC_STORAGE_TOKEN_KEY);
    } catch (error) {
      console.error('Error signing out', error);
    }
  }

  /**
   * Devuelve el último token de acceso guardado localmente
   */
  static async getLocalAccessToken(): Promise<string | null> {
    return await AsyncStorage.getItem(ASYNC_STORAGE_TOKEN_KEY);
  }
}
