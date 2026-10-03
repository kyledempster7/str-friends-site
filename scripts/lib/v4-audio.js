// Inlined only on pages with audio. Native controls remain until setup succeeds.
for (const player of document.querySelectorAll('.d-audio')) {
  const audio = player.querySelector('audio');
  const play = player.querySelector('[data-audio-play]');
  const seek = player.querySelector('[data-audio-seek]');
  const elapsed = player.querySelector('[data-audio-elapsed]');
  const total = player.querySelector('[data-audio-total]');
  const speed = player.querySelector('[data-audio-speed]');
  const status = player.querySelector('[role="status"]');
  const title = player.querySelector('h2').textContent;
  const transcript = document.getElementById(player.dataset.transcript);
  const rates = [1, 1.25, 1.5];
  const clock = seconds => `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;
  const message = text => { status.textContent = text; status.hidden = !text; };
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
  syncPlay();
  syncTime();
  player.dataset.enhanced = '';
  for (const control of player.querySelectorAll('[data-audio-custom]')) control.hidden = false;
  audio.hidden = true;
}
