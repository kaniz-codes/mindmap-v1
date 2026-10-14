// All times are local wall-clock strings: dates 'YYYY-MM-DD', datetimes 'YYYY-MM-DDTHH:MM'.
// A single-student planner never crosses time zones, so we skip UTC entirely.

const pad = (n) => String(n).padStart(2, '0');

export const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export function toMin(hhmm) {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + (m || 0);
}

export function fromMin(min) {
  const m = Math.max(0, Math.min(24 * 60, Math.round(min)));
  return `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
}

export function dateStr(d = new Date()) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function parseDate(s) {
  const [y, m, d] = s.slice(0, 10).split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(s, n) {
  const d = parseDate(s);
  d.setDate(d.getDate() + n);
  return dateStr(d);
}

export function weekday(s) {
  return parseDate(s).getDay();
}

export function daysBetween(a, b) {
  return Math.round((parseDate(b) - parseDate(a)) / 86400000);
}

export function dt(date, hhmm) {
  return `${date}T${hhmm}`;
}

export function splitDt(s) {
  return { date: s.slice(0, 10), time: s.slice(11, 16) };
}

export function dtToMs(s) {
  const { date, time } = splitDt(s);
  const d = parseDate(date);
  return d.getTime() + toMin(time || '00:00') * 60000;
}

export function msToDt(ms) {
  const d = new Date(ms);
  return `${dateStr(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function addMinutesDt(s, minutes) {
  return msToDt(dtToMs(s) + minutes * 60000);
}

export function minutesBetween(a, b) {
  return Math.round((dtToMs(b) - dtToMs(a)) / 60000);
}

export function nowDt() {
  return msToDt(Date.now());
}

export function today() {
  return dateStr(new Date());
}

// Deadlines may be a date or a datetime; a bare date means "end of that day".
export function deadlineDt(deadline) {
  if (!deadline) return null;
  return deadline.length <= 10 ? `${deadline}T23:59` : deadline;
}

export function startOfWeek(date, weekStart = 0) {
  const wd = weekday(date);
  return addDays(date, -((wd - weekStart + 7) % 7));
}

export function fmtTime(hhmm) {
  const m = toMin(hhmm);
  const h = Math.floor(m / 60) % 24;
  const mm = m % 60;
  const suffix = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${pad(mm)} ${suffix}`;
}

export function fmtDuration(min) {
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (!h) return `${m}m`;
  return m ? `${h}h ${m}m` : `${h}h`;
}

export function fmtDayLabel(date, ref = today()) {
  const diff = daysBetween(ref, date);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Tomorrow';
  if (diff === -1) return 'Yesterday';
  const d = parseDate(date);
  const name = DAY_NAMES[d.getDay()];
  if (diff > 1 && diff < 7) return name;
  return `${name.slice(0, 3)}, ${d.toLocaleString('en-US', { month: 'short' })} ${d.getDate()}`;
}

export function fmtSlot(start, end) {
  const s = splitDt(start);
  const e = splitDt(end);
  return `${fmtDayLabel(s.date)} ${fmtTime(s.time)} – ${fmtTime(e.time)}`;
}
