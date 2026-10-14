// Task state changes the scheduler owns: moving, marking missed, deadline risk.
import { db, logHistory } from '../../db.js';
import * as T from '../time.js';
import { busyBlocks, freeMinutesUntil } from './time-blocks.js';

export function httpError(status, message, extra = {}) {
  const e = new Error(message);
  e.status = status;
  Object.assign(e, extra);
  return e;
}

// Move a task, but only into time the backend agrees is free.
export function moveTask(userId, taskId, start, end) {
  const task = db.prepare('SELECT * FROM tasks WHERE id = ? AND user_id = ?').get(taskId, userId);
  if (!task) throw httpError(404, 'Task not found');
  if (end <= start) throw httpError(400, 'End must be after start');
  const date = start.slice(0, 10);
  const clash = busyBlocks(userId, date, date, { excludeTaskId: taskId, includeCompleted: false })
    .find((b) => b.start < end && b.end > start);
  if (clash) throw httpError(409, `That time overlaps ${clash.title}`, { clash });
  const wasScheduled = !!task.scheduled_start;
  db.prepare(
    `UPDATE tasks SET scheduled_start = ?, scheduled_end = ?, status = ?, reschedule_count = reschedule_count + ? WHERE id = ?`
  ).run(start, end, wasScheduled ? 'rescheduled' : 'pending', wasScheduled ? 1 : 0, taskId);
  logHistory(userId, taskId, wasScheduled ? 'rescheduled' : 'scheduled', { from: task.scheduled_start, to: start });
  return db.prepare('SELECT * FROM tasks WHERE id = ?').get(taskId);
}

// A task whose scheduled day has ended without completion is missed.
export function sweepMissed(userId) {
  const todayDate = T.today();
  const stale = db.prepare(
    `SELECT id, title, scheduled_start FROM tasks WHERE user_id = ? AND status IN ('pending','in_progress','rescheduled')
     AND scheduled_start IS NOT NULL AND substr(scheduled_start, 1, 10) < ?`
  ).all(userId, todayDate);
  const mark = db.prepare(`UPDATE tasks SET status = 'missed' WHERE id = ?`);
  for (const t of stale) {
    mark.run(t.id);
    logHistory(userId, t.id, 'missed', { from: t.scheduled_start });
  }
  return stale.length;
}

// Tasks that still need a time before their deadline, checked cumulatively.
export function deadlineRisks(userId) {
  const now = T.nowDt();
  const open = db.prepare(
    `SELECT t.* FROM tasks t
     WHERE t.user_id = ? AND t.deadline IS NOT NULL
     AND t.status IN ('pending','in_progress','rescheduled','missed')
     AND (t.scheduled_start IS NULL OR t.status = 'missed' OR t.scheduled_end > (CASE WHEN length(t.deadline) <= 10 THEN t.deadline || 'T23:59' ELSE t.deadline END))
     ORDER BY t.deadline`
  ).all(userId);
  const risks = [];
  let cumulative = 0;
  for (const t of open) {
    const dl = T.deadlineDt(t.deadline);
    if (dl <= now) continue;
    cumulative += t.estimated_minutes;
    const available = freeMinutesUntil(userId, t.deadline);
    if (cumulative > available || t.estimated_minutes > available) {
      risks.push({ task: t, requiredMinutes: t.estimated_minutes, cumulativeMinutes: cumulative, availableMinutes: available });
    }
  }
  return risks;
}

// Consecutive days (ending today, or yesterday if nothing is done yet today) with a finished task.
export function streakFor(userId) {
  const days = new Set(
    db.prepare("SELECT DISTINCT substr(completed_at, 1, 10) AS d FROM tasks WHERE user_id = ? AND status = 'completed' AND completed_at IS NOT NULL")
      .all(userId).map((r) => r.d)
  );
  let d = T.today();
  if (!days.has(d)) d = T.addDays(d, -1);
  let n = 0;
  while (days.has(d)) {
    n++;
    d = T.addDays(d, -1);
  }
  return n;
}
