// @valhalla/db — Supabase client
// Works in both Next.js (apps/web) and Expo (apps/mobile).
// Web uses environment variables; mobile uses expo-constants.

import { createClient, SupabaseClient } from '@supabase/supabase-js'

// These env vars are set in:
//   apps/web/.env.local      → NEXT_PUBLIC_SUPABASE_URL etc.
//   apps/mobile/.env         → EXPO_PUBLIC_SUPABASE_URL etc.
// Both are safe to expose in the frontend — RLS enforces security at the DB level.

function getEnv(key: string): string {
  // Next.js
  if (typeof process !== 'undefined' && process.env) {
    const nextKey = `NEXT_PUBLIC_${key}`
    if (process.env[nextKey]) return process.env[nextKey]!
    // Expo (exposed via babel plugin)
    const expoKey = `EXPO_PUBLIC_${key}`
    if (process.env[expoKey]) return process.env[expoKey]!
  }
  throw new Error(`Missing environment variable: ${key}`)
}

let _client: SupabaseClient | null = null

export function getSupabaseClient(): SupabaseClient {
  if (_client) return _client

  const url  = getEnv('SUPABASE_URL')
  const key  = getEnv('SUPABASE_ANON_KEY')

  _client = createClient(url, key, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  })

  return _client
}

// Convenience export — use this everywhere
export const supabase = getSupabaseClient()

// Re-export types
export type { SupabaseClient }
