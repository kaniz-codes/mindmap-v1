// Academics: deadlines turn into work sessions, counseling hours turn into meetups.
import { db } from '../../db.js';
import * as T from '../time.js';
import { busyBlocks } from './time-blocks.js';
import { splitPlan } from './placement.js';
import { httpError } from './tasks.js';

export const ACADEMIC_KINDS = ['deadline', 'meetup', 'office_hours'];
export const DEADLINE_TYPES = ['assignment', 'project', 'exam', 'presentation'];

// Missed sessions still count as planned: they get moved with Later, not re-planned.
export function academicProgress(itemId) {
  const r = db.prepare(
    `SELECT COALESCE(SUM(CASE WHEN status = 'completed' THEN estimated_minutes END), 0) AS done,
            COALESCE(SUM(CASE WHEN status != 'cancelled' THEN estimated_minutes END), 0) AS planned
     FROM tasks WHERE academic_id = ?`
  ).get(itemId);
  return { doneMinutes: r.done, plannedMinutes: r.planned };
}

// Plan only the part of the estimate that has no session yet, so pressing it twice is safe.
export function planAcademicWork(userId, item) {
  if (item.kind !== 'deadline') throw httpError(400, 'Only deadlines can be planned');
  if (item.status !== 'open') throw httpError(400, 'This deadline is already done or cancelled');
  if (!item.needs_minutes) throw httpError(400, 'Add how long it needs first');
  if (T.deadlineDt(item.due) <= T.nowDt()) throw httpError(400, 'This deadline has already passed');
  const remaining = item.needs_minutes - academicProgress(item.id).plannedMinutes;
  if (remaining <= 0) return { sessions: [], risk: null, remaining: 0 };

  const plan = splitPlan(userId, { minutes: remaining, deadline: item.due, piece: 90 });
  const title = item.course_code ? `${item.course_code}: ${item.title}` : item.title;
  const priority = item.type === 'exam' ? 'high' : 'medium';
  const ins = db.prepare(
    `INSERT INTO tasks (user_id, academic_id, title, estimated_minutes, scheduled_start, scheduled_end, deadline, priority, status)
     VALUES (?,?,?,?,?,?,?,?, 'pending')`
  );
  const sessions = plan.chunks.map((c) => ({
    ...c, id: ins.run(userId, item.id, title, c.minutes, c.start, c.end, item.due, priority).lastInsertRowid,
  }));
  const risk = plan.possible ? null : { requiredMinutes: remaining, availableMinutes: remaining - plan.missingMinutes };
  return { sessions, risk, remaining: plan.missingMinutes };
}

// Next occurrence of a teacher's weekly counseling hours that doesn't clash with anything.
export function bookOfficeHour(userId, item) {
  if (item.kind !== 'office_hours') throw httpError(400, 'Only counseling hours can be booked');
  const now = T.nowDt();
  for (let i = 0, d = T.today(); i < 28; i++, d = T.addDays(d, 1)) {
    if (T.weekday(d) !== item.day) continue;
    const start = T.dt(d, item.start_time);
    const end = T.dt(d, item.end_time);
    if (start <= now) continue;
    if (busyBlocks(userId, d, d, { includeCompleted: false }).some((b) => b.start < end && b.end > start)) continue;
    const id = db.prepare(
      `INSERT INTO academic_items (user_id, kind, title, course_code, teacher, room, date, start_time, end_time)
       VALUES (?, 'meetup', ?, ?, ?, ?, ?, ?, ?)`
    ).run(userId, `Meet ${item.teacher || item.title}`, item.course_code, item.teacher, item.room, d, item.start_time, item.end_time).lastInsertRowid;
    return db.prepare('SELECT * FROM academic_items WHERE id = ?').get(id);
  }
  throw httpError(409, 'No free counseling slot in the next 4 weeks');
}

// Overlaps for a meetup, so the UI can warn right after saving.
export function academicClashes(userId, item) {
  if (item.kind !== 'meetup' || item.status === 'cancelled') return [];
  const start = T.dt(item.date, item.start_time);
  const end = T.dt(item.date, item.end_time);
  return busyBlocks(userId, item.date, item.date, { includeCompleted: false })
    .filter((b) => !(b.kind === 'meetup' && b.id === item.id) && b.start < end && b.end > start)
    .map((b) => ({ ...b, overlapMinutes: T.minutesBetween(b.start > start ? b.start : start, b.end < end ? b.end : end) }));
}

// Unfinished sessions go when the deadline is done, cancelled or deleted; finished ones stay as history.
export function dropOpenSessions(userId, id) {
  db.prepare("DELETE FROM tasks WHERE academic_id = ? AND user_id = ? AND status != 'completed'").run(id, userId);
}

export function deleteAcademic(userId, id) {
  dropOpenSessions(userId, id);
  db.prepare('UPDATE tasks SET academic_id = NULL, deadline = NULL WHERE academic_id = ? AND user_id = ?').run(id, userId);
  db.prepare('DELETE FROM academic_items WHERE id = ? AND user_id = ?').run(id, userId);
}
