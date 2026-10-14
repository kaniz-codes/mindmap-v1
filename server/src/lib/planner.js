// Roadmap generation. The AI drafts milestones and tasks; the scheduler decides when they happen.
import { db } from '../db.js';
import * as T from './time.js';
import { askJson } from './ai.js';
import { simulatePlacement, freeMinutesUntil, workload } from './scheduler.js';

const DIFFICULTIES = ['easy', 'moderate', 'hard'];
const PRIORITIES = ['high', 'medium', 'low'];

const TEMPLATES = [
  {
    match: /front ?end|react|web|javascript|html|css/i,
    milestones: [
      ['HTML & CSS Foundations', 'Pages that are structured properly and look right on any screen.', 3, [
        ['Learn semantic HTML', 90, 'easy', [['MDN HTML elements', 'https://developer.mozilla.org/en-US/docs/Web/HTML/Element']]],
        ['Learn Flexbox', 90, 'easy', [['CSS Tricks: Flexbox guide', 'https://css-tricks.com/snippets/css/a-guide-to-flexbox/']]],
        ['Learn CSS Grid', 90, 'moderate', [['CSS Tricks: Grid guide', 'https://css-tricks.com/snippets/css/complete-guide-grid/']]],
        ['Build a landing page', 120, 'moderate', [['freeCodeCamp responsive design', 'https://www.freecodecamp.org/learn/2022/responsive-web-design/']]],
      ]],
      ['JavaScript Fundamentals', 'The language itself, before any framework.', 4, [
        ['Variables, types and functions', 90, 'easy', [['javascript.info basics', 'https://javascript.info/first-steps']]],
        ['Arrays, objects and loops', 120, 'moderate', [['javascript.info data types', 'https://javascript.info/data-types']]],
        ['DOM and events', 120, 'moderate', [['MDN DOM intro', 'https://developer.mozilla.org/en-US/docs/Web/API/Document_Object_Model/Introduction']]],
        ['Async JS and fetch', 120, 'hard', [['javascript.info promises', 'https://javascript.info/async']]],
        ['Build a to-do app in vanilla JS', 150, 'moderate', []],
      ]],
      ['React Essentials', 'Components, state and the patterns every React job expects.', 4, [
        ['Components and props', 90, 'easy', [['react.dev: Describing the UI', 'https://react.dev/learn/describing-the-ui']]],
        ['State and hooks', 120, 'moderate', [['react.dev: Managing state', 'https://react.dev/learn/managing-state']]],
        ['Effects and data fetching', 120, 'hard', [['react.dev: Synchronizing with effects', 'https://react.dev/learn/synchronizing-with-effects']]],
        ['Build a React weather app', 180, 'moderate', []],
      ]],
      ['Portfolio & Job Prep', 'Show the work and get it in front of people.', 2, [
        ['Build a portfolio site', 180, 'moderate', []],
        ['Write project READMEs and deploy', 90, 'easy', [['Vercel docs', 'https://vercel.com/docs']]],
      ]],
    ],
  },
  {
    match: /ielts|toefl|english|language/i,
    milestones: [
      ['Know the Test', 'Format, scoring and a baseline score.', 1, [
        ['Take a full diagnostic test', 170, 'moderate', [['British Council practice tests', 'https://takeielts.britishcouncil.org/take-ielts/prepare/free-ielts-english-practice-tests']]],
        ['Review band descriptors', 60, 'easy', []],
      ]],
      ['Listening & Reading', 'Speed and accuracy on the two objective sections.', 4, [
        ['Listening section drills', 120, 'moderate', []],
        ['Reading: skimming and scanning', 90, 'moderate', []],
        ['True/False/Not Given practice', 90, 'hard', []],
      ]],
      ['Writing & Speaking', 'Structure first, then fluency.', 4, [
        ['Task 1 report structures', 90, 'moderate', []],
        ['Task 2 essay practice', 120, 'hard', []],
        ['Speaking part 2 cue cards', 60, 'moderate', []],
      ]],
      ['Mock Exams', 'Timed full tests and targeted fixes.', 2, [
        ['Full timed mock test', 170, 'hard', []],
        ['Review mistakes and weak areas', 90, 'moderate', []],
      ]],
    ],
  },
  {
    match: /research|paper|thesis|publication/i,
    milestones: [
      ['Literature Review', 'Know what has been done and where the gap is.', 3, [
        ['Collect 20 key papers', 120, 'moderate', [['Google Scholar', 'https://scholar.google.com']]],
        ['Summarize and compare methods', 180, 'hard', []],
        ['Write the problem statement', 90, 'moderate', []],
      ]],
      ['Method & Experiments', 'Build it, run it, record everything.', 5, [
        ['Set up baseline experiments', 180, 'hard', []],
        ['Run main experiments', 180, 'hard', []],
        ['Analyze results', 120, 'moderate', []],
      ]],
      ['Writing', 'Turn results into a paper.', 3, [
        ['Draft introduction and related work', 150, 'moderate', [['Overleaf', 'https://www.overleaf.com']]],
        ['Draft method and results', 180, 'hard', []],
        ['Revise with supervisor feedback', 120, 'moderate', []],
      ]],
    ],
  },
];

function genericTemplate(goal) {
  return [
    ['Get Oriented', `Understand what "${goal.title}" really takes.`, 1, [
      ['Research what the goal requires', 60, 'easy', []],
      ['Set a baseline and write a plan', 60, 'easy', []],
    ]],
    ['Core Skills', 'Build the fundamentals in short, regular sessions.', 3, [
      ['Core session 1', 90, 'moderate', []],
      ['Core session 2', 90, 'moderate', []],
      ['Core session 3', 90, 'moderate', []],
    ]],
    ['Practice', 'Apply it to something real.', 3, [
      ['Practice project, part 1', 120, 'moderate', []],
      ['Practice project, part 2', 120, 'hard', []],
    ]],
    ['Finish Line', 'Review, polish and wrap up.', 1, [
      ['Review and polish', 90, 'moderate', []],
    ]],
  ];
}

function fromTemplate(goal) {
  const tpl = TEMPLATES.find((t) => t.match.test(`${goal.title} ${goal.description || ''}`));
  const rows = tpl ? tpl.milestones : genericTemplate(goal);
  return {
    summary: null,
    milestones: rows.map(([title, description, weeks, tasks], i) => ({
      title, description, duration_weeks: weeks,
      tasks: tasks.map(([tt, minutes, difficulty, resources], j) => ({
        title: tt, description: '', estimated_minutes: minutes, difficulty,
        priority: i === 0 || j === 0 ? 'high' : 'medium',
        resources: resources.map(([rt, url]) => ({ title: rt, url })),
      })),
    })),
  };
}

// Models invent deep links (video ids, community file ids). Keep only URLs that look like stable pages.
function safeUrl(url) {
  if (!url || !/^https:\/\/[\w.-]+\.[a-z]{2,}(\/|$)/i.test(url)) return null;
  if (/watch\?v=|youtu\.be\/|\/file\/\d|\/gallery\/\d|\d{6,}/.test(url)) return null;
  return url;
}

function clean(draft, goal) {
  const milestones = (draft?.milestones || []).slice(0, 8).map((m) => ({
    title: String(m.title || 'Milestone').slice(0, 120),
    description: String(m.description || '').slice(0, 400),
    duration_weeks: Math.max(0.5, Math.min(26, Number(m.duration_weeks) || 1)),
    tasks: (m.tasks || []).slice(0, 8).map((t) => ({
      title: String(t.title || 'Task').slice(0, 140),
      description: String(t.description || '').slice(0, 400),
      estimated_minutes: Math.max(30, Math.min(240, Math.round((Number(t.estimated_minutes) || 60) / 15) * 15)),
      difficulty: DIFFICULTIES.includes(t.difficulty) ? t.difficulty : 'moderate',
      priority: PRIORITIES.includes(t.priority) ? t.priority : goal.priority || 'medium',
      resources: (t.resources || []).slice(0, 3).map((r) => ({ title: String(r.title || r.url || 'Resource').slice(0, 80), url: safeUrl(r.url) })),
    })).filter((t) => t.title),
  })).filter((m) => m.tasks.length);
  return milestones.length ? { summary: draft.summary || null, milestones } : null;
}

const SYSTEM = `You are the planning engine of MIND MAP, a student planner.
Draft a realistic learning roadmap as JSON only. Shape:
{"summary": string, "milestones": [{"title": string, "description": string (one sentence), "duration_weeks": number,
 "tasks": [{"title": string, "description": string, "estimated_minutes": integer (30-240), "difficulty": "easy"|"moderate"|"hard",
 "priority": "high"|"medium"|"low", "resources": [{"title": string, "url": string}]}]}]}
Rules: 3-6 milestones, 2-6 tasks each, 30-180 minutes per task. Total task time must fit the student's weekly hours times the weeks available
(aim for 60-80% of that capacity). Resources: well-known free sources only (official docs, MDN, freeCodeCamp, Khan Academy, Coursera,
help centers). Link to stable top-level pages you are sure exist; never invent video or file ids. If unsure, url null. Do NOT include dates or times; the
scheduler assigns them. Keep titles short and concrete. Summary: one friendly sentence about the approach, with no
numbers, durations or dates in it (the app adds those itself).`;

export async function generateRoadmap(userId, goal) {
  const now = T.nowDt();
  const deadline = goal.deadline || T.addDays(T.today(), 120);
  const weeks = Math.max(1, Math.round(T.daysBetween(T.today(), deadline) / 7));
  const freeWeek = freeMinutesUntil(userId, T.addDays(T.today(), 7));
  const load = workload(userId, T.today(), T.addDays(T.today(), 6));
  const otherGoals = db.prepare("SELECT title, weekly_hours FROM goals WHERE user_id = ? AND id != ? AND status = 'active'").all(userId, goal.id);
  const classes = db.prepare('SELECT COUNT(*) AS n FROM classes WHERE user_id = ?').get(userId).n;

  const prompt = JSON.stringify({
    goal: goal.title, description: goal.description, current_level: goal.current_level,
    existing_knowledge: goal.existing_knowledge, weekly_hours_available: goal.weekly_hours,
    weeks_until_deadline: weeks, preferred_study_time: goal.preferred_time, budget: goal.budget, notes: goal.notes,
    context: {
      weekly_classes: classes,
      free_hours_next_7_days: Math.round(freeWeek / 60),
      this_week_load: load.mood,
      other_active_goals: otherGoals,
    },
  });

  let draft = null;
  let source = 'fallback';
  const ai = await askJson(SYSTEM, prompt);
  if (ai) {
    draft = clean(ai.data, goal);
    if (draft) source = ai.provider;
  }
  if (!draft) draft = clean(fromTemplate(goal), goal);

  const sim = simulatePlacement(userId, goal, draft.milestones, { notBefore: now });
  const totalMinutes = sim.milestones.flatMap((m) => m.tasks).reduce((s, t) => s + t.estimated_minutes, 0);
  const taskCount = sim.milestones.reduce((s, m) => s + m.tasks.length, 0);
  return {
    source,
    aiSummary: draft.summary || null,
    summary: summaryLine({ goal, sim, totalMinutes, weeks, aiSummary: draft.summary }),
    stats: { milestones: sim.milestones.length, tasks: taskCount, totalMinutes, weeklyMinutes: sim.weeklyMinutes, finishDate: sim.finishDate, unplaced: sim.unplaced },
    milestones: sim.milestones,
  };
}

// The numbers in this sentence come from the placement simulation, never from the model.
export function summaryLine({ goal, sim, totalMinutes, weeks, aiSummary }) {
  const hours = Math.round(totalMinutes / 60);
  const perWeek = Math.round(sim.weeklyMinutes / 60);
  let line = `${sim.milestones.length} milestones, ${hours}h of work at up to ${perWeek}h a week.`;
  if (sim.finishDate) {
    const d = T.parseDate(sim.finishDate);
    line += ` Placed only in time you are actually free, it wraps up around ${d.toLocaleString('en-US', { month: 'short', day: 'numeric' })}`;
    if (goal.deadline) line += sim.finishDate <= goal.deadline ? ', before your deadline.' : ', which is after your deadline.';
    else line += '.';
  }
  if (sim.unplaced) line += ` ${sim.unplaced} task${sim.unplaced > 1 ? 's' : ''} could not fit before the deadline.`;
  return aiSummary ? `${aiSummary.trim()} ${line}` : line;
}
