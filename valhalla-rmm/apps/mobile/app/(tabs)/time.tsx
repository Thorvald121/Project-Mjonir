import { useState } from 'react'
import {
  View, Text, TextInput, TouchableOpacity,
  ScrollView, Switch, ActivityIndicator,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../../../lib/supabase'
import { formatDate } from '@valhalla/utils'
import type { Customer, Ticket } from '@valhalla/types'

export default function TimeScreen() {
  const qc = useQueryClient()
  const today = new Date().toISOString().split('T')[0]

  const [minutes,     setMinutes]     = useState('60')
  const [description, setDescription] = useState('')
  const [date,        setDate]        = useState(today)
  const [billable,    setBillable]    = useState(true)
  const [hourlyRate,  setHourlyRate]  = useState('')
  const [customerId,  setCustomerId]  = useState<string | null>(null)
  const [ticketId,    setTicketId]    = useState<string | null>(null)
  const [saved,       setSaved]       = useState(false)

  const { data: customers = [] } = useQuery<Customer[]>({
    queryKey: ['customers'],
    queryFn: async () => {
      const { data } = await supabase
        .from('customers').select('id,name').eq('status','active').order('name').limit(100)
      return data ?? []
    },
  })

  const { data: tickets = [] } = useQuery<Ticket[]>({
    queryKey: ['tickets', 'open-mine'],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser()
      const { data } = await supabase
        .from('tickets').select('id,title,customer_id,customer_name')
        .eq('assigned_to', user?.email ?? '')
        .not('status','in','("resolved","closed")')
        .order('created_at',{ ascending: false })
        .limit(50)
      return data ?? []
    },
  })

  const logMutation = useMutation({
    mutationFn: async () => {
      const { data: { user } } = await supabase.auth.getUser()
      const mins = parseInt(minutes, 10)
      if (!mins || mins < 1) throw new Error('Enter a valid number of minutes.')

      const ticket = tickets.find(t => t.id === ticketId)

      const { error } = await supabase.from('time_entries').insert({
        ticket_id:    ticketId,
        ticket_title: ticket?.title ?? null,
        customer_id:  customerId ?? ticket?.customer_id ?? null,
        customer_name:(customers.find(c => c.id === (customerId ?? ticket?.customer_id)))?.name ?? ticket?.customer_name ?? null,
        technician:   user?.email,
        description:  description || null,
        minutes:      mins,
        billable,
        hourly_rate:  hourlyRate ? parseFloat(hourlyRate) : null,
        date,
      })
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['timeEntries'] })
      setMinutes('60')
      setDescription('')
      setBillable(true)
      setHourlyRate('')
      setCustomerId(null)
      setTicketId(null)
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    },
  })

  const fmtHours = (m: number) => {
    const h = Math.floor(m / 60), min = m % 60
    return min > 0 ? `${h}h ${min}m` : `${h}h`
  }

  return (
    <SafeAreaView className="flex-1 bg-slate-950" edges={['top']}>
      <ScrollView className="flex-1" contentContainerClassName="p-4" keyboardShouldPersistTaps="handled">
        <Text className="text-white text-xl font-bold mb-6">Log Time</Text>

        {/* Success */}
        {saved && (
          <View className="bg-emerald-900/50 border border-emerald-700 rounded-xl px-4 py-3 mb-4">
            <Text className="text-emerald-400 text-sm font-medium">✓ Time entry saved</Text>
          </View>
        )}

        {/* Error */}
        {logMutation.isError && (
          <View className="bg-rose-900/50 border border-rose-800 rounded-xl px-4 py-3 mb-4">
            <Text className="text-rose-400 text-sm">
              {(logMutation.error as Error).message}
            </Text>
          </View>
        )}

        {/* Minutes */}
        <View className="mb-4">
          <Text className="text-slate-400 text-xs font-semibold uppercase tracking-wide mb-2">
            Minutes *
          </Text>
          <TextInput
            value={minutes}
            onChangeText={setMinutes}
            keyboardType="number-pad"
            className="bg-slate-800 border border-slate-700 rounded-xl px-4 py-3.5 text-white text-sm"
          />
          {parseInt(minutes) > 0 && (
            <Text className="text-slate-500 text-xs mt-1">
              = {fmtHours(parseInt(minutes))}
            </Text>
          )}
        </View>

        {/* Date */}
        <View className="mb-4">
          <Text className="text-slate-400 text-xs font-semibold uppercase tracking-wide mb-2">Date</Text>
          <TextInput
            value={date}
            onChangeText={setDate}
            placeholder="YYYY-MM-DD"
            placeholderTextColor="#475569"
            className="bg-slate-800 border border-slate-700 rounded-xl px-4 py-3.5 text-white text-sm"
          />
        </View>

        {/* Description */}
        <View className="mb-4">
          <Text className="text-slate-400 text-xs font-semibold uppercase tracking-wide mb-2">
            Description
          </Text>
          <TextInput
            value={description}
            onChangeText={setDescription}
            multiline
            numberOfLines={3}
            placeholder="What was worked on?"
            placeholderTextColor="#475569"
            className="bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white text-sm"
            style={{ minHeight: 80, textAlignVertical: 'top' }}
          />
        </View>

        {/* Billable toggle */}
        <View className="flex-row items-center justify-between bg-slate-800 border border-slate-700 rounded-xl px-4 py-3.5 mb-4">
          <Text className="text-white text-sm font-medium">Billable</Text>
          <Switch
            value={billable}
            onValueChange={setBillable}
            trackColor={{ false: '#334155', true: '#D97706' }}
            thumbColor={billable ? '#FFF' : '#94A3B8'}
          />
        </View>

        {/* Hourly rate (if billable) */}
        {billable && (
          <View className="mb-4">
            <Text className="text-slate-400 text-xs font-semibold uppercase tracking-wide mb-2">
              Hourly Rate ($)
            </Text>
            <TextInput
              value={hourlyRate}
              onChangeText={setHourlyRate}
              keyboardType="decimal-pad"
              placeholder="e.g. 125.00"
              placeholderTextColor="#475569"
              className="bg-slate-800 border border-slate-700 rounded-xl px-4 py-3.5 text-white text-sm"
            />
          </View>
        )}

        {/* Linked ticket (quick picker) */}
        <View className="mb-6">
          <Text className="text-slate-400 text-xs font-semibold uppercase tracking-wide mb-2">
            Linked Ticket (optional)
          </Text>
          <View className="bg-slate-800 border border-slate-700 rounded-xl overflow-hidden">
            <TouchableOpacity
              onPress={() => setTicketId(null)}
              className={`px-4 py-3 border-b border-slate-700 ${!ticketId ? 'bg-amber-500/10' : ''}`}
            >
              <Text className={`text-sm ${!ticketId ? 'text-amber-400 font-medium' : 'text-slate-400'}`}>
                No ticket
              </Text>
            </TouchableOpacity>
            {tickets.slice(0, 5).map(t => (
              <TouchableOpacity
                key={t.id}
                onPress={() => setTicketId(t.id)}
                className={`px-4 py-3 border-b border-slate-700/50 ${ticketId === t.id ? 'bg-amber-500/10' : ''}`}
              >
                <Text className={`text-sm ${ticketId === t.id ? 'text-amber-400 font-medium' : 'text-white'}`} numberOfLines={1}>
                  {t.title}
                </Text>
                {t.customer_name && (
                  <Text className="text-xs text-slate-500 mt-0.5">{t.customer_name}</Text>
                )}
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Save button */}
        <TouchableOpacity
          onPress={() => logMutation.mutate()}
          disabled={logMutation.isPending || !minutes}
          className="bg-amber-500 rounded-xl py-4 items-center justify-center flex-row gap-2"
          activeOpacity={0.8}
        >
          {logMutation.isPending && <ActivityIndicator color="white" size="small" />}
          <Text className="text-white font-bold text-base">
            {logMutation.isPending ? 'Saving…' : 'Log Time'}
          </Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  )
}
