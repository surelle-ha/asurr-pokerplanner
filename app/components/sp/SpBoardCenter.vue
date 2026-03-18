<script setup>
import { computed } from 'vue'

const FIBONACCI  = ['?', '0', '1', '2', '3', '5', '8', '13', '21', '34', '55', '☕']
const EMOJI_LIST = ['🔥', '💡', '🤔', '😅', '🎉', '👀', '💀', '🚀', '❤️', '👏']

const sp          = inject('sp')
const activeTicket   = sp.activeTicket
const activeTicketId = sp.activeTicketId
const members        = sp.members
const currentUser    = sp.currentUser
const revealed       = sp.revealed
const voteMap        = sp.voteMap
const voters         = sp.voters
const voteCount      = sp.voteCount
const voteStats      = sp.voteStats
const myVote         = sp.myVote
const canVote        = sp.canVote

const emit = defineEmits(['send-emoji'])

function initials(n) { return (n || '?').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase() }

const tableSeats = computed(() => {
  const all = members.value
  if (!all.length) return []
  return all.map((m, i) => {
    const angle = (i / all.length) * 2 * Math.PI - Math.PI / 2
    const cx = 50 + 30 * Math.cos(angle)
    const cy = 50 + 26 * Math.sin(angle)
    const nx = 50 + 46 * Math.cos(angle)
    const ny = 50 + 40 * Math.sin(angle)
    return { ...m, cx, cy, nx, ny }
  })
})

async function castVote(card)     { await sp.castVote(card) }
async function revealVotes()      { await sp.revealVotes() }
async function resetVoting()      { await sp.resetVoting() }
async function acceptScore(score) { await sp.acceptScore(score) }
</script>

<template>
  <main class="center">
    <div v-if="!activeTicket" class="empty-center">
      <div class="empty-center__icon">🃏</div>
      <p>{{ currentUser?.is_host ? 'Add or select a ticket to begin.' : 'Waiting for host to pick a ticket…' }}</p>
    </div>

    <template v-else>
      <!-- Active ticket banner -->
      <transition name="banner-swap" mode="out-in">
        <div class="ticket-banner" :key="activeTicket?.id">
          <div class="ticket-banner__eyebrow">Now Estimating</div>
          <div class="ticket-banner__title">{{ activeTicket.title }}</div>
          <p v-if="activeTicket.description" class="ticket-banner__desc">{{ activeTicket.description }}</p>
        </div>
      </transition>

      <!-- Poker Table -->
      <div class="table-scene">
        <div v-for="seat in tableSeats" :key="'name-'+seat.id" class="seat-label" :class="{ 'seat-label--me': seat.id === currentUser?.id }" :style="{ left: seat.nx+'%', top: seat.ny+'%' }">
          <div class="seat-label__av" :style="{ background: seat.color }">{{ initials(seat.name) }}</div>
          <div class="seat-label__name">{{ seat.name }}<span v-if="seat.is_host"> ★</span><span v-if="seat.is_spectator"> 👁</span></div>
        </div>

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
            <div v-for="seat in tableSeats" :key="'card-'+seat.id" class="seat-card-wrap" :style="{ left: seat.cx+'%', top: seat.cy+'%' }">
              <div class="seat-card" :class="{
                'seat-card--voted':    !revealed && voteMap[seat.id] !== undefined,
                'seat-card--revealed': revealed  && voteMap[seat.id] !== undefined,
                'seat-card--miss':     revealed  && voteMap[seat.id] === undefined,
              }">{{ revealed ? (voteMap[seat.id] ?? '–') : (voteMap[seat.id] !== undefined ? '🂠' : '') }}</div>
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
          <div v-if="currentUser?.is_host" class="accept-section">
            <div class="accept-section__header">
              <span class="accept-section__title">Select Final Score</span>
              <span class="accept-section__hint">Suggested: <strong>{{ voteStats.mode }}</strong></span>
            </div>
            <div class="accept-cards">
              <button v-for="c in FIBONACCI.slice(1)" :key="c" class="accept-card" :class="{ 'accept-card--suggest': String(c)===String(voteStats.mode), 'accept-card--other': String(c)!==String(voteStats.mode) }" @click="acceptScore(c)">
                <span class="accept-card__val">{{ c }}</span>
                <span v-if="String(c)===String(voteStats.mode)" class="accept-card__tag">suggested</span>
              </button>
            </div>
          </div>
        </div>
      </transition>

      <!-- Floating dock -->
      <transition name="dock-in">
        <div class="float-dock">
          <div v-if="currentUser?.is_host" class="dock-section dock-section--host">
            <button v-if="!revealed" class="dock-reveal-btn" :disabled="!voteCount" @click="revealVotes">
              <span class="dock-reveal-btn__count">{{ voteCount }}/{{ voters.length }}</span>
              Reveal Votes
            </button>
            <button v-else class="dock-revote-btn" @click="resetVoting">↺ Re-vote</button>
          </div>
          <div v-if="canVote" class="dock-section dock-cards">
            <button v-for="card in FIBONACCI" :key="card" class="dock-card" :class="{ 'dock-card--sel': myVote===card }" @click="castVote(card)">{{ card }}</button>
          </div>
          <div v-else-if="currentUser?.is_spectator" class="dock-section dock-spectator">👁 Spectating</div>
          <div class="dock-divider" />
          <div class="dock-section dock-emojis">
            <button v-for="e in EMOJI_LIST" :key="e" class="dock-emoji" @click="$emit('send-emoji', e)">{{ e }}</button>
          </div>
        </div>
      </transition>
    </template>
  </main>
</template>

<style scoped>
.center { overflow-y:auto; padding:14px 20px; display:flex; flex-direction:column; gap:12px; }
.center::-webkit-scrollbar { width:4px; }
.center::-webkit-scrollbar-thumb { background:var(--border2); border-radius:2px; }
.empty-center { flex:1; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:14px; color:var(--muted); text-align:center; min-height:200px; }
.empty-center__icon { font-size:3rem; opacity:0.3; }
.ticket-banner { background:var(--surface); border:1px solid var(--border2); border-radius:var(--r); padding:12px 16px; }
.ticket-banner__eyebrow { font-size:10px; text-transform:uppercase; letter-spacing:0.1em; color:var(--accent2); font-weight:700; margin-bottom:3px; }
.ticket-banner__title { font-size:1.05rem; font-weight:700; }
.ticket-banner__desc { font-size:12px; color:var(--muted); margin-top:3px; }
/* Poker Table */
.table-scene { position:relative; width:100%; padding-bottom:44%; }
.seat-label { position:absolute; transform:translate(-50%,-50%); display:flex; flex-direction:column; align-items:center; gap:2px; z-index:20; pointer-events:none; }
.seat-label__av { width:30px; height:30px; border-radius:50%; display:flex; align-items:center; justify-content:center; font-size:11px; font-weight:700; color:white; border:2px solid rgba(255,255,255,0.2); box-shadow:0 2px 8px rgba(0,0,0,0.6); }
.seat-label--me .seat-label__av { border-color:var(--accent2); box-shadow:0 0 0 2px rgba(99,102,241,0.45); }
.seat-label__name { font-size:9px; font-weight:600; color:var(--text); white-space:nowrap; text-align:center; max-width:64px; overflow:hidden; text-overflow:ellipsis; background:rgba(13,15,20,0.75); border-radius:4px; padding:1px 5px; backdrop-filter:blur(2px); }
.table-shell { position:absolute; top:14%; left:12%; right:12%; bottom:14%; border-radius:999px; background:var(--felt-rim); box-shadow:0 0 0 6px var(--felt-rim),0 8px 32px rgba(0,0,0,0.7),inset 0 2px 8px rgba(0,0,0,0.45); }
.table-felt { position:absolute; inset:8px; border-radius:999px; background:radial-gradient(ellipse at 50% 38%, #22644a 0%, var(--felt) 55%, var(--felt2) 100%); border:2px solid rgba(255,255,255,0.05); overflow:hidden; }
.table-center { position:absolute; top:50%; left:50%; transform:translate(-50%,-50%); text-align:center; display:flex; flex-direction:column; align-items:center; gap:2px; min-width:70px; }
.tc-count { font-size:1.6rem; font-weight:900; color:rgba(255,255,255,0.88); line-height:1; }
.tc-count span { font-size:0.9rem; color:rgba(255,255,255,0.38); }
.tc-label { font-size:9px; color:rgba(255,255,255,0.38); text-transform:uppercase; letter-spacing:0.09em; }
.tc-bar { width:60px; height:3px; background:rgba(255,255,255,0.1); border-radius:2px; overflow:hidden; margin-top:2px; }
.tc-bar-fill { height:100%; background:var(--accent2); border-radius:2px; transition:width 0.4s ease; }
.tc-avg { font-size:2rem; font-weight:900; color:#fff; line-height:1; }
.tc-consensus { font-size:10px; color:#6ee7b7; margin-top:2px; font-weight:600; }
.seat-card-wrap { position:absolute; transform:translate(-50%,-50%); z-index:10; }
.seat-card { width:22px; height:30px; border-radius:4px; border:1px solid rgba(255,255,255,0.1); background:rgba(255,255,255,0.05); display:flex; align-items:center; justify-content:center; font-size:9px; font-weight:700; color:rgba(255,255,255,0.25); transition:all 0.3s; box-shadow:0 1px 4px rgba(0,0,0,0.5); }
.seat-card--voted { background:rgba(99,102,241,0.4); border-color:var(--accent2); color:var(--accent2); font-size:13px; transform:translateY(-5px); box-shadow:0 4px 12px rgba(99,102,241,0.3); }
.seat-card--revealed { background:rgba(16,185,129,0.28); border-color:#6ee7b7; color:#d1fae5; transform:translateY(-5px); font-size:11px; }
.seat-card--miss { color:rgba(255,255,255,0.18); }
/* Results */
.results { background:var(--surface); border:1px solid var(--border2); border-radius:var(--r); padding:16px; display:flex; flex-direction:column; gap:14px; }
.results-stats { display:grid; grid-template-columns:repeat(3,1fr); gap:8px; }
.stat-card { background:var(--surface2); border-radius:var(--r-sm); padding:10px; text-align:center; }
.stat-card--hl { background:rgba(99,102,241,0.14); border:1px solid rgba(99,102,241,0.28); }
.stat-val { font-size:1.4rem; font-weight:800; line-height:1; }
.stat-card--hl .stat-val { color:var(--accent2); }
.stat-lbl { font-size:10px; color:var(--muted); margin-top:2px; text-transform:uppercase; letter-spacing:0.06em; }
.accept-section { background:var(--surface2); border:1px solid var(--border2); border-radius:var(--r); padding:14px 16px; display:flex; flex-direction:column; gap:12px; }
.accept-section__header { display:flex; align-items:center; justify-content:space-between; }
.accept-section__title { font-size:12px; font-weight:700; text-transform:uppercase; letter-spacing:0.07em; color:var(--muted); }
.accept-section__hint { font-size:12px; color:var(--muted); }
.accept-section__hint strong { color:var(--accent2); }
.accept-cards { display:flex; flex-wrap:wrap; gap:8px; }
.accept-card { position:relative; min-width:48px; height:64px; border:2px solid var(--border2); border-radius:10px; background:var(--surface); color:var(--muted); cursor:pointer; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:2px; transition:all 0.15s; padding:0 10px; }
.accept-card:hover { border-color:var(--accent); background:rgba(99,102,241,0.08); color:var(--text); transform:translateY(-2px); }
.accept-card__val { font-size:1.1rem; font-weight:800; line-height:1; }
.accept-card__tag { font-size:8px; text-transform:uppercase; letter-spacing:0.06em; }
.accept-card--suggest { border-color:var(--accent); background:rgba(99,102,241,0.18); color:var(--accent2); transform:translateY(-4px); box-shadow:0 0 0 3px rgba(99,102,241,0.2),0 6px 20px rgba(99,102,241,0.25); min-width:58px; height:74px; }
.accept-card--suggest .accept-card__val { font-size:1.5rem; }
.accept-card--suggest:hover { transform:translateY(-7px); }
.accept-card--other { opacity:0.65; }
.accept-card--other:hover { opacity:1; }
/* Dock */
.float-dock { position:fixed; bottom:18px; left:50%; transform:translateX(-50%); z-index:300; display:flex; align-items:center; background:rgba(19,23,32,0.92); border:1px solid var(--border2); border-radius:999px; padding:7px 12px; backdrop-filter:blur(12px); box-shadow:0 8px 32px rgba(0,0,0,0.55),0 0 0 1px rgba(255,255,255,0.04); max-width:calc(100vw - 24px); overflow-x:auto; scrollbar-width:none; }
.float-dock::-webkit-scrollbar { display:none; }
.dock-section { display:flex; align-items:center; gap:5px; flex-shrink:0; }
.dock-divider { width:1px; height:28px; background:var(--border2); margin:0 10px; flex-shrink:0; }
.dock-section--host { margin-right:4px; }
.dock-reveal-btn { display:flex; align-items:center; gap:7px; background:var(--accent); color:white; border:none; border-radius:999px; padding:7px 16px; font-size:13px; font-weight:700; cursor:pointer; transition:all 0.15s; white-space:nowrap; font-family:var(--font-main); }
.dock-reveal-btn:disabled { opacity:0.4; cursor:not-allowed; }
.dock-reveal-btn:not(:disabled):hover { background:var(--accent2); }
.dock-reveal-btn__count { background:rgba(255,255,255,0.2); border-radius:999px; padding:1px 8px; font-size:11px; }
.dock-revote-btn { background:transparent; color:var(--muted); border:1px solid var(--border2); border-radius:999px; padding:6px 14px; font-size:12px; font-weight:600; cursor:pointer; transition:all 0.15s; white-space:nowrap; font-family:var(--font-main); }
.dock-revote-btn:hover { background:var(--surface2); color:var(--text); }
.dock-cards { gap:4px; }
.dock-card { min-width:38px; height:52px; background:var(--surface2); border:1.5px solid var(--border2); border-radius:8px; font-size:0.95rem; font-weight:800; color:var(--text); cursor:pointer; transition:all 0.13s; display:flex; align-items:center; justify-content:center; padding:0 7px; }
.dock-card:hover { transform:translateY(-5px); border-color:var(--accent); background:rgba(99,102,241,0.12); }
.dock-card--sel { transform:translateY(-9px); border-color:var(--accent); background:rgba(99,102,241,0.25); color:var(--accent2); box-shadow:0 0 0 3px rgba(99,102,241,0.2); }
.dock-spectator { font-size:12px; color:var(--muted); padding:0 8px; }
.dock-emojis { gap:2px; }
.dock-emoji { background:none; border:none; cursor:pointer; font-size:1.2rem; padding:4px 5px; border-radius:8px; line-height:1; transition:background 0.1s,transform 0.12s; }
.dock-emoji:hover { background:var(--surface2); transform:scale(1.35) translateY(-2px); }

@media (max-width: 768px) {
  .center { padding:10px 12px 100px; } /* extra bottom padding for dock */
  .table-scene { padding-bottom:52%; } /* slightly taller on mobile */
  .float-dock { bottom:12px; padding:6px 10px; border-radius:16px; }
  .dock-card { min-width:34px; height:46px; font-size:0.85rem; }
  .accept-card { min-width:42px; height:56px; }
  .accept-card--suggest { min-width:50px; height:64px; }
  .results-stats { gap:6px; }
  .stat-val { font-size:1.2rem; }
}
@media (max-width: 480px) {
  .dock-card { min-width:30px; height:42px; font-size:0.8rem; padding:0 5px; }
  .dock-emoji { font-size:1rem; padding:3px 4px; }
  .dock-reveal-btn { padding:6px 12px; font-size:12px; }
  .dock-divider { margin:0 6px; }
  .seat-label__name { max-width:48px; font-size:8px; }
}
</style>