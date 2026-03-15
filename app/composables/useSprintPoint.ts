// composables/useSprintPoint.ts

import { ref, computed, watch, onUnmounted } from 'vue'
import { useSupabaseRealtime } from './useSupabaseRealtime'
import type { Database, Room, Member, Ticket, Vote, ChatMessage } from '~/types/sprintpoint'

const COLORS = ['#6366f1', '#ec4899', '#f59e0b', '#10b981', '#3b82f6', '#8b5cf6', '#ef4444', '#14b8a6']
function randomColor() { return COLORS[Math.floor(Math.random() * COLORS.length)] }

// ── User identity ─────────────────────────────────────────────────────────────
// Each user has a global fallback UUID (auto-generated, invisible) and an
// optional room-scoped token they choose themselves. The room-scoped token
// is stored as  sp_token:<roomId>  so rejoining with the same token reconnects
// to the same member row — preventing duplicate seats.
//
// Token rules:
//   • 4–24 characters, alphanumeric + hyphen/underscore
//   • Stored per room so you can use different tokens in different rooms
//   • Shown to the user after joining so they can write it down

function getGlobalUserId(): string {
  if (typeof window === 'undefined') return 'ssr'
  const KEY = 'sp_user_id'
  let id = localStorage.getItem(KEY)
  if (!id) { id = crypto.randomUUID(); localStorage.setItem(KEY, id) }
  return id
}

function getRoomToken(roomId: string): string | null {
  if (typeof window === 'undefined') return null
  return localStorage.getItem(`sp_token:${roomId}`)
}

function setRoomToken(roomId: string, token: string) {
  if (typeof window === 'undefined') return
  localStorage.setItem(`sp_token:${roomId}`, token)
}

// Generate a memorable default token: adjective + noun + 3 digits
const ADJ  = ['swift','bold','calm','keen','wise','epic','dark','cool','pure','loud']
const NOUN = ['fox','hawk','wolf','bear','lion','crow','seal','deer','owl','lynx']
function generateDefaultToken(): string {
  const a = ADJ[Math.floor(Math.random() * ADJ.length)]
  const n = NOUN[Math.floor(Math.random() * NOUN.length)]
  const d = String(Math.floor(Math.random() * 900) + 100)
  return `${a}-${n}-${d}`
}

export function useSprintPoint() {
  const supabase = useSupabaseClient<Database>()
  const { subscribe, unsubscribe } = useSupabaseRealtime()

  // ─── State ──────────────────────────────────────────────────────────────────
  const room         = ref<Room | null>(null)
  const members      = ref<Member[]>([])
  const tickets      = ref<Ticket[]>([])
  const votes        = ref<Vote[]>([])
  const chatMessages = ref<ChatMessage[]>([])
  const currentUser  = ref<Member | null>(null)
  const loading      = ref(false)
  const error        = ref<string | null>(null)
  const myToken      = ref<string | null>(null)   // the rejoin token for current room

  // ─── Computed ────────────────────────────────────────────────────────────────
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

  // ─── Realtime handler ────────────────────────────────────────────────────────
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

  // ─── Load room ───────────────────────────────────────────────────────────────
  async function loadRoom(roomId: string) {
    loading.value = true; error.value = null
    try {
      const [roomRes, membersRes, ticketsRes, votesRes, chatRes] = await Promise.all([
        supabase.from('rooms').select('*').eq('id', roomId).single(),
        supabase.from('members').select('*').eq('room_id', roomId),
        supabase.from('tickets').select('*').eq('room_id', roomId).order('order'),
        supabase.from('votes').select('*').eq('room_id', roomId),
        supabase.from('chat_messages').select('*').eq('room_id', roomId).order('created_at').limit(200),
      ])
      if (roomRes.error) throw roomRes.error
      room.value         = roomRes.data
      members.value      = membersRes.data ?? []
      tickets.value      = ticketsRes.data ?? []
      votes.value        = votesRes.data ?? []
      chatMessages.value = chatRes.data ?? []
      subscribe(roomId, handleRealtimeEvent)
    } catch (err: any) {
      error.value = err.message ?? 'Failed to load room'
    } finally {
      loading.value = false
    }
  }

  async function sysMsg(roomId: string, text: string) {
    await supabase.from('chat_messages').insert({
      room_id: roomId, member_id: null,
      user_name: 'System', user_color: '#6366f1', text, type: 'system',
    })
  }

  // ─── Emoji via Supabase Realtime Broadcast ────────────────────────────────────
  // We use Realtime Broadcast (ephemeral, not persisted) instead of inserting into
  // chat_messages. This is instant and doesn't pollute the chat table.
  // The channel is already open from subscribe() — we piggyback on it.
  async function broadcastEmoji(emoji: string) {
    if (!room.value || !currentUser.value) return
    // Ephemeral broadcast over the existing room channel
    const channel = (supabase as any).channel(`room:${room.value.id}`)
    channel.send({
      type: 'broadcast',
      event: 'emoji',
      payload: { emoji, from: currentUser.value.id },
    })
  }

  // ─── Actions ─────────────────────────────────────────────────────────────────

  async function createRoom(opts: {
    name: string; description?: string; hostName: string
    hostCanVote: boolean; allowSpectators: boolean; pin?: string; token?: string
  }) {
    const userId = getGlobalUserId()
    // Use provided token or generate a memorable default
    const token = (opts.token?.trim() || generateDefaultToken()).toLowerCase()
    loading.value = true; error.value = null
    try {
      const { data: newRoom, error: roomErr } = await supabase
        .from('rooms')
        .insert({
          name: opts.name, description: opts.description ?? null,
          host_id: userId, host_can_vote: opts.hostCanVote,
          allow_spectators: opts.allowSpectators, locked: false,
          revealed: false, active_ticket_id: null, pin: opts.pin || null,
        })
        .select().single()
      if (roomErr) throw roomErr

      const { data: hostMember, error: memberErr } = await supabase
        .from('members')
        .insert({
          room_id: newRoom.id, user_id: userId, name: opts.hostName,
          color: randomColor(), is_host: true, is_spectator: false,
          rejoin_token: token,
        })
        .select().single()
      if (memberErr) throw memberErr

      setRoomToken(newRoom.id, token)
      myToken.value = token
      await sysMsg(newRoom.id, 'Room created! Share the room code with your team.')
      currentUser.value = hostMember
      await loadRoom(newRoom.id)

      // Subscribe to emoji broadcasts
      subscribeEmojiBroadcast(newRoom.id)
      return newRoom.id
    } catch (err: any) {
      error.value = err.message; throw err
    } finally {
      loading.value = false
    }
  }

  async function joinRoom(roomCode: string, userName: string, isSpectator: boolean, pin?: string, token?: string) {
    const userId = getGlobalUserId()
    const finalToken = (token?.trim() || getRoomToken(roomCode) || generateDefaultToken()).toLowerCase()

    const { data: targetRoom, error: roomErr } = await supabase
      .from('rooms').select('*').eq('id', roomCode).single()
    if (roomErr || !targetRoom) throw new Error('Room not found')
    if (targetRoom.locked) throw new Error('Room is locked')
    if (targetRoom.pin && targetRoom.pin !== pin) throw new Error('Incorrect PIN')

    const spectator = isSpectator && targetRoom.allow_spectators

    // Check if a member with this token already exists → rejoin that seat
    const { data: existing } = await supabase
      .from('members')
      .select('*')
      .eq('room_id', roomCode)
      .eq('rejoin_token', finalToken)
      .maybeSingle()

    let member: Member
    if (existing) {
      // Rejoin: always update the existing seat — new device gets ownership,
      // new name is applied, and color is preserved from the original seat.
      const nameChanged = existing.name !== userName
      const { data: updated, error: upErr } = await supabase
        .from('members')
        .update({ user_id: userId, name: userName, is_spectator: spectator })
        .eq('id', existing.id)
        .select().single()
      if (upErr) throw upErr
      member = updated
      const msg = nameChanged
        ? `${existing.name} rejoined as ${userName}.`
        : `${userName} rejoined.`
      await sysMsg(targetRoom.id, msg)
    } else {
      // No token match — check if this user_id already has a seat (page refresh / reconnect)
      const { data: byUserId } = await supabase
        .from('members')
        .select('*')
        .eq('room_id', roomCode)
        .eq('user_id', userId)
        .maybeSingle()

      if (byUserId) {
        // Same browser re-joining: update name if changed, refresh token
        const nameChanged = byUserId.name !== userName
        const { data: updated, error: upErr } = await supabase
          .from('members')
          .update({ name: userName, is_spectator: spectator, rejoin_token: finalToken })
          .eq('id', byUserId.id)
          .select().single()
        if (upErr) throw upErr
        member = updated
        if (nameChanged) await sysMsg(targetRoom.id, `${byUserId.name} is now known as ${userName}.`)
      } else {
        // Genuinely new seat
        const { data: newMember, error: memberErr } = await supabase
          .from('members')
          .insert({
            room_id: targetRoom.id, user_id: userId, name: userName,
            color: randomColor(), is_host: false, is_spectator: spectator,
            rejoin_token: finalToken,
          })
          .select().single()
        if (memberErr) throw memberErr
        member = newMember
        await sysMsg(targetRoom.id, `${userName} joined${spectator ? ' as spectator' : ''}.`)
      }
    }

    setRoomToken(roomCode, finalToken)
    myToken.value = finalToken
    currentUser.value = member
    await loadRoom(targetRoom.id)
    subscribeEmojiBroadcast(targetRoom.id)
    return targetRoom.id
  }

  // ─── Emoji broadcast subscription ────────────────────────────────────────────
  // Import the emojiFlash callback from the Vue component via a ref
  const onEmojiReceived = ref<((emoji: string) => void) | null>(null)

  function subscribeEmojiBroadcast(roomId: string) {
    const channel = supabase.channel(`room:${roomId}`)
    channel.on('broadcast', { event: 'emoji' }, (payload: any) => {
      // Don't show our own emoji twice (we already trigger locally)
      if (payload.payload?.from !== currentUser.value?.id) {
        onEmojiReceived.value?.(payload.payload?.emoji)
      }
    })
    // Note: channel.subscribe() is already called by useSupabaseRealtime on the
    // same channel key — Supabase deduplicates channel subscriptions automatically.
  }

  // ── Host transfer ──────────────────────────────────────────────────────────
  async function passHostTo(memberId: string) {
    if (!room.value || !currentUser.value?.is_host) return
    const target = members.value.find(m => m.id === memberId)
    if (!target) return
    const prevHostId = currentUser.value.id
    await supabase.from('members').update({ is_host: true }).eq('id', memberId)
    await supabase.from('rooms').update({ host_id: target.user_id }).eq('id', room.value.id)
    await supabase.from('members').update({ is_host: false }).eq('id', prevHostId)
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
      .from('tickets')
      .insert({ room_id: room.value.id, title, description: description ?? null, order: maxOrder + 1 })
      .select().single()
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
    else await supabase.from('votes').upsert(
      { room_id: room.value.id, ticket_id: activeTicketId.value, member_id: currentUser.value.id, value },
      { onConflict: 'ticket_id,member_id' }
    )
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
    await supabase.from('chat_messages').insert({
      room_id: room.value.id, member_id: currentUser.value.id,
      user_name: currentUser.value.name, user_color: currentUser.value.color,
      text: text.trim(), type: 'chat',
    })
  }

  async function leaveRoom() {
    if (!room.value || !currentUser.value) return
    const roomId = room.value.id
    const leavingMember = { ...currentUser.value }

    if (leavingMember.is_host) {
      await supabase.from('members').update({ is_host: false }).eq('id', leavingMember.id)
      const successor = members.value.find(m => m.id !== leavingMember.id && !m.is_spectator)
      if (successor) {
        await supabase.from('members').update({ is_host: true }).eq('id', successor.id)
        await supabase.from('rooms').update({ host_id: successor.user_id }).eq('id', roomId)
        await sysMsg(roomId, `${leavingMember.name} left. ${successor.name} is now the host.`)
      }
    }

    await supabase.from('members').delete().eq('id', leavingMember.id)

    const { count } = await supabase
      .from('members').select('*', { count: 'exact', head: true }).eq('room_id', roomId)
    if ((count ?? 0) === 0) {
      await supabase.from('rooms').delete().eq('id', roomId)
    }

    unsubscribe()
    room.value = null; members.value = []; tickets.value = []
    votes.value = []; chatMessages.value = []; currentUser.value = null
    myToken.value = null
  }

  onUnmounted(unsubscribe)

  return {
    room, members, tickets, votes, chatMessages, currentUser, loading, error,
    myToken, onEmojiReceived,
    isLocked, revealed, activeTicketId, activeTicket, voters,
    voteMap, myVote, voteCount, voteStats, canVote,
    generateDefaultToken,
    loadRoom, createRoom, joinRoom, toggleLock, addTicket, removeTicket,
    setActiveTicket, castVote, revealVotes, resetVoting, acceptScore,
    sendChat, leaveRoom, passHostTo, broadcastEmoji,
  }
}