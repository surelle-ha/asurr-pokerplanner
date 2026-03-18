<script setup>
import { ref, computed, watch, onMounted, provide } from 'vue'

definePageMeta({ ssr: false })

const sp = useSprintPoint()
provide('sp', sp)

// ── Screen routing ─────────────────────────────────────────────────────────────
const screen          = ref('landing')   // landing | create | join | room
const initialRoomCode = ref('')          // pre-filled from ?room= share link
const sessionStart    = ref(null)        // Date when user entered the room
const sessionDisplay  = ref('0:00')      // formatted elapsed time
let   sessionTimer    = null

function startSessionTimer() {
  sessionStart.value = Date.now()
  sessionDisplay.value = '0:00'
  clearInterval(sessionTimer)
  sessionTimer = setInterval(() => {
    const elapsed = Math.floor((Date.now() - sessionStart.value) / 1000)
    const h = Math.floor(elapsed / 3600)
    const m = Math.floor((elapsed % 3600) / 60)
    const s = elapsed % 60
    sessionDisplay.value = h > 0
      ? `${h}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`
      : `${m}:${String(s).padStart(2,'0')}`
  }, 1000)
}

function stopSessionTimer() {
  clearInterval(sessionTimer)
  sessionTimer = null
  sessionStart.value = null
  sessionDisplay.value = '0:00'
}

// ── Emoji overlay ──────────────────────────────────────────────────────────────
const emojiFlashes = ref([])

function triggerEmojiFlash(emoji) {
  const flash = { id: Math.random().toString(36).slice(2), emoji, x: 15 + Math.random() * 70, y: 5 + Math.random() * 70 }
  emojiFlashes.value.push(flash)
  setTimeout(() => { emojiFlashes.value = emojiFlashes.value.filter(e => e.id !== flash.id) }, 2500)
}

async function sendEmoji(emoji) {
  triggerEmojiFlash(emoji)
  await sp.broadcastEmoji(emoji)
}

// ── Modal state ─────────────────────────────────────────────────────────────────
const showShare      = ref(false)
const showPassHost   = ref(false)
const showKick       = ref(false)
const showAddTicket  = ref(false)
const showLeaderboard= ref(false)
const kickTarget     = ref(null)
const copied         = ref(false)
const tokenCopied    = ref(false)

// ── Falling items (landing only) ───────────────────────────────────────────────
const FALL_ITEMS  = ['?','0','1','2','3','5','8','13','21','34','55','☕','🎯','⚡','🃏','★']
const fallingItems = ref([])
function spawnFallers() {
  fallingItems.value = Array.from({ length: 18 }, (_, i) => ({
    id: i,
    symbol: FALL_ITEMS[Math.floor(Math.random() * FALL_ITEMS.length)],
    left: Math.random() * 100,
    delay: Math.random() * 8,
    duration: 7 + Math.random() * 8,
    size: 0.75 + Math.random() * 0.9,
    opacity: 0.04 + Math.random() * 0.1,
  }))
}

// ── Share URL & QR ─────────────────────────────────────────────────────────────
// useRequestURL() returns the correct public-facing URL in all environments
// (local dev, Railway, Vercel, custom domain) — never snapshots localhost.
const shareUrl = computed(() => {
  const id = sp.room.value?.id
  if (!id) return ''
  if (typeof window === 'undefined') return ''
  // Prefer useRequestURL if available (Nuxt server context), else use window
  try {
    const reqUrl = useRequestURL()
    return reqUrl.origin + reqUrl.pathname + '?room=' + id
  } catch {
    return window.location.origin + window.location.pathname + '?room=' + id
  }
})

async function copyLink() {
  try { await navigator.clipboard.writeText(shareUrl.value); copied.value = true; setTimeout(() => { copied.value = false }, 2000) } catch {}
}

async function copyToken() {
  if (!sp.myToken.value) return
  try { await navigator.clipboard.writeText(sp.myToken.value); tokenCopied.value = true; setTimeout(() => { tokenCopied.value = false }, 2000) } catch {}
}

// ── Room header actions ─────────────────────────────────────────────────────────
async function toggleLock() { await sp.toggleLock() }

async function passHost(memberId) {
  await sp.passHostTo(memberId)
  showPassHost.value = false
}

async function kickConfirm(memberId) {
  kickTarget.value = null
  showKick.value   = false
  await sp.kickMember(memberId)
}

async function backToLanding() {
  stopSessionTimer()
  await sp.leaveRoom()
  screen.value    = 'landing'
  showShare.value = showAddTicket.value = showPassHost.value = showKick.value = false
}

// ── Lifecycle ──────────────────────────────────────────────────────────────────
onMounted(async () => {
  spawnFallers()

  // Register composable callbacks (must be client-side only)
  sp.onEmojiReceived.value = (emoji) => triggerEmojiFlash(emoji)
  sp.onKicked.value = () => {
    sp.leaveRoom()
    screen.value    = 'landing'
    showShare.value = showAddTicket.value = showPassHost.value = showKick.value = false
    alert('You have been removed from the room by the host.')
  }

  // Try to resume session (page refresh)
  const resumed = await sp.resumeSession()
  if (resumed) { screen.value = 'room'; return }

  // Handle ?room= share URL — pass code to SpJoinRoom via prop
  const code = new URLSearchParams(window.location.search).get('room')
  if (code) { initialRoomCode.value = code; screen.value = 'join' }
})

// Start session timer whenever screen enters 'room'
watch(screen, (val, prev) => {
  if (val === 'room' && prev !== 'room') startSessionTimer()
  if (val !== 'room') stopSessionTimer()
})
</script>

<template>
  <div class="app">
    <!-- Emoji overlay -->
    <div v-if="screen === 'room'" class="emoji-stage" aria-hidden="true">
      <transition-group name="eflash">
        <div v-for="f in emojiFlashes" :key="f.id" class="emoji-flash" :style="{ left: f.x+'%', top: f.y+'%' }">{{ f.emoji }}</div>
      </transition-group>
    </div>

    <!-- Screen transitions -->
    <transition name="screen-fade" mode="out-in">

      <!-- LANDING -->
      <SpLanding
        v-if="screen === 'landing'"
        key="landing"
        :fallingItems="fallingItems"
        @go-create="screen = 'create'"
        @go-join="screen = 'join'"
      />

      <!-- CREATE -->
      <SpCreateRoom
        v-else-if="screen === 'create'"
        key="create"
        @back="screen = 'landing'"
        @created="screen = 'room'"
      />

      <!-- JOIN -->
      <SpJoinRoom
        v-else-if="screen === 'join'"
        key="join"
        :initialRoomCode="initialRoomCode"
        @back="screen = 'landing'"
        @joined="screen = 'room'"
      />

      <!-- ROOM -->
      <div v-else-if="screen === 'room' && sp.room.value" key="room" class="room">

        <!-- Header -->
        <header class="room-header">
          <!-- Row 1: room name + exit -->
          <div class="room-header__row1">
            <div class="room-header__left">
              <h1 class="room-header__title">
                {{ sp.room.value.name }}
                <span v-if="sp.isLocked.value" class="hdr-lock">🔒</span>
                <span v-if="sp.room.value.pin" class="hdr-lock">🔐</span>
              </h1>
              <div class="session-timer" title="Session duration">⏱ {{ sessionDisplay }}</div>
            </div>
            <div class="hdr-user-row">
              <div class="me-badge" :style="{ borderColor: sp.currentUser.value?.color }">
                <div class="av av--xs" :style="{ background: sp.currentUser.value?.color }">
                  {{ (sp.currentUser.value?.name || '?').split(' ').map(w => w[0]).join('').slice(0,2).toUpperCase() }}
                </div>
                <span class="me-name">{{ sp.currentUser.value?.name }}<span v-if="sp.currentUser.value?.is_host" class="me-role">host</span></span>
              </div>
              <div v-if="sp.loading.value" class="sync-badge">syncing…</div>
              <button class="exit-pill" @click="backToLanding" title="Exit room">✕</button>
            </div>
          </div>
          <!-- Row 2: controls (collapse on mobile with token hidden) -->
          <div class="room-header__row2">
            <button v-if="sp.myToken.value" class="token-pill" :title="tokenCopied ? 'Copied!' : 'Click to copy rejoin token'" @click="copyToken">
              🔑 <span class="token-pill__val">{{ sp.myToken.value }}</span><span class="token-pill__copy">{{ tokenCopied ? '✓' : '⎘' }}</span>
            </button>
            <div v-if="sp.currentUser.value?.is_host" class="host-controls">
              <button class="btn btn--ghost btn--sm" @click="toggleLock">{{ sp.isLocked.value ? '🔓' : '🔒' }}<span class="btn-label"> {{ sp.isLocked.value ? 'Unlock' : 'Lock' }}</span></button>
              <button class="btn btn--ghost btn--sm" @click="showPassHost=true">👑<span class="btn-label"> Pass</span></button>
              <button class="btn btn--ghost btn--sm" @click="showKick=true">🥾<span class="btn-label"> Kick</span></button>
              <button v-if="sp.room.value?.enable_leaderboard" class="btn btn--ghost btn--sm" @click="showLeaderboard=true">🏆<span class="btn-label"> Board</span></button>
            </div>
            <button class="btn btn--accent btn--sm" @click="showShare=true">⬆<span class="btn-label"> Share</span></button>
          </div>
        </header>

        <!-- Mobile tab bar -->
        <nav class="mobile-tabs">
          <button class="mobile-tab" :class="{ 'mobile-tab--active': mobileTab==='tickets' }" @click="mobileTab='tickets'">
            🎫 Tickets
          </button>
          <button class="mobile-tab" :class="{ 'mobile-tab--active': mobileTab==='board' }" @click="mobileTab='board'">
            🃏 Board
          </button>
          <button class="mobile-tab" :class="{ 'mobile-tab--active': mobileTab==='chat' }" @click="mobileTab='chat'">
            💬 Chat
          </button>
        </nav>

        <!-- Body: 3-column on desktop, single-panel on mobile -->
        <div class="room-body">
          <SpTicketSidebar v-model:showAddModal="showAddTicket" :class="{ 'panel-hidden': mobileTab!=='tickets' }" />
          <SpBoardCenter @send-emoji="sendEmoji" :class="{ 'panel-hidden': mobileTab!=='board' }" />
          <SpChatSidebar @open-kick="(m) => { kickTarget = m; showKick = true }" :class="{ 'panel-hidden': mobileTab!=='chat' }" />
        </div>
      </div>

    </transition>

    <!-- Modals (outside transition so they overlay any screen) -->
    <SpModals
      :showShare="showShare"
      :showPassHost="showPassHost"
      :showKick="showKick"
      :showAddTicket="showAddTicket"
      :showLeaderboard="showLeaderboard"
      :shareUrl="shareUrl"
      :kickTarget="kickTarget"
      :copied="copied"
      @close-share="showShare=false"
      @close-pass="showPassHost=false"
      @close-kick="showKick=false; kickTarget=null"
      @close-add="showAddTicket=false"
      @close-leaderboard="showLeaderboard=false"
      @pass-host="passHost"
      @kick-confirm="kickConfirm"
      @copy-link="copyLink"
    />

  </div>
</template>

<style scoped>
.app { background:var(--bg); color:var(--text); min-height:100vh; overflow:hidden; position:relative; }

/* Emoji */
.emoji-stage { position:fixed; inset:0; pointer-events:none; z-index:500; }
.emoji-flash { position:absolute; font-size:2.4rem; pointer-events:none; animation:eup 2.5s ease-out forwards; filter:drop-shadow(0 2px 6px rgba(0,0,0,0.6)); }

/* Room shell */
.room { display:flex; flex-direction:column; height:100vh; height:100dvh; overflow:hidden; }

/* Header — two stacked rows */
.room-header { display:flex; flex-direction:column; background:var(--surface); border-bottom:1px solid var(--border); flex-shrink:0; padding:8px 14px 6px; gap:5px; }
.room-header__row1 { display:flex; align-items:center; justify-content:space-between; gap:8px; min-width:0; }
.room-header__row2 { display:flex; align-items:center; gap:6px; flex-wrap:wrap; }
.room-header__left { display:flex; flex-direction:column; gap:1px; min-width:0; flex:1; }
.room-header__title { font-size:0.95rem; font-weight:700; display:flex; align-items:center; gap:6px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.hdr-lock { font-size:12px; flex-shrink:0; }
.session-timer { font-size:10px; color:var(--muted2); font-family:var(--font-mono); letter-spacing:0.04em; }
.sync-badge { font-size:10px; color:var(--muted2); background:var(--surface2); padding:2px 8px; border-radius:999px; animation:pulse 1s ease-in-out infinite; flex-shrink:0; }
.hdr-user-row { display:flex; align-items:center; gap:6px; flex-shrink:0; }
.me-badge { display:flex; align-items:center; gap:5px; border:1.5px solid; border-radius:999px; padding:2px 8px 2px 4px; font-size:12px; font-weight:500; white-space:nowrap; max-width:180px; }
.me-name { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.me-role { background:rgba(99,102,241,0.2); color:var(--accent2); font-size:10px; padding:1px 5px; border-radius:999px; margin-left:2px; flex-shrink:0; }
.token-pill { display:inline-flex; align-items:center; gap:4px; background:var(--surface2); border:1px solid var(--border2); border-radius:6px; padding:3px 7px; font-size:10px; font-family:var(--font-mono); font-weight:700; color:var(--accent2); cursor:pointer; transition:all 0.15s; }
.token-pill:hover { border-color:var(--accent); }
.token-pill__val { max-width:110px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.token-pill__copy { font-size:11px; color:var(--muted); font-family:sans-serif; flex-shrink:0; }
.exit-pill { width:28px; height:28px; border-radius:50%; background:none; border:1px solid var(--border2); color:var(--muted); font-size:13px; cursor:pointer; display:flex; align-items:center; justify-content:center; transition:all 0.15s; flex-shrink:0; }
.exit-pill:hover { background:rgba(239,68,68,0.12); border-color:rgba(239,68,68,0.4); color:#ef4444; }
.host-controls { display:flex; gap:4px; flex-wrap:wrap; }

/* Mobile tab bar — hidden on desktop */
.mobile-tabs { display:none; }

/* Room 3-col grid */
.room-body { display:grid; grid-template-columns:225px 1fr 250px; flex:1; overflow:hidden; }

/* ── Responsive ── */
@media (max-width: 768px) {
  .room-header { padding:6px 10px 5px; }
  .me-name { display:none; }
  .token-pill__val { max-width:72px; }
  .btn-label { display:none; }

  /* Single panel view */
  .room-body { grid-template-columns:1fr; }
  .panel-hidden { display:none !important; }

  /* Tab bar */
  .mobile-tabs { display:flex; background:var(--surface); border-bottom:1px solid var(--border); flex-shrink:0; }
  .mobile-tab { flex:1; padding:9px 4px; font-size:12px; font-weight:600; background:none; border:none; color:var(--muted); cursor:pointer; border-bottom:2px solid transparent; transition:all 0.15s; font-family:var(--font-main); }
  .mobile-tab--active { color:var(--accent2); border-bottom-color:var(--accent); }
}

@media (max-width: 480px) {
  .room-header__row2 { gap:3px; }
  .host-controls { gap:3px; }
  .btn.btn--sm { padding:5px 8px; font-size:11px; }
  .token-pill { display:none; } /* too cramped on very small screens */
}
</style>