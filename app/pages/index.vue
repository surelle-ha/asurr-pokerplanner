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
          <div class="room-header__left">
            <h1 class="room-header__title">
              {{ sp.room.value.name }}
              <span v-if="sp.isLocked.value" class="hdr-lock">🔒</span>
              <span v-if="sp.room.value.pin" class="hdr-lock">🔐</span>
            </h1>
            <p v-if="sp.room.value.description" class="room-header__desc">{{ sp.room.value.description }}</p>
            <div class="session-timer" title="Session duration">⏱ {{ sessionDisplay }}</div>
          </div>
          <div class="room-header__right">
            <div v-if="sp.loading.value" class="sync-badge">syncing…</div>
            <div class="hdr-user-row">
              <div class="me-badge" :style="{ borderColor: sp.currentUser.value?.color }">
                <div class="av av--xs" :style="{ background: sp.currentUser.value?.color }">
                  {{ (sp.currentUser.value?.name || '?').split(' ').map(w => w[0]).join('').slice(0,2).toUpperCase() }}
                </div>
                <span>{{ sp.currentUser.value?.name }}<span v-if="sp.currentUser.value?.is_host" class="me-role">host</span></span>
              </div>
              <button v-if="sp.myToken.value" class="token-pill" :title="tokenCopied ? 'Copied!' : 'Click to copy rejoin token'" @click="copyToken">
                🔑 {{ sp.myToken.value }}<span class="token-pill__copy">{{ tokenCopied ? '✓' : '⎘' }}</span>
              </button>
              <button class="exit-pill" @click="backToLanding" title="Exit room">✕</button>
            </div>
            <div v-if="sp.currentUser.value?.is_host" class="host-controls">
              <button class="btn btn--ghost btn--sm" @click="toggleLock">{{ sp.isLocked.value ? '🔓 Unlock' : '🔒 Lock' }}</button>
              <button class="btn btn--ghost btn--sm" @click="showPassHost=true">👑 Pass</button>
              <button class="btn btn--ghost btn--sm" @click="showKick=true">🥾 Kick</button>
              <button v-if="sp.room.value?.enable_leaderboard" class="btn btn--ghost btn--sm" @click="showLeaderboard=true">🏆 Board</button>
            </div>
            <button class="btn btn--accent btn--sm" @click="showShare=true">⬆ Share</button>
          </div>
        </header>

        <!-- Body: 3-column layout -->
        <div class="room-body">
          <SpTicketSidebar v-model:showAddModal="showAddTicket" />
          <SpBoardCenter @send-emoji="sendEmoji" />
          <SpChatSidebar @open-kick="(m) => { kickTarget = m; showKick = true }" />
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
.app {
  background: var(--bg); color: var(--text);
  min-height: 100vh; overflow: hidden; position: relative;
}
/* Emoji overlay */
.emoji-stage { position:fixed; inset:0; pointer-events:none; z-index:500; }
.emoji-flash { position:absolute; font-size:2.4rem; pointer-events:none; animation:eup 2.5s ease-out forwards; filter:drop-shadow(0 2px 6px rgba(0,0,0,0.6)); }
/* Room layout */
.room { display:flex; flex-direction:column; height:100vh; overflow:hidden; }
.room-header { display:flex; align-items:center; justify-content:space-between; padding:10px 18px; background:var(--surface); border-bottom:1px solid var(--border); flex-shrink:0; gap:12px; min-height:54px; }
.room-header__left { display:flex; align-items:center; gap:14px; }
.room-header__title { font-size:1rem; font-weight:700; display:flex; align-items:center; gap:7px; }
.hdr-lock { font-size:13px; }
.room-header__desc { font-size:11px; color:var(--muted); margin-top:1px; }
.session-timer { font-size:10px; color:var(--muted2); font-family:var(--font-mono); margin-top:3px; letter-spacing:0.04em; }
.room-header__right { display:flex; align-items:center; gap:9px; }
.sync-badge { font-size:10px; color:var(--muted2); background:var(--surface2); padding:2px 8px; border-radius:999px; animation:pulse 1s ease-in-out infinite; }
.hdr-user-row { display:flex; align-items:center; gap:6px; }
.me-badge { display:flex; align-items:center; gap:6px; border:1.5px solid; border-radius:999px; padding:3px 10px 3px 4px; font-size:12px; font-weight:500; }
.me-role { background:rgba(99,102,241,0.2); color:var(--accent2); font-size:10px; padding:1px 6px; border-radius:999px; margin-left:3px; }
.token-pill { display:inline-flex; align-items:center; gap:5px; background:var(--surface2); border:1px solid var(--border2); border-radius:6px; padding:3px 8px 3px 7px; font-size:10px; font-family:var(--font-mono); font-weight:700; color:var(--accent2); letter-spacing:0.04em; cursor:pointer; transition:all 0.15s; white-space:nowrap; }
.token-pill:hover { border-color:var(--accent); background:rgba(99,102,241,0.1); }
.token-pill__copy { margin-left:3px; font-size:11px; color:var(--muted); font-family:sans-serif; }
.exit-pill { width:26px; height:26px; border-radius:50%; background:none; border:1px solid var(--border2); color:var(--muted); font-size:13px; line-height:1; cursor:pointer; display:flex; align-items:center; justify-content:center; transition:all 0.15s; flex-shrink:0; }
.exit-pill:hover { background:rgba(239,68,68,0.12); border-color:rgba(239,68,68,0.4); color:#ef4444; }
.host-controls { display:flex; gap:6px; }
.room-body { display:grid; grid-template-columns:225px 1fr 250px; flex:1; overflow:hidden; }
</style>