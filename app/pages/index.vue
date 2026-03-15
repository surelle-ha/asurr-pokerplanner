<script setup>
import { ref, computed, reactive, watch, nextTick, onMounted } from 'vue'

const FIBONACCI = ['?', '0', '1', '2', '3', '5', '8', '13', '21', '34', '55', '☕']
const EMOJI_LIST = ['🔥', '💡', '🤔', '😅', '🎉', '👀', '💀', '🚀', '❤️', '👏']
function initials(n) { return (n || '?').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase() }

const sp = useSprintPoint()

// ─── UI state ─────────────────────────────────────────────────────────────────
const screen          = ref('landing')
const chatInput       = ref('')
const chatContainer   = ref(null)
const ticketInput     = ref({ title: '', description: '' })
const showAddTicket   = ref(false)
const showShareModal  = ref(false)
const showPassModal   = ref(false)   // pass host modal
const showExportMenu  = ref(false)   // export dropdown
const ticketsOpen     = ref(true)    // ticket sidebar collapsed state
const emojiFlashes    = ref([])
const qrContainer     = ref(null)
const copied          = ref(false)
const tokenCopied     = ref(false)

// Forms
const createForm   = reactive({ roomName: '', description: '', hostName: '', hostCanVote: true, allowSpectators: true, pin: '', token: '' })
const createErrors = reactive({ roomName: false, hostName: false })
const joinForm     = reactive({ userName: '', isSpectator: false, roomCode: '', pin: '', token: '' })
const joinErrors   = reactive({ userName: false, roomCode: false, pin: false, token: false })

// ─── Composable aliases ───────────────────────────────────────────────────────
const room           = sp.room
const members        = sp.members
const tickets        = sp.tickets
const votes          = sp.voteMap
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
const currentUser    = sp.currentUser
const myToken        = sp.myToken
const onlineMembers  = sp.onlineMembers

// ─── Computed ─────────────────────────────────────────────────────────────────
const ticketHistory = computed(() => tickets.value.filter(t => t.final_score !== null))
const nonHostMembers = computed(() => members.value.filter(m => m.id !== currentUser.value?.id && !m.is_spectator))

// Poker table: names orbit outside, cards float inside on the felt
const tableSeats = computed(() => {
  const all = members.value
  if (!all.length) return []
  return all.map((m, i) => {
    const angle = (i / all.length) * 2 * Math.PI - Math.PI / 2
    // card pos: inside the oval (smaller radii)
    const cx = 50 + 30 * Math.cos(angle)
    const cy = 50 + 26 * Math.sin(angle)
    // name label pos: outside the oval (larger radii)
    const nx = 50 + 46 * Math.cos(angle)
    const ny = 50 + 40 * Math.sin(angle)
    return { ...m, cx, cy, nx, ny }
  })
})

// Fetched directly when user types a room code; no public listing needed
const joinRoomPreview = ref(null)
let previewTimer = null
watch(() => joinForm.roomCode, async (val) => {
  clearTimeout(previewTimer)
  const code = val.trim()
  if (!code) { joinRoomPreview.value = null; return }
  previewTimer = setTimeout(async () => {
    const { data } = await useSupabaseClient().from('rooms').select('*').eq('id', code).maybeSingle()
    joinRoomPreview.value = data ?? null
  }, 300)
})

const shareUrl = computed(() => {
  const id = sp.room.value?.id
  if (!id || typeof window === 'undefined') return ''
  return window.location.origin + window.location.pathname + '?room=' + id
})

// Falling items for landing background animation
const FALL_ITEMS = ['?','0','1','2','3','5','8','13','21','34','55','☕','🎯','⚡','🃏','★']
const fallingItems = ref([])

function spawnFallers() {
  const count = 18
  fallingItems.value = Array.from({ length: count }, (_, i) => ({
    id: i,
    symbol: FALL_ITEMS[Math.floor(Math.random() * FALL_ITEMS.length)],
    left: Math.random() * 100,
    delay: Math.random() * 8,
    duration: 7 + Math.random() * 8,
    size: 0.75 + Math.random() * 0.9,
    opacity: 0.04 + Math.random() * 0.1,
  }))
}

onMounted(async () => {
  spawnFallers()

  // 1. Try to resume an existing session (handles page refresh)
  //    resumeSession returns true if the user had an active room and we
  //    successfully reconnected — skip the landing screen entirely.
  const resumed = await sp.resumeSession()
  if (resumed) { screen.value = 'room'; return }

  // 2. Handle share-link URL: ?room=CODE
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
      pin: createForm.pin.trim() || undefined,
      token: createForm.token.trim() || undefined,
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
    await sp.joinRoom(code, joinForm.userName.trim(), joinForm.isSpectator, joinForm.pin.trim() || undefined, joinForm.token.trim() || undefined)
    screen.value = 'room'
  } catch (e) {
    if (e.message === 'Room not found')   joinErrors.roomCode = true
    if (e.message === 'Room is locked')   joinErrors.roomCode = true
    if (e.message === 'Incorrect PIN')    joinErrors.pin = true
  }
}

async function toggleLock()        { await sp.toggleLock() }
async function revealVotes()       { await sp.revealVotes() }
async function resetVoting()       { await sp.resetVoting() }
async function castVote(card)      { await sp.castVote(card) }
async function acceptScore(score)  { await sp.acceptScore(score); showExportMenu.value = false }
async function removeTicket(id)    { await sp.removeTicket(id) }
async function setActiveTicket(id) { await sp.setActiveTicket(id) }

async function addTicket() {
  if (!ticketInput.value.title.trim()) return
  await sp.addTicket(ticketInput.value.title.trim(), ticketInput.value.description.trim())
  ticketInput.value = { title: '', description: '' }
  showAddTicket.value = false
}

async function passHostTo(memberId) {
  await sp.passHostTo(memberId)
  showPassModal.value = false
}

async function sendChat() {
  const text = chatInput.value.trim()
  if (!text) return
  await sp.sendChat(text)
  chatInput.value = ''
  scrollChat()
}

function onChatKey(e) { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendChat() } }
function scrollChat() { nextTick(() => { if (chatContainer.value) chatContainer.value.scrollTop = chatContainer.value.scrollHeight }) }

async function backToLanding() {
  await sp.leaveRoom()
  screen.value = 'landing'
  showShareModal.value = false; showAddTicket.value = false; showPassModal.value = false
  Object.assign(createForm, { roomName: '', description: '', hostName: '', hostCanVote: true, allowSpectators: true, pin: '', token: '' })
  Object.assign(joinForm, { userName: '', isSpectator: false, roomCode: '', pin: '', token: '' })
}

// ─── Emoji ────────────────────────────────────────────────────────────────────
// Emoji uses Supabase Realtime Broadcast (ephemeral, not persisted to DB).
// Local user sees their own flash immediately.
// Remote users receive via the onEmojiReceived callback registered in composable.

function triggerEmojiFlash(emoji) {
  const flash = { id: Math.random().toString(36).slice(2), emoji, x: 15 + Math.random() * 70, y: 5 + Math.random() * 70 }
  emojiFlashes.value.push(flash)
  setTimeout(() => { emojiFlashes.value = emojiFlashes.value.filter(e => e.id !== flash.id) }, 2500)
}

async function sendEmoji(emoji) {
  triggerEmojiFlash(emoji)           // immediate local flash
  await sp.broadcastEmoji(emoji)     // broadcast to all other users via Realtime
}

// Register the callback so the composable can trigger flashes for incoming emojis
sp.onEmojiReceived.value = (emoji) => { triggerEmojiFlash(emoji) }

// ─── Share & QR ───────────────────────────────────────────────────────────────
async function openShare() { showShareModal.value = true; await nextTick(); renderQR() }

function renderQR() {
  if (!qrContainer.value) return
  const load = () => {
    if (!window.QRCode) return
    qrContainer.value.innerHTML = ''
    new window.QRCode(qrContainer.value, { text: shareUrl.value, width: 176, height: 176, colorDark: '#818cf8', colorLight: '#0b0d12', correctLevel: window.QRCode.CorrectLevel?.M ?? 0 })
  }
  if (window.QRCode) { load(); return }
  const s = document.createElement('script')
  s.src = 'https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js'
  s.onload = load; document.head.appendChild(s)
}

async function copyLink() {
  try { await navigator.clipboard.writeText(shareUrl.value); copied.value = true; setTimeout(() => { copied.value = false }, 2000) } catch {}
}

function openGitHub() {
  window.open('https://github.com/surelle-ha/asurr-pokerplanner', '_blank', 'noopener')
}

function watchAd() {
  // Placeholder — integrate your ad SDK here (e.g. Google AdSense, AdMob Web)
  alert('Ad functionality coming soon. Thank you for supporting the project! ☕')
}

async function copyToken() {
  if (!myToken.value) return
  try { await navigator.clipboard.writeText(myToken.value); tokenCopied.value = true; setTimeout(() => { tokenCopied.value = false }, 2000) } catch {}
}

// ─── Export ───────────────────────────────────────────────────────────────────
function exportJSON() {
  if (!room.value || !ticketHistory.value.length) return
  const data = {
    room: room.value.name,
    exportedAt: new Date().toISOString(),
    tickets: ticketHistory.value.map(t => ({ title: t.title, description: t.description, finalScore: t.final_score })),
  }
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = `${room.value.name.replace(/\s+/g, '-')}-scores.json`
  a.click(); URL.revokeObjectURL(a.href)
  showExportMenu.value = false
}

function exportPDF() {
  if (!room.value || !ticketHistory.value.length) return
  const lines = [
    `Sprint Point Export — ${room.value.name}`,
    `Exported: ${new Date().toLocaleString()}`,
    '',
    ...ticketHistory.value.map((t, i) => `${i + 1}. ${t.title}${t.description ? ' — ' + t.description : ''}   →   ${t.final_score} pts`),
    '',
    `Total tickets: ${ticketHistory.value.length}`,
  ]
  const win = window.open('', '_blank')
  win.document.write(`
    <html><head><title>${room.value.name} Scores</title>
    <style>
      body{font-family:system-ui,sans-serif;padding:40px;color:#111;max-width:700px;margin:0 auto}
      h1{font-size:1.4rem;margin-bottom:4px}
      .meta{color:#666;font-size:13px;margin-bottom:28px}
      table{width:100%;border-collapse:collapse;margin-top:16px}
      th{text-align:left;padding:8px 12px;background:#f0f0f0;font-size:12px;text-transform:uppercase;letter-spacing:0.05em}
      td{padding:10px 12px;border-bottom:1px solid #eee;font-size:14px}
      .score{font-weight:700;color:#6366f1;font-size:1.1rem;text-align:center}
      .total{margin-top:20px;font-size:13px;color:#666}
    </style></head><body>
    <h1>📋 Asurr SprintPoint — ${room.value.name}</h1>
    <p class="meta">Exported ${new Date().toLocaleString()}</p>
    <table>
      <thead><tr><th>#</th><th>Ticket</th><th>Description</th><th style="text-align:center">Score</th></tr></thead>
      <tbody>
        ${ticketHistory.value.map((t, i) => `
          <tr>
            <td>${i + 1}</td>
            <td><strong>${t.title}</strong></td>
            <td style="color:#666">${t.description ?? '—'}</td>
            <td class="score">${t.final_score}</td>
          </tr>`).join('')}
      </tbody>
    </table>
    <p class="total">${ticketHistory.value.length} ticket${ticketHistory.value.length !== 1 ? 's' : ''} scored</p>
    <script>window.onload=()=>window.print()<\/script>
    </body></html>`)
  win.document.close()
  showExportMenu.value = false
}
</script>

<template>
  <div class="app">

    <!-- Emoji overlay -->
    <div v-if="screen === 'room'" class="emoji-stage" aria-hidden="true">
      <transition-group name="eflash">
        <div v-for="f in emojiFlashes" :key="f.id" class="emoji-flash" :style="{ left: f.x+'%', top: f.y+'%' }">{{ f.emoji }}</div>
      </transition-group>
    </div>

    <!-- ══ LANDING ══════════════════════════════════════════════════ -->
    <transition name="screen-fade" mode="out-in">
    <div v-if="screen === 'landing'" key="landing" class="landing">

      <!-- Falling background items -->
      <div class="fall-stage" aria-hidden="true">
        <div
          v-for="item in fallingItems" :key="item.id"
          class="fall-item"
          :style="{
            left: item.left + '%',
            animationDelay: item.delay + 's',
            animationDuration: item.duration + 's',
            fontSize: item.size + 'rem',
            opacity: item.opacity,
          }"
        >{{ item.symbol }}</div>
      </div>

      <!-- Hero -->
      <div class="landing__hero">
        <div class="landing__badge">Planning Poker</div>
        <h1 class="landing__title"><span class="brand-prefix">Asurr</span> <span class="product-name">Sprint<span class="accent">Point</span></span></h1>
        <p class="landing__sub">Free story point estimation tool — built by <a href="https://github.com/surelle-ha" target="_blank" rel="noopener" class="sub-link">surelle-ha</a></p>
        <div class="landing__actions">
          <button class="btn btn--primary" @click="screen = 'create'">Create Room</button>
          <button class="btn btn--ghost" @click="screen = 'join'">Join Room</button>
        </div>
      </div>

      <!-- Info cards row -->
      <div class="landing__info">
        <div class="info-card">
          <div class="info-card__icon">💸</div>
          <div class="info-card__body">
            <strong>Free to use</strong>
            <span>This platform is free for as long as I can sustain it.</span>
          </div>
        </div>
        <div class="info-card">
          <div class="info-card__icon">🗑️</div>
          <div class="info-card__body">
            <strong>Auto-purge</strong>
            <span>All room data older than 3 days is automatically deleted. Nothing lingers.</span>
          </div>
        </div>
        <div class="info-card info-card--link" @click="openGitHub">
          <div class="info-card__icon">⭐</div>
          <div class="info-card__body">
            <strong>Open Source</strong>
            <span>Fully open source on GitHub. Fork it, self-host it, contribute.</span>
          </div>
          <span class="info-card__arrow">→</span>
        </div>
      </div>

      <!-- Footer links -->
      <div class="landing__footer">
        <a
          href="https://github.com/surelle-ha/asurr-pokerplanner"
          target="_blank" rel="noopener"
          class="footer-link footer-link--gh"
        >
          <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"/></svg>
          Contribute
        </a>
        <a
          href="https://ko-fi.com/surelle"
          target="_blank" rel="noopener"
          class="footer-link footer-link--kofi"
        >
          ☕ Support
        </a>
        <button class="footer-link footer-link--ad" @click="watchAd">
          📺 Watch Ad
        </button>
        <a
          href="https://github.com/surelle-ha/asurr-pokerplanner/issues/new"
          target="_blank" rel="noopener"
          class="footer-link footer-link--suggest"
        >
          💬 Suggest
        </a>
      </div>

    </div>

    <!-- ══ CREATE ════════════════════════════════════════════════════ -->
    <div v-else-if="screen === 'create'" key="create" class="form-screen">
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
        <div class="field">
          <label>Room PIN <span class="optional">(optional — protects the room with a code)</span></label>
          <input v-model="createForm.pin" placeholder="e.g. 1234" maxlength="12" />
        </div>
        <div class="field">
          <label>Your Rejoin Token <span class="optional">(optional)</span></label>
          <input v-model="createForm.token" placeholder="e.g. swift-fox-412 (auto-generated if blank)" maxlength="32" />
          <span class="field-hint">Save this token — you can use it to rejoin as the same user if you disconnect.</span>
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
        <div v-if="sp.error.value" class="field-err err-box">{{ sp.error.value }}</div>
        <button class="btn btn--primary btn--full" :disabled="sp.loading.value" @click="createRoom">
          {{ sp.loading.value ? 'Creating…' : 'Create Room →' }}
        </button>
      </div>
    </div>

    <!-- ══ JOIN ══════════════════════════════════════════════════════ -->
    <div v-else-if="screen === 'join'" key="join" class="form-screen">
      <div class="form-card">
        <button class="back-btn" @click="screen = 'landing'">← Back</button>
        <h2>Join a Room</h2>
        <div class="field">
          <label>Room Code *</label>
          <input v-model="joinForm.roomCode" placeholder="Paste the room code" :class="{ error: joinErrors.roomCode }" @input="joinErrors.roomCode=false" />
          <span v-if="joinErrors.roomCode" class="field-err">
            {{ !joinForm.roomCode.trim() ? 'Room code is required' : (joinRoomPreview?.locked ? 'Room is locked 🔒' : 'Room not found') }}
          </span>
        </div>
        <div v-if="joinRoomPreview" class="room-preview">
          <span class="room-preview__name">{{ joinRoomPreview.name }}</span>
          <span v-if="joinRoomPreview.description" class="room-preview__desc">{{ joinRoomPreview.description }}</span>
          <span v-if="joinRoomPreview.locked" class="locked-badge">🔒 Locked</span>
          <span v-if="joinRoomPreview.pin" class="locked-badge" style="color:#818cf8">🔐 PIN required</span>
        </div>
        <div v-if="joinRoomPreview?.pin" class="field">
          <label>Room PIN *</label>
          <input v-model="joinForm.pin" placeholder="Enter the room PIN" :class="{ error: joinErrors.pin }" @input="joinErrors.pin=false" />
          <span v-if="joinErrors.pin" class="field-err">Incorrect PIN</span>
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
        <div class="field">
          <label>Rejoin Token <span class="optional">(optional)</span></label>
          <input v-model="joinForm.token" placeholder="Your token from a previous session" maxlength="32" />
          <span class="field-hint">Enter your previous token to reclaim your seat. Leave blank for a new auto-generated one.</span>
        </div>
        <div v-if="sp.error.value" class="field-err err-box">{{ sp.error.value }}</div>
        <button class="btn btn--primary btn--full" :disabled="sp.loading.value" @click="joinRoom">
          {{ sp.loading.value ? 'Joining…' : 'Join Room →' }}
        </button>
      </div>
    </div>

    <!-- ══ ROOM ═══════════════════════════════════════════════════════ -->
    <div v-else-if="screen === 'room' && room" key="room" class="room">

      <header class="room-header">
        <!-- Left: room title -->
        <div class="room-header__left">
          <div>
            <h1 class="room-header__title">{{ room.name }}<span v-if="isLocked" class="hdr-lock">🔒</span><span v-if="room.pin" class="hdr-lock" title="PIN protected">🔐</span></h1>
            <p v-if="room.description" class="room-header__desc">{{ room.description }}</p>
          </div>
        </div>

        <!-- Right: user badge + controls -->
        <div class="room-header__right">
          <div v-if="sp.loading.value" class="sync-badge">syncing…</div>

          <!-- Compact single-row: avatar · name · token · exit -->
          <div class="hdr-user-row">
            <div class="me-badge" :style="{ borderColor: currentUser?.color }">
              <div class="av av--xs" :style="{ background: currentUser?.color }">{{ initials(currentUser?.name ?? '?') }}</div>
              <span>{{ currentUser?.name }}<span v-if="currentUser?.is_host" class="me-role">host</span></span>
            </div>
            <button
              v-if="myToken"
              class="token-pill"
              :title="tokenCopied ? 'Copied!' : 'Click to copy your rejoin token'"
              @click="copyToken"
            >🔑 {{ myToken }}<span class="token-pill__copy">{{ tokenCopied ? '✓' : '⎘' }}</span></button>
            <button class="exit-pill" @click="backToLanding" title="Exit room">✕</button>
          </div>

          <!-- Host controls -->
          <div v-if="currentUser?.is_host" class="host-controls">
            <button class="btn btn--ghost btn--sm" @click="toggleLock">{{ isLocked ? '🔓 Unlock' : '🔒 Lock' }}</button>
            <button class="btn btn--ghost btn--sm" @click="showPassModal=true" title="Pass host role to another member">👑 Pass Host</button>
          </div>

          <button class="btn btn--accent btn--sm" @click="openShare">⬆ Share</button>
        </div>
      </header>

      <div class="room-body">

        <!-- LEFT: Tickets -->
        <aside class="sidebar sidebar--left" :class="{ 'sidebar--collapsed': !ticketsOpen }">
          <div class="sidebar-head">
            <button class="sidebar-collapse-btn" @click="ticketsOpen = !ticketsOpen" :title="ticketsOpen ? 'Collapse tickets' : 'Expand tickets'">
              <span class="section-label">Tickets</span>
              <span class="collapse-chevron" :class="{ 'collapse-chevron--up': ticketsOpen }">‹</span>
            </button>
            <div v-if="ticketsOpen" style="display:flex;align-items:center;gap:6px">
              <!-- Export dropdown -->
              <div v-if="ticketHistory.length" class="export-wrap">
                <button class="icon-btn export-icon-btn" @click="showExportMenu=!showExportMenu" title="Export scores">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                    <polyline points="7 10 12 15 17 10"/>
                    <line x1="12" y1="15" x2="12" y2="3"/>
                  </svg>
                </button>
                <div v-if="showExportMenu" class="export-menu">
                  <button @click="exportJSON">Export JSON</button>
                  <button @click="exportPDF">Export PDF</button>
                </div>
              </div>
              <button v-if="currentUser?.is_host" class="icon-btn" @click="showAddTicket=!showAddTicket">＋</button>
            </div>
          </div>
          <transition name="slide-down">
            <div v-if="ticketsOpen && showAddTicket" class="add-ticket-form">
              <input v-model="ticketInput.title" placeholder="Title (e.g. AUTH-123)" @keyup.enter="addTicket" />
              <textarea v-model="ticketInput.description" placeholder="Description (optional)" rows="2" />
              <div class="add-ticket-actions">
                <button class="btn btn--ghost btn--sm" @click="showAddTicket=false">Cancel</button>
                <button class="btn btn--primary btn--sm" @click="addTicket">Add</button>
              </div>
            </div>
          </transition>
          <div v-show="ticketsOpen" class="ticket-list" style="overflow-anchor:none">
            <div v-if="!tickets.length" class="empty-hint"><span>No tickets yet</span><small v-if="currentUser?.is_host">Tap ＋ above</small></div>
            <transition-group name="list-item" tag="div">
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
            </transition-group>
          </div>
          <div v-if="ticketsOpen && ticketHistory.length" class="completed-section">
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
            <transition name="banner-swap" mode="out-in">
            <div class="ticket-banner" :key="activeTicket?.id">
              <div class="ticket-banner__eyebrow">Now Estimating</div>
              <div class="ticket-banner__title">{{ activeTicket.title }}</div>
              <p v-if="activeTicket.description" class="ticket-banner__desc">{{ activeTicket.description }}</p>
            </div>
            </transition>

            <!-- Poker Table: names outside oval, cards inside on felt -->
            <div class="table-scene">
              <!-- Name labels rendered outside, in the scene wrapper -->
              <div
                v-for="seat in tableSeats" :key="'name-'+seat.id"
                class="seat-label"
                :class="{ 'seat-label--me': seat.id === currentUser?.id }"
                :style="{ left: seat.nx+'%', top: seat.ny+'%' }"
              >
                <div class="seat-label__av" :style="{ background: seat.color }">{{ initials(seat.name) }}</div>
                <div class="seat-label__name">{{ seat.name }}<span v-if="seat.is_host"> ★</span><span v-if="seat.is_spectator"> 👁</span></div>
              </div>

              <!-- The felt table with cards only inside -->
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
                  <!-- Cards floating on the felt at card positions (cx/cy) -->
                  <div
                    v-for="seat in tableSeats" :key="'card-'+seat.id"
                    class="seat-card-wrap"
                    :style="{ left: seat.cx+'%', top: seat.cy+'%' }"
                  >
                    <div class="seat-card" :class="{
                      'seat-card--voted':    !revealed && votes[seat.id] !== undefined,
                      'seat-card--revealed': revealed  && votes[seat.id] !== undefined,
                      'seat-card--miss':     revealed  && votes[seat.id] === undefined,
                    }">{{ revealed ? (votes[seat.id] ?? '–') : (votes[seat.id] !== undefined ? '🂠' : '') }}</div>
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

                <!-- Final score selection — emphasized -->
                <div v-if="currentUser?.is_host" class="accept-section">
                  <div class="accept-section__header">
                    <span class="accept-section__title">Select Final Score</span>
                    <span class="accept-section__hint">Suggested: <strong>{{ voteStats.mode }}</strong></span>
                  </div>
                  <div class="accept-cards">
                    <button
                      v-for="c in FIBONACCI.slice(1)" :key="c"
                      class="accept-card"
                      :class="{
                        'accept-card--suggest': String(c) === String(voteStats.mode),
                        'accept-card--other': String(c) !== String(voteStats.mode),
                      }"
                      @click="acceptScore(c)"
                    >
                      <span class="accept-card__val">{{ c }}</span>
                      <span v-if="String(c) === String(voteStats.mode)" class="accept-card__tag">suggested</span>
                    </button>
                  </div>
                </div>
              </div>
            </transition>

            <!-- Floating dock: vote cards + host controls + emoji reactions -->
            <transition name="dock-in"><div class="float-dock">
              <!-- Host controls -->
              <div v-if="currentUser?.is_host" class="dock-section dock-section--host">
                <button v-if="!revealed" class="dock-reveal-btn" :disabled="!voteCount" @click="revealVotes">
                  <span class="dock-reveal-btn__count">{{ voteCount }}/{{ voters.length }}</span>
                  Reveal Votes
                </button>
                <button v-else class="dock-revote-btn" @click="resetVoting">↺ Re-vote</button>
              </div>

              <!-- Voting cards (voters only) -->
              <div v-if="canVote" class="dock-section dock-cards">
                <button v-for="card in FIBONACCI" :key="card" class="dock-card" :class="{ 'dock-card--sel': myVote===card }" @click="castVote(card)">{{ card }}</button>
              </div>
              <div v-else-if="currentUser?.is_spectator" class="dock-section dock-spectator">👁 Spectating</div>

              <!-- Divider -->
              <div class="dock-divider" />

              <!-- Emoji reactions -->
              <div class="dock-section dock-emojis">
                <button v-for="e in EMOJI_LIST" :key="e" class="dock-emoji" @click="sendEmoji(e)">{{ e }}</button>
              </div>
            </div></transition>
          </template>
        </main>

        <!-- RIGHT: Chat -->
        <aside class="sidebar sidebar--right">
          <div class="sidebar-head">
            <span class="section-label">Team Chat</span>
            <span class="online-dot">{{ members.length }} online</span>
          </div>
          <div class="members-list">
            <transition-group name="list-item" tag="div">
            <div
              v-for="m in members" :key="m.id"
              class="member-row"
              :class="{ 'member-row--offline': !onlineMembers.find(o => o.id === m.id) }"
            >
              <div class="av av--xs" :style="{ background: m.color }">{{ initials(m.name) }}</div>
              <span class="member-row__name">{{ m.name }}</span>
              <span v-if="m.is_host" class="rbadge rbadge--host">host</span>
              <span v-if="m.is_spectator" class="rbadge">👁</span>
              <span v-if="!onlineMembers.find(o => o.id === m.id)" class="rbadge rbadge--offline" title="Away">●</span>
            </div>
            </transition-group>
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

    </transition><!-- /screen-fade -->

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
          <div v-if="room?.pin" class="room-code-row" style="margin-top:-6px">
            <span class="room-code-label">PIN</span>
            <span class="room-code" style="color:#f59e0b">{{ room.pin }}</span>
          </div>
          <div v-if="isLocked" class="locked-notice-modal">🔒 Room is locked — new joins are blocked</div>
          <p class="share-hint">Share link or code. Anyone can join from any device.</p>
        </div>
      </div>
    </transition>

    <!-- ══ PASS HOST MODAL ════════════════════════════════════════════ -->
    <transition name="modal-fade">
      <div v-if="showPassModal" class="modal-backdrop" @click.self="showPassModal=false">
        <div class="modal">
          <div class="modal-head">
            <span class="modal-title">👑 Pass Host Role</span>
            <button class="icon-btn" @click="showPassModal=false">✕</button>
          </div>
          <p class="pass-hint">Select a member to become the new host. You will lose host privileges.</p>
          <div v-if="!nonHostMembers.length" class="empty-hint" style="padding:12px 0">No other voters in the room yet.</div>
          <div class="pass-member-list">
            <div v-for="m in nonHostMembers" :key="m.id" class="pass-member-row" @click="passHostTo(m.id)">
              <div class="av av--xs" :style="{ background: m.color }">{{ initials(m.name) }}</div>
              <span class="pass-member-name">{{ m.name }}</span>
              <span class="pass-member-action">Make host →</span>
            </div>
          </div>
        </div>
      </div>
    </transition>

  </div>
</template>

<style scoped>
@import url('https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,300;0,9..40,400;0,9..40,500;0,9..40,600;0,9..40,700;0,9..40,800;0,9..40,900;1,9..40,400&family=DM+Mono:wght@400;500&display=swap');

* { box-sizing: border-box; margin: 0; padding: 0; }

.app {
  --bg: #0b0d12; --surface: #131720; --surface2: #1a1f2e;
  --border: rgba(255,255,255,0.06); --border2: rgba(255,255,255,0.11);
  --accent: #6366f1; --accent2: #818cf8; --text: #e2e5f0;
  --muted: #787e9a; --muted2: #454960; --success: #10b981;
  --felt: #1b4d35; --felt2: #143d29; --felt-rim: #0e2c1d;
  --r: 12px; --r-sm: 8px;
  --font-main: 'DM Sans', 'Segoe UI', system-ui, sans-serif;
  --font-mono: 'DM Mono', 'Fira Code', monospace;
  font-family: var(--font-main);
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

/* Brand name styling */
.brand { font-weight:800; letter-spacing:0.04em; color:var(--accent2); font-size:1em; }
.brand-prefix {
  font-size: clamp(1rem, 2.5vw, 1.6rem);
  font-weight: 900;
  font-family: var(--font-main);
  color: var(--accent2);
  letter-spacing: 0.12em;
  text-transform: uppercase;
  opacity: 0.85;
  display: block;
  line-height: 1;
  margin-bottom: 2px;
}
.product-name {
  display: block;
  line-height: 1;
}
.brand-inline {
  color: var(--accent2);
  font-weight: 700;
  font-style: normal;
}
.sub-link {
  color: var(--accent2); font-weight: 600; text-decoration: none;
  border-bottom: 1px dotted rgba(129,140,248,0.4);
  transition: border-color 0.15s;
}
.sub-link:hover { border-color: var(--accent2); }
.landing__sub { font-size:0.95rem; color:var(--muted); text-align:center; }
.landing__actions { display:flex; gap:12px; margin-top:4px; }

/* Falling background */
.fall-stage {
  position: fixed; inset: 0; pointer-events: none; z-index: 0; overflow: hidden;
}
.fall-item {
  position: absolute; top: -4rem; font-weight: 800;
  font-family: 'Inter', monospace;
  animation: fall linear infinite;
  user-select: none;
}
@keyframes fall {
  0%   { transform: translateY(-60px) rotate(0deg);   }
  100% { transform: translateY(110vh)  rotate(360deg); }
}

/* Ensure hero sits above falling layer */
.landing__hero  { position: relative; z-index: 1; }
.landing__info  { position: relative; z-index: 1; }
.landing__footer { position: relative; z-index: 1; }

/* Info cards */
.landing__info {
  display: flex; gap: 12px; flex-wrap: wrap; justify-content: center;
  max-width: 680px; width: 100%;
}
.info-card {
  display: flex; align-items: flex-start; gap: 12px;
  background: rgba(19,23,32,0.85);
  border: 1px solid var(--border2); border-radius: var(--r);
  padding: 14px 16px; flex: 1; min-width: 180px; max-width: 220px;
  backdrop-filter: blur(8px);
  transition: border-color 0.2s, background 0.2s;
}
.info-card--link { cursor: pointer; }
.info-card--link:hover { border-color: var(--accent); background: rgba(99,102,241,0.08); }
.info-card__icon { font-size: 1.35rem; flex-shrink: 0; margin-top: 1px; }
.info-card__body { display: flex; flex-direction: column; gap: 3px; flex: 1; }
.info-card__body strong { font-size: 12px; font-weight: 700; color: var(--text); }
.info-card__body span { font-size: 11px; color: var(--muted); line-height: 1.45; }
.info-card__arrow { font-size: 14px; color: var(--accent2); align-self: center; flex-shrink: 0; }

/* Footer links */
.landing__footer { display: flex; gap: 14px; flex-wrap: wrap; justify-content: center; align-items: center; }
.footer-link {
  display: inline-flex; align-items: center; gap: 6px;
  text-decoration: none; font-size: 12px; font-weight: 600;
  border-radius: 999px; padding: 6px 14px;
  transition: all 0.15s; border: 1px solid;
}
.footer-link--gh {
  color: var(--text); border-color: var(--border2);
  background: rgba(255,255,255,0.04);
}
.footer-link--gh:hover { border-color: var(--border2); background: var(--surface2); }
.footer-link--suggest {
  color: var(--accent2); border-color: rgba(99,102,241,0.3);
  background: rgba(99,102,241,0.08);
}
.footer-link--suggest:hover { background: rgba(99,102,241,0.18); border-color: var(--accent); }
.footer-link--kofi {
  color: #ff6b3d; border-color: rgba(255,107,61,0.3);
  background: rgba(255,107,61,0.08);
}
.footer-link--kofi:hover { background: rgba(255,107,61,0.18); border-color: rgba(255,107,61,0.6); }
.footer-link--ad {
  color: #10b981; border-color: rgba(16,185,129,0.3);
  background: rgba(16,185,129,0.08); cursor: pointer;
  font-family: inherit;
}
.footer-link--ad:hover { background: rgba(16,185,129,0.18); border-color: rgba(16,185,129,0.6); }

.public-rooms { width:100%; max-width:520px; }
.public-rooms__list { display:flex; flex-direction:column; gap:7px; margin-top:8px; }
.pub-card { display:flex; align-items:center; gap:12px; background:var(--surface); border:1px solid var(--border2); border-radius:var(--r-sm); padding:11px 15px; cursor:pointer; transition:border-color 0.15s,background 0.15s; }
.pub-card:hover { border-color:var(--accent); background:rgba(99,102,241,0.06); }
.pub-card__left { flex:1; display:flex; flex-direction:column; gap:2px; min-width:0; }
.pub-card__name { font-weight:600; font-size:14px; }
.pub-card__desc { font-size:11px; color:var(--muted); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.pub-card__right { display:flex; align-items:center; gap:8px; flex-shrink:0; }
.chip { font-size:11px; color:var(--muted); background:var(--surface2); padding:2px 8px; border-radius:999px; }
.chip--pin { color:var(--accent2); background:rgba(99,102,241,0.12); }
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
.err-box { padding:8px; background:rgba(239,68,68,0.08); border-radius:8px; }
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

/* Compact single-row header user area */
.hdr-user-row { display:flex; align-items:center; gap:6px; }
.me-badge { display:flex; align-items:center; gap:6px; border:1.5px solid; border-radius:999px; padding:3px 10px 3px 4px; font-size:12px; font-weight:500; }
.me-role { background:rgba(99,102,241,0.2); color:var(--accent2); font-size:10px; padding:1px 6px; border-radius:999px; margin-left:3px; }

/* Token pill: compact inline, clickable to copy */
.token-pill {
  display: inline-flex; align-items: center; gap: 5px;
  background: var(--surface2); border: 1px solid var(--border2);
  border-radius: 6px; padding: 3px 8px 3px 7px;
  font-size: 10px; font-family: var(--font-mono); font-weight: 700;
  color: var(--accent2); letter-spacing: 0.04em;
  cursor: pointer; transition: all 0.15s; white-space: nowrap;
}
.token-pill:hover { border-color: var(--accent); background: rgba(99,102,241,0.1); }
.token-pill__copy { margin-left: 3px; font-size: 11px; color: var(--muted); font-family: sans-serif; }

/* Exit pill: small X button */
.exit-pill {
  width: 26px; height: 26px; border-radius: 50%;
  background: none; border: 1px solid var(--border2);
  color: var(--muted); font-size: 13px; line-height: 1;
  cursor: pointer; display: flex; align-items: center; justify-content: center;
  transition: all 0.15s; flex-shrink: 0;
}
.exit-pill:hover { background: rgba(239,68,68,0.12); border-color: rgba(239,68,68,0.4); color: #ef4444; }

.host-controls { display:flex; gap:6px; }
.room-body { display:grid; grid-template-columns:225px 1fr 250px; flex:1; overflow:hidden; transition: grid-template-columns 0.25s cubic-bezier(0.4,0,0.2,1); }

/* ── Sidebars ── */
.sidebar { background:var(--surface); display:flex; flex-direction:column; overflow:hidden; border-right:1px solid var(--border); transition: width 0.25s cubic-bezier(0.4,0,0.2,1), min-width 0.25s cubic-bezier(0.4,0,0.2,1); }
.sidebar--right { border-right:none; border-left:1px solid var(--border); }
.sidebar--collapsed { min-width: 42px !important; width: 42px !important; overflow: hidden; }
.sidebar-head { display:flex; align-items:center; justify-content:space-between; padding:13px 13px 8px; flex-shrink:0; }

/* Collapsible sidebar head button */
.sidebar-collapse-btn {
  display: flex; align-items: center; gap: 6px;
  background: none; border: none; cursor: pointer; padding: 0;
  flex: 1; min-width: 0;
}
.sidebar-collapse-btn:hover .section-label { color: var(--text); }
.collapse-chevron {
  font-size: 16px; color: var(--muted); line-height: 1;
  transform: rotate(-90deg);
  transition: transform 0.22s cubic-bezier(0.4,0,0.2,1);
  flex-shrink: 0;
}
.collapse-chevron--up { transform: rotate(90deg); }

/* Export icon button tweak */
.export-icon-btn { padding: 4px 6px; }
.export-icon-btn svg { display: block; }
.section-label { font-size:10px; font-weight:700; text-transform:uppercase; letter-spacing:0.09em; color:var(--muted); }
.online-dot { font-size:11px; color:var(--muted); }
.divider { height:1px; background:var(--border); flex-shrink:0; }

/* Export dropdown */
.export-wrap { position:relative; }
.export-menu { position:absolute; right:0; top:34px; background:var(--surface); border:1px solid var(--border2); border-radius:var(--r-sm); min-width:140px; z-index:200; overflow:hidden; box-shadow:0 8px 24px rgba(0,0,0,0.5); }
.export-menu button { display:block; width:100%; text-align:left; background:none; border:none; color:var(--text); font-size:13px; padding:10px 14px; cursor:pointer; transition:background 0.1s; }
.export-menu button:hover { background:var(--surface2); }

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

/* ── Poker Table Scene ── */
/* The scene is a square container so % positioning works consistently */
.table-scene {
  position: relative;
  width: 100%;
  padding-bottom: 44%; /* compact oval */
}

/* Name labels: positioned outside the oval using % of the scene */
.seat-label {
  position: absolute;
  transform: translate(-50%, -50%);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  z-index: 20;
  pointer-events: none;
}
.seat-label__av {
  width: 30px; height: 30px; border-radius: 50%;
  display: flex; align-items: center; justify-content: center;
  font-size: 11px; font-weight: 700; color: white;
  border: 2px solid rgba(255,255,255,0.2);
  box-shadow: 0 2px 8px rgba(0,0,0,0.6);
}
.seat-label--me .seat-label__av { border-color: var(--accent2); box-shadow: 0 0 0 2px rgba(99,102,241,0.45); }
.seat-label__name {
  font-size: 9px; font-weight: 600; color: var(--text);
  white-space: nowrap; text-align: center; max-width: 64px;
  overflow: hidden; text-overflow: ellipsis;
  background: rgba(13,15,20,0.75); border-radius: 4px; padding: 1px 5px;
  backdrop-filter: blur(2px);
}

/* The felt table shell: centered inside the scene */
.table-shell {
  position: absolute;
  /* inset so it sits inside the label ring — labels orbit outside this */
  top: 14%; left: 12%; right: 12%; bottom: 14%;
  border-radius: 999px;
  background: var(--felt-rim);
  box-shadow: 0 0 0 6px var(--felt-rim), 0 8px 32px rgba(0,0,0,0.7), inset 0 2px 8px rgba(0,0,0,0.45);
}
.table-felt {
  position: absolute; inset: 8px; border-radius: 999px;
  background: radial-gradient(ellipse at 50% 38%, #22644a 0%, var(--felt) 55%, var(--felt2) 100%);
  border: 2px solid rgba(255,255,255,0.05);
  overflow: hidden;
}

/* Center display */
.table-center { position:absolute; top:50%; left:50%; transform:translate(-50%,-50%); text-align:center; display:flex; flex-direction:column; align-items:center; gap:2px; min-width:70px; }
.tc-count { font-size:1.6rem; font-weight:900; color:rgba(255,255,255,0.88); line-height:1; }
.tc-count span { font-size:0.9rem; color:rgba(255,255,255,0.38); }
.tc-label { font-size:9px; color:rgba(255,255,255,0.38); text-transform:uppercase; letter-spacing:0.09em; }
.tc-bar { width:60px; height:3px; background:rgba(255,255,255,0.1); border-radius:2px; overflow:hidden; margin-top:2px; }
.tc-bar-fill { height:100%; background:var(--accent2); border-radius:2px; transition:width 0.4s ease; }
.tc-avg { font-size:2rem; font-weight:900; color:#fff; line-height:1; }
.tc-consensus { font-size:10px; color:#6ee7b7; margin-top:2px; font-weight:600; }

/* Cards floating on the felt */
.seat-card-wrap {
  position: absolute;
  transform: translate(-50%, -50%);
  z-index: 10;
}
.seat-card {
  width: 22px; height: 30px; border-radius: 4px;
  border: 1px solid rgba(255,255,255,0.1); background: rgba(255,255,255,0.05);
  display: flex; align-items: center; justify-content: center;
  font-size: 9px; font-weight: 700; color: rgba(255,255,255,0.25);
  transition: all 0.3s; box-shadow: 0 1px 4px rgba(0,0,0,0.5);
}
.seat-card--voted { background:rgba(99,102,241,0.4); border-color:var(--accent2); color:var(--accent2); font-size:13px; transform:translateY(-5px); box-shadow:0 4px 12px rgba(99,102,241,0.3); }
.seat-card--revealed { background:rgba(16,185,129,0.28); border-color:#6ee7b7; color:#d1fae5; transform:translateY(-5px); font-size:11px; }
.seat-card--miss { color:rgba(255,255,255,0.18); }

/* ── Results ── */
.results { background:var(--surface); border:1px solid var(--border2); border-radius:var(--r); padding:16px; display:flex; flex-direction:column; gap:14px; }
.results-stats { display:grid; grid-template-columns:repeat(3,1fr); gap:8px; }
.stat-card { background:var(--surface2); border-radius:var(--r-sm); padding:10px; text-align:center; }
.stat-card--hl { background:rgba(99,102,241,0.14); border:1px solid rgba(99,102,241,0.28); }
.stat-val { font-size:1.4rem; font-weight:800; line-height:1; }
.stat-card--hl .stat-val { color:var(--accent2); }
.stat-lbl { font-size:10px; color:var(--muted); margin-top:2px; text-transform:uppercase; letter-spacing:0.06em; }

/* Final score selection — emphasized */
.accept-section {
  background: var(--surface2);
  border: 1px solid var(--border2);
  border-radius: var(--r);
  padding: 14px 16px;
  display: flex; flex-direction: column; gap: 12px;
}
.accept-section__header { display:flex; align-items:center; justify-content:space-between; }
.accept-section__title { font-size:12px; font-weight:700; text-transform:uppercase; letter-spacing:0.07em; color:var(--muted); }
.accept-section__hint { font-size:12px; color:var(--muted); }
.accept-section__hint strong { color:var(--accent2); }

.accept-cards { display:flex; flex-wrap:wrap; gap:8px; }
.accept-card {
  position: relative;
  min-width: 48px; height: 64px;
  border: 2px solid var(--border2);
  border-radius: 10px;
  background: var(--surface);
  color: var(--muted);
  cursor: pointer;
  display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 2px;
  transition: all 0.15s;
  padding: 0 10px;
}
.accept-card:hover { border-color:var(--accent); background:rgba(99,102,241,0.08); color:var(--text); transform:translateY(-2px); }
.accept-card__val { font-size:1.1rem; font-weight:800; line-height:1; }
.accept-card__tag { font-size:8px; text-transform:uppercase; letter-spacing:0.06em; }

/* Suggested score — large, glowing, unmissable */
.accept-card--suggest {
  border-color: var(--accent);
  background: rgba(99,102,241,0.18);
  color: var(--accent2);
  transform: translateY(-4px);
  box-shadow: 0 0 0 3px rgba(99,102,241,0.2), 0 6px 20px rgba(99,102,241,0.25);
  min-width: 58px; height: 74px;
}
.accept-card--suggest .accept-card__val { font-size:1.5rem; }
.accept-card--suggest:hover { transform:translateY(-7px); box-shadow:0 0 0 3px rgba(99,102,241,0.3),0 10px 28px rgba(99,102,241,0.35); }

/* Other score cards — slightly dimmed */
.accept-card--other { opacity: 0.65; }
.accept-card--other:hover { opacity: 1; }





/* ── Chat ── */
.members-list { padding:4px 10px 8px; display:flex; flex-direction:column; gap:3px; flex-shrink:0; max-height:110px; overflow-y:auto; }
.member-row { display:flex; align-items:center; gap:7px; font-size:12px; padding:3px 4px; border-radius:5px; }
.member-row__name { flex:1; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.rbadge { font-size:10px; background:var(--surface2); color:var(--muted); padding:1px 6px; border-radius:999px; flex-shrink:0; }
.rbadge--host { background:rgba(99,102,241,0.15); color:var(--accent2); }
.rbadge--offline { background:none; color:var(--muted2); font-size:8px; padding:0 4px; }
.member-row--offline { opacity: 0.45; }
.member-row--offline .member-row__name { text-decoration: line-through; }
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

/* ── Modals ── */
.modal-backdrop { position:fixed; inset:0; background:rgba(0,0,0,0.72); display:flex; align-items:center; justify-content:center; z-index:600; backdrop-filter:blur(5px); }
.modal { background:var(--surface); border:1px solid var(--border2); border-radius:var(--r); padding:24px; width:310px; display:flex; flex-direction:column; gap:14px; box-shadow:0 24px 64px rgba(0,0,0,0.65); }
.modal-head { display:flex; align-items:center; justify-content:space-between; }
.modal-title { font-size:14px; font-weight:700; }
.qr-wrap { display:flex; justify-content:center; align-items:center; background:var(--bg); border-radius:var(--r-sm); padding:14px; min-height:204px; }
.qr-wrap canvas, .qr-wrap img { border-radius:4px; display:block; }
.share-url-row { display:flex; gap:8px; align-items:center; }
.share-url-input { flex:1; background:var(--bg); border:1px solid var(--border2); border-radius:var(--r-sm); color:var(--muted); font-size:11px; padding:8px 10px; outline:none; font-family:var(--font-mono); }
.room-code-row { display:flex; align-items:center; gap:10px; background:var(--surface2); border-radius:var(--r-sm); padding:10px 14px; }
.room-code-label { font-size:11px; color:var(--muted); flex:1; }
.room-code { font-family:monospace; font-size:15px; font-weight:700; color:var(--accent2); letter-spacing:0.06em; word-break:break-all; }
.locked-notice-modal { font-size:12px; color:#f59e0b; text-align:center; background:rgba(245,158,11,0.08); border-radius:var(--r-sm); padding:8px; }
.share-hint { font-size:11px; color:var(--muted); text-align:center; line-height:1.5; }

/* Pass host modal */
.pass-hint { font-size:12px; color:var(--muted); line-height:1.5; }
.pass-member-list { display:flex; flex-direction:column; gap:6px; max-height:240px; overflow-y:auto; }
.pass-member-row { display:flex; align-items:center; gap:10px; background:var(--surface2); border:1px solid var(--border2); border-radius:var(--r-sm); padding:10px 14px; cursor:pointer; transition:border-color 0.15s,background 0.15s; }
.pass-member-row:hover { border-color:var(--accent); background:rgba(99,102,241,0.07); }
.pass-member-name { flex:1; font-size:13px; font-weight:500; }
.pass-member-action { font-size:11px; color:var(--accent2); font-weight:600; }

/* ── Floating dock ── */
.float-dock {
  position: fixed;
  bottom: 18px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 300;
  display: flex;
  align-items: center;
  gap: 0;
  background: rgba(19,23,32,0.92);
  border: 1px solid var(--border2);
  border-radius: 999px;
  padding: 7px 12px;
  backdrop-filter: blur(12px);
  box-shadow: 0 8px 32px rgba(0,0,0,0.55), 0 0 0 1px rgba(255,255,255,0.04);
  max-width: calc(100vw - 520px); /* stay clear of sidebars */
  overflow-x: auto;
  scrollbar-width: none;
}
.float-dock::-webkit-scrollbar { display: none; }
.dock-section { display: flex; align-items: center; gap: 5px; flex-shrink: 0; }
.dock-divider { width: 1px; height: 28px; background: var(--border2); margin: 0 10px; flex-shrink: 0; }
.dock-section--host { margin-right: 4px; }
.dock-reveal-btn {
  display: flex; align-items: center; gap: 7px;
  background: var(--accent); color: white; border: none; border-radius: 999px;
  padding: 7px 16px; font-size: 13px; font-weight: 700; cursor: pointer;
  transition: all 0.15s; white-space: nowrap;
}
.dock-reveal-btn:disabled { opacity: 0.4; cursor: not-allowed; }
.dock-reveal-btn:not(:disabled):hover { background: var(--accent2); }
.dock-reveal-btn__count { background: rgba(255,255,255,0.2); border-radius: 999px; padding: 1px 8px; font-size: 11px; }
.dock-revote-btn {
  background: transparent; color: var(--muted); border: 1px solid var(--border2);
  border-radius: 999px; padding: 6px 14px; font-size: 12px; font-weight: 600; cursor: pointer;
  transition: all 0.15s; white-space: nowrap;
}
.dock-revote-btn:hover { background: var(--surface2); color: var(--text); }
.dock-cards { gap: 4px; }
.dock-card {
  min-width: 38px; height: 52px;
  background: var(--surface2); border: 1.5px solid var(--border2);
  border-radius: 8px; font-size: 0.95rem; font-weight: 800; color: var(--text);
  cursor: pointer; transition: all 0.13s;
  display: flex; align-items: center; justify-content: center; padding: 0 7px;
}
.dock-card:hover { transform: translateY(-5px); border-color: var(--accent); background: rgba(99,102,241,0.12); }
.dock-card--sel {
  transform: translateY(-9px); border-color: var(--accent);
  background: rgba(99,102,241,0.25); color: var(--accent2);
  box-shadow: 0 0 0 3px rgba(99,102,241,0.2);
}
.dock-spectator { font-size: 12px; color: var(--muted); padding: 0 8px; }
.dock-emojis { gap: 2px; }
.dock-emoji {
  background: none; border: none; cursor: pointer; font-size: 1.2rem;
  padding: 4px 5px; border-radius: 8px; line-height: 1;
  transition: background 0.1s, transform 0.12s;
}
.dock-emoji:hover { background: var(--surface2); transform: scale(1.35) translateY(-2px); }

.field-hint { font-size:11px; color:var(--muted); line-height:1.4; }



/* ── Transitions ── */

/* Screen-level page transitions */
.screen-fade-enter-active { transition: opacity 0.22s ease, transform 0.22s ease; }
.screen-fade-leave-active { transition: opacity 0.18s ease, transform 0.18s ease; }
.screen-fade-enter-from { opacity: 0; transform: translateY(10px); }
.screen-fade-leave-to   { opacity: 0; transform: translateY(-6px); }

/* Slide-down (add ticket form, pass modal list) */
.slide-down-enter-active,.slide-down-leave-active { transition:all 0.22s cubic-bezier(0.4,0,0.2,1); }
.slide-down-enter-from,.slide-down-leave-to { opacity:0; transform:translateY(-10px); max-height:0; }

/* Results reveal */
.reveal-enter-active { transition: opacity 0.4s ease, transform 0.4s cubic-bezier(0.34,1.56,0.64,1); }
.reveal-leave-active { transition: opacity 0.2s ease; }
.reveal-enter-from { opacity:0; transform:translateY(16px) scale(0.97); }
.reveal-leave-to   { opacity:0; }

/* Modal */
.modal-fade-enter-active { transition: opacity 0.2s ease; }
.modal-fade-leave-active { transition: opacity 0.15s ease; }
.modal-fade-enter-from,.modal-fade-leave-to { opacity:0; }
.modal-fade-enter-active .modal { transition: transform 0.25s cubic-bezier(0.34,1.56,0.64,1); }
.modal-fade-enter-from .modal { transform: scale(0.93) translateY(8px); }

/* Fade up (public rooms, etc) */
.fade-up-enter-active { transition:all 0.4s ease; }
.fade-up-enter-from { opacity:0; transform:translateY(8px); }

/* List items (tickets, members) */
.list-item-enter-active { transition: all 0.25s cubic-bezier(0.4,0,0.2,1); }
.list-item-leave-active { transition: all 0.18s ease; }
.list-item-enter-from { opacity:0; transform:translateX(-8px); }
.list-item-leave-to   { opacity:0; transform:translateX(8px); height:0; padding:0; margin:0; }
.list-item-move       { transition: transform 0.25s ease; }

/* Ticket banner swap */
.banner-swap-enter-active { transition: all 0.3s cubic-bezier(0.4,0,0.2,1); }
.banner-swap-leave-active { transition: all 0.2s ease; }
.banner-swap-enter-from { opacity:0; transform:translateY(6px); }
.banner-swap-leave-to   { opacity:0; transform:translateY(-4px); }

/* Dock entrance */
.dock-in-enter-active { transition: all 0.35s cubic-bezier(0.34,1.56,0.64,1); }
.dock-in-leave-active { transition: all 0.2s ease; }
.dock-in-enter-from { opacity:0; transform:translateX(-50%) translateY(20px); }
.dock-in-leave-to   { opacity:0; transform:translateX(-50%) translateY(12px); }
</style>