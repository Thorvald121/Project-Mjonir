import { useState } from 'react'
import {
  View, Text, FlatList, TouchableOpacity,
  TextInput, ActivityIndicator, ScrollView,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useQuery } from '@tanstack/react-query'
import { Search, BookOpen, ChevronRight, ArrowLeft, ThumbsUp, Eye } from 'lucide-react-native'
import { supabase } from '../../../lib/supabase'

const CATEGORY_COLORS: Record<string, string> = {
  how_to: '#3B82F6', troubleshooting: '#F97316', policy: '#8B5CF6',
  network: '#10B981', software: '#F59E0B', hardware: '#64748B',
}

export default function KnowledgeScreen() {
  const [search,   setSearch]   = useState('')
  const [selected, setSelected] = useState<any | null>(null)

  const { data: articles = [], isLoading } = useQuery({
    queryKey: ['kb-articles-mobile'],
    queryFn: async () => {
      const { data } = await supabase.from('knowledge_articles')
        .select('id,title,category,helpful_count,view_count,content')
        .eq('is_published', true)
        .order('helpful_count', { ascending: false })
        .limit(100)
      return data ?? []
    },
  })

  const filtered = search
    ? articles.filter(a =>
        a.title.toLowerCase().includes(search.toLowerCase()) ||
        (a.category ?? '').toLowerCase().includes(search.toLowerCase())
      )
    : articles

  // Article detail view
  if (selected) return (
    <SafeAreaView className="flex-1 bg-slate-950" edges={['top']}>
      <View className="flex-row items-center gap-3 px-4 py-3 border-b border-slate-800">
        <TouchableOpacity onPress={() => setSelected(null)} activeOpacity={0.7}>
          <ArrowLeft size={20} color="#94A3B8" />
        </TouchableOpacity>
        <Text className="text-white font-semibold text-sm flex-1" numberOfLines={1}>
          {selected.title}
        </Text>
      </View>
      <ScrollView className="flex-1 px-4 py-4">
        <View className="flex-row items-center gap-2 mb-4">
          <View className="px-2.5 py-1 rounded-full bg-slate-800 border border-slate-700">
            <Text className="text-xs capitalize font-medium"
              style={{ color: CATEGORY_COLORS[selected.category] ?? '#94A3B8' }}>
              {selected.category?.replace(/_/g, ' ')}
            </Text>
          </View>
          {selected.view_count > 0 && (
            <View className="flex-row items-center gap-1">
              <Eye size={11} color="#64748B" />
              <Text className="text-slate-500 text-xs">{selected.view_count}</Text>
            </View>
          )}
          {selected.helpful_count > 0 && (
            <View className="flex-row items-center gap-1">
              <ThumbsUp size={11} color="#64748B" />
              <Text className="text-slate-500 text-xs">{selected.helpful_count}</Text>
            </View>
          )}
        </View>
        <Text className="text-slate-200 text-sm leading-loose whitespace-pre-wrap">
          {/* Strip markdown formatting for readability */}
          {(selected.content ?? '').replace(/^#{1,3} /gm, '').replace(/\*\*/g, '').replace(/\*/g, '')}
        </Text>
        <View className="h-10" />
      </ScrollView>
    </SafeAreaView>
  )

  return (
    <SafeAreaView className="flex-1 bg-slate-950" edges={['top']}>
      <View className="px-4 pt-2 pb-3">
        <Text className="text-white text-xl font-bold mb-3">Knowledge Base</Text>
        <View className="flex-row items-center bg-slate-800 rounded-xl px-3 gap-2 border border-slate-700">
          <Search size={15} color="#64748B" />
          <TextInput
            value={search} onChangeText={setSearch}
            placeholder="Search articles…" placeholderTextColor="#475569"
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
          keyExtractor={a => a.id}
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 20 }}
          ItemSeparatorComponent={() => <View className="h-2" />}
          ListEmptyComponent={
            <View className="items-center justify-center py-20">
              <BookOpen size={32} color="#1E293B" />
              <Text className="text-slate-500 text-sm mt-3">
                {search ? 'No articles match your search' : 'No published articles yet'}
              </Text>
            </View>
          }
          renderItem={({ item: a }) => (
            <TouchableOpacity
              onPress={() => setSelected(a)}
              activeOpacity={0.7}
              className="bg-slate-800 rounded-2xl px-4 py-4 border border-slate-700 flex-row items-center gap-3"
            >
              <View className="w-9 h-9 rounded-xl items-center justify-center flex-shrink-0"
                style={{ backgroundColor: (CATEGORY_COLORS[a.category] ?? '#64748B') + '20' }}>
                <BookOpen size={16} color={CATEGORY_COLORS[a.category] ?? '#94A3B8'} />
              </View>
              <View className="flex-1 min-w-0">
                <Text className="text-white text-sm font-medium" numberOfLines={2}>{a.title}</Text>
                <View className="flex-row items-center gap-2 mt-1">
                  <Text className="text-xs capitalize" style={{ color: CATEGORY_COLORS[a.category] ?? '#94A3B8' }}>
                    {a.category?.replace(/_/g, ' ')}
                  </Text>
                  {a.helpful_count > 0 && (
                    <View className="flex-row items-center gap-0.5">
                      <ThumbsUp size={10} color="#475569" />
                      <Text className="text-slate-500 text-xs">{a.helpful_count}</Text>
                    </View>
                  )}
                </View>
              </View>
              <ChevronRight size={14} color="#475569" />
            </TouchableOpacity>
          )}
        />
      )}
    </SafeAreaView>
  )
}