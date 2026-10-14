process.env.DB_FILE = ':memory:';
import { test } from 'node:test';
import assert from 'node:assert/strict';

const { db, prefsFor } = await import('../src/db.js');
const T = await import('../src/lib/time.js');
const S = await import('../src/lib/scheduler.js');

const uid = db.prepare("INSERT INTO users (name, email, password_hash) VALUES ('A', 'a@a.io', 'x')").run().lastInsertRowid;
prefsFor(uid);
const tomorrow = T.addDays(T.today(), 1);
const wd = T.weekday(tomorrow);
db.prepare("INSERT INTO classes (user_id, course_code, day, start_time, end_time) VALUES (?, 'CSE 327', ?, '09:40', '11:10')").run(uid, wd);

const add = (row) => {
  const cols = Object.keys(row);
  const id = db.prepare(`INSERT INTO academic_items (user_id, ${cols.join(', ')}) VALUES (?, ${cols.map(() => '?').join(', ')})`)
    .run(uid, ...Object.values(row)).lastInsertRowid;
  return db.prepare('SELECT * FROM academic_items WHERE id = ?').get(id);
};
const gaps = () => S.freeSlots(uid, tomorrow, tomorrow)[tomorrow].map((s) => [s.start.slice(11), s.end.slice(11)]);

test('an open meetup is busy time; counseling hours and cancelled meetups are not', () => {
  const m = add({ kind: 'meetup', title: 'Meet Dr. Karim', teacher: 'Dr. Karim', date: tomorrow, start_time: '12:00', end_time: '12:30' });
  add({ kind: 'office_hours', title: 'Counseling hours', teacher: 'Dr. Rahman', day: wd, start_time: '15:00', end_time: '16:00' });
  assert.deepEqual(gaps(), [['08:00', '09:40'], ['11:10', '12:00'], ['12:30', '22:00']]);
  db.prepare("UPDATE academic_items SET status = 'cancelled' WHERE id = ?").run(m.id);
  assert.deepEqual(gaps(), [['08:00', '09:40'], ['11:10', '22:00']]);
});

test('a meetup that overlaps a class is reported with the overlap', () => {
  const m = add({ kind: 'meetup', title: 'Meet Dr. Hasan', teacher: 'Dr. Hasan', date: tomorrow, start_time: '11:00', end_time: '11:30' });
  const c = S.academicClashes(uid, m);
  assert.equal(c.length, 1);
  assert.equal(c[0].kind, 'class');
  assert.equal(c[0].overlapMinutes, 10);
  db.prepare('DELETE FROM academic_items WHERE id = ?').run(m.id);
});

test('plan work fills free time before the deadline, and planning again adds nothing', () => {
  const dl = add({ kind: 'deadline', type: 'project', title: 'Project', course_code: 'CSE 331', due: T.dt(T.addDays(tomorrow, 4), '23:59'), needs_minutes: 300 });
  const r = S.planAcademicWork(uid, dl);
  assert.equal(r.risk, null);
  assert.equal(r.sessions.reduce((s, c) => s + c.minutes, 0), 300);
  assert.ok(new Set(r.sessions.map((s) => s.date)).size >= 2);
  const ids = new Set(r.sessions.map((s) => s.id));
  const busy = S.busyBlocks(uid, T.today(), T.addDays(tomorrow, 4)).filter((b) => !(b.kind === 'task' && ids.has(b.id)));
  for (const s of r.sessions) {
    assert.ok(s.end <= dl.due, `${s.label} is after the deadline`);
    assert.ok(!busy.some((b) => b.start < s.end && b.end > s.start), `${s.label} overlaps`);
  }
  assert.deepEqual(S.academicProgress(dl.id), { doneMinutes: 0, plannedMinutes: 300 });
  assert.equal(S.planAcademicWork(uid, dl).sessions.length, 0);
});

test('booking counseling hours takes the next free occurrence and refuses clashes', () => {
  const clashing = add({ kind: 'office_hours', title: 'Counseling hours', teacher: 'Dr. Karim', room: '405', day: wd, start_time: '10:00', end_time: '10:30' });
  assert.throws(() => S.bookOfficeHour(uid, clashing), /No free counseling slot/);
  const oh = add({ kind: 'office_hours', title: 'Counseling hours', teacher: 'Dr. Karim', room: '405', day: wd, start_time: '16:00', end_time: '16:30' });
  const first = S.bookOfficeHour(uid, oh);
  assert.equal(first.kind, 'meetup');
  assert.equal(first.date, tomorrow);
  assert.equal(first.teacher, 'Dr. Karim');
  const second = S.bookOfficeHour(uid, oh);
  assert.equal(second.date, T.addDays(tomorrow, 7));
});

test('not enough time is reported as risk, and a past deadline is refused', () => {
  const huge = add({ kind: 'deadline', title: 'Thesis', due: T.dt(tomorrow, '23:59'), needs_minutes: 3000 });
  const r = S.planAcademicWork(uid, huge);
  assert.ok(r.risk);
  assert.equal(r.risk.requiredMinutes, 3000);
  assert.ok(r.risk.availableMinutes < 3000);
  assert.ok(r.remaining > 0);
  assert.throws(() => S.planAcademicWork(uid, { ...huge, due: T.dt(T.addDays(T.today(), -1), '10:00') }), /already passed/);
  S.deleteAcademic(uid, huge.id);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM tasks WHERE academic_id = ?').get(huge.id).n, 0);
});

test('deleting a deadline keeps completed sessions and removes the rest', () => {
  const dl = add({ kind: 'deadline', title: 'Essay', due: T.dt(T.addDays(tomorrow, 6), '23:59'), needs_minutes: 120 });
  const r = S.planAcademicWork(uid, dl);
  db.prepare("UPDATE tasks SET status = 'completed' WHERE id = ?").run(r.sessions[0].id);
  S.deleteAcademic(uid, dl.id);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM academic_items WHERE id = ?').get(dl.id).n, 0);
  const left = db.prepare('SELECT status, academic_id FROM tasks WHERE id IN (' + r.sessions.map(() => '?').join(',') + ')').all(...r.sessions.map((s) => s.id));
  assert.deepEqual(left, [{ status: 'completed', academic_id: null }]);
});

const { validateAcademic } = await import('../src/routes/academics.js');

test('validation explains what is missing', () => {
  assert.match(validateAcademic({ kind: 'lecture' }), /deadline, meetup or counseling/);
  assert.match(validateAcademic({ kind: 'deadline', title: 'X' }), /due date/);
  assert.match(validateAcademic({ kind: 'deadline', title: 'X', due: '2026-10-01T23:59', needs_minutes: 5 }), /between 15 minutes/);
  assert.match(validateAcademic({ kind: 'meetup', teacher: 'Dr. K', date: '2026-10-01', start_time: '10:00', end_time: '09:00' }), /end after/);
  assert.match(validateAcademic({ kind: 'office_hours', teacher: 'Dr. K', start_time: '10:00', end_time: '11:00' }), /weekday/);
  assert.equal(validateAcademic({ kind: 'office_hours', teacher: 'Dr. K', day: 0, start_time: '10:00', end_time: '11:00' }), null);
  assert.equal(validateAcademic({ kind: 'deadline', title: 'X', type: 'project', due: '2026-10-01T23:59', needs_minutes: 360 }), null);
});

test('demo data has academics and its meetup clashes with nothing', async () => {
  const { seedDemo } = await import('../src/seed.js');
  const demo = seedDemo();
  const kinds = db.prepare('SELECT kind FROM academic_items WHERE user_id = ?').all(demo).map((r) => r.kind);
  assert.equal(kinds.filter((k) => k === 'deadline').length, 3);
  assert.equal(kinds.filter((k) => k === 'office_hours').length, 2);
  assert.equal(kinds.filter((k) => k === 'meetup').length, 1);
  const project = db.prepare("SELECT * FROM academic_items WHERE user_id = ? AND type = 'project'").get(demo);
  assert.equal(S.academicProgress(project.id).doneMinutes, 120);
  const meetupClashes = S.conflicts(demo, T.today(), T.addDays(T.today(), 13)).filter((c) => c.a.kind === 'meetup' || c.b.kind === 'meetup');
  assert.equal(meetupClashes.length, 0);
});

// HTTP-level checks through the real routers, signed in with a Bearer token.
const { after } = await import('node:test');
const express = (await import('express')).default;
const { sign } = await import('../src/auth.js');
const { router: tasksRouter } = await import('../src/routes/tasks.js');
const { router: academicsRouter } = await import('../src/routes/academics.js');
const { router: accountRouter } = await import('../src/routes/account.js');
const app = express();
app.use(express.json());
app.use('/api/tasks', tasksRouter);
app.use('/api/academics', academicsRouter);
app.use('/api', accountRouter);
app.use((err, req, res, next) => res.status(err.status || 500).json({ error: err.message })); // eslint-disable-line no-unused-vars
const server = app.listen(0);
after(() => server.close());
const call = async (method, path, body) => {
  const r = await fetch(`http://localhost:${server.address().port}/api${path}`, {
    method, headers: { 'content-type': 'application/json', authorization: `Bearer ${sign({ id: uid })}` },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: r.status, body: await r.json() };
};

test('splitting a work session keeps every part linked to its deadline', async () => {
  const dl = add({ kind: 'deadline', title: 'Split me', due: T.dt(T.addDays(tomorrow, 5), '23:59'), needs_minutes: 90 });
  const [s] = S.planAcademicWork(uid, dl).sessions;
  const day = T.addDays(tomorrow, 2);
  const r = await call('POST', `/tasks/${s.id}/split`, { chunks: [
    { start: T.dt(day, '06:00'), end: T.dt(day, '06:45'), minutes: 45 },
    { start: T.dt(day, '22:15'), end: T.dt(day, '23:00'), minutes: 45 },
  ] });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.deepEqual(r.body.tasks.map((t) => t.academic_id), [dl.id, dl.id]);
  assert.equal(S.academicProgress(dl.id).plannedMinutes, 90);
});

test('marking a deadline done removes its unfinished sessions and keeps finished ones', async () => {
  const dl = add({ kind: 'deadline', title: 'Submit early', due: T.dt(T.addDays(tomorrow, 6), '23:59'), needs_minutes: 180 });
  const { sessions } = S.planAcademicWork(uid, dl);
  db.prepare("UPDATE tasks SET status = 'completed' WHERE id = ?").run(sessions[0].id);
  const r = await call('PUT', `/academics/${dl.id}`, { status: 'done' });
  assert.equal(r.status, 200);
  const left = db.prepare('SELECT status FROM tasks WHERE academic_id = ?').all(dl.id).map((x) => x.status);
  assert.deepEqual(left, ['completed']);
});

test('a due date far in the future is refused and planning never scans decades', () => {
  assert.match(validateAcademic({ kind: 'deadline', title: 'X', due: '9999-12-31T23:59' }), /within a year/);
  const t0 = Date.now();
  S.splitPlan(uid, { minutes: 60, deadline: '2080-01-01' });
  assert.ok(Date.now() - t0 < 1000, `splitPlan took ${Date.now() - t0}ms`);
});

test('clearing my data removes academics too', async () => {
  const r = await call('DELETE', '/me/data');
  assert.equal(r.status, 200);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM academic_items WHERE user_id = ?').get(uid).n, 0);
});

test('work sessions in busy blocks carry their academic_id so the calendar can pick them out', () => {
  const dl = add({ kind: 'deadline', title: 'Tagged', due: T.dt(T.addDays(tomorrow, 5), '23:59'), needs_minutes: 60 });
  const [s] = S.planAcademicWork(uid, dl).sessions;
  const block = S.busyBlocks(uid, s.date, s.date).find((b) => b.kind === 'task' && b.id === s.id);
  assert.equal(block.academic_id, dl.id);
});

test('a finished or cancelled deadline cannot be planned', () => {
  const dl = add({ kind: 'deadline', title: 'Old', due: T.dt(T.addDays(tomorrow, 5), '23:59'), needs_minutes: 60, status: 'done' });
  assert.throws(() => S.planAcademicWork(uid, dl), /already done or cancelled/);
});

test('finished sessions of a deleted deadline stop showing as deadline markers', () => {
  const dl = add({ kind: 'deadline', title: 'Gone', due: T.dt(T.addDays(tomorrow, 5), '23:59'), needs_minutes: 60 });
  const [s] = S.planAcademicWork(uid, dl).sessions;
  db.prepare("UPDATE tasks SET status = 'completed' WHERE id = ?").run(s.id);
  S.deleteAcademic(uid, dl.id);
  assert.equal(db.prepare('SELECT deadline FROM tasks WHERE id = ?').get(s.id).deadline, null);
});
