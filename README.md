# LifeOS

**Goal → Activity → Task → Subtask → Execution → Focus → Completion → Review**

LifeOS is a personal productivity web app that connects long-term goals to
what you do today. It is a static site (HTML + Tailwind CSS + vanilla
JavaScript) that runs on GitHub Pages, works offline, installs as an app, and
can sync to your own Google Sheet through Google Apps Script.

## Features

- **Homepage** – a public landing page for signed-out visitors with links to
  create an account or sign in.
- **Dashboard** – greeting, today's progress, overdue/today/suggested tasks,
  Plan-my-day, focus card, goal snapshot, reminders, review prompt.
- **Goals** – goals with a "why", target date, colour and category. Progress
  is derived from the tasks and subtasks underneath (never a manual slider).
- **Activities** – group a goal's work (e.g. "Learn ASP.NET Core").
- **Tasks** – priorities, due date & time, planned day, estimates, tags,
  recurrence, reminders and subtasks. Views: Today, Upcoming, All, Completed,
  with filters and grouping.
- **Quick add** – natural language: `Learn EF Core tomorrow 7pm !high #study +net`.
- **Inbox** – capture now, organise later.
- **Calendar** – month grid, day agenda, drag-and-drop rescheduling.
- **Focus** – Pomodoro timer (survives reloads), task-linked sessions,
  full-screen Focus Mode, sound + notifications.
- **Reminders** – one-off and repeating, in-app + system notifications.
- **Statistics** – completion & focus charts, on-time rate, focus per goal.
- **Reviews** – daily and weekly reflections with automatic summaries.
- **Accounts** – sign up / sign in with email and password, password reset
  by emailed code, change password, sign out of all devices. Each user's data
  is private and synced through your Google Sheet. "Continue without an
  account" keeps everything in the browser instead.
- **Settings** – profile, theme, timer, notifications, account & sync,
  JSON export/import, example data.
- Responsive (sidebar on desktop, bottom nav + drawer on mobile), dark mode,
  keyboard shortcuts (`N`, `/`, `Ctrl K`, `P`, `M`, `G` then a letter, `?`),
  accessible dialogs and controls.

## Run locally

```bash
python -m http.server 5173
```

Then open <http://localhost:5173>. (ES modules don't load from `file://`.)

## Deploy to GitHub Pages

Push this folder to a repository and enable **Settings → Pages → Deploy from
branch**. No build step is needed. Bump `CACHE_VERSION` in `sw.js` on each
release so installed apps pick up the new version.

## Accounts & Google Sheets sync

Deploy the Apps Script backend ([`apps-script/SETUP.md`](apps-script/SETUP.md)),
then put its Web App URL in [`js/config.js`](js/config.js) so users can create
accounts straight away.

## Project docs

Architecture, data model, decisions and implementation phases are in
[`DEVELOPMENT.md`](DEVELOPMENT.md).
