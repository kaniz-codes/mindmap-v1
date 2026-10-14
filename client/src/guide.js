// The user manual. Each chapter has short steps to read and a "Show me" tour that
// points at the real screen. Tour targets are `data-tour` attributes in the pages.

export const TOURS = {
  dashboard: {
    path: '/',
    steps: [
      { mood: 'wave', title: "Hi, I'm Miso!", text: 'MIND MAP keeps your classes, deadlines and activities in one plan. Let me show you around.' },
      { target: 'smart-add', mood: 'happy', title: 'Add anything here', text: 'Type it the way you would say it: "Lab report 2h by Friday". I put it in your free time, around your classes.' },
      { target: 'today', mood: 'think', title: 'Your day, in order', text: 'Tick things off as you go. Missed something? Tap Later and it moves to your next free slot.' },
      { target: 'mood', mood: 'sleepy', title: 'Rough day?', text: 'Turn on Hard day mode and I show just one thing at a time.' },
      { target: 'nav', mood: 'happy', title: 'Everything else', text: 'Your schedule, academics and extracurricular activities.' },
    ],
  },
  classes: {
    path: '/academics?tab=routine',
    steps: [
      { target: 'classes-actions', mood: 'happy', title: 'Add your routine once', text: 'Import a photo or screenshot of your routine, or add classes by hand. Nothing is saved until you check it.' },
      { target: 'classes-grid', mood: 'think', title: 'Your week of classes', text: 'Classes repeat every week. Click one to edit or delete it. Everything else is planned around these.' },
    ],
  },
  academics: {
    path: '/academics',
    steps: [
      { target: 'ac-add', mood: 'happy', title: 'Deadlines and meetups', text: 'Add a project, assignment or exam, a meetup with a teacher, or their weekly counseling hours.' },
      { target: 'ac-calendar', mood: 'think', title: 'Your academic week', text: 'Classes, meetups and work sessions. Other plans stay faint so you see why time is taken.' },
      { target: 'ac-tasks', mood: 'love', title: 'Plan the work', text: 'Say how many hours a deadline needs, press Plan, and I put the sessions in your free time.' },
    ],
  },
  schedule: {
    path: '/schedule',
    steps: [
      { target: 'schedule-tabs', mood: 'happy', title: 'Day, week or month', text: 'Switch between day, week and month here.' },
      { target: 'schedule-nav', mood: 'think', title: 'Move through time', text: 'Use the arrows to go back or forward. "Today" jumps back to now.' },
      { target: 'schedule-view', mood: 'happy', title: 'Everything in one place', text: 'Classes, tasks and activities in order. The gaps are your free time, and that is where new work goes.' },
    ],
  },
  activities: {
    path: '/extracurricular',
    steps: [
      { target: 'act-add', mood: 'happy', title: 'Clubs, events, competitions', text: 'Add anything outside class. I warn you if it clashes with a class.' },
      { target: 'act-tabs', mood: 'think', title: 'Keep track', text: 'See what is coming, what you registered for, and what you already did.' },
    ],
  },
  settings: {
    path: '/settings',
    steps: [
      { target: 'set-day', mood: 'think', title: 'Your day', text: 'Tell me when you wake, sleep and like to study. I only plan inside these hours.' },
      { target: 'set-look', mood: 'happy', title: 'Look and sound', text: 'Light or dark, sounds on or off, and you can hide me here too.' },
    ],
  },
};

export const CHAPTERS = [
  { id: 'start', tour: 'dashboard', title: 'Getting started', steps: ['Open the Dashboard to see today in order.', 'Type anything in the add box. It lands in your free time.', 'Tick tasks when done. Untick to undo.'] },
  { id: 'classes', tour: 'classes', title: 'Add your class routine', steps: ['Go to Academics → Routine.', 'Add your classes one by one.', 'Check the rows, then press "Looks correct".'] },
  { id: 'academics', tour: 'academics', title: 'Deadlines and counseling', steps: ['Open Academics and press Add.', 'For a deadline, say how many hours it needs, then press Plan.', 'Add a teacher\'s counseling hours and press Book to reserve the next free one.'] },
  { id: 'plan', tour: 'schedule', title: 'See your day, week or month', steps: ['Open My Schedule.', 'Pick Day, Week or Month.', 'Free time shows as gaps. New work goes there.'] },
  { id: 'missed', tour: 'dashboard', title: 'Missed a task?', steps: ['Missed tasks show in red at the top of Today.', 'Tap Later to move it to the next free slot (Undo is there too).'] },
  { id: 'hard', tour: 'dashboard', title: 'Hard days', steps: ['Press "Hard day?" on the Dashboard.', 'You see one thing at a time, with Done and Later.', 'I can move smaller tasks to later this week for you.'] },
  { id: 'activities', tour: 'activities', title: 'Clubs and events', steps: ['Open Extracurricular and add an activity.', 'Mark it registered, then attended.', 'Clashes with classes show in red.'] },
  { id: 'settings', tour: 'settings', title: 'Make it yours', steps: ['Set your day and sleep hours in Settings.', 'Switch light or dark mode, and sounds on or off.'] },
];
