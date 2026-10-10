import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { StatusBar } from 'expo-status-bar';
import LoginScreen from './src/screens/LoginScreen';
import AmbulanceScreen from './src/screens/AmbulanceScreen';
import NormalUserScreen from './src/screens/NormalUserScreen';

const Stack = createNativeStackNavigator();

export default function App() {
  return (
    <NavigationContainer>
      <StatusBar style="light" />
      <Stack.Navigator
        initialRouteName="Login"
        screenOptions={{
          headerStyle: { backgroundColor: '#0f172a' },
          headerTintColor: '#fff',
          headerTitleStyle: { fontWeight: 'bold' }
        }}
      >
        <Stack.Screen name="Login" component={LoginScreen} options={{ headerShown: false }} />
        <Stack.Screen
          name="Ambulance"
          component={AmbulanceScreen}
          options={{ title: 'Ambulance Responder HUD' }}
        />
        <Stack.Screen
          name="NormalUser"
          component={NormalUserScreen}
          options={{ title: 'Connected Driver Navigation' }}
        />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
