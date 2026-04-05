import React, { useState, useEffect } from 'react';
import { View, StyleSheet } from 'react-native';
import { Appbar, Switch, List, Text, useTheme } from 'react-native-paper';
import AsyncStorage from '@react-native-async-storage/async-storage';

export function SettingsScreen({ navigation }: any) {
  const [isMode1, setIsMode1] = useState(true);
  const theme = useTheme();

  useEffect(() => {
    (async () => {
      const mode = await AsyncStorage.getItem('app_mode');
      if (mode === '2') setIsMode1(false);
    })();
  }, []);

  const toggleSwitch = async () => {
    const newMode = !isMode1;
    setIsMode1(newMode);
    await AsyncStorage.setItem('app_mode', newMode ? '1' : '2');
  };

  return (
    <View style={styles.container}>
      <Appbar.Header style={{ backgroundColor: theme.colors.surface }}>
        <Appbar.BackAction onPress={() => navigation.goBack()} />
        <Appbar.Content title="Configuración de Voz" />
      </Appbar.Header>

      <List.Section>
        <List.Subheader>Modo de Comportamiento del Asistente</List.Subheader>
        <List.Item
          title="Modo 1: Escucha Inmediata"
          description="Al recibir un correo, el asistente te avisará y preguntará al instante."
          left={props => <List.Icon {...props} icon="ear-hearing" />}
          right={() => <Switch value={isMode1} onValueChange={toggleSwitch} />}
        />
        <List.Item
          title="Modo 2: Bajo Demanda (On-Demand)"
          description="Los correos se acumulan y los escuchas solo cuando tú lo solicitas."
          left={props => <List.Icon {...props} icon="hand-pointing-up" />}
          right={() => <Switch value={!isMode1} onValueChange={toggleSwitch} />}
        />
      </List.Section>

      <View style={styles.infoBox}>
        <Text variant="bodyMedium" style={{ color: 'gray', textAlign: 'center' }}>
          La aplicación utiliza la API de OpenAI Whisper para procesar el IDIOMA automáticamente.
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  infoBox: {
    padding: 20,
    marginTop: 40,
  }
});
