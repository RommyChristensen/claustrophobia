/* Background music picker. Tracks are listed in /music/playlist.json */
(() => {
  const audio = new Audio();
  audio.loop = true;
  const sel = document.getElementById('music-select');
  const vol = document.getElementById('music-volume');
  const btn = document.getElementById('music-toggle');
  const panel = document.getElementById('music-panel');
  const hint = document.getElementById('music-hint');

  const get = (k, d) => { try { return localStorage.getItem(k) ?? d; } catch { return d; } };
  const set = (k, v) => { try { localStorage.setItem(k, v); } catch {} };

  vol.value = get('cl_music_vol', '0.5');
  audio.volume = Number(vol.value);

  btn.addEventListener('click', () => panel.classList.toggle('hidden'));
  document.addEventListener('click', (e) => { if (!e.target.closest('#music')) panel.classList.add('hidden'); });

  vol.addEventListener('input', () => { audio.volume = Number(vol.value); set('cl_music_vol', vol.value); });

  function play(file) {
    set('cl_music_track', file);
    if (!file) { audio.pause(); btn.classList.remove('playing'); return; }
    audio.src = 'music/' + encodeURIComponent(file);
    audio.play().then(() => btn.classList.add('playing')).catch(() => {
      btn.classList.remove('playing');
      hint.textContent = 'Tap the page, then pick the track again to play.';
    });
  }
  sel.addEventListener('change', () => play(sel.value));
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
        const resume = () => { play(saved); document.removeEventListener('pointerdown', resume); };
        document.addEventListener('pointerdown', resume);
      }
    });
})();
