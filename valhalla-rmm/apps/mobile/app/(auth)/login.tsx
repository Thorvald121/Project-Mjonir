import { useState } from 'react'
import {
  View, Text, TextInput, TouchableOpacity,
  KeyboardAvoidingView, Platform, ScrollView, ActivityIndicator,
} from 'react-native'
import { router } from 'expo-router'
import * as LocalAuthentication from 'expo-local-authentication'
import { supabase } from '../../lib/supabase'

export default function LoginScreen() {
  const [email,    setEmail]    = useState('')
  const [password, setPassword] = useState('')
  const [loading,  setLoading]  = useState(false)
  const [error,    setError]    = useState<string | null>(null)

  const handleLogin = async () => {
    if (!email || !password) {
      setError('Please enter your email and password.')
      return
    }
    setLoading(true)
    setError(null)

    const { error } = await supabase.auth.signInWithPassword({ email, password })

    if (error) {
      setError(error.message)
      setLoading(false)
      return
    }

    // After login, check if biometrics is available and offer to enable
    const biometricAvailable = await LocalAuthentication.hasHardwareAsync()
    if (biometricAvailable) {
      // Store a flag to prompt biometric setup on next app open
      // (handled in the tabs layout)
    }

    router.replace('/(tabs)/tickets')
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      className="flex-1 bg-slate-950"
    >
      <ScrollView
        contentContainerClassName="flex-1 justify-center px-6 py-12"
        keyboardShouldPersistTaps="handled"
      >
        {/* Logo */}
        <View className="items-center mb-10">
          <View className="w-16 h-16 rounded-2xl bg-amber-500 items-center justify-center mb-4">
            <Text className="text-white font-bold text-2xl">V</Text>
          </View>
          <Text className="text-white text-2xl font-bold">Valhalla RMM</Text>
          <Text className="text-slate-400 text-sm mt-1">Sign in to continue</Text>
        </View>

        {/* Error */}
        {error && (
          <View className="bg-rose-950/50 border border-rose-800 rounded-xl px-4 py-3 mb-4">
            <Text className="text-rose-400 text-sm">{error}</Text>
          </View>
        )}

        {/* Email */}
        <View className="mb-4">
          <Text className="text-slate-400 text-xs font-medium mb-1.5 uppercase tracking-wide">
            Email
          </Text>
          <TextInput
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            autoComplete="email"
            keyboardType="email-address"
            returnKeyType="next"
            placeholder="you@valhalla-rmm.com"
            placeholderTextColor="#475569"
            className="bg-slate-800 border border-slate-700 rounded-xl px-4 py-3.5 text-white text-sm"
          />
        </View>

        {/* Password */}
        <View className="mb-6">
          <Text className="text-slate-400 text-xs font-medium mb-1.5 uppercase tracking-wide">
            Password
          </Text>
          <TextInput
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoComplete="password"
            returnKeyType="done"
            onSubmitEditing={handleLogin}
            placeholder="••••••••"
            placeholderTextColor="#475569"
            className="bg-slate-800 border border-slate-700 rounded-xl px-4 py-3.5 text-white text-sm"
          />
        </View>

        {/* Sign in button */}
        <TouchableOpacity
          onPress={handleLogin}
          disabled={loading}
          className="bg-amber-500 rounded-xl py-3.5 items-center justify-center flex-row gap-2"
          activeOpacity={0.8}
        >
          {loading && <ActivityIndicator color="white" size="small" />}
          <Text className="text-white font-semibold text-base">
            {loading ? 'Signing in…' : 'Sign In'}
          </Text>
        </TouchableOpacity>

        <Text className="text-slate-600 text-xs text-center mt-8">
          Valhalla RMM · Technician App
        </Text>
      </ScrollView>
    </KeyboardAvoidingView>
  )
}
