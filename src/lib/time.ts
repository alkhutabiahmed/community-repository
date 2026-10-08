const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

export function suggestedDate(defaultTime: string, from = new Date()): Date {
  const text = defaultTime.toLowerCase();
  const timeMatch = text.match(/(\d{1,2}):(\d{2})/);
  const d = new Date(from);
  d.setSeconds(0, 0);

  if (text.includes('weekend')) {
    const add = (6 - d.getDay() + 7) % 7 || 7;
    d.setDate(d.getDate() + add + (text.includes('next') ? 7 : 0));
    d.setHours(11, 0);
    return d;
  }
  const dayIdx = WEEKDAYS.findIndex((w) => text.includes(w));
  if (dayIdx >= 0) {
    const add = (dayIdx - d.getDay() + 7) % 7 || 7;
    d.setDate(d.getDate() + add);
  }
  if (timeMatch) d.setHours(Number(timeMatch[1]), Number(timeMatch[2]));
  else d.setHours(20, 0);
  if (d.getTime() < from.getTime() + 30 * 60000) d.setTime(from.getTime() + 2 * 3600000);
  return d;
}

export function tonightAt(hour = 20): Date {
  const now = new Date();
  const d = new Date(now);
  d.setHours(hour, 0, 0, 0);
  if (d.getTime() < now.getTime() + 30 * 60000) {
    d.setTime(now.getTime() + 60 * 60000);
    d.setMinutes(d.getMinutes() < 30 ? 30 : 60, 0, 0);
  }
  return d;
}

export function endOfToday(): Date {
  const d = new Date();
  d.setHours(23, 59, 0, 0);
  return d;
}

export function toLocalInput(d: Date) {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function formatWhen(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  const tomorrow = new Date(now);
  tomorrow.setDate(now.getDate() + 1);
  const time = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  if (d.toDateString() === now.toDateString()) return `Tonight ${time}`;
  if (d.toDateString() === tomorrow.toDateString()) return `Tomorrow ${time}`;
  return `${d.toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' })}, ${time}`;
}

export function timeLeft(iso: string) {
  const ms = new Date(iso).getTime() - Date.now();
  if (ms <= 0) return null;
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  return h > 0 ? `${h}h ${m}m left` : `${m}m left`;
}

export function isExpired(iso: string) {
  return new Date(iso).getTime() <= Date.now();
}

export function timeAgo(iso: string) {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return new Date(iso).toLocaleDateString([], { day: 'numeric', month: 'short' });
}
