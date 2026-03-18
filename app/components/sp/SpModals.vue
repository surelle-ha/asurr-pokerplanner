<script setup>
// SpModals.vue — all room modals in one component
// Props control visibility; emits signal actions back to parent
import { ref, nextTick } from 'vue'

const sp          = inject('sp')
const members     = sp.members
const currentUser = sp.currentUser

const props = defineProps({
  showShare:      Boolean,
  showPassHost:   Boolean,
  showKick:       Boolean,
  showAddTicket:  Boolean,
  showLeaderboard:Boolean,
  shareUrl:       String,
  kickTarget:     Object,
  copied:         Boolean,
})

const emit = defineEmits([
  'close-share', 'close-pass', 'close-kick', 'close-add', 'close-leaderboard',
  'pass-host', 'kick-confirm', 'copy-link', 'add-ticket',
])

function initials(n) { return (n || '?').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase() }

// QR
const qrContainer = ref(null)
watch(() => props.showShare, async (v) => {
  if (!v) return
  await nextTick(); renderQR()
})
function renderQR() {
  if (!qrContainer.value) return
  const load = () => {
    if (!window.QRCode) return
    qrContainer.value.innerHTML = ''
    new window.QRCode(qrContainer.value, { text: props.shareUrl, width: 176, height: 176, colorDark: '#818cf8', colorLight: '#0b0d12', correctLevel: window.QRCode.CorrectLevel?.M ?? 0 })
  }
  if (window.QRCode) { load(); return }
  const s = document.createElement('script')
  s.src = 'https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js'
  s.onload = load; document.head.appendChild(s)
}

// Add ticket — submitting guard prevents double-fire on fast clicks
const ticketInput      = ref({ title: '', description: '', url: '' })
const submittingTicket = ref(false)
const urlError         = ref('')

function validateUrl() {
  const raw = ticketInput.value.url.trim()
  if (!raw) { urlError.value = ''; return true }  // empty is fine — url is optional
  try {
    const u = new URL(raw)
    if (u.protocol !== 'http:' && u.protocol !== 'https:') {
      urlError.value = 'URL must start with http:// or https://'
      return false
    }
    urlError.value = ''
    return true
  } catch {
    urlError.value = 'Please enter a valid URL'
    return false
  }
}

async function submitAddTicket() {
  if (!ticketInput.value.title.trim() || submittingTicket.value) return
  if (!validateUrl()) return   // block if url is present but invalid
  submittingTicket.value = true
  try {
    await sp.addTicket(ticketInput.value.title.trim(), ticketInput.value.description.trim(), ticketInput.value.url.trim() || undefined)
    ticketInput.value = { title: '', description: '', url: '' }
    urlError.value = ''
    emit('close-add')
  } finally {
    submittingTicket.value = false
  }
}

// Leaderboard
const leaderboard = sp.leaderboard
const room        = sp.room

// nonHostMembers for pass host modal
const nonHostMembers = computed(() => members.value.filter(m => m.id !== currentUser.value?.id && !m.is_spectator))
</script>

<template>
  <!-- ── Share ── -->
  <transition name="modal-fade">
    <div v-if="showShare" class="modal-backdrop" @click.self="$emit('close-share')">
      <div class="modal">
        <div class="modal-head">
          <span class="modal-title">Invite to {{ room?.name }}</span>
          <button class="icon-btn" @click="$emit('close-share')">✕</button>
        </div>
        <div class="qr-wrap" ref="qrContainer" />
        <div class="share-url-row">
          <input class="share-url-input" :value="shareUrl" readonly />
          <button class="btn btn--primary btn--sm" @click="$emit('copy-link')">{{ copied ? '✓ Copied' : 'Copy' }}</button>
        </div>
        <div class="room-code-row">
          <span class="room-code-label">Room Code</span>
          <span class="room-code">{{ room?.id }}</span>
        </div>
        <div v-if="room?.pin" class="room-code-row" style="margin-top:-6px">
          <span class="room-code-label">PIN</span>
          <span class="room-code" style="color:#f59e0b">{{ room.pin }}</span>
        </div>
        <div v-if="room?.locked" class="locked-notice-modal">🔒 Room is locked — new joins blocked</div>
        <p class="share-hint">Share link or code. Anyone can join from any device.</p>
      </div>
    </div>
  </transition>

  <!-- ── Add Ticket ── -->
  <transition name="modal-fade">
    <div v-if="showAddTicket" class="modal-backdrop" @click.self="$emit('close-add')">
      <div class="modal">
        <div class="modal-head">
          <span class="modal-title">＋ Add Ticket</span>
          <button class="icon-btn" @click="$emit('close-add')">✕</button>
        </div>
        <div class="field">
          <label>Title *</label>
          <input v-model="ticketInput.title" placeholder="e.g. AUTH-123 — Login flow" class="modal-input" @keyup.enter="submitAddTicket" autofocus />
        </div>
        <div class="field">
          <label>Description <span class="optional">(optional)</span></label>
          <textarea v-model="ticketInput.description" placeholder="What needs estimating?" rows="2" class="modal-input" />
        </div>
        <div class="field">
          <label>Ticket URL <span class="optional">(optional — Jira, Linear, GitHub…)</span></label>
          <input
            v-model="ticketInput.url"
            placeholder="https://..."
            class="modal-input"
            :class="{ 'input-error': urlError }"
            @blur="validateUrl"
            @input="urlError = ''"
          />
          <span v-if="urlError" class="field-err">{{ urlError }}</span>
        </div>
        <div class="modal-actions">
          <button class="btn btn--ghost" @click="$emit('close-add')">Cancel</button>
          <button class="btn btn--primary" :disabled="!ticketInput.title.trim() || submittingTicket || !!urlError" @click="submitAddTicket">{{ submittingTicket ? 'Adding…' : 'Add Ticket' }}</button>
        </div>
      </div>
    </div>
  </transition>

  <!-- ── Pass Host ── -->
  <transition name="modal-fade">
    <div v-if="showPassHost" class="modal-backdrop" @click.self="$emit('close-pass')">
      <div class="modal">
        <div class="modal-head">
          <span class="modal-title">👑 Pass Host Role</span>
          <button class="icon-btn" @click="$emit('close-pass')">✕</button>
        </div>
        <p class="pass-hint">Select a member to become the new host. You will lose host privileges.</p>
        <div v-if="!nonHostMembers.length" class="empty-hint" style="padding:12px 0">No other voters in the room yet.</div>
        <div class="pass-member-list">
          <div v-for="m in nonHostMembers" :key="m.id" class="pass-member-row" @click="$emit('pass-host', m.id)">
            <div class="av av--xs" :style="{ background: m.color }">{{ initials(m.name) }}</div>
            <span class="pass-member-name">{{ m.name }}</span>
            <span class="pass-member-action">Make host →</span>
          </div>
        </div>
      </div>
    </div>
  </transition>

  <!-- ── Kick ── -->
  <transition name="modal-fade">
    <div v-if="showKick" class="modal-backdrop" @click.self="$emit('close-kick')">
      <div class="modal">
        <div class="modal-head">
          <span class="modal-title">🥾 Kick Member</span>
          <button class="icon-btn" @click="$emit('close-kick')">✕</button>
        </div>
        <template v-if="kickTarget">
          <p class="pass-hint">Remove <strong>{{ kickTarget.name }}</strong> from the room?</p>
          <div class="modal-actions">
            <button class="btn btn--ghost" @click="$emit('close-kick')">Cancel</button>
            <button class="btn btn--danger" @click="$emit('kick-confirm', kickTarget.id)">Kick {{ kickTarget.name }}</button>
          </div>
        </template>
        <template v-else>
          <p class="pass-hint">Select a member to remove.</p>
          <div class="pass-member-list">
            <div v-for="m in members.filter(m => m.id !== currentUser?.id)" :key="m.id" class="pass-member-row" @click="$emit('kick-confirm', m.id)">
              <div class="av av--xs" :style="{ background: m.color }">{{ initials(m.name) }}</div>
              <span class="pass-member-name">{{ m.name }}</span>
              <span class="pass-member-action" style="color:#ef4444">Kick →</span>
            </div>
          </div>
        </template>
      </div>
    </div>
  </transition>

  <!-- ── Leaderboard ── -->
  <transition name="modal-fade">
    <div v-if="showLeaderboard && room?.enable_leaderboard" class="modal-backdrop" @click.self="$emit('close-leaderboard')">
      <div class="modal modal--wide">
        <div class="modal-head">
          <span class="modal-title">🏆 Leaderboard</span>
          <button class="icon-btn" @click="$emit('close-leaderboard')">✕</button>
        </div>
        <div class="lb-table">
          <div class="lb-head">
            <span class="lb-col lb-col--rank">#</span>
            <span class="lb-col lb-col--name">Member</span>
            <span class="lb-col lb-col--num">✓ Accurate</span>
            <span class="lb-col lb-col--num">🔥 Streak</span>
            <span class="lb-col lb-col--num">Voted</span>
          </div>
          <div v-for="(row, i) in leaderboard" :key="row.memberId" class="lb-row" :class="{ 'lb-row--me': row.memberId===currentUser?.id, 'lb-row--top': i===0 }">
            <span class="lb-col lb-col--rank">{{ i===0?'🥇':i===1?'🥈':i===2?'🥉':i+1 }}</span>
            <span class="lb-col lb-col--name">
              <div class="av av--xs" :style="{ background: row.color }">{{ initials(row.name) }}</div>
              {{ row.name }}<span v-if="row.memberId===currentUser?.id" class="lb-you"> (you)</span>
            </span>
            <span class="lb-col lb-col--num">{{ row.accurate }}<small>/{{ row.voted }}</small></span>
            <span class="lb-col lb-col--num lb-streak" :class="{ 'lb-streak--hot': row.currentStreak>=3 }">{{ row.currentStreak>=3?'🔥':'' }}{{ row.bestStreak }}</span>
            <span class="lb-col lb-col--num">{{ row.voted }}</span>
          </div>
          <div v-if="!leaderboard?.length" class="empty-hint" style="padding:20px">No votes cast yet.</div>
        </div>
        <p class="lb-note">Accuracy = vote matched final score. Streak = best consecutive run.</p>
      </div>
    </div>
  </transition>
</template>

<style scoped>
.lb-table { display:flex; flex-direction:column; gap:2px; }
.lb-head { display:grid; grid-template-columns:36px 1fr 80px 72px 52px; padding:6px 10px; gap:8px; font-size:10px; font-weight:700; text-transform:uppercase; letter-spacing:0.07em; color:var(--muted); }
.lb-row { display:grid; grid-template-columns:36px 1fr 80px 72px 52px; align-items:center; padding:9px 10px; gap:8px; background:var(--surface2); border-radius:var(--r-sm); border:1px solid transparent; transition:border-color 0.15s; font-size:13px; }
.lb-row:hover { border-color:var(--border2); }
.lb-row--me { border-color:rgba(99,102,241,0.3); background:rgba(99,102,241,0.07); }
.lb-row--top { background:rgba(251,191,36,0.07); border-color:rgba(251,191,36,0.25); }
.lb-col { display:flex; align-items:center; gap:5px; }
.lb-col--rank { font-size:15px; justify-content:center; }
.lb-col--num { justify-content:center; font-weight:700; }
.lb-col--num small { font-weight:400; color:var(--muted); font-size:10px; }
.lb-streak { font-weight:700; }
.lb-streak--hot { color:#f97316; }
.lb-you { font-size:10px; color:var(--muted); }
.lb-note { font-size:10px; color:var(--muted2); text-align:center; line-height:1.5; }
</style>