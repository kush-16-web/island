/**
 * Island Tasks / To-Do Manager (Phase 1B.2)
 *
 * Provides persistent task tracking for the Idle Notch ("2/7 completed")
 * and Little Island LauncherPanel.
 */

const STORAGE_KEY = 'island_tasks_list';

export const DEFAULT_TASKS = [
  { id: 'task-1', title: 'Review morning telemetry', completed: true, createdAt: Date.now() - 3600000 },
  { id: 'task-2', title: 'Calibrate weather sensors', completed: true, createdAt: Date.now() - 3000000 },
  { id: 'task-3', title: 'Design idle widget layout', completed: false, createdAt: Date.now() - 2400000 },
  { id: 'task-4', title: 'Check audio spectrum visualizer', completed: false, createdAt: Date.now() - 1800000 },
  { id: 'task-5', title: 'Prepare project milestones', completed: false, createdAt: Date.now() - 1200000 },
  { id: 'task-6', title: 'Schedule weekly sync', completed: false, createdAt: Date.now() - 600000 },
  { id: 'task-7', title: 'Sync Island AI companion mood', completed: false, createdAt: Date.now() },
];

export function getTasks() {
  if (typeof window === 'undefined' || !window.localStorage) {
    return [...DEFAULT_TASKS];
  }
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(DEFAULT_TASKS));
      return [...DEFAULT_TASKS];
    }
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [...DEFAULT_TASKS];
  } catch {
    return [...DEFAULT_TASKS];
  }
}

export function saveTasks(tasks) {
  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks));
      window.dispatchEvent(new CustomEvent('island:tasks-changed', { detail: tasks }));
    } catch {}
  }
  return tasks;
}

export function addTask(title) {
  if (!title || !title.trim()) return getTasks();
  const tasks = getTasks();
  const newTask = {
    id: `task-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    title: title.trim(),
    completed: false,
    createdAt: Date.now(),
  };
  const next = [newTask, ...tasks];
  return saveTasks(next);
}

export function toggleTask(id) {
  const tasks = getTasks();
  const next = tasks.map((t) =>
    t.id === id ? { ...t, completed: !t.completed, completedAt: !t.completed ? Date.now() : null } : t
  );
  return saveTasks(next);
}

export function deleteTask(id) {
  const tasks = getTasks();
  const next = tasks.filter((t) => t.id !== id);
  return saveTasks(next);
}

export function clearTasks() {
  return saveTasks([]);
}

export function getTaskStats(tasks = null) {
  const current = tasks || getTasks();
  const total = current.length;
  const completed = current.filter((t) => t.completed).length;
  const pending = total - completed;
  const ratio = total > 0 ? `${completed}/${total}` : '0/0';
  const percent = total > 0 ? Math.round((completed / total) * 100) : 0;

  return { total, completed, pending, ratio, percent };
}

/**
 * Natural language helper for Island AI:
 * Parses bullet points, numbered lists, or lines into tasks.
 */
export function parseTasksFromAi(text) {
  if (!text || typeof text !== 'string') return [];
  const lines = text.split(/\r?\n/);
  const detected = [];

  for (const line of lines) {
    const trimmed = line.trim();
    const match = trimmed.match(/^(?:[-*•]|\d+[.)])\s+(?:\[[ xX]\]\s*)?(.+)$/);
    if (match && match[1]) {
      detected.push(match[1].trim());
    }
  }

  return detected;
}
