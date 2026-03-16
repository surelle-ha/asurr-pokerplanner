<script setup>
import { ref, nextTick } from 'vue'

const sp           = inject('sp')
const members      = sp.members
const chatMessages = sp.chatMessages
const currentUser  = sp.currentUser
const onlineMembers = sp.onlineMembers

const emit = defineEmits(['open-kick'])

const chatInput    = ref('')
const chatContainer = ref(null)

function initials(n) { return (n || '?').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase() }

async function sendChat() {
  const text = chatInput.value.trim()
  if (!text) return
  await sp.sendChat(text)
  chatInput.value = ''
  nextTick(() => { if (chatContainer.value) chatContainer.value.scrollTop = chatContainer.value.scrollHeight })
}

function onKey(e) { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendChat() } }
</script>

<template>
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
          <span v-if="m.is_host"      class="rbadge rbadge--host">host</span>
          <span v-if="m.is_spectator" class="rbadge">👁</span>
          <span v-if="!onlineMembers.find(o => o.id === m.id)" class="rbadge rbadge--offline" title="Away">●</span>
          <button
            v-if="currentUser?.is_host && m.id !== currentUser?.id"
            class="kick-btn"
            title="Kick member"
            @click.stop="$emit('open-kick', m)"
          >✕</button>
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
            <span class="msg__time">{{ new Date(msg.created_at).toLocaleTimeString([], { hour:'2-digit', minute:'2-digit' }) }}</span>
          </div>
          <div class="msg__bubble">{{ msg.text }}</div>
        </div>
      </template>
    </div>

    <div class="chat-input-row">
      <input v-model="chatInput" class="chat-input" placeholder="Message…" @keydown="onKey" />
      <button class="icon-btn send-btn" :disabled="!chatInput.trim()" @click="sendChat">↑</button>
    </div>
  </aside>
</template>

<style scoped>
.sidebar--right { background:var(--surface); display:flex; flex-direction:column; overflow:hidden; border-left:1px solid var(--border); }
.sidebar-head { display:flex; align-items:center; justify-content:space-between; padding:13px 13px 8px; flex-shrink:0; }
.online-dot { font-size:11px; color:var(--muted); }
.members-list { padding:4px 10px 8px; display:flex; flex-direction:column; gap:3px; flex-shrink:0; max-height:110px; overflow-y:auto; }
.member-row { display:flex; align-items:center; gap:7px; font-size:12px; padding:3px 4px; border-radius:5px; }
.member-row--offline { opacity:0.45; }
.member-row--offline .member-row__name { text-decoration:line-through; }
.member-row__name { flex:1; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.kick-btn { background:none; border:none; color:transparent; cursor:pointer; font-size:12px; padding:1px 4px; border-radius:4px; transition:color 0.15s,background 0.15s; line-height:1; flex-shrink:0; }
.member-row:hover .kick-btn { color:var(--muted2); }
.kick-btn:hover { color:#ef4444 !important; background:rgba(239,68,68,0.1); }
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
.chat-input { flex:1; background:var(--surface2); border:1px solid var(--border2); border-radius:8px; color:var(--text); font-size:13px; padding:8px 10px; outline:none; font-family:var(--font-main); }
.chat-input:focus { border-color:var(--accent); }
.send-btn { font-size:16px; color:var(--accent); }
</style>