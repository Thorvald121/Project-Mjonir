import { useState } from 'react'
import {
  View, Text, FlatList, TouchableOpacity,
  TextInput, ActivityIndicator,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { router } from 'expo-router'
import { useQuery } from '@tanstack/react-query'
import { Search, Building2, Phone, Mail, ChevronRight, AlertTriangle } from 'lucide-react-native'
import { supabase } from '../../../lib/supabase'

const STATUS_COLORS: Record<string, string> = {
  active: '#10B981', inactive: '#64748B', prospect: '#3B82F6',
}

export default function CustomersScreen() {
  const [search, setSearch] = useState('')

  const { data: customers = [], isLoading } = useQuery({
    queryKey: ['customers-mobile'],
    queryFn: async () => {
      const { data } = await supabase.from('customers')
        .select('id,name,status,contact_name,contact_email,contact_phone,contract_type,industry')
        .order('name').limit(200)
      return data ?? []
    },
  })

  const filtered = search
    ? customers.filter(c =>
        c.name.toLowerCase().includes(search.toLowerCase()) ||
        (c.contact_name ?? '').toLowerCase().includes(search.toLowerCase()) ||
        (c.contact_email ?? '').toLowerCase().includes(search.toLowerCase())
      )
    : customers

  return (
    <SafeAreaView className="flex-1 bg-slate-950" edges={['top']}>
      <View className="px-4 pt-2 pb-3">
        <Text className="text-white text-xl font-bold mb-3">Customers</Text>
        <View className="flex-row items-center bg-slate-800 rounded-xl px-3 gap-2 border border-slate-700">
          <Search size={15} color="#64748B" />
          <TextInput
            value={search} onChangeText={setSearch}
            placeholder="Search customers…" placeholderTextColor="#475569"
            className="flex-1 py-3 text-white text-sm"
          />
        </View>
      </View>

      {isLoading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color="#F59E0B" />
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={c => c.id}
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 20 }}
          ItemSeparatorComponent={() => <View className="h-2" />}
          ListEmptyComponent={
            <View className="items-center justify-center py-20">
              <Text className="text-slate-500 text-sm">
                {search ? 'No customers match your search' : 'No customers yet'}
              </Text>
            </View>
          }
          renderItem={({ item: c }) => (
            <TouchableOpacity
              activeOpacity={0.7}
              className="bg-slate-800 rounded-2xl p-4 border border-slate-700"
            >
              <View className="flex-row items-start justify-between gap-2">
                <View className="flex-1 min-w-0">
                  <View className="flex-row items-center gap-2 mb-1">
                    <View className="w-8 h-8 rounded-xl bg-amber-500/20 border border-amber-500/30 items-center justify-center flex-shrink-0">
                      <Building2 size={14} color="#F59E0B" />
                    </View>
                    <View className="flex-1 min-w-0">
                      <Text className="text-white font-semibold text-sm" numberOfLines={1}>{c.name}</Text>
                      {c.industry && <Text className="text-slate-500 text-xs">{c.industry}</Text>}
                    </View>
                  </View>

                  {c.contact_name && (
                    <Text className="text-slate-400 text-xs ml-10 mb-1">{c.contact_name}</Text>
                  )}

                  <View className="flex-row flex-wrap gap-3 ml-10">
                    {c.contact_phone && (
                      <View className="flex-row items-center gap-1">
                        <Phone size={11} color="#64748B" />
                        <Text className="text-slate-400 text-xs">{c.contact_phone}</Text>
                      </View>
                    )}
                    {c.contact_email && (
                      <View className="flex-row items-center gap-1">
                        <Mail size={11} color="#64748B" />
                        <Text className="text-slate-400 text-xs" numberOfLines={1}>{c.contact_email}</Text>
                      </View>
                    )}
                  </View>
                </View>

                <View className="items-end gap-1.5 flex-shrink-0">
                  <View className="w-2 h-2 rounded-full" style={{ backgroundColor: STATUS_COLORS[c.status] ?? '#64748B' }} />
                  {c.contract_type && (
                    <Text className="text-slate-600 text-[10px] capitalize">{c.contract_type.replace(/_/g, ' ')}</Text>
                  )}
                </View>
              </View>
            </TouchableOpacity>
          )}
        />
      )}
    </SafeAreaView>
  )
}