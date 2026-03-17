import { useState, useCallback } from 'react'
import {
  View, Text, FlatList, TouchableOpacity,
  TextInput, RefreshControl, ActivityIndicator,
} from 'react-native'
import { router } from 'expo-router'
import { useQuery } from '@tanstack/react-query'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Search, AlertTriangle, Clock } from 'lucide-react-native'
import { supabase } from '../../../lib/supabase'
import { getSlaState, getSlaLabel, TICKET_STATUS_LABELS } from '@valhalla/utils'
import type { Ticket } from '@valhalla/types'

const PRIORITY_COLORS: Record<string, string> = {
  critical: '#F43F5E',
  high:     '#F97316',
  medium:   '#F59E0B',
  low:      '#10B981',
}

const STATUS_BG: Record<string, string> = {
  open:        '#1E3A5F',
  in_progress: '#2E1B69',
  waiting:     '#451A03',
  resolved:    '#052E16',
  closed:      '#1E293B',
}

export default function TicketsScreen() {
  const [search,     setSearch]     = useState('')
  const [refreshing, setRefreshing] = useState(false)
  const [myTickets,  setMyTickets]  = useState(true)

  const { data: currentUser } = useQuery({
    queryKey: ['current-user'],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser()
      return user
    },
    staleTime: Infinity,
  })

  const { data: tickets = [], isLoading, refetch, isError } = useQuery<Ticket[]>({
    queryKey: ['tickets', myTickets ? 'mine' : 'all'],
    queryFn: async () => {
      let query = supabase
        .from('tickets')
        .select('*')
        .not('status', 'in', '("resolved","closed")')
        .order('created_at', { ascending: false })
        .limit(100)

      if (myTickets && currentUser?.email) {
        query = query.eq('assigned_to', currentUser.email)
      }

      const { data, error } = await query
      if (error) throw error
      return data as Ticket[]
    },
    enabled: true,
  })

  const filtered = search
    ? tickets.filter(t =>
        t.title.toLowerCase().includes(search.toLowerCase()) ||
        (t.customer_name ?? '').toLowerCase().includes(search.toLowerCase())
      )
    : tickets

  const handleRefresh = useCallback(async () => {
    setRefreshing(true)
    await refetch()
    setRefreshing(false)
  }, [refetch])

  const renderTicket = ({ item: ticket }: { item: Ticket }) => {
    const slaState = getSlaState(ticket.sla_due_date, ticket.status)
    const slaLabel = getSlaLabel(ticket.sla_due_date, ticket.status)

    return (
      <TouchableOpacity
        onPress={() => router.push(`/(tabs)/tickets/${ticket.id}`)}
        className="mx-4 mb-3 bg-slate-800 rounded-2xl p-4 border border-slate-700"
        activeOpacity={0.7}
      >
        {/* Priority bar */}
        <View
          className="absolute left-0 top-3 bottom-3 w-1 rounded-full"
          style={{ backgroundColor: PRIORITY_COLORS[ticket.priority] ?? '#94A3B8', marginLeft: 12 }}
        />
        <View className="ml-3">
          {/* Title + status */}
          <View className="flex-row items-start justify-between gap-2 mb-1">
            <Text className="text-white font-semibold text-sm flex-1" numberOfLines={2}>
              {ticket.title}
            </Text>
            <View
              className="px-2 py-0.5 rounded-full flex-shrink-0"
              style={{ backgroundColor: STATUS_BG[ticket.status] }}
            >
              <Text className="text-xs font-medium text-slate-300">
                {TICKET_STATUS_LABELS[ticket.status]}
              </Text>
            </View>
          </View>

          {/* Customer */}
          {ticket.customer_name && (
            <Text className="text-slate-400 text-xs mb-2">{ticket.customer_name}</Text>
          )}

          {/* Footer: SLA + priority */}
          <View className="flex-row items-center justify-between">
            <View className="flex-row items-center gap-1">
              {slaState === 'breached' ? (
                <AlertTriangle size={11} color="#F43F5E" />
              ) : (
                <Clock size={11} color={slaState === 'warning' ? '#F59E0B' : '#64748B'} />
              )}
              <Text
                className="text-xs font-medium"
                style={{ color: slaState === 'breached' ? '#F43F5E' : slaState === 'warning' ? '#F59E0B' : '#64748B' }}
              >
                {slaLabel}
              </Text>
            </View>
            <Text
              className="text-xs font-semibold capitalize"
              style={{ color: PRIORITY_COLORS[ticket.priority] }}
            >
              {ticket.priority}
            </Text>
          </View>
        </View>
      </TouchableOpacity>
    )
  }

  return (
    <SafeAreaView className="flex-1 bg-slate-950" edges={['top']}>
      {/* Header */}
      <View className="px-4 pt-2 pb-3">
        <View className="flex-row items-center justify-between mb-3">
          <Text className="text-white text-xl font-bold">Tickets</Text>
          <TouchableOpacity
            onPress={() => setMyTickets(!myTickets)}
            className={`px-3 py-1.5 rounded-full border ${
              myTickets
                ? 'bg-amber-500/20 border-amber-500/40'
                : 'bg-slate-800 border-slate-700'
            }`}
          >
            <Text className={`text-xs font-semibold ${myTickets ? 'text-amber-400' : 'text-slate-400'}`}>
              {myTickets ? 'My Tickets' : 'All Tickets'}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Search */}
        <View className="flex-row items-center bg-slate-800 rounded-xl px-3 gap-2 border border-slate-700">
          <Search size={15} color="#64748B" />
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="Search tickets…"
            placeholderTextColor="#475569"
            className="flex-1 py-3 text-white text-sm"
          />
        </View>
      </View>

      {/* Content */}
      {isLoading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color="#F59E0B" />
        </View>
      ) : isError ? (
        <View className="flex-1 items-center justify-center px-8">
          <Text className="text-rose-400 text-sm text-center">
            Failed to load tickets. Pull down to retry.
          </Text>
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={t => t.id}
          renderItem={renderTicket}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              tintColor="#F59E0B"
            />
          }
          ListEmptyComponent={
            <View className="items-center justify-center py-20">
              <Text className="text-slate-500 text-sm">
                {search ? 'No tickets match your search' : 'No open tickets 🎉'}
              </Text>
            </View>
          }
          contentContainerStyle={{ paddingBottom: 20 }}
        />
      )}
    </SafeAreaView>
  )
}
