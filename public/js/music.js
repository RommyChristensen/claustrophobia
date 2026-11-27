/* Background music picker (tracks are listed in /music/playlist.json) and the battle track */
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
  let primed = false;
  let isMuted = get('cl_music_muted', '0') === '1';

  // one slider and mute button for both tracks; "muted" is needed because iOS ignores volume
  function applyVolume() {
    for (const a of [audio, battle]) { a.volume = Number(vol.value); a.muted = isMuted || Number(vol.value) === 0; }
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
    if (!battleOn) resumeBackground(); // otherwise it starts when the battle ends
  }
  function resumeBackground() {
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
  window.Music = { setBattle };

  // phones only allow sound after a tap, so unlock the battle track on the first one
  // (this also retries if a battle was already running when the page loaded)
  document.addEventListener('click', () => {
    if (inBattle) { if (!battleOn) startBattle(); return; }
    if (primed) return;
    battle.muted = true;
    battle.play().then(() => { primed = true; if (!inBattle) battle.pause(); })
      .catch(() => {})
      .finally(applyVolume);
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
