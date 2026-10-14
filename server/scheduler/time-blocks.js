// Busy blocks (classes, activities, meetups, tasks) and the free time between them.
import { db, prefsFor } from '../../db.js';
import * as T from '../time.js';

export const ACTIVE_STATUSES = ['pending', 'in_progress', 'rescheduled'];

export const MIN_SLOT = 30;

export function busyBlocks(userId, from, to, { excludeTaskId = null, includeCompleted = true, extra = [] } = {}) {
  const blocks = [];
  const classes = db.prepare('SELECT * FROM classes WHERE user_id = ?').all(userId);
  // Classes only repeat inside the semester, when one is set.
  const { semester_start: semStart, semester_end: semEnd } = prefsFor(userId);
  for (let d = from; d <= to; d = T.addDays(d, 1)) {
    if ((semStart && d < semStart) || (semEnd && d > semEnd)) continue;
    const wd = T.weekday(d);
    for (const c of classes) {
      if (c.day !== wd) continue;
      blocks.push({
        kind: 'class', id: c.id, date: d,
        title: c.title ? `${c.course_code} · ${c.title}` : c.course_code,
        start: T.dt(d, c.start_time), end: T.dt(d, c.end_time),
        room: c.room, instructor: c.instructor, status: 'scheduled',
      });
    }
  }

  const acts = db.prepare(
    `SELECT * FROM activities WHERE user_id = ? AND event_date BETWEEN ? AND ?
     AND status != 'cancelled' AND start_time IS NOT NULL AND end_time IS NOT NULL`
  ).all(userId, from, to);
  for (const a of acts) {
    blocks.push({
      kind: 'activity', id: a.id, date: a.event_date, title: a.title, category: a.category,
      start: T.dt(a.event_date, a.start_time), end: T.dt(a.event_date, a.end_time),
      location: a.location, status: a.status, priority: a.priority,
    });
  }

  const meetups = db.prepare(
    `SELECT * FROM academic_items WHERE user_id = ? AND kind = 'meetup' AND status != 'cancelled' AND date BETWEEN ? AND ?`
  ).all(userId, from, to);
  for (const m of meetups) {
    blocks.push({
      kind: 'meetup', id: m.id, date: m.date, title: m.title,
      start: T.dt(m.date, m.start_time), end: T.dt(m.date, m.end_time),
      location: m.room ? `Room ${m.room}` : m.teacher, category: 'Counseling', teacher: m.teacher, status: m.status,
    });
  }

  const statuses = includeCompleted ? [...ACTIVE_STATUSES, 'completed'] : ACTIVE_STATUSES;
  const tasks = db.prepare(
    `SELECT t.* FROM tasks t
     WHERE t.user_id = ? AND t.scheduled_start BETWEEN ? AND ?
     AND t.status IN (${statuses.map(() => '?').join(',')})`
  ).all(userId, `${from}T00:00`, `${to}T23:59`, ...statuses);
  for (const t of tasks) {
    if (t.id === excludeTaskId) continue;
    blocks.push({
      kind: 'task', id: t.id, date: t.scheduled_start.slice(0, 10), title: t.title,
      start: t.scheduled_start, end: t.scheduled_end, status: t.status, priority: t.priority,
      deadline: t.deadline, academic_id: t.academic_id,
    });
  }

  blocks.push(...extra);
  return blocks.sort((a, b) => a.start.localeCompare(b.start));
}

// Working window for a day: user's day hours, trimmed by sleep, and by "now" when the day is today.
function dayWindow(prefs, date, nowDt) {
  let ws = T.toMin(prefs.day_start);
  let we = T.toMin(prefs.day_end);
  const ss = T.toMin(prefs.sleep_start);
  const se = T.toMin(prefs.sleep_end);
  if (ss > se) {
    we = Math.min(we, ss);
    ws = Math.max(ws, se);
  }
  const { date: nd, time: nt } = T.splitDt(nowDt);
  if (date === nd) ws = Math.max(ws, Math.ceil(T.toMin(nt) / 15) * 15);
  if (date < nd) return null;
  return we - ws >= MIN_SLOT ? [ws, we] : null;
}

export function freeSlotsFromBlocks(prefs, blocks, from, to, { minMinutes = MIN_SLOT, nowDt = T.nowDt() } = {}) {
  const byDate = {};
  for (let d = from; d <= to; d = T.addDays(d, 1)) {
    const win = dayWindow(prefs, d, nowDt);
    byDate[d] = [];
    if (!win) continue;
    const busy = blocks
      .filter((b) => b.date === d)
      .map((b) => [T.toMin(T.splitDt(b.start).time), T.toMin(T.splitDt(b.end).time)])
      .sort((a, b) => a[0] - b[0]);
    let cursor = win[0];
    for (const [s, e] of busy) {
      if (s > cursor) pushGap(byDate[d], d, cursor, Math.min(s, win[1]), minMinutes);
      cursor = Math.max(cursor, e);
      if (cursor >= win[1]) break;
    }
    if (cursor < win[1]) pushGap(byDate[d], d, cursor, win[1], minMinutes);
  }
  return byDate;
}

function pushGap(list, date, s, e, minMinutes) {
  if (e - s < minMinutes) return;
  list.push({ date, start: T.dt(date, T.fromMin(s)), end: T.dt(date, T.fromMin(e)), minutes: e - s });
}

export function freeSlots(userId, from, to, opts = {}) {
  const prefs = prefsFor(userId);
  const blocks = busyBlocks(userId, from, to, { excludeTaskId: opts.excludeTaskId, extra: opts.extra || [] });
  return freeSlotsFromBlocks(prefs, blocks, from, to, opts);
}

export function freeMinutesUntil(userId, deadline, { excludeTaskId = null } = {}) {
  const now = T.nowDt();
  const dl = T.deadlineDt(deadline);
  if (!dl || dl <= now) return 0;
  const from = now.slice(0, 10);
  const to = dl.slice(0, 10);
  const slots = freeSlots(userId, from, to, { excludeTaskId, nowDt: now });
  let total = 0;
  for (const list of Object.values(slots)) {
    for (const s of list) {
      const end = s.end > dl ? dl : s.end;
      if (end > s.start) total += T.minutesBetween(s.start, end);
    }
  }
  return total;
}

export function loadByDate(blocks) {
  const load = {};
  for (const b of blocks) load[b.date] = (load[b.date] || 0) + T.minutesBetween(b.start, b.end);
  return load;
}
