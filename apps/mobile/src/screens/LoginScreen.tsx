import React, { useState } from 'react';
import { StyleSheet, View, Text, TextInput, TouchableOpacity, Alert } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { api } from '../services/api';

export default function LoginScreen({ navigation }: any) {
  const [email, setEmail] = useState('driver@ambulane.emergency');
  const [password, setPassword] = useState('password123');

  const handleLogin = async () => {
    try {
      const res = await api.login(email, password);
      await SecureStore.setItemAsync('auth_token', res.token);
      if (res.user.role === 'AMBULANCE_DRIVER') {
        navigation.replace('Ambulance');
      } else {
        navigation.replace('NormalUser');
      }
    } catch (e: any) {
      Alert.alert('Login Failed', e.message);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.logo}>🚑 AMBULANE</Text>
      <Text style={styles.subtitle}>Emergency Mobility Network Mobile Client</Text>

      <View style={styles.form}>
        <TextInput
          style={styles.input}
          placeholder="Email address"
          placeholderTextColor="#94a3b8"
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
        />
        <TextInput
          style={styles.input}
          placeholder="Password"
          placeholderTextColor="#94a3b8"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
        />

        <TouchableOpacity style={styles.loginBtn} onPress={handleLogin}>
          <Text style={styles.loginBtnText}>SIGN IN</Text>
        </TouchableOpacity>

        <View style={styles.quickRoles}>
          <Text style={styles.quickText}>Quick Login:</Text>
          <TouchableOpacity onPress={() => { setEmail('driver@ambulane.emergency'); setPassword('password123'); }}>
            <Text style={styles.quickLink}>Ambulance Driver</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => { setEmail('driver_a@user.test'); setPassword('password123'); }}>
            <Text style={styles.quickLink}>Normal Driver</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#020617', padding: 24, justifyContent: 'center' },
  logo: { fontSize: 28, fontWeight: '900', color: '#fff', textAlign: 'center' },
  subtitle: { fontSize: 13, color: '#94a3b8', textAlign: 'center', marginTop: 4, marginBottom: 32 },
  form: { backgroundColor: '#0f172a', padding: 20, borderRadius: 20, borderWidth: 1, borderColor: '#1e293b' },
  input: { backgroundColor: '#1e293b', color: '#fff', padding: 14, borderRadius: 12, marginBottom: 12 },
  loginBtn: { backgroundColor: '#e11d48', paddingVertical: 16, borderRadius: 12, alignItems: 'center', marginTop: 4 },
  loginBtnText: { color: '#fff', fontWeight: 'bold', letterSpacing: 1 },
  quickRoles: { marginTop: 16, flexDirection: 'row', justifyContent: 'space-around', alignItems: 'center' },
  quickText: { color: '#64748b', fontSize: 11 },
  quickLink: { color: '#38bdf8', fontSize: 12, fontWeight: 'bold' }
});
