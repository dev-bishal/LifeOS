# LifeOS — Development Guide

LifeOS is a static, installable productivity app built on one idea:

> **Goal → Activity → Task → Subtask → Execution → Focus → Completion → Review**

It runs entirely in the browser (GitHub Pages compatible), stores data locally
(`localStorage`) and can optionally sync to **Google Sheets** through a
**Google Apps Script** web app.

---

## 1. Tech stack (hard constraints)

| Layer      | Choice                                                     |
|------------|------------------------------------------------------------|
| Markup     | HTML5 (single `index.html` shell)                          |
| Styling    | Tailwind CSS v4 (browser build from jsDelivr) + `css/app.css` |
| Logic      | Vanilla JavaScript, native ES modules (no bundler)         |
| Local data | `localStorage` (data, settings, timer state)               |
| Remote DB  | Google Sheets via Google Apps Script web app (`apps-script/`) |
| Offline    | Service worker (`sw.js`) + web app manifest                |

No frameworks, no Node backend, no build step. Node/Python are only used
locally as a static file server for testing (`python -m http.server`).

---

## 2. Folder structure

```
LifeOS/
├── index.html               App shell (sidebar, topbar, bottom nav, roots)
├── manifest.webmanifest     PWA manifest
├── sw.js                    Service worker (offline cache)
├── .nojekyll                Tell GitHub Pages to serve files as-is
├── css/app.css              Non-Tailwind CSS (animations, scrollbars, ring)
├── assets/icons/            App icons (svg + png)
├── apps-script/
│   ├── Code.gs              Google Apps Script sync backend
│   └── SETUP.md             Step-by-step deployment guide
└── js/
    ├── config.js            Deployment config (server URL, local mode)
    ├── main.js              Bootstrap: sign-in screen or app (store, router, services, shell)
    ├── core/                Framework-free infrastructure
    │   ├── utils.js         ids, escaping, debounce, misc helpers
    │   ├── dates.js         local-date keys (YYYY-MM-DD), formatting, grids
    │   ├── events.js        tiny pub/sub bus (timer ticks, sync status…)
    │   ├── session.js       signed-in account / local mode, storage namespace
    │   ├── store.js         collections, persistence, dirty tracking, merge
    │   └── router.js        hash router + view lifecycle + focus restore
    ├── data/                Domain layer (no DOM)
    │   ├── models.js        constants + record factories
    │   ├── selectors.js     derived data: progress, today, stats, search
    │   ├── actions.js       business operations (complete, recur, cascade)
    │   ├── parser.js        quick-add natural language parser
    │   └── sample.js        example data ("Get a .NET Developer Job")
    ├── services/            Long-running behaviour
    │   ├── timer.js         Pomodoro engine (survives reloads)
    │   ├── reminders.js     Reminder scheduler (in-app + notifications)
    │   ├── notify.js        Notification + sound helpers
    │   ├── api.js           HTTP client for the Apps Script backend
    │   ├── auth.js          sign up / in / out, reset, change password (PBKDF2)
    │   ├── sync.js          Google Sheets sync client
    │   └── pwa.js           Service worker registration + install prompt
    ├── ui/                  Shared UI
    │   ├── dom.js           query/template helpers
    │   ├── icons.js         inline SVG icon set
    │   ├── actions.js       global event delegation (data-action=…)
    │   ├── publicSite.js    signed-out router: #/ homepage, #/login, #/signup, #/forgot
    │   ├── landing.js       public homepage (hero, how it works, features, FAQ)
    │   ├── authScreen.js    sign in / create account / reset password page
    │   ├── modal.js         accessible modal / confirm dialogs
    │   ├── toast.js         toasts with undo
    │   ├── theme.js         light / dark / system
    │   ├── shell.js         sidebar, topbar, bottom nav, drawer
    │   ├── shortcuts.js     keyboard shortcuts
    │   └── components/      taskItem, taskEditor, quickAdd, goalEditor,
    │                        activityEditor, reminderEditor, search,
    │                        planDay, focusOverlay, charts, common
    └── views/               One module per screen
        dashboard, goals, goalDetail, tasks, inbox, calendar,
        focus, stats, review, settings
```

---

## 3. Architecture

### 3.1 Data flow

```
 user event ──► ui/actions.js (delegation) ──► data/actions.js ──► store
                                                                  │
      router.refresh() ◄── store.subscribe (microtask-batched) ◄──┘
      shell.update()
      sync (debounced push)
```

* **Views are pure-ish render functions** returning HTML strings
  (`render(params)`) plus an optional `mount(root)` for behaviour that
  needs listeners (returns a cleanup function).
* Every store change re-renders the current view (batched per animation
  frame). The router restores scroll position and the focused input
  (by `id` + selection) so typing is never interrupted.
* Interactions use **event delegation**: elements declare
  `data-action="task:toggle"` / `data-submit` / `data-change` / `data-input`
  and handlers are registered with `registerActions({...})`.
* All user text is escaped with `esc()` before it is placed in HTML.

### 3.2 Records

Every record has `id, createdAt, updatedAt, deletedAt`. Deletes are
**soft** (tombstones) so they can sync; tombstones older than 60 days that
are already synced are purged locally.

| Collection   | Key fields |
|--------------|------------|
| `goals`      | title, description, why, category, color, status (active/paused/completed/archived), targetDate, completedAt, order |
| `activities` | goalId, title, description, status, order |
| `tasks`      | title, notes, goalId, activityId, status (todo/done), priority (high/medium/low/none), dueDate, dueTime, scheduledDate, estimate (pomodoros), tags[], recurrence, completedAt, order |
| `subtasks`   | taskId, title, done, order |
| `sessions`   | taskId, goalId, type (focus), date, startedAt, endedAt, minutes, completed |
| `reminders`  | title, taskId, remindAt (ISO), repeat, firedAt |
| `reviews`    | type (daily/weekly), period (date key / week-start key), mood, energy, wins, challenges, lessons, nextFocus |

Settings (`lifeos:settings:v1`) are device-local and never synced.
Data (`lifeos:data:v1`) and timer state (`lifeos:timer:v1`) are namespaced per
account: `…:u:<userId>` when signed in, the plain key in local-only mode.
The session lives in `lifeos:auth:v1`.

### 3.3 Progress model

* Task progress = 1 if done, otherwise `doneSubtasks / subtasks` (0 if none).
* Activity progress = average task progress of its tasks.
* Goal progress = average task progress of **all** tasks under the goal
  (directly or through an activity). A goal is never a manual slider.

### 3.4 Accounts

* Signed-out visitors see the public homepage at `#/` with links to
  `#/signup` and `#/login` (also `#/forgot`). Any other URL while signed out
  goes to `#/login`; signed-in users opening those URLs land on the dashboard.
* The browser derives `passwordKey = PBKDF2-SHA256(password, "lifeos:v1:"+email, 600k)`;
  the password itself is never sent. The server stores
  `HMAC-SHA256(passwordKey, pepper + ":" + salt)` and compares in constant time.
* Sessions: random token returned once, stored server-side as SHA-256,
  30-day sliding expiry. `AUTH` errors show a "session expired" toast; local
  data (including unsynced edits) is kept and syncs after signing in again.
* Lockout after 5 failed sign-ins (15 min). Password reset by 6-digit emailed
  code (15 min, 5 attempts, single use). Reset / password change revoke other sessions.
* On first sign-in on a device with local-only data the app offers (once per
  account) to copy it into the account.
* Sign-out syncs first, warns about unsynced changes, then removes the
  account's data from the browser.
* Full backend details: [`apps-script/SETUP.md`](apps-script/SETUP.md#security-design).

### 3.5 Sync protocol (Google Sheets)

* Client tracks **dirty ids** per collection.
* `POST {action:"sync", session, since, changes}` → Apps Script (rows are
  scoped to the session's `userId`; records owned by another user are rejected):
  1. upserts each incoming record if `incoming.updatedAt >= stored.updatedAt`
     (last-write-wins) and stamps it with server `syncedAt`;
  2. returns every row with `syncedAt > since` (except the ones just
     accepted) and the new `serverTime` cursor.
* Client merges remote rows with the same LWW rule and clears dirty flags
  only for records that did not change during the request.
* Requests use `Content-Type: text/plain` to avoid a CORS preflight
  (Apps Script cannot answer `OPTIONS`).
* Auto-sync: 4 s after local edits, every N minutes, on reconnect and
  when the tab becomes visible.

---

## 4. Decisions & assumptions

| # | Decision | Why |
|---|----------|-----|
| D1 | Tailwind **v4 browser build** via CDN, customised in an inline `<style type="text/tailwindcss">`. | No build step allowed on GitHub Pages. The service worker caches it for offline use. If you later want a production CSS file, the standalone Tailwind CLI binary (no Node) can generate one — see §7. |
| D2 | `localStorage` instead of IndexedDB. | Synchronous, simple, plenty (5 MB ≈ tens of thousands of tasks). Wrapped in one module so it can be swapped later. |
| D3 | **Inbox** = open tasks without a goal. | Matches GTD "capture now, organise later". Assigning a goal removes it from the inbox. |
| D4 | **Today** = open tasks due or scheduled on/before today + tasks completed today. | "Scheduled" (`scheduledDate`) is the daily-planning field ("do it today"), separate from the deadline (`dueDate`). Missed scheduled tasks roll over automatically. |
| D5 | Deleting a goal moves its tasks to the Inbox (activities are deleted). Deleting an activity keeps its tasks under the goal. | Never silently destroy work. Undo is offered via toast. |
| D6 | Recurring tasks: completing one marks it done and creates the next occurrence (subtasks copied unchecked, reminder shifted). | Keeps completion history for statistics. |
| D7 | Focus sessions ≥ 1 minute that are stopped early are logged with `completed:false`. | Statistics reflect real focus time. |
| D8 | Reminders fire while the app is open (tab or installed PWA). | Browsers have no reliable way to schedule notifications for a closed static site without a push server. Missed reminders fire as soon as the app is opened. |
| D9 | Hash routing (`#/goals/abc`). | Works on GitHub Pages without 404 rewrites. |
| D10 | Service worker: network-first for same-origin files, stale-while-revalidate for CDN, never caches Apps Script calls. | Fresh code after deploys, still fully offline. |
| D12 | Email + password accounts implemented on Apps Script (user's choice over Google Sign-In). Passwords are stretched client-side with PBKDF2 (WebCrypto) because Apps Script has no fast KDF; the server adds salt + pepper. | Keeps passwords off the wire and makes a leaked sheet expensive to attack, within the "no other backend" constraint. |
| D13 | Local-only mode is kept ("Continue without an account"). | Preserves the original offline-first behaviour; can be disabled with `CONFIG.allowLocalMode = false`. |
| D14 | Each account's data is stored under its own localStorage key; sign-out removes it. | Several people can share a browser without seeing each other's data. |
| D15 | A public homepage (`#/`) is shown only to signed-out visitors; the sign-in pages have their own URLs. | Visitors learn what LifeOS is before signing up; real URLs make links, bookmarks and the back button work. |
| D11 | The original brief was truncated after the Dashboard section; remaining screens (Tasks, Inbox, Calendar, Focus, Statistics, Settings, Reviews) follow the product concept and common productivity-app conventions. | Documented so requirements can be refined later. |

---

## 5. Implementation phases

Each phase leaves the app runnable. ✅ = done.

- ✅ **Phase 0 – Architecture**: this document, folder layout, conventions.
- ✅ **Phase 1 – Core & shell**: store, router, dates/utils, theme, responsive
  shell (sidebar / topbar / bottom nav / drawer), modal, toast, icons.
- ✅ **Phase 2 – Tasks**: task CRUD, editor, subtasks, priorities, due/scheduled
  dates, tags, recurrence, quick-add with natural language, Tasks & Inbox views.
- ✅ **Phase 3 – Goals & Activities**: goal/activity CRUD, derived progress,
  goal list + detail views, cascade rules with undo.
- ✅ **Phase 4 – Dashboard & daily planning**: greeting, progress KPIs,
  today buckets, Plan-my-day dialog, goal snapshot, reminders, review prompt.
- ✅ **Phase 5 – Focus**: Pomodoro engine, focus view, full-screen Focus Mode,
  session logging, sound + notifications.
- ✅ **Phase 6 – Calendar**: month grid, day agenda, drag-to-reschedule.
- ✅ **Phase 7 – Reminders**: reminder entity, scheduler, notifications.
- ✅ **Phase 8 – Statistics & Reviews**: KPIs, SVG charts, daily/weekly reviews.
- ✅ **Phase 9 – Google Sheets sync**: Apps Script backend + client sync.
- ✅ **Phase 10 – PWA**: manifest, icons, service worker, install prompt.
- ✅ **Phase 11 – Polish**: global search, keyboard shortcuts, import/export,
  sample data, accessibility pass.

- ✅ **Phase 12 – Accounts**: email/password sign-up & sign-in, password reset by
  email, change password, sign out (everywhere), per-user data in the sheet
  and in the browser, session expiry handling, local-data import.

- ✅ **Phase 13 – Homepage**: public landing page with links to sign up / sign in,
  URL-based auth pages, working skip link.

### Verification log (v1.2.0 — homepage)

- Signed out: `#/` shows the homepage; header/hero/footer links open
  `#/signup` and `#/login`; tabs and "Forgot password?" update the URL;
  back button and "Home" link work; `#/tasks` redirects to `#/login`.
- Signed in: `#/login` redirects to the dashboard; signing out returns to the homepage.
- Mobile (375px) and desktop layouts; no console errors.

### Verification log (v1.1.0 — accounts)

- Backend (mocked Google services, 30 checks): sign-up validation, duplicate
  email, no derived key / token stored in the sheet, case-insensitive email,
  generic sign-in errors, lockout, profile update, cross-user read/write
  isolation, reset code (unknown email silent, wrong code, single use, other
  sessions revoked), change password, logout, closed sign-up.
- Browser end-to-end against the real `Code.gs` over HTTP: sign-up → import
  local data → sync; sign-out removes local copy; wrong password; sign-in
  restores data; change password; forgot-password with emailed code;
  session revoked elsewhere → toast → re-sign-in keeps and syncs the pending
  edit; second account on the same browser sees an empty workspace; local mode.

### Verification log (v1.0.0)

- Every route renders without console errors (desktop 1280px and mobile 375px, light + dark).
- Quick-add parser checked against dates, times, priorities, tags, `+goal`
  and false positives ("Monday.com", "today's").
- Recurring completion (weekday rule Sat → Mon), undo of completion and deletion.
- Timer: completion logs a session, advances to a break, respects auto-start;
  a finished timer is handled correctly after a reload.
- `apps-script/Code.gs` tested with mocked Sheets services (auth, typed
  round-trip, `extra` column, LWW rejection, incremental cursor, no duplicates)
  and end-to-end in the browser: push → wipe local data → full restore →
  remote edit merged.
- Service worker precaches 53 files incl. Tailwind; app loads fully styled
  with the server stopped.

### Known limitations

- Reminders and timer notifications only fire while LifeOS is open (tab or
  installed app); missed reminders fire on next open (D8).
- Last-write-wins sync relies on device clocks being roughly correct.
- Tailwind browser build compiles CSS at runtime (see §7 for precompiling).

### Backlog / ideas

- Drag-and-drop ordering of tasks inside a list.
- Week view in the calendar.
- Habit tracking linked to goals.
- Tag management screen.
- Web Push reminders via an Apps Script time trigger + email as fallback.
- Precompiled Tailwind CSS (see §7).

---

## 6. Running locally

ES modules need an HTTP server (not `file://`):

```bash
cd LifeOS
python -m http.server 5173
```

Open <http://localhost:5173>. Add `?nosw` to the URL to skip the service
worker while developing.

### Manual test checklist

1. Quick add `Read chapter 3 tomorrow !high #book` → due tomorrow, high, tag.
2. Create goal → activity → task → subtasks; tick subtasks and watch goal %.
3. Complete a daily recurring task → next occurrence appears for tomorrow.
4. Start a 1-minute focus session (Settings) → session logged, sound, toast.
5. Reload during a running timer → timer continues.
6. Set a reminder 1 minute ahead → toast/notification fires.
7. Calendar: drag a task to another day (desktop).
8. Export JSON → Clear data → Import JSON → everything back.
9. Mobile width (375px): bottom nav, drawer, bottom-sheet modals.
10. Offline (DevTools → Network → Offline) → app still loads and works.

---

## 7. Deploying to GitHub Pages

1. Push the contents of `LifeOS/` to a repository (root or `/docs`).
2. Settings → Pages → Deploy from branch → select branch/folder.
3. When you change files, bump `CACHE_VERSION` in `sw.js`.

Optional production CSS (no Node): download the Tailwind standalone CLI,
extract the `<style type="text/tailwindcss">` block into `css/input.css`,
run `tailwindcss -i css/input.css -o css/tailwind.css --minify` and replace
the CDN `<script>` with a `<link>` to the generated file.

## 8. Google Sheets sync

See [`apps-script/SETUP.md`](apps-script/SETUP.md).
