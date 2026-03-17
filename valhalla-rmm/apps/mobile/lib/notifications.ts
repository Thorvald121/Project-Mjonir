// apps/mobile/lib/notifications.ts
// Registers device for Expo push notifications and saves the token to Supabase
// so Edge Functions can send targeted notifications to this device.

import * as Notifications from 'expo-notifications'
import * as Device from 'expo-device'
import { Platform } from 'react-native'
import { supabase } from './supabase'

// Configure how notifications appear when the app is in the foreground
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge:  true,
  }),
})

export async function registerForPushNotifications(): Promise<string | null> {
  // Push notifications don't work on simulators
  if (!Device.isDevice) {
    console.log('[push] Skipping — not a real device')
    return null
  }

  // Request permission
  const { status: existingStatus } = await Notifications.getPermissionsAsync()
  let finalStatus = existingStatus

  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync()
    finalStatus = status
  }

  if (finalStatus !== 'granted') {
    console.log('[push] Permission denied')
    return null
  }

  // Android needs a notification channel
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name:       'Valhalla RMM',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
    })
  }

  // Get the Expo push token
  const { data: token } = await Notifications.getExpoPushTokenAsync({
    projectId: process.env.EXPO_PUBLIC_EAS_PROJECT_ID,
  })

  if (!token) return null

  // Save token to Supabase so Edge Functions can look it up by user email
  const { data: { user } } = await supabase.auth.getUser()
  if (user) {
    await supabase
      .from('device_push_tokens')
      .upsert({
        user_id:    user.id,
        user_email: user.email,
        token,
        platform:   Platform.OS as 'ios' | 'android',
      }, { onConflict: 'user_id,token' })
  }

  return token
}

export function useNotificationListener(
  onNotification: (notification: Notifications.Notification) => void
) {
  return Notifications.addNotificationReceivedListener(onNotification)
}

export function useNotificationResponseListener(
  onResponse: (response: Notifications.NotificationResponse) => void
) {
  return Notifications.addNotificationResponseReceivedListener(onResponse)
}
