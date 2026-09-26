# Backend setup — accounts & Google Sheets sync

LifeOS works offline in the browser. The backend adds **email + password
accounts** and keeps every user's data in **your Google Sheet**, so people can
use LifeOS on several devices.

It takes about 5–10 minutes.

## 1. Create the spreadsheet and script

1. Go to <https://sheets.new> and name the spreadsheet, e.g. **LifeOS Data**.
2. In the sheet, open **Extensions → Apps Script**.
3. Delete the sample code in `Code.gs` and paste the full contents of
   [`Code.gs`](Code.gs) from this folder. Click **Save** (💾).

## 2. Initialise it

1. In the function drop-down at the top, choose **`setup`** and click **Run**.
2. Google asks for permission. Click **Review permissions**, choose your
   account, then **Advanced → Go to project (unsafe) → Allow**. The warning
   appears because the script is your own and unverified. It needs:
   - *Spreadsheets* — to store users and their data in this sheet;
   - *Send email as you* — to send password-reset codes.

`setup()` creates these tabs:

| Tab | Contents |
|-----|----------|
| `Users` | id, email, name, password hash + salt, lockout & reset state |
| `AuthSessions` | SHA-256 hashes of session tokens, expiry |
| `Goals`, `Activities`, `Tasks`, `Subtasks`, `FocusSessions`, `Reminders`, `Reviews` | app data; each row has the owner's `userId` |

It also creates a secret **pepper** in *Project Settings → Script properties*
(`PEPPER`). Never share it or put it in the sheet — it makes a leaked sheet
useless for guessing passwords.

## 3. Deploy as a Web App

1. Click **Deploy → New deployment**.
2. Click the gear ⚙ next to *Select type* → **Web app**.
3. Settings:
   - **Description:** LifeOS
   - **Execute as:** *Me*
   - **Who has access:** *Anyone*
4. Click **Deploy** and copy the **Web app URL**
   (`https://script.google.com/macros/s/…/exec`).

> "Anyone" lets the browser reach the script without a Google login. Access to
> data is controlled by LifeOS accounts: every request (except sign-up, sign-in
> and password reset) needs a valid session, and users only ever see their own rows.

## 4. Point LifeOS at your server

**Recommended:** put the URL in [`js/config.js`](../js/config.js) before you
publish to GitHub Pages, so users can sign up immediately:

```js
export const CONFIG = {
  apiUrl: 'https://script.google.com/macros/s/…/exec',
  allowLocalMode: true,
};
```

Otherwise each user enters the URL once under **Server settings** on the sign-in screen.

Then open LifeOS → **Create account**.

## Security design

- The password **never leaves the browser**. LifeOS derives a key with
  PBKDF2-SHA256 (600,000 iterations, salted with the email) and sends only that.
- The script stores `HMAC-SHA256(key, pepper + per-user salt)`, compared in
  constant time.
- 5 wrong passwords lock the account for 15 minutes. Sign-in errors never reveal
  whether an email is registered; neither does "forgot password".
- Session tokens are random 256-bit-ish values; only their SHA-256 hash is stored.
  They expire after 30 days of inactivity.
- Password reset: a 6-digit code, emailed, valid for 15 minutes, 5 attempts,
  single use. Resetting or changing a password signs out other devices.
- Password rules (≥ 8 characters, not trivially guessable) are enforced in the app,
  since the server only ever sees the derived key.

Limitations to be aware of: there is no email verification at sign-up, and the
Apps Script mail quota is ~100 emails/day on a free Google account.

## Admin functions

Run these from the Apps Script editor (function drop-down → Run):

| Function | What it does |
|----------|--------------|
| `closeSignup()` | Stop new accounts (existing users can still sign in) |
| `openSignup()` | Allow sign-ups again |
| `unlockUser(email)` | Clear a lockout. The Run button can't pass arguments, so add e.g. `function unlockAnn() { unlockUser('ann@example.com'); }`, run it, then delete it. |
| `revokeAllSessions()` | Sign everybody out everywhere |

To delete a user, remove their row in `Users`, their `AuthSessions` rows and
(optionally) all rows with their `userId` in the data tabs.

## How sync works

- Every change is saved locally first, then pushed a few seconds later (and on
  an interval, when you come back online and when the tab becomes visible).
- When the same record was edited on two devices, the **most recent edit wins**
  (`updatedAt`).
- Deleted items stay as rows with a `deletedAt` value so deletions reach other devices.
- `syncedAt` is the server time a row was last written; `extra` holds fields
  added by newer app versions.

If you edit cells by hand, also update that row's `updatedAt` (ISO time, e.g.
`2026-09-26T18:30:00.000Z`) and `syncedAt` so devices pick up the change.

## Updating the script

After replacing the code: **Deploy → Manage deployments → Edit (✏) →
Version: New version → Deploy**. The URL stays the same.

## Troubleshooting

| Message | Fix |
|---------|-----|
| *No server is configured yet* | Set `apiUrl` in `js/config.js` or use *Server settings* on the sign-in screen. |
| *Unexpected response…* | The URL must end with `/exec` and access must be **Anyone**. Re-deploy if you changed it. |
| *Could not reach the server* | You are offline, or the URL is wrong. |
| *Sign-up is closed* | Run `openSignup()`. |
| *The reset email could not be sent* | Run `setup()` again and grant the email permission; check the daily mail quota. |
| *Your session has expired* | Sign in again — unsynced changes on the device are kept and sync afterwards. |
