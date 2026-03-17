import { View, Text, TouchableOpacity, Alert } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { router } from 'expo-router'
import { useQuery } from '@tanstack/react-query'
import { LogOut, BookOpen, Package, Bell, ChevronRight } from 'lucide-react-native'
import { supabase } from '../../../lib/supabase'

export default function MoreScreen() {
  const { data: user } = useQuery({
    queryKey: ['current-user'],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser()
      return user
    },
    staleTime: Infinity,
  })

  const handleSignOut = () => {
    Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign Out',
        style: 'destructive',
        onPress: async () => {
          await supabase.auth.signOut()
          router.replace('/(auth)/login')
        },
      },
    ])
  }

  const MenuItem = ({
    icon: Icon, label, onPress, destructive = false,
  }: {
    icon: React.ElementType
    label: string
    onPress: () => void
    destructive?: boolean
  }) => (
    <TouchableOpacity
      onPress={onPress}
      className="flex-row items-center gap-3 px-4 py-4 border-b border-slate-800"
      activeOpacity={0.7}
    >
      <Icon size={18} color={destructive ? '#F43F5E' : '#94A3B8'} />
      <Text className={`flex-1 text-sm font-medium ${destructive ? 'text-rose-400' : 'text-slate-200'}`}>
        {label}
      </Text>
      {!destructive && <ChevronRight size={14} color="#475569" />}
    </TouchableOpacity>
  )

  return (
    <SafeAreaView className="flex-1 bg-slate-950" edges={['top']}>
      <View className="p-4 pb-2">
        <Text className="text-white text-xl font-bold">More</Text>
      </View>

      {/* User info */}
      <View className="mx-4 mb-4 bg-slate-800 rounded-2xl px-4 py-4 border border-slate-700">
        <View className="w-10 h-10 rounded-full bg-amber-500/20 border border-amber-500/40 items-center justify-center mb-2">
          <Text className="text-amber-400 font-bold text-base">
            {user?.email?.[0]?.toUpperCase() ?? '?'}
          </Text>
        </View>
        <Text className="text-white font-semibold text-sm">{user?.email ?? '—'}</Text>
        <Text className="text-slate-500 text-xs mt-0.5">Technician</Text>
      </View>

      {/* Menu items */}
      <View className="mx-4 bg-slate-800 rounded-2xl overflow-hidden border border-slate-700">
        <MenuItem
          icon={BookOpen}
          label="Knowledge Base"
          onPress={() => router.push('/(tabs)/knowledge')}
        />
        <MenuItem
          icon={Package}
          label="Inventory"
          onPress={() => Alert.alert('Coming soon', 'Inventory lookup is coming in V2.')}
        />
        <MenuItem
          icon={Bell}
          label="Notification Settings"
          onPress={() => Alert.alert('Coming soon', 'Notification preferences coming in V2.')}
        />
        <MenuItem
          icon={LogOut}
          label="Sign Out"
          onPress={handleSignOut}
          destructive
        />
      </View>

      <Text className="text-slate-700 text-xs text-center mt-8">
        Valhalla RMM v1.0.0
      </Text>
    </SafeAreaView>
  )
}
