export const pad = (n) => String(n).padStart(2, '0');

export const uses12h = (() => {
  try {
    return new Intl.DateTimeFormat(undefined, { hour: 'numeric' }).resolvedOptions().hour12 === true;
  } catch {
    return false;
  }
})();

export function formatRemaining(ms) {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

export function formatTrackTime(ms) {
  const total = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(total / 60)}:${pad(total % 60)}`;
}

export function formatClock(ms) {
  return new Date(ms).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

export function formatAlarmTime(time) {
  const [h, m] = time.split(':').map(Number);
  return new Date(2000, 0, 1, h, m).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

export function untilText(ms) {
  const mins = Math.max(0, Math.round(ms / 60000));
  if (mins < 1) return 'in under a minute';
  if (mins < 60) return `in ${mins}m`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h < 24) return m ? `in ${h}h ${m}m` : `in ${h}h`;
  const d = Math.floor(h / 24);
  return `in ${d}d ${h % 24}h`;
}

export function timeAgo(ts, now) {
  const s = Math.max(0, Math.round((now - ts) / 1000));
  if (s < 45) return 'now';
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}

export const DAY_LABELS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
export const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function describeDays(days) {
  if (!days.length) return 'Once';
  if (days.length === 7) return 'Every day';
  if (days.length === 5 && [1, 2, 3, 4, 5].every((d) => days.includes(d))) return 'Weekdays';
  if (days.length === 2 && days.includes(0) && days.includes(6)) return 'Weekends';
  return days.map((d) => DAY_NAMES[d]).join(' ');
}

export function hueFrom(text) {
  let h = 0;
  for (let i = 0; i < text.length; i++) h = (h * 31 + text.charCodeAt(i)) >>> 0;
  return h % 360;
}
