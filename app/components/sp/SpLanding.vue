<script setup>
defineProps({ fallingItems: Array })
defineEmits(['go-create', 'go-join'])

function openGitHub() {
  window.open('https://github.com/surelle-ha/asurr-pokerplanner', '_blank', 'noopener')
}
function watchAd() {
  alert('Ad functionality coming soon. Thank you for supporting the project! ☕')
}
</script>

<template>
  <div class="landing">
    <!-- Falling background -->
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
      <div class="landing__badge">Scrum Planning Poker</div>
      <h1 class="landing__title">
        <span class="brand-prefix">Surelle</span>
        <span class="product-name">Scrum <span class="accent">PokerPlanner</span></span>
      </h1>
      <p class="landing__sub">
        Free story point estimation tool — built by
        <a href="https://github.com/surelle-ha" target="_blank" rel="noopener" class="sub-link">surelle-ha</a>
      </p>
      <div class="landing__actions">
        <button class="btn btn--primary" @click="$emit('go-create')">Create Room</button>
        <button class="btn btn--ghost"   @click="$emit('go-join')">Join Room</button>
      </div>
    </div>

    <!-- Info cards -->
    <div class="landing__info">
      <div class="info-card">
        <div class="info-card__icon">💸</div>
        <div class="info-card__body"><strong>Free to use</strong><span>Free for as long as I can sustain it.</span></div>
      </div>
      <div class="info-card">
        <div class="info-card__icon">👥</div>
        <div class="info-card__body"><strong>Unlimited Users</strong><span>No cap on how many teammates can join.</span></div>
      </div>
      <div class="info-card">
        <div class="info-card__icon">🎫</div>
        <div class="info-card__body"><strong>No Ticket Limit</strong><span>Add as many tickets as your sprint needs.</span></div>
      </div>
      <div class="info-card">
        <div class="info-card__icon">🗑️</div>
        <div class="info-card__body"><strong>Auto-purge</strong><span>All room data is deleted once the room is closed.</span></div>
      </div>
      <div class="info-card">
        <div class="info-card__icon">🤝</div>
        <div class="info-card__body"><strong>Community Trusted</strong><span>Built for real teams, used by real sprints.</span></div>
      </div>
      <div class="info-card info-card--link" @click="openGitHub">
        <div class="info-card__icon">⭐</div>
        <div class="info-card__body"><strong>Open Source</strong><span>Fork it, self-host it, contribute on GitHub.</span></div>
        <span class="info-card__arrow">→</span>
      </div>
    </div>

    <!-- Footer links -->
    <div class="landing__footer">
      <a href="https://github.com/surelle-ha/asurr-pokerplanner" target="_blank" rel="noopener" class="footer-link footer-link--gh">
        <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"/></svg>
        Contribute
      </a>
      <a href="https://ko-fi.com/surelle" target="_blank" rel="noopener" class="footer-link footer-link--kofi">☕ Support</a>
      <button class="footer-link footer-link--ad" @click="watchAd">📺 Watch Ad</button>
      <a href="https://github.com/surelle-ha/asurr-pokerplanner/issues/new" target="_blank" rel="noopener" class="footer-link footer-link--suggest">💬 Suggest</a>
    </div>
  </div>
</template>

<style scoped>
.landing { display:flex; flex-direction:column; align-items:center; justify-content:center; min-height:100vh; gap:2rem; padding:2rem; background:radial-gradient(ellipse at 50% 6%, rgba(99,102,241,0.18) 0%, transparent 58%); position:relative; }
.fall-stage { position:fixed; inset:0; pointer-events:none; z-index:0; overflow:hidden; }
.fall-item { position:absolute; top:-4rem; font-weight:800; animation:fall linear infinite; user-select:none; }
@keyframes fall { 0%{transform:translateY(-60px) rotate(0deg)} 100%{transform:translateY(110vh) rotate(360deg)} }
.landing__hero { position:relative; z-index:1; display:flex; flex-direction:column; align-items:center; gap:10px; }
.landing__info  { position:relative; z-index:1; display:grid; grid-template-columns:repeat(3,1fr); gap:10px; max-width:660px; width:100%; }
.landing__footer { position:relative; z-index:1; display:flex; gap:14px; flex-wrap:wrap; justify-content:center; align-items:center; }
.landing__badge { background:rgba(99,102,241,0.14); color:var(--accent2); border:1px solid rgba(99,102,241,0.28); border-radius:999px; padding:3px 14px; font-size:11px; letter-spacing:0.1em; text-transform:uppercase; }
.landing__title { font-size:clamp(2.8rem,6vw,4.8rem); font-weight:800; letter-spacing:-0.03em; line-height:1; text-align:center; }
.brand-prefix { font-size:clamp(1rem,2.5vw,1.6rem); font-weight:900; color:var(--accent2); letter-spacing:0.12em; text-transform:uppercase; opacity:0.85; display:block; line-height:1; margin-bottom:2px; }
.product-name { display:block; line-height:1; }
.accent { color:var(--accent2); }
.landing__sub { font-size:0.95rem; color:var(--muted); text-align:center; }
.sub-link { color:var(--accent2); font-weight:600; text-decoration:none; border-bottom:1px dotted rgba(129,140,248,0.4); transition:border-color 0.15s; }
.sub-link:hover { border-color:var(--accent2); }
.landing__actions { display:flex; gap:12px; margin-top:4px; }
.info-card { display:flex; align-items:flex-start; gap:11px; background:rgba(19,23,32,0.85); border:1px solid var(--border2); border-radius:var(--r); padding:13px 14px; backdrop-filter:blur(8px); transition:border-color 0.2s,background 0.2s; }
.info-card--link { cursor:pointer; }
.info-card--link:hover { border-color:var(--accent); background:rgba(99,102,241,0.08); }
.info-card__icon { font-size:1.35rem; flex-shrink:0; margin-top:1px; }
.info-card__body { display:flex; flex-direction:column; gap:3px; flex:1; }
.info-card__body strong { font-size:12px; font-weight:700; color:var(--text); }
.info-card__body span { font-size:11px; color:var(--muted); line-height:1.45; }
.info-card__arrow { font-size:14px; color:var(--accent2); align-self:center; flex-shrink:0; }
.footer-link { display:inline-flex; align-items:center; gap:6px; text-decoration:none; font-size:12px; font-weight:600; border-radius:999px; padding:6px 14px; transition:all 0.15s; border:1px solid; font-family:var(--font-main); cursor:pointer; }
.footer-link--gh { color:var(--text); border-color:var(--border2); background:rgba(255,255,255,0.04); }
.footer-link--gh:hover { background:var(--surface2); }
.footer-link--kofi { color:#ff6b3d; border-color:rgba(255,107,61,0.3); background:rgba(255,107,61,0.08); }
.footer-link--kofi:hover { background:rgba(255,107,61,0.18); }
.footer-link--ad { color:#10b981; border-color:rgba(16,185,129,0.3); background:rgba(16,185,129,0.08); }
.footer-link--ad:hover { background:rgba(16,185,129,0.18); }
.footer-link--suggest { color:var(--accent2); border-color:rgba(99,102,241,0.3); background:rgba(99,102,241,0.08); }
.footer-link--suggest:hover { background:rgba(99,102,241,0.18); border-color:var(--accent); }
</style>