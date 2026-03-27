import { useState, useCallback } from 'react'
import {
  View, Text, ScrollView, TouchableOpacity, TextInput,
  ActivityIndicator, Alert, KeyboardAvoidingView, Platform,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useLocalSearchParams, router } from 'expo-router'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  ArrowLeft, Send, Lock, Clock, User,
  AlertTriangle, CheckCircle2, Tag,
} from 'lucide-react-native'
import { supabase } from '../../../lib/supabase'

const PRIORITY_COLORS: Record<string, string> = {
  critical: '#F43F5E', high: '#F97316', medium: '#F59E0B', low: '#10B981',
}
const STATUS_LABELS: Record<string, string> = {
  open: 'Open', in_progress: 'In Progress', waiting: 'Waiting',
  resolved: 'Resolved', closed: 'Closed',
}
const STATUS_COLORS: Record<string, string> = {
  open: '#3B82F6', in_progress: '#8B5CF6', waiting: '#F59E0B',
  resolved: '#10B981', closed: '#64748B',
}

function fmtDate(d: string | null) {
  if (!d) return '—'
  const date = new Date(d)
  return date.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}

function fmtRelative(d: string) {
  const secs = Math.round((Date.now() - new Date(d).getTime()) / 1000)
  if (secs < 60)    return 'just now'
  if (secs < 3600)  return `${Math.floor(secs / 60)}m ago`
  if (secs < 86400) return `${Math.floor(secs / 3600)}h ago`
  return `${Math.floor(secs / 86400)}d ago`
}

export default function TicketDetailScreen() {
  const { id }   = useLocalSearchParams<{ id: string }>()
  const qc       = useQueryClient()
  const [reply,  setReply]  = useState('')
  const [mode,   setMode]   = useState<'reply' | 'note'>('reply')
  const [status, setStatus] = useState<string | null>(null)

  const { data: user } = useQuery({
    queryKey: ['current-user'],
    queryFn: async () => { const { data: { user } } = await supabase.auth.getUser(); return user },
    staleTime: Infinity,
  })

  const { data: ticket, isLoading } = useQuery({
    queryKey: ['ticket', id],
    queryFn: async () => {
      const { data, error } = await supabase.from('tickets').select('*').eq('id', id).single()
      if (error) throw error
      setStatus(data.status)
      return data
    },
    enabled: !!id,
  })

  const { data: comments = [] } = useQuery({
    queryKey: ['ticket-comments', id],
    queryFn: async () => {
      const { data } = await supabase.from('ticket_comments')
        .select('*').eq('ticket_id', id)
        .not('is_internal', 'eq', mode === 'reply' ? false : true)
        .order('created_at', { ascending: true })
      return data ?? []
    },
    enabled: !!id,
  })

  // Reload all comments regardless of mode
  const { data: allComments = [] } = useQuery({
    queryKey: ['ticket-comments-all', id],
    queryFn: async () => {
      const { data } = await supabase.from('ticket_comments')
        .select('*').eq('ticket_id', id)
        .order('created_at', { ascending: true })
      return data ?? []
    },
    enabled: !!id,
  })

  const sendMutation = useMutation({
    mutationFn: async () => {
      if (!reply.trim() || !ticket) return
      const { error } = await supabase.from('ticket_comments').insert({
        ticket_id:       id,
        organization_id: ticket.organization_id,
        author_name:     user?.email ?? 'Technician',
        author_email:    user?.email ?? '',
        content:         reply.trim(),
        is_staff:        true,
        is_internal:     mode === 'note',
        source:          'admin',
      })
      if (error) throw error
    },
    onSuccess: () => {
      setReply('')
      qc.invalidateQueries({ queryKey: ['ticket-comments-all', id] })
    },
    onError: (e: any) => Alert.alert('Error', e.message),
  })

  const updateStatus = async (newStatus: string) => {
    if (!ticket) return
    const { error } = await supabase.from('tickets').update({ status: newStatus }).eq('id', id)
    if (error) { Alert.alert('Error', error.message); return }
    setStatus(newStatus)
    qc.invalidateQueries({ queryKey: ['ticket', id] })
    qc.invalidateQueries({ queryKey: ['tickets'] })
  }

  if (isLoading) return (
    <SafeAreaView className="flex-1 bg-slate-950 items-center justify-center" edges={['top']}>
      <ActivityIndicator color="#F59E0B" />
    </SafeAreaView>
  )

  if (!ticket) return (
    <SafeAreaView className="flex-1 bg-slate-950 items-center justify-center" edges={['top']}>
      <Text className="text-slate-400">Ticket not found</Text>
    </SafeAreaView>
  )

  const currentStatus = status ?? ticket.status
  const slaBreached   = ticket.sla_due_date && new Date(ticket.sla_due_date) < new Date()
    && !['resolved', 'closed'].includes(currentStatus)

  return (
    <SafeAreaView className="flex-1 bg-slate-950" edges={['top']}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        className="flex-1"
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
      >
        {/* Header */}
        <View className="flex-row items-center gap-3 px-4 py-3 border-b border-slate-800">
          <TouchableOpacity onPress={() => router.back()} activeOpacity={0.7}>
            <ArrowLeft size={20} color="#94A3B8" />
          </TouchableOpacity>
          <Text className="text-white font-semibold text-sm flex-1" numberOfLines={1}>
            {ticket.title}
          </Text>
        </View>

        <ScrollView className="flex-1" keyboardShouldPersistTaps="handled">
          {/* Ticket info */}
          <View className="px-4 py-4 border-b border-slate-800 space-y-3">
            {/* Badges row */}
            <View className="flex-row flex-wrap gap-2">
              <View className="px-2.5 py-1 rounded-full border" style={{ borderColor: STATUS_COLORS[currentStatus] + '60' }}>
                <Text className="text-xs font-semibold" style={{ color: STATUS_COLORS[currentStatus] }}>
                  {STATUS_LABELS[currentStatus]}
                </Text>
              </View>
              <View className="px-2.5 py-1 rounded-full bg-slate-800 border border-slate-700">
                <Text className="text-xs font-semibold capitalize" style={{ color: PRIORITY_COLORS[ticket.priority] }}>
                  {ticket.priority}
                </Text>
              </View>
              {ticket.category && (
                <View className="px-2.5 py-1 rounded-full bg-slate-800 border border-slate-700">
                  <Text className="text-xs text-slate-400 capitalize">{ticket.category}</Text>
                </View>
              )}
              {slaBreached && (
                <View className="flex-row items-center gap-1 px-2.5 py-1 rounded-full bg-rose-950/50 border border-rose-800">
                  <AlertTriangle size={10} color="#F43F5E" />
                  <Text className="text-xs font-semibold text-rose-400">SLA Breach</Text>
                </View>
              )}
            </View>

            {/* Customer + assigned */}
            {ticket.customer_name && (
              <View className="flex-row items-center gap-2">
                <User size={12} color="#64748B" />
                <Text className="text-slate-400 text-xs">{ticket.customer_name}</Text>
              </View>
            )}
            {ticket.assigned_to && (
              <View className="flex-row items-center gap-2">
                <Tag size={12} color="#64748B" />
                <Text className="text-slate-400 text-xs">Assigned to {ticket.assigned_to}</Text>
              </View>
            )}
            {ticket.sla_due_date && (
              <View className="flex-row items-center gap-2">
                <Clock size={12} color={slaBreached ? '#F43F5E' : '#64748B'} />
                <Text className={`text-xs ${slaBreached ? 'text-rose-400' : 'text-slate-400'}`}>
                  SLA due {fmtDate(ticket.sla_due_date)}
                </Text>
              </View>
            )}

            {/* Description */}
            {ticket.description && (
              <View className="bg-slate-800 rounded-xl p-3 mt-1">
                <Text className="text-slate-300 text-xs leading-relaxed">{ticket.description}</Text>
              </View>
            )}

            {/* Quick status change */}
            <View>
              <Text className="text-slate-500 text-xs mb-2 font-medium uppercase tracking-wide">Change Status</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} className="-mx-1">
                {['open', 'in_progress', 'waiting', 'resolved', 'closed'].map(s => (
                  <TouchableOpacity key={s} onPress={() => updateStatus(s)}
                    className={`mx-1 px-3 py-1.5 rounded-full border ${currentStatus === s ? 'border-transparent' : 'border-slate-700 bg-slate-800'}`}
                    style={currentStatus === s ? { backgroundColor: STATUS_COLORS[s] + '30', borderColor: STATUS_COLORS[s] + '60' } : {}}
                    activeOpacity={0.7}>
                    <Text className="text-xs font-semibold capitalize"
                      style={{ color: currentStatus === s ? STATUS_COLORS[s] : '#64748B' }}>
                      {STATUS_LABELS[s]}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          </View>

          {/* Comments */}
          <View className="px-4 py-4 space-y-3">
            <Text className="text-slate-500 text-xs font-semibold uppercase tracking-wide mb-2">
              Conversation ({allComments.length})
            </Text>
            {allComments.length === 0 ? (
              <Text className="text-slate-600 text-sm text-center py-6">No messages yet</Text>
            ) : allComments.map(c => (
              <View key={c.id} className={`mb-3 ${c.is_staff ? '' : 'items-end'}`}>
                <View className={`max-w-[85%] rounded-2xl px-4 py-3 ${
                  c.is_internal
                    ? 'bg-amber-950/40 border border-amber-800/40'
                    : c.is_staff
                    ? 'bg-slate-800 border border-slate-700'
                    : 'bg-blue-900/40 border border-blue-700/40'
                }`}>
                  <View className="flex-row items-center justify-between gap-2 mb-1">
                    <Text className="text-xs font-semibold text-slate-400">
                      {c.is_internal ? '🔒 ' : ''}{c.author_name || c.author_email}
                      {c.is_staff && !c.is_internal ? ' · Support' : ''}
                    </Text>
                    <Text className="text-slate-600 text-[10px]">{fmtRelative(c.created_at)}</Text>
                  </View>
                  <Text className="text-slate-200 text-sm leading-relaxed">{c.content}</Text>
                </View>
              </View>
            ))}
          </View>
          <View className="h-4" />
        </ScrollView>

        {/* Reply box */}
        <View className="border-t border-slate-800 px-4 py-3 bg-slate-900">
          {/* Mode toggle */}
          <View className="flex-row gap-2 mb-3">
            {(['reply', 'note'] as const).map(m => (
              <TouchableOpacity key={m} onPress={() => setMode(m)}
                className={`flex-row items-center gap-1.5 px-3 py-1.5 rounded-full ${
                  mode === m ? (m === 'reply' ? 'bg-blue-600' : 'bg-amber-600') : 'bg-slate-800 border border-slate-700'
                }`}
                activeOpacity={0.7}>
                {m === 'note' && <Lock size={11} color={mode === m ? 'white' : '#94A3B8'} />}
                {m === 'reply' && <Send size={11} color={mode === m ? 'white' : '#94A3B8'} />}
                <Text className={`text-xs font-semibold ${mode === m ? 'text-white' : 'text-slate-400'}`}>
                  {m === 'reply' ? 'Reply to Client' : 'Internal Note'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <View className="flex-row items-end gap-2">
            <TextInput
              value={reply}
              onChangeText={setReply}
              multiline
              maxLength={2000}
              placeholder={mode === 'reply' ? 'Reply to client…' : 'Internal note (not visible to client)…'}
              placeholderTextColor="#475569"
              className="flex-1 bg-slate-800 border border-slate-700 rounded-2xl px-4 py-3 text-white text-sm"
              style={{ maxHeight: 120, textAlignVertical: 'top' }}
            />
            <TouchableOpacity
              onPress={() => sendMutation.mutate()}
              disabled={!reply.trim() || sendMutation.isPending}
              className={`w-10 h-10 rounded-full items-center justify-center ${
                reply.trim() ? (mode === 'reply' ? 'bg-blue-600' : 'bg-amber-500') : 'bg-slate-700'
              }`}
              activeOpacity={0.7}>
              {sendMutation.isPending
                ? <ActivityIndicator size="small" color="white" />
                : <Send size={16} color={reply.trim() ? 'white' : '#475569'} />
              }
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}