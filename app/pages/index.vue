<script setup>
import { ref, computed, reactive, nextTick, onMounted } from 'vue'

// ─── Constants ────────────────────────────────────────────────────────────────
const FIBONACCI = ['?', '0', '1', '2', '3', '5', '8', '13', '21', '34', '55', '☕']
const EMOJI_LIST = ['🔥', '💡', '🤔', '😅', '🎉', '👀', '💀', '🚀', '❤️', '👏']

function initials(n) { return n.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase() }

// ─── Supabase composable ──────────────────────────────────────────────────────
// Auto-imported from composables/useSprintPoint.ts
const sp = useSprintPoint()

// ─── UI-only state (not shared / not in DB) ───────────────────────────────────
const screen         = ref('landing')  // landing | create | join | room
const chatInput      = ref('')
const chatContainer  = ref(null)
const ticketInput    = ref({ title: '', description: '' })
const showAddTicket  = ref(false)
const showShareModal = ref(false)
const emojiFlashes   = ref([])
const qrContainer    = ref(null)
const copied         = ref(false)

// Forms
const createForm   = reactive({ roomName: '', description: '', hostName: '', hostCanVote: true, allowSpectators: true })
const createErrors = reactive({ roomName: false, hostName: false })
const joinForm     = reactive({ userName: '', isSpectator: false, roomCode: '' })
const joinErrors   = reactive({ userName: false, roomCode: false })

// ─── Aliases from composable ──────────────────────────────────────────────────
const room           = sp.room
const members        = sp.members
const tickets        = sp.tickets
const votes          = sp.voteMap      // { [member_id]: value } for active ticket
const revealed       = sp.revealed
const chatMessages   = sp.chatMessages
const isLocked       = sp.isLocked
const activeTicketId = sp.activeTicketId
const activeTicket   = sp.activeTicket
const voters         = sp.voters
const myVote         = sp.myVote
const voteCount      = sp.voteCount
const voteStats      = sp.voteStats
const canVote        = sp.canVote
const publicRooms    = sp.publicRooms
const currentUser    = sp.currentUser

// ─── Local computeds ──────────────────────────────────────────────────────────
const ticketHistory = computed(() => tickets.value.filter(t => t.final_score !== null))

const tableSeats = computed(() => {
  const all = members.value
  if (!all.length) return []
  return all.map((m, i) => {
    const angle = (i / all.length) * 2 * Math.PI - Math.PI / 2
    return { ...m, x: 50 + 40 * Math.cos(angle), y: 50 + 30 * Math.sin(angle) }
  })
})

const joinRoomPreview = computed(() => {
  const code = joinForm.roomCode.trim()
  return code ? (sp.publicRooms.value.find(r => r.id === code) ?? null) : null
})

const shareUrl = computed(() => {
  const id = sp.room.value?.id
  if (!id || typeof window === 'undefined') return ''
  return window.location.origin + window.location.pathname + '?room=' + id
})

// ─── Lifecycle ────────────────────────────────────────────────────────────────
onMounted(async () => {
  await sp.loadPublicRooms()

  // Handle share URL: ?room=ROOM_ID
  const code = new URLSearchParams(window.location.search).get('room')
  if (code) { joinForm.roomCode = code; screen.value = 'join' }
})

// ─── Actions ──────────────────────────────────────────────────────────────────
async function createRoom() {
  createErrors.roomName = !createForm.roomName.trim()
  createErrors.hostName = !createForm.hostName.trim()
  if (createErrors.roomName || createErrors.hostName) return
  try {
    await sp.createRoom({
      name: createForm.roomName.trim(),
      description: createForm.description.trim(),
      hostName: createForm.hostName.trim(),
      hostCanVote: createForm.hostCanVote,
      allowSpectators: createForm.allowSpectators,
    })
    screen.value = 'room'
  } catch (e) { console.error(e) }
}

async function joinRoom() {
  const code = joinForm.roomCode.trim()
  joinErrors.roomCode = !code
  joinErrors.userName  = !joinForm.userName.trim()
  if (joinErrors.roomCode || joinErrors.userName) return
  try {
    await sp.joinRoom(code, joinForm.userName.trim(), joinForm.isSpectator)
    screen.value = 'room'
  } catch (e) {
    if (e.message === 'Room not found') joinErrors.roomCode = true
    if (e.message === 'Room is locked') joinErrors.roomCode = true
  }
}

function joinPublicRoom(id) { joinForm.roomCode = id; screen.value = 'join' }

async function toggleLock()        { await sp.toggleLock() }
async function revealVotes()       { await sp.revealVotes() }
async function resetVoting()       { await sp.resetVoting() }
async function castVote(card)      { await sp.castVote(card) }
async function acceptScore(score)  { await sp.acceptScore(score) }
async function removeTicket(id)    { await sp.removeTicket(id) }
async function setActiveTicket(id) { await sp.setActiveTicket(id) }

async function addTicket() {
  if (!ticketInput.value.title.trim()) return
  await sp.addTicket(ticketInput.value.title.trim(), ticketInput.value.description.trim())
  ticketInput.value = { title: '', description: '' }
  showAddTicket.value = false
}

async function sendChat() {
  const text = chatInput.value.trim()
  if (!text) return
  await sp.sendChat(text)
  chatInput.value = ''
  scrollChat()
}

function onChatKey(e) { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendChat() } }

function scrollChat() {
  nextTick(() => { if (chatContainer.value) chatContainer.value.scrollTop = chatContainer.value.scrollHeight })
}

async function backToLanding() {
  await sp.leaveRoom()
  screen.value = 'landing'
  showShareModal.value = false
  showAddTicket.value  = false
  Object.assign(createForm, { roomName: '', description: '', hostName: '', hostCanVote: true, allowSpectators: true })
  Object.assign(joinForm, { userName: '', isSpectator: false, roomCode: '' })
}

// ─── Emoji (board-only flash, no chat) ────────────────────────────────────────
function sendEmoji(emoji) {
  const flash = { id: Math.random().toString(36).slice(2), emoji, x: 20 + Math.random() * 60, y: 10 + Math.random() * 60 }
  emojiFlashes.value.push(flash)
  setTimeout(() => { emojiFlashes.value = emojiFlashes.value.filter(e => e.id !== flash.id) }, 2500)
}

// ─── Share & QR ───────────────────────────────────────────────────────────────
async function openShare() {
  showShareModal.value = true
  await nextTick()
  renderQR()
}

function renderQR() {
  if (!qrContainer.value) return
  const load = () => {
    if (!window.QRCode) return
    qrContainer.value.innerHTML = ''
    new window.QRCode(qrContainer.value, {
      text: shareUrl.value, width: 176, height: 176,
      colorDark: '#818cf8', colorLight: '#0b0d12',
      correctLevel: window.QRCode.CorrectLevel?.M ?? 0,
    })
  }
  if (window.QRCode) { load(); return }
  const s = document.createElement('script')
  s.src = 'https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js'
  s.onload = load
  document.head.appendChild(s)
}

async function copyLink() {
  try { await navigator.clipboard.writeText(shareUrl.value); copied.value = true; setTimeout(() => { copied.value = false }, 2000) } catch {}
}
</script>

<template>
  <div class="app">

    <!-- Emoji overlay (board-only) -->
    <div v-if="screen === 'room'" class="emoji-stage" aria-hidden="true">
      <transition-group name="eflash">
        <div v-for="f in emojiFlashes" :key="f.id" class="emoji-flash" :style="{ left: f.x+'%', top: f.y+'%' }">{{ f.emoji }}</div>
      </transition-group>
    </div>

    <!-- ══ LANDING ══════════════════════════════════════════════════ -->
    <div v-if="screen === 'landing'" class="landing">
      <div class="landing__hero">
        <div class="landing__badge">Planning Poker</div>
        <h1 class="landing__title">Sprint<span class="accent">Point</span></h1>
        <p class="landing__sub">Story point estimation for agile teams</p>
        <div class="landing__actions">
          <button class="btn btn--primary" @click="screen = 'create'">Create Room</button>
          <button class="btn btn--ghost" @click="screen = 'join'">Join Room</button>
        </div>
      </div>
      <div class="landing__cards">
        <div v-for="(n, i) in FIBONACCI.slice(1, 7)" :key="n" class="landing__card" :style="{ animationDelay: i*0.1+'s' }">{{ n }}</div>
      </div>
      <transition name="fade-up">
        <div v-if="publicRooms.length" class="public-rooms">
          <div class="section-label">Open Rooms</div>
          <div class="public-rooms__list">
            <div v-for="r in publicRooms" :key="r.id" class="pub-card" @click="joinPublicRoom(r.id)">
              <div class="pub-card__left">
                <span class="pub-card__name">{{ r.name }}</span>
                <span v-if="r.description" class="pub-card__desc">{{ r.description }}</span>
              </div>
              <div class="pub-card__right">
                <span class="chip">{{ r.members?.length ?? 0 }} 👤</span>
                <span class="join-arrow">Join →</span>
              </div>
            </div>
          </div>
        </div>
      </transition>
    </div>

    <!-- ══ CREATE ════════════════════════════════════════════════════ -->
    <div v-else-if="screen === 'create'" class="form-screen">
      <div class="form-card">
        <button class="back-btn" @click="screen = 'landing'">← Back</button>
        <h2>Create a Room</h2>
        <p class="form-hint">Configure your planning session</p>
        <div class="field">
          <label>Your Name *</label>
          <input v-model="createForm.hostName" placeholder="e.g. Jane Doe" :class="{ error: createErrors.hostName }" @input="createErrors.hostName=false" />
          <span v-if="createErrors.hostName" class="field-err">Name is required</span>
        </div>
        <div class="field">
          <label>Room Name *</label>
          <input v-model="createForm.roomName" placeholder="e.g. Sprint 42 Planning" :class="{ error: createErrors.roomName }" @input="createErrors.roomName=false" />
          <span v-if="createErrors.roomName" class="field-err">Room name is required</span>
        </div>
        <div class="field">
          <label>Description <span class="optional">(optional)</span></label>
          <textarea v-model="createForm.description" placeholder="What are we estimating?" rows="2" />
        </div>
        <div class="toggles">
          <label class="toggle-row">
            <span class="toggle-label"><strong>Host can vote</strong><small>Participate in estimation rounds</small></span>
            <div class="toggle-wrap"><input type="checkbox" v-model="createForm.hostCanVote" /><span class="toggle-track" /></div>
          </label>
          <label class="toggle-row">
            <span class="toggle-label"><strong>Allow spectators</strong><small>Members can join watch-only</small></span>
            <div class="toggle-wrap"><input type="checkbox" v-model="createForm.allowSpectators" /><span class="toggle-track" /></div>
          </label>
        </div>
        <div v-if="sp.error.value" class="field-err" style="padding:8px;background:rgba(239,68,68,0.08);border-radius:8px">{{ sp.error.value }}</div>
        <button class="btn btn--primary btn--full" :disabled="sp.loading.value" @click="createRoom">
          {{ sp.loading.value ? 'Creating…' : 'Create Room →' }}
        </button>
      </div>
    </div>

    <!-- ══ JOIN ══════════════════════════════════════════════════════ -->
    <div v-else-if="screen === 'join'" class="form-screen">
      <div class="form-card">
        <button class="back-btn" @click="screen = 'landing'">← Back</button>
        <h2>Join a Room</h2>
        <div class="field">
          <label>Room Code *</label>
          <input v-model="joinForm.roomCode" placeholder="Paste the room code from the host" :class="{ error: joinErrors.roomCode }" @input="joinErrors.roomCode=false" />
          <span v-if="joinErrors.roomCode" class="field-err">
            {{ !joinForm.roomCode.trim() ? 'Room code is required' : (joinRoomPreview?.locked ? 'Room is locked 🔒' : 'Room not found') }}
          </span>
        </div>
        <div v-if="joinRoomPreview" class="room-preview">
          <span class="room-preview__name">{{ joinRoomPreview.name }}</span>
          <span v-if="joinRoomPreview.description" class="room-preview__desc">{{ joinRoomPreview.description }}</span>
          <span v-if="joinRoomPreview.locked" class="locked-badge">🔒 Locked</span>
        </div>
        <div class="field">
          <label>Your Name *</label>
          <input v-model="joinForm.userName" placeholder="e.g. Alex Kim" :class="{ error: joinErrors.userName }" @input="joinErrors.userName=false" />
          <span v-if="joinErrors.userName" class="field-err">Name is required</span>
        </div>
        <label v-if="joinRoomPreview?.allow_spectators" class="toggle-row">
          <span class="toggle-label"><strong>Join as Spectator</strong><small>Watch without voting</small></span>
          <div class="toggle-wrap"><input type="checkbox" v-model="joinForm.isSpectator" /><span class="toggle-track" /></div>
        </label>
        <div v-if="sp.error.value" class="field-err" style="padding:8px;background:rgba(239,68,68,0.08);border-radius:8px">{{ sp.error.value }}</div>
        <button class="btn btn--primary btn--full" :disabled="sp.loading.value" @click="joinRoom">
          {{ sp.loading.value ? 'Joining…' : 'Join Room →' }}
        </button>
      </div>
    </div>

    <!-- ══ ROOM ═══════════════════════════════════════════════════════ -->
    <div v-else-if="screen === 'room' && room" class="room">

      <header class="room-header">
        <div class="room-header__left">
          <button class="back-btn" @click="backToLanding">← Exit</button>
          <div>
            <h1 class="room-header__title">{{ room.name }}<span v-if="isLocked" class="hdr-lock">🔒</span></h1>
            <p v-if="room.description" class="room-header__desc">{{ room.description }}</p>
          </div>
        </div>
        <div class="room-header__right">
          <div v-if="sp.loading.value" class="sync-badge">syncing…</div>
          <div class="me-badge" :style="{ borderColor: currentUser?.color }">
            <div class="av av--xs" :style="{ background: currentUser?.color }">{{ initials(currentUser?.name ?? '?') }}</div>
            <span>{{ currentUser?.name }}<span v-if="currentUser?.is_host" class="me-role">host</span></span>
          </div>
          <button v-if="currentUser?.is_host" class="btn btn--ghost btn--sm" @click="toggleLock">{{ isLocked ? '🔓 Unlock' : '🔒 Lock' }}</button>
          <button class="btn btn--accent btn--sm" @click="openShare">⬆ Share</button>
        </div>
      </header>

      <div class="room-body">

        <!-- LEFT: Tickets -->
        <aside class="sidebar sidebar--left">
          <div class="sidebar-head">
            <span class="section-label">Tickets</span>
            <button v-if="currentUser?.is_host" class="icon-btn" @click="showAddTicket=!showAddTicket">＋</button>
          </div>
          <transition name="slide-down">
            <div v-if="showAddTicket" class="add-ticket-form">
              <input v-model="ticketInput.title" placeholder="Title (e.g. AUTH-123)" @keyup.enter="addTicket" />
              <textarea v-model="ticketInput.description" placeholder="Description (optional)" rows="2" />
              <div class="add-ticket-actions">
                <button class="btn btn--ghost btn--sm" @click="showAddTicket=false">Cancel</button>
                <button class="btn btn--primary btn--sm" @click="addTicket">Add</button>
              </div>
            </div>
          </transition>
          <div class="ticket-list">
            <div v-if="!tickets.length" class="empty-hint">
              <span>No tickets yet</span>
              <small v-if="currentUser?.is_host">Tap ＋ above to add</small>
            </div>
            <div
              v-for="ticket in tickets" :key="ticket.id"
              class="ticket-item"
              :class="{ 'ticket-item--active': activeTicketId===ticket.id, 'ticket-item--done': ticket.final_score!==null }"
              @click="currentUser?.is_host && ticket.final_score===null && setActiveTicket(ticket.id)"
            >
              <div class="ticket-item__body">
                <span class="ticket-item__title">{{ ticket.title }}</span>
                <span v-if="ticket.description" class="ticket-item__desc">{{ ticket.description }}</span>
              </div>
              <div class="ticket-item__right">
                <span v-if="ticket.final_score!==null" class="ticket-score">{{ ticket.final_score }}</span>
                <span v-else-if="activeTicketId===ticket.id" class="ticket-dot" />
                <button v-if="currentUser?.is_host && ticket.final_score===null" class="rm-btn" @click.stop="removeTicket(ticket.id)">×</button>
              </div>
            </div>
          </div>
          <div v-if="ticketHistory.length" class="completed-section">
            <div class="section-label" style="margin-bottom:7px">Completed</div>
            <div v-for="t in ticketHistory" :key="t.id" class="history-row">
              <span class="history-title">{{ t.title }}</span>
              <span class="history-score">{{ t.final_score }}</span>
            </div>
          </div>
        </aside>

        <!-- CENTER: Board -->
        <main class="center">
          <div v-if="!activeTicket" class="empty-center">
            <div class="empty-center__icon">🃏</div>
            <p>{{ currentUser?.is_host ? 'Add or select a ticket to begin.' : 'Waiting for host to pick a ticket…' }}</p>
          </div>
          <template v-else>
            <div class="ticket-banner">
              <div class="ticket-banner__eyebrow">Now Estimating</div>
              <div class="ticket-banner__title">{{ activeTicket.title }}</div>
              <p v-if="activeTicket.description" class="ticket-banner__desc">{{ activeTicket.description }}</p>
            </div>

            <!-- Poker Table -->
            <div class="table-wrap">
              <div class="table-shell">
                <div class="table-felt">
                  <div class="table-center">
                    <template v-if="!revealed">
                      <div class="tc-count">{{ voteCount }}<span>/{{ voters.length }}</span></div>
                      <div class="tc-label">voted</div>
                      <div class="tc-bar"><div class="tc-bar-fill" :style="{ width: (voteCount/Math.max(voters.length,1)*100)+'%' }" /></div>
                    </template>
                    <template v-else-if="voteStats">
                      <div class="tc-avg">{{ voteStats.avg }}</div>
                      <div class="tc-label">average</div>
                      <div v-if="voteStats.consensus" class="tc-consensus">🎉 Consensus!</div>
                    </template>
                  </div>
                  <div
                    v-for="seat in tableSeats" :key="seat.id"
                    class="seat"
                    :style="{ left: seat.x+'%', top: seat.y+'%' }"
                    :class="{ 'seat--me': seat.id === currentUser?.id }"
                  >
                    <div class="seat-card" :class="{
                      'seat-card--voted':    !revealed && votes[seat.id] !== undefined,
                      'seat-card--revealed': revealed  && votes[seat.id] !== undefined,
                      'seat-card--miss':     revealed  && votes[seat.id] === undefined,
                    }">{{ revealed ? (votes[seat.id] ?? '–') : (votes[seat.id] !== undefined ? '🂠' : '') }}</div>
                    <div class="seat-av" :style="{ background: seat.color }">{{ initials(seat.name) }}</div>
                    <div class="seat-name">{{ seat.name }}<span v-if="seat.is_host"> ★</span><span v-if="seat.is_spectator"> 👁</span></div>
                  </div>
                </div>
              </div>
            </div>

            <!-- Results -->
            <transition name="reveal">
              <div v-if="revealed && voteStats" class="results">
                <div class="results-stats">
                  <div class="stat-card"><div class="stat-val">{{ voteStats.avg }}</div><div class="stat-lbl">Average</div></div>
                  <div class="stat-card stat-card--hl"><div class="stat-val">{{ voteStats.mode }}</div><div class="stat-lbl">Consensus</div></div>
                  <div class="stat-card"><div class="stat-val">{{ voteStats.min }}–{{ voteStats.max }}</div><div class="stat-lbl">Range</div></div>
                </div>
                <div v-if="currentUser?.is_host" class="accept-row">
                  <span class="accept-lbl">Accept score:</span>
                  <button v-for="c in FIBONACCI.slice(1)" :key="c" class="accept-btn" :class="{ 'accept-btn--hl': String(c)===String(voteStats.mode) }" @click="acceptScore(c)">{{ c }}</button>
                </div>
              </div>
            </transition>

            <div class="action-row">
              <button v-if="currentUser?.is_host && !revealed" class="btn btn--primary" :disabled="!voteCount" @click="revealVotes">Reveal Votes</button>
              <button v-if="currentUser?.is_host && revealed" class="btn btn--ghost" @click="resetVoting">↺ Re-vote</button>
            </div>

            <div v-if="canVote" class="card-deck">
              <button v-for="card in FIBONACCI" :key="card" class="card" :class="{ 'card--sel': myVote===card }" @click="castVote(card)">{{ card }}</button>
            </div>
            <div v-else-if="currentUser?.is_spectator" class="notice">👁 Spectating</div>

            <div class="emoji-bar">
              <span class="emoji-bar__label">React</span>
              <button v-for="e in EMOJI_LIST" :key="e" class="emoji-btn" @click="sendEmoji(e)">{{ e }}</button>
            </div>
          </template>
        </main>

        <!-- RIGHT: Chat -->
        <aside class="sidebar sidebar--right">
          <div class="sidebar-head">
            <span class="section-label">Team Chat</span>
            <span class="online-dot">{{ members.length }} online</span>
          </div>
          <div class="members-list">
            <div v-for="m in members" :key="m.id" class="member-row">
              <div class="av av--xs" :style="{ background: m.color }">{{ initials(m.name) }}</div>
              <span class="member-row__name">{{ m.name }}</span>
              <span v-if="m.is_host"      class="rbadge rbadge--host">host</span>
              <span v-if="m.is_spectator" class="rbadge">👁</span>
            </div>
          </div>
          <div class="divider" />
          <div class="chat-messages" ref="chatContainer">
            <div v-if="!chatMessages.length" class="empty-hint">No messages yet…</div>
            <template v-for="msg in chatMessages" :key="msg.id">
              <div v-if="msg.type==='system'" class="msg-sys">{{ msg.text }}</div>
              <div v-else class="msg" :class="{ 'msg--me': msg.member_id===currentUser?.id }">
                <div class="msg__meta">
                  <span class="msg__name" :style="{ color: msg.user_color }">{{ msg.member_id===currentUser?.id ? 'You' : msg.user_name }}</span>
                  <span class="msg__time">{{ new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) }}</span>
                </div>
                <div class="msg__bubble">{{ msg.text }}</div>
              </div>
            </template>
          </div>
          <div class="chat-input-row">
            <input v-model="chatInput" class="chat-input" placeholder="Message…" @keydown="onChatKey" />
            <button class="icon-btn send-btn" :disabled="!chatInput.trim()" @click="sendChat">↑</button>
          </div>
        </aside>
      </div>
    </div>

    <!-- ══ SHARE MODAL ════════════════════════════════════════════════ -->
    <transition name="modal-fade">
      <div v-if="showShareModal" class="modal-backdrop" @click.self="showShareModal=false">
        <div class="modal">
          <div class="modal-head">
            <span class="modal-title">Invite to {{ room?.name }}</span>
            <button class="icon-btn" @click="showShareModal=false">✕</button>
          </div>
          <div class="qr-wrap" ref="qrContainer" />
          <div class="share-url-row">
            <input class="share-url-input" :value="shareUrl" readonly />
            <button class="btn btn--primary btn--sm" @click="copyLink">{{ copied ? '✓ Copied' : 'Copy' }}</button>
          </div>
          <div class="room-code-row">
            <span class="room-code-label">Room Code</span>
            <span class="room-code">{{ room?.id }}</span>
          </div>
          <div v-if="isLocked" class="locked-notice-modal">🔒 Room is locked — new joins are blocked</div>
          <p class="share-hint">Share this link or code. Anyone with Supabase access can join from any device.</p>
        </div>
      </div>
    </transition>

  </div>
</template>

<style scoped>
* { box-sizing: border-box; margin: 0; padding: 0; }

.app {
  --bg: #0b0d12; --surface: #131720; --surface2: #1a1f2e;
  --border: rgba(255,255,255,0.06); --border2: rgba(255,255,255,0.11);
  --accent: #6366f1; --accent2: #818cf8; --text: #e2e5f0;
  --muted: #787e9a; --muted2: #454960; --success: #10b981;
  --felt: #1b4d35; --felt2: #143d29; --felt-rim: #0e2c1d;
  --r: 12px; --r-sm: 8px;
  font-family: 'Inter', 'Segoe UI', system-ui, sans-serif;
  background: var(--bg); color: var(--text);
  min-height: 100vh; overflow: hidden; position: relative;
}

/* ── Emoji overlay ── */
.emoji-stage { position: fixed; inset: 0; pointer-events: none; z-index: 500; }
.emoji-flash { position: absolute; font-size: 2.4rem; pointer-events: none; animation: eup 2.5s ease-out forwards; filter: drop-shadow(0 2px 6px rgba(0,0,0,0.6)); }
@keyframes eup { 0%{transform:translateY(0) scale(0.3) rotate(-15deg);opacity:1} 30%{transform:translateY(-50px) scale(1.4) rotate(10deg);opacity:1} 100%{transform:translateY(-120px) scale(0.85);opacity:0} }
.eflash-enter-active { animation: eup 2.5s ease-out forwards; }
.eflash-leave-active { display: none; }

/* ── Landing ── */
.landing { display:flex; flex-direction:column; align-items:center; justify-content:center; min-height:100vh; gap:2rem; padding:2rem; background:radial-gradient(ellipse at 50% 6%, rgba(99,102,241,0.18) 0%, transparent 58%); }
.landing__hero { display:flex; flex-direction:column; align-items:center; gap:10px; }
.landing__badge { background:rgba(99,102,241,0.14); color:var(--accent2); border:1px solid rgba(99,102,241,0.28); border-radius:999px; padding:3px 14px; font-size:11px; letter-spacing:0.1em; text-transform:uppercase; }
.landing__title { font-size:clamp(2.8rem,6vw,4.8rem); font-weight:800; letter-spacing:-0.03em; line-height:1; }
.accent { color:var(--accent2); }
.landing__sub { font-size:0.95rem; color:var(--muted); text-align:center; }
.landing__actions { display:flex; gap:12px; margin-top:4px; }
.landing__cards { display:flex; gap:10px; opacity:0.18; }
.landing__card { width:44px; height:60px; background:var(--surface); border:1px solid var(--border2); border-radius:8px; display:flex; align-items:center; justify-content:center; font-size:1.1rem; font-weight:700; animation:float 3s ease-in-out infinite; }
@keyframes float { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-7px)} }
.public-rooms { width:100%; max-width:520px; }
.public-rooms__list { display:flex; flex-direction:column; gap:7px; margin-top:8px; }
.pub-card { display:flex; align-items:center; gap:12px; background:var(--surface); border:1px solid var(--border2); border-radius:var(--r-sm); padding:11px 15px; cursor:pointer; transition:border-color 0.15s,background 0.15s; }
.pub-card:hover { border-color:var(--accent); background:rgba(99,102,241,0.06); }
.pub-card__left { flex:1; display:flex; flex-direction:column; gap:2px; min-width:0; }
.pub-card__name { font-weight:600; font-size:14px; }
.pub-card__desc { font-size:11px; color:var(--muted); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.pub-card__right { display:flex; align-items:center; gap:8px; flex-shrink:0; }
.chip { font-size:11px; color:var(--muted); background:var(--surface2); padding:2px 8px; border-radius:999px; }
.join-arrow { font-size:12px; color:var(--accent2); font-weight:600; }

/* ── Buttons ── */
.btn { border:none; border-radius:var(--r-sm); padding:10px 20px; font-size:14px; font-weight:600; cursor:pointer; transition:all 0.15s; white-space:nowrap; }
.btn--primary { background:var(--accent); color:#fff; }
.btn--primary:hover { background:var(--accent2); }
.btn--primary:disabled { opacity:0.4; cursor:not-allowed; }
.btn--ghost { background:transparent; color:var(--text); border:1px solid var(--border2); }
.btn--ghost:hover { background:var(--surface2); }
.btn--accent { background:rgba(99,102,241,0.18); color:var(--accent2); border:1px solid rgba(99,102,241,0.3); }
.btn--accent:hover { background:rgba(99,102,241,0.28); }
.btn--full { width:100%; margin-top:6px; }
.btn--sm { padding:6px 12px; font-size:12px; }
.back-btn { background:none; border:none; color:var(--muted); cursor:pointer; font-size:13px; padding:4px 0; }
.back-btn:hover { color:var(--text); }
.icon-btn { background:none; border:none; cursor:pointer; color:var(--muted); font-size:18px; padding:4px 8px; border-radius:var(--r-sm); transition:color 0.15s,background 0.15s; line-height:1; }
.icon-btn:hover { color:var(--text); background:var(--surface2); }
.icon-btn:disabled { opacity:0.3; cursor:not-allowed; }
.send-btn { font-size:16px; color:var(--accent); }

/* ── Forms ── */
.form-screen { min-height:100vh; display:flex; align-items:center; justify-content:center; padding:2rem; background:radial-gradient(ellipse at 50% 0%, rgba(99,102,241,0.1) 0%, transparent 60%); }
.form-card { width:100%; max-width:440px; background:var(--surface); border:1px solid var(--border); border-radius:var(--r); padding:30px; display:flex; flex-direction:column; gap:18px; }
.form-card h2 { font-size:1.4rem; font-weight:700; }
.form-hint { color:var(--muted); font-size:13px; margin-top:-8px; }
.optional { font-weight:400; font-size:11px; color:var(--muted); }
.field { display:flex; flex-direction:column; gap:6px; }
.field label { font-size:11px; font-weight:700; color:var(--muted); text-transform:uppercase; letter-spacing:0.07em; }
.field input, .field textarea { background:var(--bg); border:1px solid var(--border2); border-radius:var(--r-sm); color:var(--text); font-size:14px; padding:9px 12px; outline:none; transition:border-color 0.15s; font-family:inherit; resize:vertical; }
.field input:focus, .field textarea:focus { border-color:var(--accent); }
.field input.error { border-color:#ef4444; }
.field-err { color:#ef4444; font-size:12px; }
.toggles { display:flex; flex-direction:column; gap:9px; }
.toggle-row { display:flex; align-items:center; justify-content:space-between; background:var(--surface2); border-radius:var(--r-sm); padding:12px 14px; cursor:pointer; }
.toggle-label { display:flex; flex-direction:column; gap:2px; }
.toggle-label strong { font-size:13px; }
.toggle-label small { font-size:11px; color:var(--muted); }
.toggle-wrap { position:relative; width:36px; height:20px; flex-shrink:0; }
.toggle-wrap input { position:absolute; opacity:0; width:0; height:0; }
.toggle-track { position:absolute; inset:0; background:var(--muted2); border-radius:999px; transition:background 0.2s; }
.toggle-track::after { content:''; position:absolute; top:2px; left:2px; width:16px; height:16px; border-radius:50%; background:white; transition:transform 0.2s; }
.toggle-wrap input:checked ~ .toggle-track { background:var(--accent); }
.toggle-wrap input:checked ~ .toggle-track::after { transform:translateX(16px); }
.room-preview { background:var(--surface2); border-radius:var(--r-sm); padding:12px 14px; display:flex; flex-direction:column; gap:4px; }
.room-preview__name { font-weight:700; font-size:15px; }
.room-preview__desc { font-size:12px; color:var(--muted); }
.locked-badge { font-size:12px; color:#f59e0b; margin-top:2px; }

/* ── Room layout ── */
.room { display:flex; flex-direction:column; height:100vh; overflow:hidden; }
.room-header { display:flex; align-items:center; justify-content:space-between; padding:10px 18px; background:var(--surface); border-bottom:1px solid var(--border); flex-shrink:0; gap:12px; min-height:54px; }
.room-header__left { display:flex; align-items:center; gap:14px; }
.room-header__title { font-size:1rem; font-weight:700; display:flex; align-items:center; gap:7px; }
.hdr-lock { font-size:13px; }
.room-header__desc { font-size:11px; color:var(--muted); margin-top:1px; }
.room-header__right { display:flex; align-items:center; gap:9px; }
.sync-badge { font-size:10px; color:var(--muted2); background:var(--surface2); padding:2px 8px; border-radius:999px; animation:pulse 1s ease-in-out infinite; }
@keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }
.me-badge { display:flex; align-items:center; gap:7px; border:1.5px solid; border-radius:999px; padding:3px 10px 3px 4px; font-size:12px; font-weight:500; }
.me-role { background:rgba(99,102,241,0.2); color:var(--accent2); font-size:10px; padding:1px 6px; border-radius:999px; margin-left:4px; }
.room-body { display:grid; grid-template-columns:225px 1fr 250px; flex:1; overflow:hidden; }

/* ── Sidebars ── */
.sidebar { background:var(--surface); display:flex; flex-direction:column; overflow:hidden; border-right:1px solid var(--border); }
.sidebar--right { border-right:none; border-left:1px solid var(--border); }
.sidebar-head { display:flex; align-items:center; justify-content:space-between; padding:13px 13px 8px; flex-shrink:0; }
.section-label { font-size:10px; font-weight:700; text-transform:uppercase; letter-spacing:0.09em; color:var(--muted); }
.online-dot { font-size:11px; color:var(--muted); }
.divider { height:1px; background:var(--border); flex-shrink:0; }
.ticket-list { flex:1; overflow-y:auto; padding:0 7px 8px; }
.ticket-list::-webkit-scrollbar { width:3px; }
.ticket-list::-webkit-scrollbar-thumb { background:var(--border2); border-radius:2px; }
.empty-hint { color:var(--muted); font-size:13px; padding:16px; text-align:center; display:flex; flex-direction:column; gap:4px; }
.ticket-item { display:flex; align-items:flex-start; gap:8px; padding:9px; border-radius:var(--r-sm); cursor:pointer; transition:background 0.12s; margin-bottom:2px; border:1px solid transparent; }
.ticket-item:hover { background:var(--surface2); }
.ticket-item--active { background:rgba(99,102,241,0.09); border-color:rgba(99,102,241,0.2); }
.ticket-item--done { opacity:0.48; cursor:default; }
.ticket-item__body { flex:1; display:flex; flex-direction:column; gap:2px; min-width:0; }
.ticket-item__title { font-size:12px; font-weight:600; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.ticket-item__desc { font-size:11px; color:var(--muted); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.ticket-item__right { display:flex; align-items:center; gap:4px; flex-shrink:0; }
.ticket-score { background:var(--accent); color:white; font-size:11px; font-weight:700; padding:2px 7px; border-radius:999px; }
.ticket-dot { width:6px; height:6px; border-radius:50%; background:var(--accent); animation:pulse 1.4s ease-in-out infinite; }
.rm-btn { background:none; border:none; color:var(--muted2); cursor:pointer; font-size:15px; line-height:1; }
.rm-btn:hover { color:#ef4444; }
.add-ticket-form { margin:0 7px 8px; background:var(--surface2); border-radius:var(--r-sm); padding:10px; display:flex; flex-direction:column; gap:7px; }
.add-ticket-form input, .add-ticket-form textarea { background:var(--bg); border:1px solid var(--border2); border-radius:6px; color:var(--text); font-size:13px; padding:7px 10px; outline:none; font-family:inherit; resize:none; }
.add-ticket-form input:focus, .add-ticket-form textarea:focus { border-color:var(--accent); }
.add-ticket-actions { display:flex; gap:7px; justify-content:flex-end; }
.completed-section { padding:10px 13px; border-top:1px solid var(--border); flex-shrink:0; max-height:140px; overflow-y:auto; }
.history-row { display:flex; justify-content:space-between; align-items:center; padding:3px 0; }
.history-title { font-size:11px; color:var(--muted); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:145px; }
.history-score { font-size:12px; font-weight:700; color:var(--success); flex-shrink:0; }

/* ── Center board ── */
.center { overflow-y:auto; padding:14px 20px; display:flex; flex-direction:column; gap:12px; }
.center::-webkit-scrollbar { width:4px; }
.center::-webkit-scrollbar-thumb { background:var(--border2); border-radius:2px; }
.empty-center { flex:1; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:14px; color:var(--muted); text-align:center; min-height:200px; }
.empty-center__icon { font-size:3rem; opacity:0.3; }
.ticket-banner { background:var(--surface); border:1px solid var(--border2); border-radius:var(--r); padding:12px 16px; }
.ticket-banner__eyebrow { font-size:10px; text-transform:uppercase; letter-spacing:0.1em; color:var(--accent2); font-weight:700; margin-bottom:3px; }
.ticket-banner__title { font-size:1.05rem; font-weight:700; }
.ticket-banner__desc { font-size:12px; color:var(--muted); margin-top:3px; }

/* ── Poker Table ── */
.table-wrap { position:relative; width:100%; }
.table-shell { position:relative; width:100%; height:180px; border-radius:999px; background:var(--felt-rim); box-shadow:0 0 0 6px var(--felt-rim),0 8px 32px rgba(0,0,0,0.7),inset 0 2px 8px rgba(0,0,0,0.5); }
.table-felt { position:absolute; inset:8px; border-radius:999px; background:radial-gradient(ellipse at 50% 38%, #22644a 0%, var(--felt) 55%, var(--felt2) 100%); border:2px solid rgba(255,255,255,0.05); overflow:hidden; }
.table-center { position:absolute; top:50%; left:50%; transform:translate(-50%,-50%); text-align:center; display:flex; flex-direction:column; align-items:center; gap:2px; min-width:70px; }
.tc-count { font-size:1.6rem; font-weight:900; color:rgba(255,255,255,0.88); line-height:1; }
.tc-count span { font-size:0.9rem; color:rgba(255,255,255,0.38); }
.tc-label { font-size:9px; color:rgba(255,255,255,0.38); text-transform:uppercase; letter-spacing:0.09em; }
.tc-bar { width:60px; height:3px; background:rgba(255,255,255,0.1); border-radius:2px; overflow:hidden; margin-top:2px; }
.tc-bar-fill { height:100%; background:var(--accent2); border-radius:2px; transition:width 0.4s ease; }
.tc-avg { font-size:2rem; font-weight:900; color:#fff; line-height:1; }
.tc-consensus { font-size:10px; color:#6ee7b7; margin-top:2px; font-weight:600; }
.seat { position:absolute; transform:translate(-50%,-50%); display:flex; flex-direction:column; align-items:center; gap:1px; z-index:10; }
.seat-av { width:28px; height:28px; border-radius:50%; display:flex; align-items:center; justify-content:center; font-size:10px; font-weight:700; color:white; border:2px solid rgba(255,255,255,0.18); box-shadow:0 2px 6px rgba(0,0,0,0.5); }
.seat--me .seat-av { border-color:var(--accent2); box-shadow:0 0 0 2px rgba(99,102,241,0.4); }
.seat-name { font-size:8px; font-weight:600; color:rgba(255,255,255,0.7); white-space:nowrap; text-shadow:0 1px 3px rgba(0,0,0,0.9); max-width:56px; overflow:hidden; text-overflow:ellipsis; text-align:center; }
.seat-card { width:20px; height:28px; border-radius:3px; border:1px solid rgba(255,255,255,0.1); background:rgba(255,255,255,0.05); display:flex; align-items:center; justify-content:center; font-size:9px; font-weight:700; color:rgba(255,255,255,0.25); transition:all 0.3s; box-shadow:0 1px 3px rgba(0,0,0,0.4); }
.seat-card--voted { background:rgba(99,102,241,0.35); border-color:var(--accent2); color:var(--accent2); font-size:12px; transform:translateY(-4px); }
.seat-card--revealed { background:rgba(16,185,129,0.25); border-color:#6ee7b7; color:#d1fae5; transform:translateY(-4px); font-size:10px; }
.seat-card--miss { color:rgba(255,255,255,0.18); }

/* ── Results ── */
.results { background:var(--surface); border:1px solid var(--border2); border-radius:var(--r); padding:14px; display:flex; flex-direction:column; gap:12px; }
.results-stats { display:grid; grid-template-columns:repeat(3,1fr); gap:8px; }
.stat-card { background:var(--surface2); border-radius:var(--r-sm); padding:10px; text-align:center; }
.stat-card--hl { background:rgba(99,102,241,0.14); border:1px solid rgba(99,102,241,0.28); }
.stat-val { font-size:1.4rem; font-weight:800; line-height:1; }
.stat-card--hl .stat-val { color:var(--accent2); }
.stat-lbl { font-size:10px; color:var(--muted); margin-top:2px; text-transform:uppercase; letter-spacing:0.06em; }
.accept-row { display:flex; align-items:center; gap:6px; flex-wrap:wrap; }
.accept-lbl { font-size:11px; color:var(--muted); }
.accept-btn { background:var(--surface2); border:1px solid var(--border2); color:var(--text); border-radius:6px; padding:4px 8px; font-size:12px; font-weight:700; cursor:pointer; transition:all 0.12s; }
.accept-btn:hover { border-color:var(--accent); }
.accept-btn--hl { border-color:var(--accent); background:rgba(99,102,241,0.15); color:var(--accent2); }

/* ── Cards ── */
.action-row { display:flex; gap:10px; justify-content:center; }
.card-deck { display:flex; flex-wrap:wrap; gap:7px; justify-content:center; }
.card { min-width:42px; height:58px; background:var(--surface); border:1.5px solid var(--border2); border-radius:8px; font-size:1rem; font-weight:800; color:var(--text); cursor:pointer; transition:all 0.15s; display:flex; align-items:center; justify-content:center; padding:0 8px; }
.card:hover { transform:translateY(-4px); border-color:var(--accent); background:rgba(99,102,241,0.08); }
.card--sel { transform:translateY(-8px); border-color:var(--accent); background:rgba(99,102,241,0.2); color:var(--accent2); box-shadow:0 0 0 3px rgba(99,102,241,0.2); }
.notice { text-align:center; color:var(--muted); font-size:13px; }

/* ── Emoji bar ── */
.emoji-bar { display:flex; align-items:center; gap:4px; justify-content:center; flex-wrap:wrap; background:var(--surface); border:1px solid var(--border); border-radius:999px; padding:6px 14px; align-self:center; }
.emoji-bar__label { font-size:9px; color:var(--muted); text-transform:uppercase; letter-spacing:0.08em; margin-right:4px; }
.emoji-btn { background:none; border:none; cursor:pointer; font-size:1.15rem; padding:3px 4px; border-radius:6px; transition:background 0.1s,transform 0.12s; line-height:1; }
.emoji-btn:hover { background:var(--surface2); transform:scale(1.3); }

/* ── Chat ── */
.members-list { padding:4px 10px 8px; display:flex; flex-direction:column; gap:3px; flex-shrink:0; max-height:110px; overflow-y:auto; }
.member-row { display:flex; align-items:center; gap:7px; font-size:12px; padding:3px 4px; border-radius:5px; }
.member-row__name { flex:1; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.rbadge { font-size:10px; background:var(--surface2); color:var(--muted); padding:1px 6px; border-radius:999px; flex-shrink:0; }
.rbadge--host { background:rgba(99,102,241,0.15); color:var(--accent2); }
.chat-messages { flex:1; overflow-y:auto; padding:10px 12px; display:flex; flex-direction:column; gap:7px; }
.chat-messages::-webkit-scrollbar { width:3px; }
.chat-messages::-webkit-scrollbar-thumb { background:var(--border2); border-radius:2px; }
.msg-sys { text-align:center; font-size:11px; color:var(--muted2); padding:1px 0; }
.msg { display:flex; flex-direction:column; gap:2px; max-width:93%; }
.msg--me { align-self:flex-end; align-items:flex-end; }
.msg__meta { display:flex; align-items:baseline; gap:5px; }
.msg--me .msg__meta { flex-direction:row-reverse; }
.msg__name { font-size:11px; font-weight:700; }
.msg__time { font-size:10px; color:var(--muted2); }
.msg__bubble { background:var(--surface2); border-radius:10px; padding:7px 10px; font-size:13px; line-height:1.4; max-width:100%; word-break:break-word; }
.msg--me .msg__bubble { background:rgba(99,102,241,0.2); }
.chat-input-row { padding:10px; border-top:1px solid var(--border); display:flex; align-items:center; gap:6px; flex-shrink:0; }
.chat-input { flex:1; background:var(--surface2); border:1px solid var(--border2); border-radius:8px; color:var(--text); font-size:13px; padding:8px 10px; outline:none; font-family:inherit; }
.chat-input:focus { border-color:var(--accent); }

/* ── Avatar ── */
.av { border-radius:50%; display:flex; align-items:center; justify-content:center; font-weight:700; color:white; flex-shrink:0; border:2px solid var(--bg); }
.av--xs { width:22px; height:22px; font-size:9px; }

/* ── Modal ── */
.modal-backdrop { position:fixed; inset:0; background:rgba(0,0,0,0.72); display:flex; align-items:center; justify-content:center; z-index:600; backdrop-filter:blur(5px); }
.modal { background:var(--surface); border:1px solid var(--border2); border-radius:var(--r); padding:24px; width:310px; display:flex; flex-direction:column; gap:14px; box-shadow:0 24px 64px rgba(0,0,0,0.65); }
.modal-head { display:flex; align-items:center; justify-content:space-between; }
.modal-title { font-size:14px; font-weight:700; }
.qr-wrap { display:flex; justify-content:center; align-items:center; background:var(--bg); border-radius:var(--r-sm); padding:14px; min-height:204px; }
.qr-wrap canvas, .qr-wrap img { border-radius:4px; display:block; }
.share-url-row { display:flex; gap:8px; align-items:center; }
.share-url-input { flex:1; background:var(--bg); border:1px solid var(--border2); border-radius:var(--r-sm); color:var(--muted); font-size:11px; padding:8px 10px; outline:none; font-family:monospace; }
.room-code-row { display:flex; align-items:center; gap:10px; background:var(--surface2); border-radius:var(--r-sm); padding:10px 14px; }
.room-code-label { font-size:11px; color:var(--muted); flex:1; }
.room-code { font-family:monospace; font-size:15px; font-weight:700; color:var(--accent2); letter-spacing:0.06em; word-break:break-all; }
.locked-notice-modal { font-size:12px; color:#f59e0b; text-align:center; background:rgba(245,158,11,0.08); border-radius:var(--r-sm); padding:8px; }
.share-hint { font-size:11px; color:var(--muted); text-align:center; line-height:1.5; }

/* ── Transitions ── */
.slide-down-enter-active,.slide-down-leave-active { transition:all 0.2s ease; }
.slide-down-enter-from,.slide-down-leave-to { opacity:0; transform:translateY(-8px); }
.reveal-enter-active { transition:all 0.35s ease; }
.reveal-enter-from { opacity:0; transform:translateY(10px); }
.modal-fade-enter-active,.modal-fade-leave-active { transition:opacity 0.2s ease; }
.modal-fade-enter-from,.modal-fade-leave-to { opacity:0; }
.fade-up-enter-active { transition:all 0.4s ease; }
.fade-up-enter-from { opacity:0; transform:translateY(8px); }
</style>