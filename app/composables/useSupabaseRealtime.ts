// composables/useSupabaseRealtime.ts
// Manages a single Supabase Realtime channel for a room.
// Subscribes to all 5 tables and calls the provided callbacks on changes.
// Used internally by useSprintPoint — you don't call this directly.

import type { RealtimeChannel } from '@supabase/supabase-js'
import type { Database } from '~/types/sprintpoint'

type TableName = keyof Database['public']['Tables']
type ChangeCallback = (event: 'INSERT' | 'UPDATE' | 'DELETE', table: TableName, row: any, oldRow: any) => void

export function useSupabaseRealtime() {
  const supabase = useSupabaseClient<Database>()
  let channel: RealtimeChannel | null = null

  /**
   * Subscribe to all SprintPoint tables for a given room.
   * @param roomId  - the room UUID to filter on
   * @param onEvent - called for every INSERT / UPDATE / DELETE
   */
  function subscribe(roomId: string, onEvent: ChangeCallback) {
    // Clean up any existing subscription first
    unsubscribe()

    channel = supabase
      .channel(`room:${roomId}`)
      // rooms
      .on('postgres_changes', { event: '*', schema: 'public', table: 'rooms', filter: `id=eq.${roomId}` },
        (payload) => onEvent(payload.eventType as any, 'rooms', payload.new, payload.old))
      // members
      .on('postgres_changes', { event: '*', schema: 'public', table: 'members', filter: `room_id=eq.${roomId}` },
        (payload) => onEvent(payload.eventType as any, 'members', payload.new, payload.old))
      // tickets
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tickets', filter: `room_id=eq.${roomId}` },
        (payload) => onEvent(payload.eventType as any, 'tickets', payload.new, payload.old))
      // votes
      .on('postgres_changes', { event: '*', schema: 'public', table: 'votes', filter: `room_id=eq.${roomId}` },
        (payload) => onEvent(payload.eventType as any, 'votes', payload.new, payload.old))
      // chat
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'chat_messages', filter: `room_id=eq.${roomId}` },
        (payload) => onEvent('INSERT', 'chat_messages', payload.new, null))
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          console.log(`[SprintPoint] Realtime subscribed to room ${roomId}`)
        }
        if (status === 'CHANNEL_ERROR') {
          console.error(`[SprintPoint] Realtime channel error for room ${roomId}`)
        }
      })
  }

  function unsubscribe() {
    if (channel) {
      supabase.removeChannel(channel)
      channel = null
    }
  }

  return { subscribe, unsubscribe }
}