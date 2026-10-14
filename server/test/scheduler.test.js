process.env.DB_FILE = ':memory:';
import { test } from 'node:test';
import assert from 'node:assert/strict';

const { db, prefsFor } = await import('../src/db.js');
const T = await import('../src/lib/time.js');
const S = await import('../src/lib/scheduler.js');

const uid = db.prepare("INSERT INTO users (name, email, password_hash) VALUES ('T', 't@t.io', 'x')").run().lastInsertRowid;
prefsFor(uid);
const tomorrow = T.addDays(T.today(), 1);
const wd = T.weekday(tomorrow);
db.prepare("INSERT INTO classes (user_id, course_code, day, start_time, end_time) VALUES (?, 'CSE 327', ?, '09:40', '11:10')").run(uid, wd);
db.prepare("INSERT INTO classes (user_id, course_code, day, start_time, end_time) VALUES (?, 'MAT 361', ?, '14:00', '15:30')").run(uid, wd);

test('free slots are the gaps between classes inside the working day', () => {
  const free = S.freeSlots(uid, tomorrow, tomorrow)[tomorrow];
  assert.deepEqual(free.map((s) => [s.start.slice(11), s.end.slice(11)]), [
    ['08:00', '09:40'], ['11:10', '14:00'], ['15:30', '22:00'],
  ]);
});

test('suggested slots never overlap busy time and respect the deadline', () => {
  const slots = S.suggestSlots(uid, { minutes: 120, deadline: tomorrow, limit: 10, distinctDays: false });
  assert.ok(slots.length > 0);
  const busy = S.busyBlocks(uid, T.today(), tomorrow);
  for (const s of slots) {
    assert.ok(s.end <= `${tomorrow}T23:59`);
    assert.ok(!busy.some((b) => b.start < s.end && b.end > s.start), `${s.label} overlaps`);
  }
});

test('conflicts report the overlap in minutes', () => {
  const id = db.prepare("INSERT INTO activities (user_id, title, event_date, start_time, end_time, status) VALUES (?, 'Workshop', ?, '15:00', '17:00', 'registered')")
    .run(uid, tomorrow).lastInsertRowid;
  const c = S.conflicts(uid, tomorrow, tomorrow);
  assert.equal(c.length, 1);
  assert.equal(c[0].overlapMinutes, 30);
  db.prepare('DELETE FROM activities WHERE id = ?').run(id);
});

test('moveTask refuses a slot that overlaps a class', () => {
  const id = db.prepare("INSERT INTO tasks (user_id, title, estimated_minutes, status) VALUES (?, 'Essay', 60, 'missed')").run(uid).lastInsertRowid;
  assert.throws(() => S.moveTask(uid, id, T.dt(tomorrow, '10:00'), T.dt(tomorrow, '11:00')), /overlaps CSE 327/);
  const moved = S.moveTask(uid, id, T.dt(tomorrow, '12:00'), T.dt(tomorrow, '13:00'));
  assert.equal(moved.status, 'pending');
});

test('split plan covers the full duration across free slots', () => {
  const plan = S.splitPlan(uid, { minutes: 180, deadline: T.addDays(tomorrow, 3) });
  assert.equal(plan.possible, true);
  assert.equal(plan.chunks.reduce((s, c) => s + c.minutes, 0), 180);
  assert.ok(new Set(plan.chunks.map((c) => c.date)).size >= 2);
});

test('deadline risk flags work that cannot fit before its deadline', () => {
  // 50h of work due tomorrow cannot fit in the remaining free time.
  db.prepare("INSERT INTO tasks (user_id, title, estimated_minutes, deadline, status) VALUES (?, 'Huge report', 3000, ?, 'pending')").run(uid, tomorrow);
  const risks = S.deadlineRisks(uid);
  assert.ok(risks.some((r) => r.task.title === 'Huge report' && r.availableMinutes < 3000));
});

test('classes only repeat inside the semester', () => {
  db.prepare('UPDATE user_preferences SET semester_start = ?, semester_end = ? WHERE user_id = ?').run(T.addDays(tomorrow, 1), T.addDays(tomorrow, 90), uid);
  assert.equal(S.busyBlocks(uid, tomorrow, tomorrow).filter((b) => b.kind === 'class').length, 0);
  assert.ok(S.busyBlocks(uid, T.addDays(tomorrow, 7), T.addDays(tomorrow, 7)).some((b) => b.kind === 'class'));
  db.prepare('UPDATE user_preferences SET semester_start = NULL, semester_end = NULL WHERE user_id = ?').run(uid);
});
