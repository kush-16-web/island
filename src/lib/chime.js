// A soft three-note chime that repeats until stopped. Pure Web Audio, no asset files.
let ctx = null;
let timer = null;
let plays = 0;

function audio() {
  if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});
  return ctx;
}

function tone(freq, start, duration, peak = 0.11) {
  const c = audio();
  const t0 = c.currentTime + start;
  const osc = c.createOscillator();
  const gain = c.createGain();
  osc.type = 'sine';
  osc.frequency.value = freq;
  gain.gain.setValueAtTime(0.0001, t0);
  gain.gain.exponentialRampToValueAtTime(peak, t0 + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
  osc.connect(gain).connect(c.destination);
  osc.start(t0);
  osc.stop(t0 + duration + 0.05);
}

function phrase() {
  [880, 1174.66, 1318.51].forEach((freq, i) => tone(freq, i * 0.16, 0.75));
}

export function startChime() {
  stopChime();
  plays = 0;
  try {
    phrase();
    timer = setInterval(() => {
      plays += 1;
      if (plays >= 40) stopChime();
      else phrase();
    }, 2200);
  } catch {
    // Audio can fail on machines with no output device; the visual alert still works.
  }
}

export function stopChime() {
  clearInterval(timer);
  timer = null;
}
