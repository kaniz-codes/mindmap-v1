// The scheduling engine. Everything about real time lives here: busy blocks,
// free slots, conflicts, workload, slot ranking, splitting and deadline risk.
// The AI layer only ever reads what these modules compute.
export * from './scheduler/time-blocks.js';
export * from './scheduler/workload.js';
export * from './scheduler/placement.js';
export * from './scheduler/tasks.js';
export * from './scheduler/goals.js';
