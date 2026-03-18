// composables/useSprintPoint.ts
//
// Key design decision: members are NEVER deleted on leave.
// Instead, leaving sets is_active=false. Rejoining sets is_active=true.
// This keeps the same member.id across sessions, so Realtime UPDATE events
// always match the existing row on other clients — no ghost entries, no
// hard-refresh required.
//
// Run migration 007_member_active.sql to add the is_active column.

import { ref, computed, onUnmounted } from 'vue'
import { useSupabaseRealtime } from './useSupabaseRealtime'
import { useSupabase } from './supabase.client'
import type { Database, Room, Member, Ticket, Vote, ChatMessage } from '~/types/sprintpoint'

const COLORS = ['#6366f1', '#ec4899', '#f59e0b', '#10b981', '#3b82f6', '#8b5cf6', '#ef4444', '#14b8a6']
const HEARTBEAT_MS  = 20_000
const OFFLINE_AFTER = 60_000

function randomColor() { return COLORS[Math.floor(Math.random() * COLORS.length)] }

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
function saveSession(roomId: string, memberId: string) {
  if (typeof window === 'undefined') return
  localStorage.setItem('sp_session', JSON.stringify({ roomId, memberId }))
}
function clearSession() {
  if (typeof window === 'undefined') return
  localStorage.removeItem('sp_session')
}
function loadSession(): { roomId: string; memberId: string } | null {
  if (typeof window === 'undefined') return null
  try { return JSON.parse(localStorage.getItem('sp_session') || 'null') } catch { return null }
}

const ADJ  = ['swift','bold','calm','keen','wise','epic','dark','cool','pure','loud']
const NOUN = ['fox','hawk','wolf','bear','lion','crow','seal','deer','owl','lynx']
export function generateDefaultToken(): string {
  const a = ADJ[Math.floor(Math.random() * ADJ.length)]
  const n = NOUN[Math.floor(Math.random() * NOUN.length)]
  return `${a}-${n}-${String(Math.floor(Math.random() * 900) + 100)}`
}

export function useSprintPoint() {
  const supabase = useSupabase()
  const { subscribe, unsubscribe } = useSupabaseRealtime()

  const room         = ref<Room | null>(null)
  const members      = ref<Member[]>([])
  const tickets      = ref<Ticket[]>([])
  const votes        = ref<Vote[]>([])
  const chatMessages = ref<ChatMessage[]>([])
  const currentUser  = ref<Member | null>(null)
  const loading      = ref(false)
  const error        = ref<string | null>(null)
  const myToken      = ref<string | null>(null)
  let heartbeatTimer: ReturnType<typeof setInterval> | null = null

  // ─── Computed ────────────────────────────────────────────────────────────────
  const isLocked       = computed(() => room.value?.locked ?? false)
  const revealed       = computed(() => room.value?.revealed ?? false)
  const activeTicketId = computed(() => room.value?.active_ticket_id ?? null)
  const activeTicket   = computed(() => tickets.value.find(t => t.id === activeTicketId.value) ?? null)

  // Only show active members (is_active=true); inactive ones are hidden entirely
  const activeMembers  = computed(() => members.value.filter(m => m.is_active !== false))
  const voters         = computed(() => activeMembers.value.filter(m => !m.is_spectator || (m.is_host && room.value?.host_can_vote)))

  // Online = active AND seen within OFFLINE_AFTER window
  const onlineMembers  = computed(() => {
    const cutoff = Date.now() - OFFLINE_AFTER
    return activeMembers.value.filter(m => !m.last_seen || new Date(m.last_seen).getTime() > cutoff)
  })

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

  // ─── Leaderboard ─────────────────────────────────────────────────────────────
  // Computes per-member accuracy (votes that matched the final score) and
  // streak (best consecutive run of accurate estimates) from completed tickets.
  const leaderboard = computed(() => {
    if (!room.value?.enable_leaderboard) return []
    const completedTickets = tickets.value.filter(t => t.final_score !== null)
    if (!completedTickets.length) return []

    const stats: Record<string, {
      memberId: string; name: string; color: string
      voted: number; accurate: number; bestStreak: number; currentStreak: number
    }> = {}

    // Seed entries for all active members
    for (const m of members.value) {
      stats[m.id] = { memberId: m.id, name: m.name, color: m.color, voted: 0, accurate: 0, bestStreak: 0, currentStreak: 0 }
    }

    // Walk completed tickets in order; build accuracy per member
    for (const ticket of completedTickets.sort((a, b) => a.order - b.order)) {
      const ticketVotes = votes.value.filter(v => v.ticket_id === ticket.id)
      for (const v of ticketVotes) {
        if (!stats[v.member_id]) continue
        const s = stats[v.member_id]
        s.voted++
        const hit = String(v.value) === String(ticket.final_score)
        if (hit) {
          s.accurate++
          s.currentStreak++
          if (s.currentStreak > s.bestStreak) s.bestStreak = s.currentStreak
        } else {
          s.currentStreak = 0
        }
      }
    }

    return Object.values(stats)
      .filter(s => s.voted > 0)
      .sort((a, b) => b.accurate - a.accurate || b.bestStreak - a.bestStreak)
  })

  // ─── Realtime handler ────────────────────────────────────────────────────────
  function handleRealtimeEvent(event: 'INSERT' | 'UPDATE' | 'DELETE', table: string, row: any) {
    switch (table) {
      case 'rooms':
        if (event === 'UPDATE' && room.value?.id === row.id) room.value = row
        if (event === 'DELETE' && room.value?.id === row.id) room.value = null
        break

      case 'members':
        if (event === 'INSERT') {
          if (!members.value.some(m => m.id === row.id)) {
            members.value = [...members.value, row]
          }
        }
        if (event === 'UPDATE') {
          // If OUR OWN row was set inactive, we've been kicked — force-eject
          if (row.id === currentUser.value?.id && row.is_active === false) {
            onKicked.value?.()
            break
          }
          if (members.value.some(m => m.id === row.id)) {
            // If the updated row is now inactive, remove it from the local list
            if (row.is_active === false) {
              members.value = members.value.filter(m => m.id !== row.id)
            } else {
              members.value = members.value.map(m => m.id === row.id ? row : m)
            }
          } else if (row.is_active !== false) {
            // Row rejoined after being inactive
            members.value = [...members.value, row]
          }
          if (currentUser.value?.id === row.id) currentUser.value = row
        }
        if (event === 'DELETE') {
          members.value = members.value.filter(m => m.id !== row.id)
          if (currentUser.value?.id === row.id) currentUser.value = null
        }
        break

      case 'tickets':
        if (event === 'INSERT') {
          if (!tickets.value.some(t => t.id === row.id))
            tickets.value = [...tickets.value, row].sort((a, b) => a.order - b.order)
        }
        if (event === 'UPDATE') tickets.value = tickets.value.map(t => t.id === row.id ? row : t)
        if (event === 'DELETE' && row.id) {
          // row.id may be undefined if REPLICA IDENTITY FULL is not set —
          // in that case the optimistic delete in removeTicket() already handled it
          tickets.value = tickets.value.filter(t => t.id !== row.id)
        }
        break

      case 'votes':
        if (event === 'INSERT') {
          // Replace optimistic tmp entry if present, else append
          const tmp = votes.value.find(v => v.member_id === row.member_id && v.ticket_id === row.ticket_id && String(v.id).startsWith('tmp-'))
          if (tmp) votes.value = votes.value.map(v => v.id === tmp.id ? row : v)
          else if (!votes.value.some(v => v.id === row.id)) votes.value = [...votes.value, row]
        }
        if (event === 'UPDATE') votes.value = votes.value.map(v => v.id === row.id ? row : v)
        if (event === 'DELETE' && row.id) votes.value = votes.value.filter(v => v.id !== row.id)
        break

      case 'chat_messages':
        if (event === 'INSERT') chatMessages.value = [...chatMessages.value, row]
        break
    }
  }

  // ─── Heartbeat ───────────────────────────────────────────────────────────────
  function startHeartbeat() {
    stopHeartbeat()
    heartbeatTimer = setInterval(async () => {
      if (!currentUser.value) return
      await supabase.from('members')
        .update({ last_seen: new Date().toISOString() })
        .eq('id', currentUser.value.id)
    }, HEARTBEAT_MS)
  }
  function stopHeartbeat() {
    if (heartbeatTimer) { clearInterval(heartbeatTimer); heartbeatTimer = null }
  }

  // ─── Load room ───────────────────────────────────────────────────────────────
  async function loadRoom(roomId: string) {
    loading.value = true; error.value = null
    try {
      const [roomRes, membersRes, ticketsRes, votesRes, chatRes] = await Promise.all([
        supabase.from('rooms').select('*').eq('id', roomId).single(),
        // Only load active members for the initial snapshot
        supabase.from('members').select('*').eq('room_id', roomId).eq('is_active', true),
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
      startHeartbeat()
    } catch (err: any) {
      error.value = err.message ?? 'Failed to load room'
    } finally {
      loading.value = false
    }
  }

  // ─── Resume session ───────────────────────────────────────────────────────────
  async function resumeSession(): Promise<boolean> {
    const session = loadSession()
    if (!session) return false
    const userId = getGlobalUserId()
    const { data: existingRoom } = await supabase
      .from('rooms').select('*').eq('id', session.roomId).maybeSingle()
    if (!existingRoom) { clearSession(); return false }
    let member: Member | null = null
    const { data: byId } = await supabase
      .from('members').select('*').eq('id', session.memberId).maybeSingle()
    if (byId) {
      member = byId
    } else {
      const { data: byUser } = await supabase
        .from('members').select('*').eq('room_id', session.roomId).eq('user_id', userId).maybeSingle()
      member = byUser ?? null
    }
    if (!member) { clearSession(); return false }
    // Reactivate and update last_seen
    const { data: refreshed } = await supabase
      .from('members')
      .update({ user_id: userId, is_active: true, last_seen: new Date().toISOString() })
      .eq('id', member.id)
      .select().single()
    currentUser.value = refreshed ?? member
    myToken.value = getRoomToken(session.roomId)
    await loadRoom(session.roomId)
    saveSession(session.roomId, member.id)
    subscribeEmojiBroadcast(session.roomId)
    return true
  }

  // ─── Helpers ─────────────────────────────────────────────────────────────────
  async function sysMsg(roomId: string, text: string) {
    await supabase.from('chat_messages').insert({
      room_id: roomId, member_id: null,
      user_name: 'System', user_color: '#6366f1', text, type: 'system',
    })
  }

  const onEmojiReceived = ref<((emoji: string) => void) | null>(null)
  // Called when the current user's own is_active is set to false (kicked)
  const onKicked = ref<(() => void) | null>(null)

  async function broadcastEmoji(emoji: string) {
    if (!room.value || !currentUser.value) return
    const channel = (supabase as any).channel(`room:${room.value.id}`)
    channel.send({ type: 'broadcast', event: 'emoji', payload: { emoji, from: currentUser.value.id } })
  }

  function subscribeEmojiBroadcast(roomId: string) {
    const channel = supabase.channel(`room:${roomId}`)
    channel.on('broadcast', { event: 'emoji' }, (payload: any) => {
      if (payload.payload?.from !== currentUser.value?.id) {
        onEmojiReceived.value?.(payload.payload?.emoji)
      }
    })
  }

  // ─── Actions ─────────────────────────────────────────────────────────────────

  async function createRoom(opts: {
    name: string; description?: string; hostName: string
    hostCanVote: boolean; allowSpectators: boolean; pin?: string; token?: string; enableLeaderboard?: boolean
  }) {
    const userId = getGlobalUserId()
    const token  = (opts.token?.trim() || generateDefaultToken()).toLowerCase()
    loading.value = true; error.value = null
    try {
      const { data: newRoom, error: roomErr } = await supabase
        .from('rooms')
        .insert({ name: opts.name, description: opts.description ?? null, host_id: userId, host_can_vote: opts.hostCanVote, allow_spectators: opts.allowSpectators, locked: false, revealed: false, active_ticket_id: null, pin: opts.pin || null, enable_leaderboard: opts.enableLeaderboard ?? false })
        .select().single()
      if (roomErr) throw roomErr

      const { data: hostMember, error: memberErr } = await supabase
        .from('members')
        .insert({ room_id: newRoom.id, user_id: userId, name: opts.hostName, color: randomColor(), is_host: true, is_spectator: false, is_active: true, rejoin_token: token, last_seen: new Date().toISOString() })
        .select().single()
      if (memberErr) throw memberErr

      setRoomToken(newRoom.id, token)
      myToken.value = token
      await sysMsg(newRoom.id, 'Room created! Share the room code with your team.')
      currentUser.value = hostMember
      await loadRoom(newRoom.id)
      saveSession(newRoom.id, hostMember.id)
      subscribeEmojiBroadcast(newRoom.id)
      return newRoom.id
    } catch (err: any) {
      error.value = err.message; throw err
    } finally {
      loading.value = false
    }
  }

  async function joinRoom(roomCode: string, userName: string, isSpectator: boolean, pin?: string, token?: string) {
    const userId     = getGlobalUserId()
    const finalToken = (token?.trim() || getRoomToken(roomCode) || generateDefaultToken()).toLowerCase()

    const { data: targetRoom, error: roomErr } = await supabase
      .from('rooms').select('*').eq('id', roomCode).single()
    if (roomErr || !targetRoom) throw new Error('Room not found')
    if (targetRoom.locked) throw new Error('Room is locked')
    if (targetRoom.pin && targetRoom.pin !== pin) throw new Error('Incorrect PIN')

    const spectator = isSpectator && targetRoom.allow_spectators
    let member: Member

    // 1. Match by rejoin token (searches ALL members, active or inactive)
    const { data: byToken } = await supabase
      .from('members').select('*')
      .eq('room_id', roomCode)
      .eq('rejoin_token', finalToken)
      .maybeSingle()

    if (byToken) {
      const nameChanged = byToken.name !== userName
      // Always UPDATE (never insert) — keeps the same member.id so other
      // clients' Realtime handlers patch the existing row cleanly
      const { data: updated, error: upErr } = await supabase
        .from('members')
        .update({
          user_id: userId,
          name: userName,
          is_spectator: spectator,
          is_active: true,
          last_seen: new Date().toISOString(),
        })
        .eq('id', byToken.id)
        .select().single()
      if (upErr) throw upErr
      member = updated
      await sysMsg(targetRoom.id, nameChanged
        ? `${byToken.name} rejoined as ${userName}.`
        : `${userName} rejoined.`)
    } else {
      // 2. Same browser / same user_id
      const { data: byUser } = await supabase
        .from('members').select('*')
        .eq('room_id', roomCode)
        .eq('user_id', userId)
        .maybeSingle()

      if (byUser) {
        const nameChanged = byUser.name !== userName
        const { data: updated, error: upErr } = await supabase
          .from('members')
          .update({
            name: userName,
            is_spectator: spectator,
            is_active: true,
            rejoin_token: finalToken,
            last_seen: new Date().toISOString(),
          })
          .eq('id', byUser.id)
          .select().single()
        if (upErr) throw upErr
        member = updated
        if (nameChanged) await sysMsg(targetRoom.id, `${byUser.name} is now known as ${userName}.`)
        else await sysMsg(targetRoom.id, `${userName} rejoined.`)
      } else {
        // 3. Genuinely new seat
        const { data: newMember, error: memberErr } = await supabase
          .from('members')
          .insert({
            room_id: targetRoom.id,
            user_id: userId,
            name: userName,
            color: randomColor(),
            is_host: false,
            is_spectator: spectator,
            is_active: true,
            rejoin_token: finalToken,
            last_seen: new Date().toISOString(),
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
    saveSession(targetRoom.id, member.id)
    subscribeEmojiBroadcast(targetRoom.id)
    return targetRoom.id
  }

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

  async function kickMember(memberId: string) {
    if (!room.value || !currentUser.value?.is_host) return
    const target = members.value.find(m => m.id === memberId)
    if (!target || target.id === currentUser.value.id) return
    // Mark inactive — same as leaveRoom for that member
    await supabase.from('members')
      .update({ is_active: false, last_seen: new Date().toISOString() })
      .eq('id', memberId)
    await sysMsg(room.value.id, `${target.name} was removed from the room.`)
  }

  async function toggleLock() {
    if (!room.value) return
    const newLocked = !room.value.locked
    await supabase.from('rooms').update({ locked: newLocked }).eq('id', room.value.id)
    await sysMsg(room.value.id, newLocked ? '🔒 Room locked by host.' : '🔓 Room unlocked.')
  }

  async function addTicket(title: string, description?: string, url?: string) {
    if (!room.value) return
    const maxOrder = tickets.value.reduce((m, t) => Math.max(m, t.order), -1)
    const { data: ticket, error: err } = await supabase
      .from('tickets')
      .insert({ room_id: room.value.id, title, description: description ?? null, url: url ?? null, order: maxOrder + 1 })
      .select().single()
    if (err) { error.value = err.message; return }
    if (!room.value.active_ticket_id) {
      // Pass the known title directly — avoids the race where the Realtime
      // INSERT hasn't arrived yet so tickets.value doesn't have this row yet
      await setActiveTicket(ticket.id, title)
    } else {
      await sysMsg(room.value.id, `Ticket added: "${title}"`)
    }
  }

  async function removeTicket(ticketId: string) {
    if (!room.value) return

    // Optimistic update — remove immediately from local state so the UI
    // responds instantly without waiting for Realtime (which requires
    // REPLICA IDENTITY FULL to carry the id in DELETE payloads).
    tickets.value = tickets.value.filter(t => t.id !== ticketId)
    votes.value   = votes.value.filter(v => v.ticket_id !== ticketId)

    // Clear active ticket if it was the one deleted
    const wasActive = room.value.active_ticket_id === ticketId
    if (wasActive) room.value = { ...room.value, active_ticket_id: null, revealed: false }

    // Persist to DB — Realtime will propagate to other users
    await supabase.from('tickets').delete().eq('id', ticketId)
    if (wasActive)
      await supabase.from('rooms').update({ active_ticket_id: null, revealed: false }).eq('id', room.value.id)
  }

  async function setActiveTicket(ticketId: string, knownTitle?: string) {
    if (!room.value || revealed.value) return
    // Use knownTitle when provided (avoids undefined when Realtime hasn't delivered the INSERT yet)
    const title = knownTitle ?? tickets.value.find(t => t.id === ticketId)?.title ?? ''
    await supabase.from('votes').delete().eq('room_id', room.value.id).eq('ticket_id', ticketId)
    await supabase.from('rooms').update({ active_ticket_id: ticketId, revealed: false }).eq('id', room.value.id)
    if (title) await sysMsg(room.value.id, `Now estimating: "${title}"`)
  }

  async function castVote(value: string) {
    if (!canVote.value || !currentUser.value || !room.value || !activeTicketId.value) return
    const existing = votes.value.find(v => v.ticket_id === activeTicketId.value && v.member_id === currentUser.value!.id)
    if (existing && existing.value === value) {
      // Optimistic retract
      votes.value = votes.value.filter(v => v.id !== existing.id)
      await supabase.from('votes').delete().eq('id', existing.id)
    } else {
      // Optimistic upsert — add/replace locally then sync to DB
      const optimistic = {
        id: existing?.id ?? `tmp-${Date.now()}`,
        room_id: room.value.id,
        ticket_id: activeTicketId.value,
        member_id: currentUser.value.id,
        value,
        created_at: new Date().toISOString(),
      }
      if (existing) {
        votes.value = votes.value.map(v => v.id === existing.id ? optimistic : v)
      } else {
        votes.value = [...votes.value, optimistic]
      }
      const { data: saved } = await supabase.from('votes').upsert(
        { room_id: room.value.id, ticket_id: activeTicketId.value, member_id: currentUser.value.id, value },
        { onConflict: 'ticket_id,member_id' }
      ).select().single()
      // Replace the optimistic entry with the real DB row (has correct id)
      if (saved) votes.value = votes.value.map(v => v.id === optimistic.id ? saved : v)
    }
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
    stopHeartbeat()

    if (leavingMember.is_host) {
      // Demote self first
      await supabase.from('members').update({ is_host: false }).eq('id', leavingMember.id)
      const successor = activeMembers.value.find(m => m.id !== leavingMember.id && !m.is_spectator)
      if (successor) {
        await supabase.from('members').update({ is_host: true }).eq('id', successor.id)
        await supabase.from('rooms').update({ host_id: successor.user_id }).eq('id', roomId)
        await sysMsg(roomId, `${leavingMember.name} left. ${successor.name} is now the host.`)
      }
    }

    // Mark inactive instead of deleting — preserves the row for rejoin
    await supabase.from('members')
      .update({ is_active: false, last_seen: new Date().toISOString() })
      .eq('id', leavingMember.id)

    // Check if any active members remain; purge room if empty
    const { count } = await supabase
      .from('members')
      .select('*', { count: 'exact', head: true })
      .eq('room_id', roomId)
      .eq('is_active', true)
    if ((count ?? 0) === 0) {
      await supabase.from('rooms').delete().eq('id', roomId)
    }

    unsubscribe()
    clearSession()
    room.value = null; members.value = []; tickets.value = []
    votes.value = []; chatMessages.value = []; currentUser.value = null
    myToken.value = null
  }

  onUnmounted(() => {
    stopHeartbeat()
    unsubscribe()
  })

  return {
    room, members: activeMembers, tickets, votes, chatMessages, currentUser,
    loading, error, myToken, onEmojiReceived, onKicked, onlineMembers,
    isLocked, revealed, activeTicketId, activeTicket, voters,
    voteMap, myVote, voteCount, voteStats, canVote,
    generateDefaultToken, resumeSession,
    loadRoom, createRoom, joinRoom, toggleLock, addTicket, removeTicket,
    setActiveTicket, castVote, revealVotes, resetVoting, acceptScore,
    sendChat, leaveRoom, passHostTo, kickMember, broadcastEmoji,
    leaderboard,
  }
}