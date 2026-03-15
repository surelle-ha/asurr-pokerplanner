// composables/useSprintPoint.ts

import { ref, computed, onUnmounted } from 'vue'
import { useSupabaseRealtime } from './useSupabaseRealtime'
import type { Database, Room, Member, Ticket, Vote, ChatMessage } from '~/types/sprintpoint'

const COLORS = ['#6366f1', '#ec4899', '#f59e0b', '#10b981', '#3b82f6', '#8b5cf6', '#ef4444', '#14b8a6']
function randomColor() { return COLORS[Math.floor(Math.random() * COLORS.length)] }

function getOrCreateUserId(): string {
  if (typeof window === 'undefined') return 'ssr'
  const KEY = 'sp_user_id'
  let id = localStorage.getItem(KEY)
  if (!id) { id = crypto.randomUUID(); localStorage.setItem(KEY, id) }
  return id
}

export function useSprintPoint() {
  const supabase = useSupabaseClient<Database>()
  const { subscribe, unsubscribe } = useSupabaseRealtime()

  const room         = ref<Room | null>(null)
  const members      = ref<Member[]>([])
  const tickets      = ref<Ticket[]>([])
  const votes        = ref<Vote[]>([])
  const chatMessages = ref<ChatMessage[]>([])
  const publicRooms  = ref<Room[]>([])
  const currentUser  = ref<Member | null>(null)
  const loading      = ref(false)
  const error        = ref<string | null>(null)

  const isLocked       = computed(() => room.value?.locked ?? false)
  const revealed       = computed(() => room.value?.revealed ?? false)
  const activeTicketId = computed(() => room.value?.active_ticket_id ?? null)
  const activeTicket   = computed(() => tickets.value.find(t => t.id === activeTicketId.value) ?? null)
  const voters         = computed(() => members.value.filter(m => !m.is_spectator || (m.is_host && room.value?.host_can_vote)))

  const voteMap = computed(() => {
    const map: Record<string, string> = {}
    if (!activeTicketId.value) return map
    for (const v of votes.value) {
      if (v.ticket_id === activeTicketId.value) map[v.member_id] = v.value
    }
    return map
  })

  const myVote    = computed(() => currentUser.value ? voteMap.value[currentUser.value.id] : undefined)
  const voteCount = computed(() => Object.keys(voteMap.value).length)

  const voteStats = computed(() => {
    if (!revealed.value) return null
    const vals = Object.values(voteMap.value).filter(v => !isNaN(Number(v))).map(Number)
    if (!vals.length) return null
    const avg = vals.reduce((a, b) => a + b, 0) / vals.length
    const freq: Record<number, number> = {}
    vals.forEach(v => { freq[v] = (freq[v] || 0) + 1 })
    const mode = Number(Object.keys(freq).sort((a, b) => freq[+b] - freq[+a])[0])
    return { avg: avg.toFixed(1), min: Math.min(...vals), max: Math.max(...vals), consensus: vals.every(v => v === vals[0]), mode }
  })

  const canVote = computed(() => {
    if (!currentUser.value || !activeTicket.value) return false
    if (currentUser.value.is_spectator) return false
    if (currentUser.value.is_host && !room.value?.host_can_vote) return false
    return !revealed.value
  })

  function handleRealtimeEvent(event: 'INSERT' | 'UPDATE' | 'DELETE', table: string, row: any) {
    switch (table) {
      case 'rooms':
        if (event === 'UPDATE' && room.value?.id === row.id) room.value = row
        if (event === 'DELETE' && room.value?.id === row.id) room.value = null
        break
      case 'members':
        if (event === 'INSERT') members.value = [...members.value, row]
        if (event === 'UPDATE') {
          members.value = members.value.map(m => m.id === row.id ? row : m)
          if (currentUser.value?.id === row.id) currentUser.value = row
        }
        if (event === 'DELETE') {
          members.value = members.value.filter(m => m.id !== row.id)
          // If we lost our own seat somehow, sync it
          if (currentUser.value?.id === row.id) currentUser.value = null
        }
        break
      case 'tickets':
        if (event === 'INSERT') tickets.value = [...tickets.value, row].sort((a, b) => a.order - b.order)
        if (event === 'UPDATE') tickets.value = tickets.value.map(t => t.id === row.id ? row : t)
        if (event === 'DELETE') tickets.value = tickets.value.filter(t => t.id !== row.id)
        break
      case 'votes':
        if (event === 'INSERT') votes.value = [...votes.value, row]
        if (event === 'UPDATE') votes.value = votes.value.map(v => v.id === row.id ? row : v)
        if (event === 'DELETE') votes.value = votes.value.filter(v => v.id !== row.id)
        break
      case 'chat_messages':
        if (event === 'INSERT') chatMessages.value = [...chatMessages.value, row]
        break
    }
  }

  async function loadRoom(roomId: string) {
    loading.value = true
    error.value = null
    try {
      const [roomRes, membersRes, ticketsRes, votesRes, chatRes] = await Promise.all([
        supabase.from('rooms').select('*').eq('id', roomId).single(),
        supabase.from('members').select('*').eq('room_id', roomId),
        supabase.from('tickets').select('*').eq('room_id', roomId).order('order'),
        supabase.from('votes').select('*').eq('room_id', roomId),
        supabase.from('chat_messages').select('*').eq('room_id', roomId).order('created_at').limit(200),
      ])
      if (roomRes.error) throw roomRes.error
      room.value = roomRes.data
      members.value = membersRes.data ?? []
      tickets.value = ticketsRes.data ?? []
      votes.value = votesRes.data ?? []
      chatMessages.value = chatRes.data ?? []
      subscribe(roomId, handleRealtimeEvent)
    } catch (err: any) {
      error.value = err.message ?? 'Failed to load room'
    } finally {
      loading.value = false
    }
  }

  async function loadPublicRooms() {
    const { data } = await supabase.from('rooms').select('*').eq('locked', false).order('created_at', { ascending: false }).limit(20)
    publicRooms.value = data ?? []
  }

  async function sysMsg(roomId: string, text: string) {
    await supabase.from('chat_messages').insert({ room_id: roomId, member_id: null, user_name: 'System', user_color: '#6366f1', text, type: 'system' })
  }

  async function createRoom(opts: { name: string; description?: string; hostName: string; hostCanVote: boolean; allowSpectators: boolean; pin?: string }) {
    const userId = getOrCreateUserId()
    loading.value = true; error.value = null
    try {
      const { data: newRoom, error: roomErr } = await supabase
        .from('rooms')
        .insert({ name: opts.name, description: opts.description ?? null, host_id: userId, host_can_vote: opts.hostCanVote, allow_spectators: opts.allowSpectators, locked: false, revealed: false, active_ticket_id: null, pin: opts.pin || null })
        .select().single()
      if (roomErr) throw roomErr
      const { data: hostMember, error: memberErr } = await supabase
        .from('members')
        .insert({ room_id: newRoom.id, user_id: userId, name: opts.hostName, color: randomColor(), is_host: true, is_spectator: false })
        .select().single()
      if (memberErr) throw memberErr
      await sysMsg(newRoom.id, 'Room created! Share the room code with your team.')
      currentUser.value = hostMember
      await loadRoom(newRoom.id)
      return newRoom.id
    } catch (err: any) {
      error.value = err.message; throw err
    } finally {
      loading.value = false
    }
  }

  async function joinRoom(roomCode: string, userName: string, isSpectator: boolean, pin?: string) {
    const userId = getOrCreateUserId()
    const { data: targetRoom, error: roomErr } = await supabase.from('rooms').select('*').eq('id', roomCode).single()
    if (roomErr || !targetRoom) throw new Error('Room not found')
    if (targetRoom.locked) throw new Error('Room is locked')
    if (targetRoom.pin && targetRoom.pin !== pin) throw new Error('Incorrect PIN')
    const spectator = isSpectator && targetRoom.allow_spectators
    const { data: member, error: memberErr } = await supabase
      .from('members')
      .upsert({ room_id: targetRoom.id, user_id: userId, name: userName, color: randomColor(), is_host: false, is_spectator: spectator }, { onConflict: 'room_id,user_id' })
      .select().single()
    if (memberErr) throw memberErr
    await sysMsg(targetRoom.id, `${userName} joined${spectator ? ' as spectator' : ''}.`)
    currentUser.value = member
    await loadRoom(targetRoom.id)
    return targetRoom.id
  }

  // ── Host transfer ──────────────────────────────────────────────────────────
  async function passHostTo(memberId: string) {
    if (!room.value || !currentUser.value?.is_host) return
    const target = members.value.find(m => m.id === memberId)
    if (!target) return
    // Strip host from current user
    await supabase.from('members').update({ is_host: false }).eq('id', currentUser.value.id)
    // Promote target
    await supabase.from('members').update({ is_host: true }).eq('id', memberId)
    // Update room host_id
    await supabase.from('rooms').update({ host_id: target.user_id }).eq('id', room.value.id)
    await sysMsg(room.value.id, `${target.name} is now the host.`)
  }

  async function toggleLock() {
    if (!room.value) return
    const newLocked = !room.value.locked
    await supabase.from('rooms').update({ locked: newLocked }).eq('id', room.value.id)
    await sysMsg(room.value.id, newLocked ? '🔒 Room locked by host.' : '🔓 Room unlocked.')
  }

  async function addTicket(title: string, description?: string) {
    if (!room.value) return
    const maxOrder = tickets.value.reduce((m, t) => Math.max(m, t.order), -1)
    const { data: ticket, error: err } = await supabase
      .from('tickets').insert({ room_id: room.value.id, title, description: description ?? null, order: maxOrder + 1 }).select().single()
    if (err) { error.value = err.message; return }
    if (!room.value.active_ticket_id) await setActiveTicket(ticket.id)
    else await sysMsg(room.value.id, `Ticket added: "${title}"`)
  }

  async function removeTicket(ticketId: string) {
    if (!room.value) return
    await supabase.from('tickets').delete().eq('id', ticketId)
    if (room.value.active_ticket_id === ticketId)
      await supabase.from('rooms').update({ active_ticket_id: null, revealed: false }).eq('id', room.value.id)
  }

  async function setActiveTicket(ticketId: string) {
    if (!room.value || revealed.value) return
    const ticket = tickets.value.find(t => t.id === ticketId)
    await supabase.from('votes').delete().eq('room_id', room.value.id).eq('ticket_id', ticketId)
    await supabase.from('rooms').update({ active_ticket_id: ticketId, revealed: false }).eq('id', room.value.id)
    await sysMsg(room.value.id, `Now estimating: "${ticket?.title}"`)
  }

  async function castVote(value: string) {
    if (!canVote.value || !currentUser.value || !room.value || !activeTicketId.value) return
    const existing = votes.value.find(v => v.ticket_id === activeTicketId.value && v.member_id === currentUser.value!.id)
    if (existing && existing.value === value) await supabase.from('votes').delete().eq('id', existing.id)
    else await supabase.from('votes').upsert({ room_id: room.value.id, ticket_id: activeTicketId.value, member_id: currentUser.value.id, value }, { onConflict: 'ticket_id,member_id' })
  }

  async function revealVotes() {
    if (!room.value) return
    await supabase.from('rooms').update({ revealed: true }).eq('id', room.value.id)
  }

  async function resetVoting() {
    if (!room.value || !activeTicketId.value) return
    await supabase.from('votes').delete().eq('ticket_id', activeTicketId.value)
    await supabase.from('rooms').update({ revealed: false }).eq('id', room.value.id)
  }

  async function acceptScore(score: string) {
    if (!room.value || !activeTicketId.value) return
    const ticket = tickets.value.find(t => t.id === activeTicketId.value)
    if (!ticket) return
    await supabase.from('tickets').update({ final_score: score }).eq('id', ticket.id)
    await sysMsg(room.value.id, `"${ticket.title}" → ${score} pts`)
    const sorted = [...tickets.value].sort((a, b) => a.order - b.order)
    const next = sorted.slice(sorted.findIndex(t => t.id === activeTicketId.value) + 1).find(t => !t.final_score)
    await supabase.from('rooms').update({ active_ticket_id: next?.id ?? null, revealed: false }).eq('id', room.value.id)
    if (next) {
      await supabase.from('votes').delete().eq('room_id', room.value.id).eq('ticket_id', next.id)
      await sysMsg(room.value.id, `Now estimating: "${next.title}"`)
    }
  }

  async function sendChat(text: string) {
    if (!room.value || !currentUser.value || !text.trim()) return
    await supabase.from('chat_messages').insert({ room_id: room.value.id, member_id: currentUser.value.id, user_name: currentUser.value.name, user_color: currentUser.value.color, text: text.trim(), type: 'chat' })
  }

  async function leaveRoom() {
    if (!room.value || !currentUser.value) return
    const roomId = room.value.id
    const leavingMember = currentUser.value
    unsubscribe()

    // If host is leaving, promote next member first
    if (leavingMember.is_host) {
      const successor = members.value.find(m => m.id !== leavingMember.id && !m.is_spectator)
      if (successor) {
        await supabase.from('members').update({ is_host: true }).eq('id', successor.id)
        await supabase.from('rooms').update({ host_id: successor.user_id }).eq('id', roomId)
        await sysMsg(roomId, `${leavingMember.name} left. ${successor.name} is now the host.`)
      }
    }

    await supabase.from('members').delete().eq('id', leavingMember.id)
    const { count } = await supabase.from('members').select('*', { count: 'exact', head: true }).eq('room_id', roomId)
    if (count === 0) await supabase.from('rooms').delete().eq('id', roomId)

    room.value = null; members.value = []; tickets.value = []
    votes.value = []; chatMessages.value = []; currentUser.value = null
  }

  onUnmounted(unsubscribe)

  return {
    room, members, tickets, votes, chatMessages, publicRooms, currentUser, loading, error,
    isLocked, revealed, activeTicketId, activeTicket, voters, voteMap, myVote, voteCount, voteStats, canVote,
    loadPublicRooms, createRoom, joinRoom, toggleLock, addTicket, removeTicket,
    setActiveTicket, castVote, revealVotes, resetVoting, acceptScore, sendChat, leaveRoom, passHostTo,
  }
}