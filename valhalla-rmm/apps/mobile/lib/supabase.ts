// apps/mobile/lib/supabase.ts
// Supabase client for Expo — uses expo-secure-store for session persistence
// so auth tokens survive app restarts.

import { createClient } from '@supabase/supabase-js'
import * as SecureStore from 'expo-secure-store'

const supabaseUrl  = process.env.EXPO_PUBLIC_SUPABASE_URL!
const supabaseKey  = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!

// SecureStore adapter — keeps JWT off AsyncStorage (which is plaintext)
const ExpoSecureStoreAdapter = {
  getItem:    (key: string) => SecureStore.getItemAsync(key),
  setItem:    (key: string, value: string) => SecureStore.setItemAsync(key, value),
  removeItem: (key: string) => SecureStore.deleteItemAsync(key),
}

export const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    storage:          ExpoSecureStoreAdapter,
    autoRefreshToken: true,
    persistSession:   true,
    detectSessionInUrl: false,   // not a browser — no URL-based auth
  },
})
