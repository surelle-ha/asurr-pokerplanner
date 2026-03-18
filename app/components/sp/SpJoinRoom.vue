<script setup>
import { ref, reactive, watch } from 'vue'

const sp    = inject('sp')
const emit  = defineEmits(['back', 'joined'])
const props = defineProps({ initialRoomCode: { type: String, default: '' } })

// Seed roomCode from the share-link ?room= param if provided
const form   = reactive({ userName: '', isSpectator: false, roomCode: props.initialRoomCode, pin: '', token: '' })
const errors = reactive({ userName: false, roomCode: false, pin: false })

const preview     = ref(null)
let   previewTimer = null

watch(() => form.roomCode, async (val) => {
  clearTimeout(previewTimer)
  const code = val.trim()
  if (!code) { preview.value = null; return }
  previewTimer = setTimeout(async () => {
    const { data } = await useSupabase().from('rooms').select('*').eq('id', code).maybeSingle()
    preview.value = data ?? null
  }, 300)
}, { immediate: true })

async function submit() {
  const code = form.roomCode.trim()
  errors.roomCode = !code
  errors.userName  = !form.userName.trim()
  if (errors.roomCode || errors.userName) return
  try {
    await sp.joinRoom(code, form.userName.trim(), form.isSpectator, form.pin.trim() || undefined, form.token.trim() || undefined)
    emit('joined')
  } catch (e) {
    if (e.message === 'Room not found')   errors.roomCode = true
    if (e.message === 'Room is locked')   errors.roomCode = true
    if (e.message === 'Incorrect PIN')    errors.pin = true
  }
}
</script>

<template>
  <div class="form-screen">
    <div class="form-card">
      <button class="back-btn" @click="$emit('back')">← Back</button>
      <h2>Join a Room</h2>

      <div class="field">
        <label>Room Code *</label>
        <input v-model="form.roomCode" placeholder="Paste the room code" :class="{ error: errors.roomCode }" @input="errors.roomCode=false" />
        <span v-if="errors.roomCode" class="field-err">
          {{ !form.roomCode.trim() ? 'Room code is required' : (preview?.locked ? 'Room is locked 🔒' : 'Room not found') }}
        </span>
      </div>

      <div v-if="preview" class="room-preview">
        <span class="room-preview__name">{{ preview.name }}</span>
        <span v-if="preview.description" class="room-preview__desc">{{ preview.description }}</span>
        <span v-if="preview.locked" class="locked-badge">🔒 Locked</span>
        <span v-if="preview.pin" class="locked-badge" style="color:#818cf8">🔐 PIN required</span>
      </div>

      <div v-if="preview?.pin" class="field">
        <label>Room PIN *</label>
        <input v-model="form.pin" placeholder="Enter the room PIN" :class="{ error: errors.pin }" @input="errors.pin=false" />
        <span v-if="errors.pin" class="field-err">Incorrect PIN</span>
      </div>

      <div class="field">
        <label>Your Name *</label>
        <input v-model="form.userName" placeholder="e.g. Alex Kim" :class="{ error: errors.userName }" @input="errors.userName=false" />
        <span v-if="errors.userName" class="field-err">Name is required</span>
      </div>

      <label v-if="preview?.allow_spectators" class="toggle-row">
        <span class="toggle-label"><strong>Join as Spectator</strong><small>Watch without voting</small></span>
        <div class="toggle-wrap"><input type="checkbox" v-model="form.isSpectator" /><span class="toggle-track" /></div>
      </label>

      <div class="field">
        <label>Rejoin Token <span class="optional">(optional)</span></label>
        <input v-model="form.token" placeholder="e.g. swift-fox-412 (auto-generated if blank)" maxlength="32" />
        <span class="field-hint">Enter your previous token to reclaim your seat.</span>
      </div>

      <div v-if="sp.error.value" class="field-err err-box">{{ sp.error.value }}</div>
      <button class="btn btn--primary btn--full" :disabled="sp.loading.value" @click="submit">
        {{ sp.loading.value ? 'Joining…' : 'Join Room →' }}
      </button>
    </div>
  </div>
</template>

<style scoped>
.form-screen { min-height:100vh; display:flex; align-items:center; justify-content:center; padding:2rem; background:radial-gradient(ellipse at 50% 0%, rgba(99,102,241,0.1) 0%, transparent 60%); }
.form-card { width:100%; max-width:440px; background:var(--surface); border:1px solid var(--border); border-radius:var(--r); padding:30px; display:flex; flex-direction:column; gap:18px; }
.form-card h2 { font-size:1.4rem; font-weight:700; }
.room-preview { background:var(--surface2); border-radius:var(--r-sm); padding:12px 14px; display:flex; flex-direction:column; gap:4px; }
.room-preview__name { font-weight:700; font-size:15px; }
.room-preview__desc { font-size:12px; color:var(--muted); }
.locked-badge { font-size:12px; color:#f59e0b; margin-top:2px; }

@media (max-width: 480px) {
  .form-screen { padding:1rem; align-items:flex-start; padding-top:2rem; }
  .form-card { padding:20px 16px; }
}
</style>