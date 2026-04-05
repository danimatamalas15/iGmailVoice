import 'react-native-gesture-handler';
import React, { useEffect } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { Provider as PaperProvider } from 'react-native-paper';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import messaging from '@react-native-firebase/messaging';

import { HomeScreen } from './src/screens/HomeScreen';
import { SettingsScreen } from './src/screens/SettingsScreen';
import { MessagingHandler } from './src/background/MessagingHandler';

const Stack = createNativeStackNavigator();

// Registrar el manejador background tempranamente fuera del ciclo de vida de React
// (Esto usualmente se pone en index.js, pero en Expo blank App.tsx servirá)
messaging().setBackgroundMessageHandler(async remoteMessage => {
  console.log('Background message received', remoteMessage);
  // Re-imported because App.tsx might be initialized without VoiceAgent
  const { MessagingHandler } = await import('./src/background/MessagingHandler');
  (MessagingHandler as any).handlePush(remoteMessage);
});

export default function App() {
  useEffect(() => {
    // Inicialización del handler de notificaciones para cuando la app inicia
    MessagingHandler.setup();
  }, []);

  return (
    <SafeAreaProvider>
      <PaperProvider>
        <NavigationContainer>
          <Stack.Navigator initialRouteName="Home" screenOptions={{ headerShown: false }}>
            <Stack.Screen name="Home" component={HomeScreen} />
            <Stack.Screen name="Settings" component={SettingsScreen} />
          </Stack.Navigator>
        </NavigationContainer>
      </PaperProvider>
    </SafeAreaProvider>
  );
}
