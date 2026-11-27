/* Background music picker (tracks are listed in /music/playlist.json), battle track and chest sounds */
(() => {
  const audio = new Audio();
  audio.loop = true;
  const sel = document.getElementById('music-select');
  const vol = document.getElementById('music-volume');
  const btn = document.getElementById('music-toggle');
  const panel = document.getElementById('music-panel');
  const hint = document.getElementById('music-hint');
  const muteBtn = document.getElementById('music-mute');

  const get = (k, d) => { try { return localStorage.getItem(k) ?? d; } catch { return d; } };
  const set = (k, v) => { try { localStorage.setItem(k, v); } catch {} };

  const battle = new Audio('music/battleMusic.mp3');
  battle.loop = true;
  battle.preload = 'auto';
  let inBattle = false; // a battle is waiting for its winner
  let battleOn = false; // the battle track has actually started
  const chests = Object.fromEntries(['bronze', 'silver', 'gold'].map((t) => [t, new Audio(`music/${t}Music.mp3`)]));
  const CHEST_MAX_MS = 6000; // longer files are cut off here
  let chestNow = null;       // the chest sound being played
  let chestTimer;
  const effects = [battle, ...Object.values(chests)];
  const primed = new Set();
  let isMuted = get('cl_music_muted', '0') === '1';

  // one slider and mute button for every sound; "muted" is needed because iOS ignores volume
  function setLevel(a) { a.volume = Number(vol.value); a.muted = isMuted || Number(vol.value) === 0; }
  function applyVolume() {
    [audio, ...effects].forEach(setLevel);
    muteBtn.textContent = isMuted ? 'Unmute' : 'Mute';
    btn.classList.toggle('is-muted', isMuted);
  }
  function setMuted(on) { isMuted = on; set('cl_music_muted', on ? '1' : '0'); applyVolume(); }
  vol.value = get('cl_music_vol', '0.5');
  applyVolume();

  btn.addEventListener('click', () => panel.classList.toggle('hidden'));
  document.addEventListener('click', (e) => { if (!e.target.closest('#music')) panel.classList.add('hidden'); });

  vol.addEventListener('input', () => { set('cl_music_vol', vol.value); setMuted(false); });
  muteBtn.addEventListener('click', () => setMuted(!isMuted));

  function play(file) {
    set('cl_music_track', file);
    if (!file) { audio.pause(); if (!battleOn) btn.classList.remove('playing'); return; }
    audio.src = 'music/' + encodeURIComponent(file);
    resumeBackground();
  }
  function resumeBackground() {
    if (battleOn || chestNow) return; // it starts when they finish
    audio.play().then(() => btn.classList.add('playing')).catch(() => {
      btn.classList.remove('playing');
      hint.textContent = 'Tap the page, then pick the track again to play.';
    });
  }
  sel.addEventListener('change', () => play(sel.value));

  function startBattle() {
    battle.play().then(() => {
      if (!inBattle) { battle.pause(); return; }
      battleOn = true;
      audio.pause();
      btn.classList.add('playing');
    }).catch(() => {}); // missing file or autoplay blocked: the background track carries on
  }

  function setBattle(on) {
    if (on === inBattle) return;
    inBattle = on;
    if (on) { battle.currentTime = 0; startBattle(); return; }
    battle.pause();
    battleOn = false;
    if (sel.value && audio.src) resumeBackground();
    else btn.classList.remove('playing');
  }
  function endChest() {
    if (!chestNow) return;
    clearTimeout(chestTimer);
    chestNow.pause();
    chestNow = null;
    if (sel.value && audio.src) resumeBackground();
  }

  function playChest(tier) {
    const a = chests[tier];
    if (!a) return;
    clearTimeout(chestTimer);
    if (chestNow && chestNow !== a) chestNow.pause();
    chestNow = a;
    setLevel(a);
    a.currentTime = 0;
    a.play().then(() => {
      if (chestNow !== a) return;
      primed.add(a);
      audio.pause();
      chestTimer = setTimeout(endChest, CHEST_MAX_MS);
    }).catch(() => { if (chestNow === a) endChest(); }); // missing file or autoplay blocked
  }
  for (const a of Object.values(chests)) a.addEventListener('ended', () => { if (chestNow === a) endChest(); });
  window.Music = { setBattle, playChest };

  // phones only allow sound after a tap, so unlock the battle and chest sounds on the first one
  // (this also retries if a battle was already running when the page loaded)
  document.addEventListener('click', () => {
    if (inBattle && !battleOn) startBattle();
    const wanted = (a) => (a === battle && inBattle) || a === chestNow;
    for (const a of effects) {
      if (primed.has(a) || wanted(a)) continue;
      a.muted = true;
      a.play().then(() => { primed.add(a); if (!wanted(a)) a.pause(); })
        .catch(() => {})
        .finally(() => setLevel(a));
    }
  }, true);
  audio.addEventListener('error', () => { if (audio.src) { hint.textContent = 'Could not load that file.'; btn.classList.remove('playing'); } });

  fetch('music/playlist.json', { cache: 'no-store' })
    .then((r) => (r.ok ? r.json() : []))
    .catch(() => [])
    .then((list) => {
      list = Array.isArray(list) ? list : [];
      sel.innerHTML = '<option value="">Off</option>' + list.map((t) => `<option value="${String(t.file).replace(/"/g, '&quot;')}">${String(t.title || t.file).replace(/</g, '&lt;')}</option>`).join('');
      hint.textContent = list.length ? '' : 'No tracks yet. Add MP3s to public/music and list them in playlist.json.';
      const saved = get('cl_music_track', '');
      if (saved && list.some((t) => t.file === saved)) {
        sel.value = saved;
        // browsers block autoplay until the user interacts; start on first click
        const resume = () => { play(saved); document.removeEventListener('click', resume); };
        document.addEventListener('click', resume);
      }
    });
})();
