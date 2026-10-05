// Inlined only on pages with audio. Native controls remain until setup succeeds.
// A player with data-remember keeps its position in localStorage (every access is guarded: storage can be blocked).
for (const player of document.querySelectorAll('.d-audio')) {
  const audio = player.querySelector('audio');
  const play = player.querySelector('[data-audio-play]');
  const seek = player.querySelector('[data-audio-seek]');
  const elapsed = player.querySelector('[data-audio-elapsed]');
  const total = player.querySelector('[data-audio-total]');
  const speed = player.querySelector('[data-audio-speed]');
  const status = player.querySelector('[role="status"]');
  const title = player.dataset.title || player.querySelector('h2').textContent;
  const storeKey = player.dataset.remember ? `str-friends-audio:${player.dataset.remember}` : '';
  let lastSaved = 0;
  let resumeAt = 0;
  const transcript = document.getElementById(player.dataset.transcript);
  const rates = [1, 1.25, 1.5];
  const clock = seconds => `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;
  const message = text => { status.textContent = text; status.hidden = !text; };
  const readSaved = () => {
    if (!storeKey) return 0;
    try { const value = Number(localStorage.getItem(storeKey)); return Number.isFinite(value) && value > 0 ? value : 0; } catch { return 0; }
  };
  const writeSaved = seconds => {
    if (!storeKey) return;
    try { if (seconds > 0) localStorage.setItem(storeKey, String(Math.floor(seconds))); else localStorage.removeItem(storeKey); } catch { /* storage unavailable: playback still works */ }
  };
  const syncPlay = () => {
    const playing = !audio.paused && !audio.ended;
    player.dataset.playing = String(playing);
    play.setAttribute('aria-label', `${playing ? 'Pause' : 'Play'} ${title}`);
  };
  const syncTime = () => {
    const duration = Number.isFinite(audio.duration) ? audio.duration : Number(seek.max);
    seek.max = duration;
    seek.value = audio.currentTime;
    seek.setAttribute('aria-valuetext', `${clock(audio.currentTime)} of ${clock(duration)}`);
    elapsed.textContent = clock(audio.currentTime);
    total.textContent = clock(duration);
  };
  play.addEventListener('click', async () => {
    if (!audio.paused) { audio.pause(); return; }
    message('');
    try {
      if (audio.error) audio.load();
      if (audio.ended) audio.currentTime = 0;
      if (resumeAt > 0) {
        // Load the metadata first, then jump, then play: seeking while a first play is still starting makes some browsers pause.
        const target = resumeAt;
        resumeAt = 0;
        if (audio.readyState < 1) {
          audio.preload = 'metadata';
          await new Promise(resolve => {
            audio.addEventListener('loadedmetadata', resolve, { once: true });
            audio.addEventListener('error', resolve, { once: true });
            audio.load();
          });
        }
        if (!audio.error) {
          await new Promise(resolve => {
            audio.addEventListener('seeked', resolve, { once: true });
            setTimeout(resolve, 2000);
            audio.currentTime = target;
          });
        }
      }
      await audio.play();
    } catch (error) {
      if (error.name !== 'AbortError') message('Audio could not play. Try again or read the transcript.');
      syncPlay();
    }
  });
  seek.addEventListener('input', () => {
    audio.currentTime = Number(seek.value);
    syncTime();
  });
  speed.addEventListener('click', () => {
    audio.playbackRate = rates[(rates.indexOf(audio.playbackRate) + 1) % rates.length];
  });
  audio.addEventListener('ratechange', () => {
    speed.textContent = `${audio.playbackRate}×`;
    speed.setAttribute('aria-label', `Playback speed: ${audio.playbackRate} times. Change speed`);
  });
  audio.addEventListener('loadedmetadata', () => {
    seek.disabled = !Number.isFinite(audio.duration) || audio.duration <= 0;
    seek.setAttribute('aria-label', 'Seek audio');
    syncTime();
  });
  for (const event of ['play', 'pause', 'ended']) audio.addEventListener(event, syncPlay);
  // One episode at a time.
  audio.addEventListener('play', () => {
    for (const other of document.querySelectorAll('.d-audio audio')) if (other !== audio) other.pause();
  });
  if (storeKey) {
    audio.addEventListener('timeupdate', () => {
      if (Date.now() - lastSaved < 4000) return;
      lastSaved = Date.now();
      writeSaved(audio.currentTime);
    });
    for (const event of ['pause', 'seeked']) audio.addEventListener(event, () => { if (!audio.ended) writeSaved(audio.currentTime); });
    audio.addEventListener('ended', () => writeSaved(0));
    window.addEventListener('pagehide', () => { if (audio.currentTime > 0 && !audio.ended) writeSaved(audio.currentTime); });
  }
  for (const event of ['timeupdate', 'durationchange', 'seeked']) audio.addEventListener(event, syncTime);
  audio.addEventListener('waiting', () => message('Loading audio…'));
  audio.addEventListener('playing', () => message(''));
  audio.addEventListener('error', () => {
    message('Audio could not load. Try again or read the transcript.');
    syncPlay();
  });
  const openTranscript = () => {
    if (location.hash === `#${transcript.id}`) transcript.open = true;
  };
  player.querySelector('.d-audio-transcript-link').addEventListener('click', () => { transcript.open = true; });
  window.addEventListener('hashchange', openTranscript);
  openTranscript();
  // Resume where this listener stopped. The jump happens on the first Play, once the metadata has loaded.
  const saved = readSaved();
  syncPlay();
  syncTime();
  if (saved > 5 && saved < Number(seek.max) - 5) {
    resumeAt = saved;
    elapsed.textContent = clock(saved);
    message(`Resume from ${clock(saved)}. Press Play.`);
  }
  player.dataset.enhanced = '';
  for (const control of player.querySelectorAll('[data-audio-custom]')) control.hidden = false;
  audio.hidden = true;
}
