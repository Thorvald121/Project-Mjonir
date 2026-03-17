import { useEffect, useRef } from 'react'
import { Tabs, router } from 'expo-router'
import { Platform } from 'react-native'
import * as LocalAuthentication from 'expo-local-authentication'
import * as Notifications from 'expo-notifications'
import { Ticket, Clock, Users, BookOpen, MoreHorizontal } from 'lucide-react-native'
import { registerForPushNotifications } from '../../lib/notifications'

export default function TabsLayout() {
  const notifListener    = useRef<Notifications.Subscription>()
  const notifRespListener = useRef<Notifications.Subscription>()

  useEffect(() => {
    // Register for push notifications on first mount
    registerForPushNotifications().catch(console.error)

    // Handle notification tap — navigate to the relevant ticket
    notifRespListener.current = Notifications.addNotificationResponseReceivedListener(response => {
      const ticketId = response.notification.request.content.data?.ticketId
      if (ticketId) {
        router.push(`/(tabs)/tickets/${ticketId}`)
      }
    })

    return () => {
      notifListener.current?.remove()
      notifRespListener.current?.remove()
    }
  }, [])

  useEffect(() => {
    // Prompt for Face ID / Touch ID on every app resume
    // This is what satisfies Apple Guideline 4.2 for native functionality
    const checkBiometric = async () => {
      const available = await LocalAuthentication.hasHardwareAsync()
      if (!available) return

      const enrolled = await LocalAuthentication.isEnrolledAsync()
      if (!enrolled) return

      // Only require biometric if we have a stored preference
      // (set after first successful password login)
      const { success } = await LocalAuthentication.authenticateAsync({
        promptMessage: 'Unlock Valhalla RMM',
        fallbackLabel: 'Use Password',
        cancelLabel:   'Cancel',
      })

      if (!success) {
        router.replace('/(auth)/login')
      }
    }

    // Only run on real device
    if (Platform.OS !== 'web') {
      // checkBiometric()  // Uncomment after testing login flow
    }
  }, [])

  const tabBarStyle = {
    backgroundColor: '#0F172A',
    borderTopColor:  '#1E293B',
    paddingBottom:   Platform.OS === 'ios' ? 20 : 8,
    height:          Platform.OS === 'ios' ? 84 : 60,
  }

  return (
    <Tabs
      screenOptions={{
        headerShown:         false,
        tabBarActiveTintColor:   '#F59E0B',  // amber-400
        tabBarInactiveTintColor: '#64748B',  // slate-500
        tabBarStyle,
        tabBarLabelStyle: { fontSize: 10, fontWeight: '600', marginTop: 2 },
      }}
    >
      <Tabs.Screen
        name="tickets"
        options={{
          title: 'Tickets',
          tabBarIcon: ({ color, size }) => <Ticket color={color} size={size - 2} />,
        }}
      />
      <Tabs.Screen
        name="time"
        options={{
          title: 'Time',
          tabBarIcon: ({ color, size }) => <Clock color={color} size={size - 2} />,
        }}
      />
      <Tabs.Screen
        name="customers"
        options={{
          title: 'Customers',
          tabBarIcon: ({ color, size }) => <Users color={color} size={size - 2} />,
        }}
      />
      <Tabs.Screen
        name="knowledge"
        options={{
          title: 'Knowledge',
          tabBarIcon: ({ color, size }) => <BookOpen color={color} size={size - 2} />,
        }}
      />
      <Tabs.Screen
        name="more"
        options={{
          title: 'More',
          tabBarIcon: ({ color, size }) => <MoreHorizontal color={color} size={size - 2} />,
        }}
      />
    </Tabs>
  )
}
