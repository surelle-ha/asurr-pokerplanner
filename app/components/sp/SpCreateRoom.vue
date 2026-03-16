<script setup>
import { reactive } from 'vue'

const sp = inject('sp')
const emit = defineEmits(['back', 'created'])

const form   = reactive({ roomName: '', description: '', hostName: '', hostCanVote: true, allowSpectators: true, pin: '', token: '', enableLeaderboard: false })
const errors = reactive({ roomName: false, hostName: false })

async function submit() {
  errors.roomName = !form.roomName.trim()
  errors.hostName = !form.hostName.trim()
  if (errors.roomName || errors.hostName) return
  try {
    await sp.createRoom({
      name: form.roomName.trim(),
      description: form.description.trim(),
      hostName: form.hostName.trim(),
      hostCanVote: form.hostCanVote,
      allowSpectators: form.allowSpectators,
      pin: form.pin.trim() || undefined,
      token: form.token.trim() || undefined,
      enableLeaderboard: form.enableLeaderboard,
    })
    emit('created')
  } catch (e) { console.error(e) }
}
</script>

<template>
  <div class="form-screen">
    <div class="form-card">
      <button class="back-btn" @click="$emit('back')">← Back</button>
      <h2>Create a Room</h2>
      <p class="form-hint">Configure your planning session</p>

      <div class="field">
        <label>Your Name *</label>
        <input v-model="form.hostName" placeholder="e.g. Jane Doe" :class="{ error: errors.hostName }" @input="errors.hostName=false" />
        <span v-if="errors.hostName" class="field-err">Name is required</span>
      </div>
      <div class="field">
        <label>Room Name *</label>
        <input v-model="form.roomName" placeholder="e.g. Sprint 42 Planning" :class="{ error: errors.roomName }" @input="errors.roomName=false" />
        <span v-if="errors.roomName" class="field-err">Room name is required</span>
      </div>
      <div class="field">
        <label>Description <span class="optional">(optional)</span></label>
        <textarea v-model="form.description" placeholder="What are we estimating?" rows="2" />
      </div>
      <div class="field">
        <label>Room PIN <span class="optional">(optional)</span></label>
        <input v-model="form.pin" placeholder="e.g. 1234" maxlength="12" />
      </div>
      <div class="field">
        <label>Your Rejoin Token <span class="optional">(optional)</span></label>
        <input v-model="form.token" placeholder="e.g. swift-fox-412 (auto-generated if blank)" maxlength="32" />
        <span class="field-hint">Save this token to rejoin as the same user if you disconnect.</span>
      </div>

      <div class="toggles">
        <label class="toggle-row">
          <span class="toggle-label"><strong>Host can vote</strong><small>Participate in estimation rounds</small></span>
          <div class="toggle-wrap"><input type="checkbox" v-model="form.hostCanVote" /><span class="toggle-track" /></div>
        </label>
        <label class="toggle-row">
          <span class="toggle-label"><strong>Allow spectators</strong><small>Members can join watch-only</small></span>
          <div class="toggle-wrap"><input type="checkbox" v-model="form.allowSpectators" /><span class="toggle-track" /></div>
        </label>
        <label class="toggle-row">
          <span class="toggle-label"><strong>Enable Leaderboard</strong><small>Track accuracy &amp; streaks</small></span>
          <div class="toggle-wrap"><input type="checkbox" v-model="form.enableLeaderboard" /><span class="toggle-track" /></div>
        </label>
      </div>

      <div v-if="sp.error.value" class="field-err err-box">{{ sp.error.value }}</div>
      <button class="btn btn--primary btn--full" :disabled="sp.loading.value" @click="submit">
        {{ sp.loading.value ? 'Creating…' : 'Create Room →' }}
      </button>
    </div>
  </div>
</template>

<style scoped>
.form-screen { min-height:100vh; display:flex; align-items:center; justify-content:center; padding:2rem; background:radial-gradient(ellipse at 50% 0%, rgba(99,102,241,0.1) 0%, transparent 60%); }
.form-card { width:100%; max-width:440px; background:var(--surface); border:1px solid var(--border); border-radius:var(--r); padding:30px; display:flex; flex-direction:column; gap:18px; }
.form-card h2 { font-size:1.4rem; font-weight:700; }
.form-hint { color:var(--muted); font-size:13px; margin-top:-8px; }
</style>