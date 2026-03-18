<script setup>
import { ref, computed } from 'vue'

const sp          = inject('sp')
const tickets     = sp.tickets
const currentUser = sp.currentUser
const activeTicketId = sp.activeTicketId

const ticketsOpen   = ref(true)
const showExportMenu = ref(false)
const ticketInput   = ref({ title: '', description: '' })
const showAddModal  = defineModel('showAddModal', { default: false })

const ticketHistory = computed(() => tickets.value.filter(t => t.final_score !== null))

async function removeTicket(id) {
  try { await sp.removeTicket(id) }
  catch (e) { console.error('[removeTicket]', e) }
}

async function setActiveTicket(id) { await sp.setActiveTicket(id) }

function exportJSON() {
  const room = sp.room.value
  if (!room || !ticketHistory.value.length) return
  const data = { room: room.name, exportedAt: new Date().toISOString(), tickets: ticketHistory.value.map(t => ({ title: t.title, description: t.description, finalScore: t.final_score })) }
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = `${room.name.replace(/\s+/g, '-')}-scores.json`
  a.click(); URL.revokeObjectURL(a.href)
  showExportMenu.value = false
}

function exportPDF() {
  const room = sp.room.value
  if (!room || !ticketHistory.value.length) return
  const win = window.open('', '_blank')
  win.document.write(`<html><head><title>${room.name} Scores</title>
  <style>body{font-family:system-ui,sans-serif;padding:40px;color:#111;max-width:700px;margin:0 auto}table{width:100%;border-collapse:collapse;margin-top:16px}th{text-align:left;padding:8px 12px;background:#f0f0f0;font-size:12px;text-transform:uppercase}td{padding:10px 12px;border-bottom:1px solid #eee;font-size:14px}.score{font-weight:700;color:#6366f1;text-align:center}
@media (max-width: 768px) {
  .sidebar--left { border-right:none; min-width:unset !important; width:100% !important; }
  .sidebar--collapsed { display:none; }
}
</style></head><body>
  <h1>📋 ${room.name}</h1><p>Exported ${new Date().toLocaleString()}</p>
  <table><thead><tr><th>#</th><th>Ticket</th><th>Description</th><th style="text-align:center">Score</th></tr></thead><tbody>
  ${ticketHistory.value.map((t, i) => `<tr><td>${i+1}</td><td><strong>${t.title}</strong></td><td style="color:#666">${t.description ?? '—'}</td><td class="score">${t.final_score}</td></tr>`).join('')}
  </tbody></table><p>${ticketHistory.value.length} ticket(s) scored</p>
  <script>window.onload=()=>window.print()<\/script></body></html>`)
  win.document.close()
  showExportMenu.value = false
}
</script>

<template>
  <aside class="sidebar sidebar--left" :class="{ 'sidebar--collapsed': !ticketsOpen }">
    <div class="sidebar-head">
      <button class="sidebar-collapse-btn" @click="ticketsOpen = !ticketsOpen" :title="ticketsOpen ? 'Collapse' : 'Expand tickets'">
        <svg class="collapse-icon" :class="{ 'collapse-icon--open': ticketsOpen }" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="15 18 9 12 15 6"/>
        </svg>
        <span v-if="ticketsOpen" class="section-label">Tickets</span>
      </button>
      <div v-if="ticketsOpen" class="sidebar-head-actions">
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
        <button v-if="currentUser?.is_host" class="icon-btn" @click="showAddModal=true" title="Add ticket">＋</button>
      </div>
    </div>

    <div v-show="ticketsOpen" class="ticket-list" style="overflow-anchor:none">
      <div v-if="!tickets.length" class="empty-hint">
        <span>No tickets yet</span>
        <small v-if="currentUser?.is_host">Tap ＋ above</small>
      </div>
      <transition-group name="list-item" tag="div">
        <div
          v-for="ticket in tickets" :key="ticket.id"
          class="ticket-item"
          :class="{
            'ticket-item--active': activeTicketId===ticket.id,
            'ticket-item--done':   ticket.final_score!==null,
          }"
          @click="currentUser?.is_host && ticket.final_score===null && setActiveTicket(ticket.id)"
        >
          <!-- Status indicator strip -->
          <div class="ticket-item__strip">
            <span v-if="ticket.final_score!==null" class="ticket-score-strip">{{ ticket.final_score }}</span>
            <span v-else-if="activeTicketId===ticket.id" class="ticket-dot" />
            <span v-else class="ticket-strip-idle" />
          </div>

          <!-- Main body -->
          <div class="ticket-item__body">
            <div class="ticket-item__title-row">
              <span class="ticket-item__title">{{ ticket.title }}</span>
              <a
                v-if="ticket.url"
                :href="ticket.url"
                target="_blank"
                rel="noopener"
                class="ticket-link-btn"
                title="Open ticket URL"
                @click.stop
              >
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
                  <polyline points="15 3 21 3 21 9"/>
                  <line x1="10" y1="14" x2="21" y2="3"/>
                </svg>
              </a>
            </div>
            <span v-if="ticket.description" class="ticket-item__desc">{{ ticket.description }}</span>
          </div>

          <!-- Actions -->
          <div class="ticket-item__actions">
            <button v-if="currentUser?.is_host && ticket.final_score===null" class="rm-btn" @click.stop="removeTicket(ticket.id)" title="Delete ticket">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/>
              </svg>
            </button>
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
</template>

<style scoped>
.sidebar--left { background:var(--surface); display:flex; flex-direction:column; overflow:hidden; border-right:1px solid var(--border); transition:width 0.25s cubic-bezier(0.4,0,0.2,1), min-width 0.25s cubic-bezier(0.4,0,0.2,1); }
.sidebar--collapsed { min-width:42px !important; width:42px !important; overflow:hidden; }
.sidebar-head { display:flex; align-items:center; justify-content:space-between; padding:13px 13px 8px; flex-shrink:0; }
.sidebar-head-actions { display:flex; align-items:center; gap:6px; }
.sidebar-collapse-btn { display:flex; align-items:center; gap:6px; background:none; border:none; cursor:pointer; padding:4px 2px; flex:1; min-width:0; border-radius:var(--r-sm); transition:background 0.15s; }
.sidebar-collapse-btn:hover { background:var(--surface2); }
.sidebar-collapse-btn:hover .section-label { color:var(--text); }
.collapse-icon { color:var(--muted); flex-shrink:0; transition:transform 0.22s cubic-bezier(0.4,0,0.2,1); transform:rotate(0deg); }
.collapse-icon--open { transform:rotate(180deg); color:var(--text); }
.export-wrap { position:relative; }
.export-icon-btn { padding:4px 6px; }
.export-icon-btn svg { display:block; }
.export-menu { position:absolute; right:0; top:34px; background:var(--surface); border:1px solid var(--border2); border-radius:var(--r-sm); min-width:140px; z-index:200; overflow:hidden; box-shadow:0 8px 24px rgba(0,0,0,0.5); }
.export-menu button { display:block; width:100%; text-align:left; background:none; border:none; color:var(--text); font-size:13px; padding:10px 14px; cursor:pointer; font-family:var(--font-main); transition:background 0.1s; }
.export-menu button:hover { background:var(--surface2); }
.ticket-list { flex:1; overflow-y:auto; padding:0 7px 8px; }
.ticket-list::-webkit-scrollbar { width:3px; }
.ticket-list::-webkit-scrollbar-thumb { background:var(--border2); border-radius:2px; }
.ticket-item {
  display: flex; align-items: center; gap: 0;
  border-radius: var(--r-sm); cursor: pointer;
  transition: background 0.12s, border-color 0.12s;
  margin-bottom: 3px; border: 1px solid transparent;
  overflow: hidden; min-height: 40px;
}
.ticket-item:hover { background: var(--surface2); border-color: var(--border2); }
.ticket-item--active { background: rgba(99,102,241,0.09); border-color: rgba(99,102,241,0.28); }
.ticket-item--done { opacity: 0.5; cursor: default; }
/* Left strip — colour-coded status, stretches full height via align-self */
.ticket-item__strip {
  width: 4px; flex-shrink: 0; align-self: stretch;
  background: var(--border2);
  display: flex; align-items: center; justify-content: center;
  transition: background 0.2s;
}
.ticket-item--active .ticket-item__strip { background: var(--accent); }
.ticket-item--done   .ticket-item__strip { background: var(--success); }
/* Score badge inside strip for done tickets */
.ticket-score-strip {
  writing-mode: vertical-rl; text-orientation: mixed;
  font-size: 9px; font-weight: 800; color: white;
  letter-spacing: 0.05em; padding: 4px 0;
}
.ticket-strip-idle { width: 4px; }
/* Body */
.ticket-item__body { flex: 1; display: flex; flex-direction: column; gap: 2px; min-width: 0; padding: 7px 6px 7px 8px; }
.ticket-item__title-row { display: flex; align-items: center; gap: 4px; min-width: 0; }
.ticket-item__title { font-size: 12px; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; flex: 1; }
.ticket-item__desc { font-size: 10px; color: var(--muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
/* URL link icon */
.ticket-link-btn {
  display: inline-flex; align-items: center; justify-content: center;
  color: var(--muted2); flex-shrink: 0;
  border-radius: 3px; padding: 1px 2px;
  transition: color 0.15s, background 0.15s;
  text-decoration: none;
}
.ticket-link-btn:hover { color: var(--accent2); background: rgba(99,102,241,0.12); }
/* Delete action column — always same height as row, centred */
.ticket-item__actions {
  display: flex; align-items: center; justify-content: center;
  padding: 0 6px; flex-shrink: 0;
  opacity: 0; transition: opacity 0.15s;
}
.ticket-item:hover .ticket-item__actions { opacity: 1; }
.rm-btn {
  background: none; border: none; color: var(--muted2); cursor: pointer;
  padding: 4px; border-radius: 4px; display: flex; align-items: center; justify-content: center;
  transition: color 0.15s, background 0.15s; line-height: 0;
}
.rm-btn:hover { color: #ef4444; background: rgba(239,68,68,0.1); }
.ticket-dot { width: 6px; height: 6px; border-radius: 50%; background: var(--accent); animation: pulse 1.4s ease-in-out infinite; }
.ticket-score { background: var(--accent); color: white; font-size: 11px; font-weight: 700; padding: 2px 7px; border-radius: 999px; }
.completed-section { padding:10px 13px; border-top:1px solid var(--border); flex-shrink:0; max-height:140px; overflow-y:auto; }
.history-row { display:flex; justify-content:space-between; align-items:center; padding:3px 0; }
.history-title { font-size:11px; color:var(--muted); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:145px; }
.history-score { font-size:12px; font-weight:700; color:var(--success); flex-shrink:0; }
</style>