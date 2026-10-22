// In-memory stand-in for the Electron bridge. Used only when the UI runs in a normal browser tab.

const TRACKS = [
  { title: 'Neon Tides', artist: 'Aurora Vale', album: 'Low Orbit', hue: 265, durationMs: 214000 },
  { title: 'Glass Garden', artist: 'Mono Meadow', album: 'Soft Machines', hue: 168, durationMs: 187000 },
  { title: 'Paper Satellites', artist: 'The Quiet Hours', album: 'Night Shift', hue: 18, durationMs: 241000 },
];

function artFor(hue) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="hsl(${hue} 80% 62%)"/><stop offset="1" stop-color="hsl(${(hue + 60) % 360} 70% 32%)"/></linearGradient></defs><rect width="200" height="200" fill="url(#g)"/><circle cx="130" cy="78" r="46" fill="hsl(${(hue + 30) % 360} 90% 78%)" opacity=".85"/><circle cx="64" cy="140" r="30" fill="#000" opacity=".25"/></svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

function nextAlarmTime(time, days) {
  const [h, m] = time.split(':').map(Number);
  const now = Date.now();
  for (let i = 0; i < 8; i++) {
    const d = new Date();
    d.setDate(d.getDate() + i);
    d.setHours(h, m, 0, 0);
    if (d.getTime() > now && (days.length === 0 || days.includes(d.getDay()))) return d.getTime();
  }
  return null;
}

export function createMockIsland() {
  const handlers = {};
  const emit = (channel, payload) => (handlers[channel] || []).forEach((cb) => cb(payload));
  let seq = 0;
  let items = [];
  let inbox = [];
  let media = { active: false };
  let trackIndex = 0;

  const rank = (i) => (i.kind === 'timer' ? 0 : i.enabled ? 1 : 2);
  const sorted = () =>
    items.map((i) => ({ ...i })).sort((a, b) => rank(a) - rank(b) || (a.fireAt ?? Infinity) - (b.fireAt ?? Infinity));
  const pushSchedule = () => emit('scheduler:state', sorted());
  const pushInbox = () => emit('inbox:state', inbox.map((n) => ({ ...n })));

  function setTrack(index, status = 'playing') {
    trackIndex = (index + TRACKS.length) % TRACKS.length;
    const t = TRACKS[trackIndex];
    media = {
      active: true,
      title: t.title,
      artist: t.artist,
      album: t.album,
      app: 'Spotify',
      status,
      positionMs: 0,
      durationMs: t.durationMs,
      art: artFor(t.hue),
      reportedAt: Date.now(),
    };
    emit('media', media);
  }

  function notify(n) {
    const entry = {
      id: `n${++seq}`,
      title: n.title,
      body: n.body || '',
      app: n.app || 'Notification',
      kind: n.kind || 'info',
      source: 'mock',
      ts: Date.now(),
      read: false,
    };
    inbox = [entry, ...inbox].slice(0, 100);
    pushInbox();
    emit('notification', { ...entry, timeoutMs: n.timeoutMs || 5000 });
  }

  setInterval(() => {
    const now = Date.now();
    for (const item of [...items]) {
      if (!item.enabled || item.fireAt == null || now < item.fireAt) continue;
      emit('ring', { kind: item.kind, item: { ...item } });
      if (item.kind === 'timer') items = items.filter((x) => x !== item);
      else if (item.days.length) item.fireAt = nextAlarmTime(item.time, item.days);
      else {
        item.enabled = false;
        item.fireAt = null;
      }
      pushSchedule();
    }
  }, 500);

  return {
    getState: async () => ({
      schedule: sorted(),
      inbox,
      media,
      platform: 'web preview',
      port: 47823,
      hotkey: 'Ctrl+Alt+Space',
      systemAccent: '#38bdf8',
    }),
    logLifecycle() {},
    setIgnoreMouse() {},
    setFocusable() {},
    startWindowDrag() {},
    moveWindowDrag() {},
    moveWindowBy() {},
    endWindowDrag() {},
    setWindowPreset() {},
    resetWindowPos() {},
    getWindowPos: async () => ({ x: 0, preset: 'center' }),
    getWindowDock: async () => ({ edge: 'top', preset: 'center', align: 'center' }),
    setIslandExpanded() {},
    movePetBy() {},
    setPetPos() {},
    getPetPos: async () => ({ x: 0, y: 0 }),
    resetPetPos() {},
    setPetVisible() {},
    getAutohide: async () => true,
    setAutohide: async () => true,
    getAutohidePet: async () => true,
    setAutohidePet: async () => true,
    getDockMode: async () => 'smart',
    setDockMode: async () => true,
    getSnapThreshold: async () => 85,
    setSnapThreshold: async () => true,
    scheduler: {
      async addAlarm({ time, days = [], label = '' }) {
        if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) return { ok: false, error: 'Alarm time must look like 07:30' };
        const item = {
          id: `a${++seq}`, kind: 'alarm', time, days: [...days].sort(), label: label.slice(0, 40),
          enabled: true, fireAt: nextAlarmTime(time, days), createdAt: Date.now(),
        };
        items.push(item);
        pushSchedule();
        return { ok: true, item };
      },
      async addTimer({ durationMs, label = '', snoozed = false }) {
        if (!(durationMs >= 1000)) return { ok: false, error: 'Timer must be at least 1 second' };
        const now = Date.now();
        const item = {
          id: `t${++seq}`, kind: 'timer', label: label.slice(0, 40), durationMs, startedAt: now,
          fireAt: now + durationMs, enabled: true, createdAt: now, snoozed,
        };
        items.push(item);
        pushSchedule();
        return { ok: true, item };
      },
      async snooze({ label = '', minutes = 5 }) {
        return this.addTimer({ durationMs: minutes * 60000, label: label || 'Alarm', snoozed: true });
      },
      async remove(id) {
        items = items.filter((i) => i.id !== id);
        pushSchedule();
        return { ok: true };
      },
      async setEnabled(id, enabled) {
        const item = items.find((i) => i.id === id);
        if (item && item.kind === 'alarm') {
          item.enabled = enabled;
          item.fireAt = enabled ? nextAlarmTime(item.time, item.days) : null;
          pushSchedule();
        }
        return { ok: true };
      },
    },
    media: {
      control(action) {
        if (!media.active) return;
        if (action === 'playpause') {
          const now = Date.now();
          const elapsed = media.status === 'playing' ? now - media.reportedAt : 0;
          media = {
            ...media,
            status: media.status === 'playing' ? 'paused' : 'playing',
            positionMs: media.positionMs + elapsed,
            reportedAt: now,
          };
          emit('media', media);
        } else if (action === 'next') setTrack(trackIndex + 1);
        else if (action === 'previous') setTrack(trackIndex - 1);
      },
      seek(posSec) {
        if (!media.active) return;
        media = {
          ...media,
          positionMs: Math.max(0, Math.min(media.durationMs || 300000, Number(posSec) * 1000)),
          reportedAt: Date.now(),
        };
        emit('media', media);
      },
    },
    inbox: {
      clear() {
        inbox = [];
        pushInbox();
      },
      remove(id) {
        inbox = inbox.filter((n) => n.id !== id);
        pushInbox();
      },
      markRead() {
        inbox = inbox.map((n) => ({ ...n, read: true }));
        pushInbox();
      },
    },
    setVoiceMood(voiceState) {
      emit('voice:state', voiceState);
    },
    gemini: {
      processSpeech: async () => ({ ok: false, error: 'Voice service requires desktop Electron app.' }),
      synthesizeSpeech: async () => ({ ok: false, error: 'Speech synthesis requires desktop Electron app.' }),
      getStatus: async () => ({ hasKey: false, provider: 'gemini' }),
    },
    groq: {
      chat: async () => ({ ok: false, error: 'Groq service requires desktop Electron app.' }),
      transcribe: async () => ({ ok: false, error: 'Groq Whisper requires desktop Electron app.' }),
      listModels: async () => ({
        ok: true,
        chatModels: ['openai/gpt-oss-20b', 'openai/gpt-oss-120b'],
        whisperModels: ['whisper-large-v3-turbo', 'whisper-large-v3'],
        count: 4,
        checkedAt: new Date().toISOString(),
      }),
      getStatus: async () => {
        const key = typeof window !== 'undefined' ? localStorage.getItem('island_mock_groq_key') : null;
        return {
          hasKey: Boolean(key && key.length > 8),
          keyMasked: key && key.length > 8 ? `${key.slice(0, 4)}...${key.slice(-4)}` : null,
          provider: 'groq',
          defaultChatModel: 'openai/gpt-oss-20b',
          fastChatModel: 'openai/gpt-oss-20b',
          reasoningChatModel: 'openai/gpt-oss-120b',
          catalogChatModels: [
            { id: 'openai/gpt-oss-20b', label: 'GPT-OSS 20B (Recommended • Fast)' },
            { id: 'openai/gpt-oss-120b', label: 'GPT-OSS 120B (High Reasoning)' },
            { id: 'llama-3.1-8b-instant', label: 'Llama 3.1 8B (Tiered / Enterprise)' },
            { id: 'llama-3.3-70b-versatile', label: 'Llama 3.3 70B (Tiered / Enterprise)' },
          ],
        };
      },
      setKey: async (p) => {
        const key = typeof p === 'string' ? p : (p?.key || p?.apiKey);
        if (key && typeof window !== 'undefined') localStorage.setItem('island_mock_groq_key', key);
        return { ok: true };
      },
      clearKey: async () => {
        if (typeof window !== 'undefined') localStorage.removeItem('island_mock_groq_key');
        return { ok: true };
      },
    },
    ai: {
      getStatus: async () => ({
        gemini: { hasKey: false, provider: 'gemini' },
        groq: { hasKey: false, provider: 'groq' },
        kokoro: { installed: false, isLoaded: false },
      }),
      setGroqKey: async () => ({ ok: true }),
      clearGroqKey: async () => ({ ok: true }),
    },
    kokoro: {
      getStatus: async () => ({ installed: false, isLoaded: false }),
      loadModel: async () => ({ ok: false, error: 'Local Kokoro requires desktop Electron app.' }),
      installModel: async () => ({ ok: false, error: 'Local Kokoro requires desktop Electron app.' }),
      synthesize: async () => ({ ok: false, error: 'Local Kokoro requires desktop Electron app.' }),
      cancel: async () => ({ ok: true, cancelled: false }),
      dispose: async () => ({ ok: true, disposed: false }),
    },
    realtime: {
      async createSession() {
        return { ok: false, error: 'Realtime voice requires the desktop Electron app with .env OPENAI_API_KEY.' };
      },
    },
    on(channel, callback) {
      (handlers[channel] = handlers[channel] || []).push(callback);
      return () => {
        handlers[channel] = handlers[channel].filter((cb) => cb !== callback);
      };
    },
    // Only exists in the browser preview; drives the little dev bar.
    dev: {
      notify,
      toggleMusic() {
        if (media.active) {
          media = { active: false };
          emit('media', media);
        } else setTrack(0);
      },
      ring(kind = 'alarm') {
        const item =
          kind === 'alarm'
            ? { id: `r${++seq}`, kind: 'alarm', time: '07:30', label: 'Wake up', days: [], enabled: true }
            : { id: `r${++seq}`, kind: 'timer', label: 'Tea', durationMs: 180000, enabled: true };
        emit('ring', { kind, item });
      },
    },
  };
}
