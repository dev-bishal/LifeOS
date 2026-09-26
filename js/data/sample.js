// Example data that demonstrates Goal → Activity → Task → Subtask.

import { todayKey, addDays, combine } from '../core/dates.js';
import { store } from '../core/store.js';
import { createGoal, createActivity, createTask, createReminder, logSession, toggleTask } from './actions.js';

export function loadSampleData() {
  const today = todayKey();

  const job = createGoal({
    title: 'Get a .NET Developer Job',
    why: 'Build a stable career doing work I enjoy and grow as a backend engineer.',
    description: 'Master ASP.NET Core, ship 2 portfolio projects and start applying.',
    category: 'Career',
    color: 'indigo',
    targetDate: addDays(today, 120),
    order: 1,
  });
  const learn = createActivity({ goalId: job.id, title: 'Learn ASP.NET Core', order: 1 });
  const build = createActivity({ goalId: job.id, title: 'Build portfolio projects', order: 2 });
  const apply = createActivity({ goalId: job.id, title: 'Prepare job applications', order: 3 });

  const webApi = createTask({ title: 'Learn Web API', activityId: learn.id, priority: 'medium', estimate: 4, tags: ['aspnet'] });
  toggleTask(webApi.id);
  store.update('tasks', webApi.id, { completedAt: combine(addDays(today, -1), '18:30').toISOString() });

  const di = createTask(
    { title: 'Learn Dependency Injection', activityId: learn.id, priority: 'high', scheduledDate: today, estimate: 2, tags: ['aspnet'] },
    { subtasks: [{ title: 'Read the official DI docs', done: true }, { title: 'Service lifetimes: transient, scoped, singleton' }, { title: 'Write a small demo' }] }
  );
  createTask({ title: 'Learn Entity Framework Core', activityId: learn.id, priority: 'medium', dueDate: addDays(today, 3), estimate: 6, tags: ['aspnet', 'ef'] });
  createTask(
    { title: 'Build Web API project', activityId: build.id, priority: 'high', dueDate: addDays(today, 10), estimate: 8 },
    {
      subtasks: [
        { title: 'Create project', done: true },
        { title: 'Configure database', done: true },
        { title: 'Create models' },
        { title: 'Create repository' },
        { title: 'Create controller' },
        { title: 'Test API' },
      ],
    }
  );
  createTask({ title: 'Deploy project to Azure', activityId: build.id, priority: 'low', dueDate: addDays(today, 21) });
  createTask({ title: 'Update CV with new skills', activityId: apply.id, priority: 'medium', dueDate: today, dueTime: '17:00' });
  createTask({ title: 'Apply to 5 companies', activityId: apply.id, priority: 'high', dueDate: addDays(today, -1) });

  const health = createGoal({
    title: 'Run a half marathon',
    why: 'Feel energetic and prove to myself I can stick to a plan.',
    category: 'Health',
    color: 'emerald',
    targetDate: addDays(today, 90),
    order: 2,
  });
  const training = createActivity({ goalId: health.id, title: 'Training plan', order: 1 });
  createTask({ title: 'Easy 5 km run', activityId: training.id, scheduledDate: today, recurrence: 'weekdays', priority: 'medium', tags: ['run'] });
  createTask({ title: 'Buy running shoes', goalId: health.id, dueDate: addDays(today, 2) });

  createTask({ title: 'Call the bank about new card' });
  createTask({ title: 'Read "Clean Architecture"', tags: ['book'] });
  createTask({ title: 'Plan weekend trip', priority: 'low' });

  // A few focus sessions over the past week for the statistics screen.
  const minutes = [50, 25, 75, 0, 100, 50, 25];
  minutes.forEach((m, i) => {
    if (!m) return;
    const day = addDays(today, -(6 - i));
    const start = combine(day, '09:00');
    logSession({
      taskId: i % 2 ? di.id : webApi.id,
      startedAt: start.toISOString(),
      endedAt: new Date(start.getTime() + m * 60000).toISOString(),
      minutes: m,
    });
  });

  createReminder({ title: 'Stand up, stretch and drink water', remindAt: new Date(Date.now() + 60 * 60000).toISOString(), repeat: 'none' });
}
