/**
 * LifeOS — Google Sheets backend (Google Apps Script): accounts + sync.
 *
 * Deploy as a Web App (Execute as: Me, Who has access: Anyone).
 * See SETUP.md for step-by-step instructions.
 *
 * All requests are POST with a JSON body sent as text/plain (avoids a CORS
 * preflight, which Apps Script cannot answer). Every response is
 *   { ok: true, ... }  or  { ok: false, error: "message", code?: "AUTH" | ... }
 *
 * Public actions
 *   ping                                   -> { version, serverTime, signupOpen }
 *   signup   { name, email, passwordKey }   -> { session, user }
 *   login    { email, passwordKey }         -> { session, user }
 *   requestReset  { email }                 -> emails a 6-digit code
 *   resetPassword { email, code, passwordKey } -> { session, user }
 * Authenticated actions (body.session = token from signup/login)
 *   me, updateProfile { name }, changePassword { currentKey, newKey },
 *   logout, logoutAll, sync { since, changes }
 *
 * Passwords never reach this script: the app derives `passwordKey` with
 * PBKDF2-SHA256 (600k iterations) in the browser. Here it is hashed again with
 * HMAC-SHA256 using a per-user salt and a secret pepper stored in Script
 * Properties (not in the sheet). Session tokens are stored only as SHA-256 hashes.
 *
 * Sync: last write wins by `updatedAt`; every row carries the owner's `userId`
 * and a server `syncedAt`; clients pull their own rows with syncedAt > cursor.
 */

var VERSION = '1.1.0';

var SESSION_DAYS = 30;
var MAX_FAILED_LOGINS = 5;
var LOCK_MINUTES = 15;
var RESET_MINUTES = 15;
var MAX_RESET_ATTEMPTS = 5;

/**
 * Column schema per data collection. Suffix types: :n number, :b boolean, :j JSON.
 * Unknown fields sent by the app are kept in the `extra` JSON column.
 */
var SCHEMA = {
  goals: ['id', 'title', 'description', 'why', 'category', 'color', 'status', 'targetDate', 'completedAt', 'order:n', 'createdAt', 'updatedAt', 'deletedAt'],
  activities: ['id', 'goalId', 'title', 'description', 'status', 'order:n', 'createdAt', 'updatedAt', 'deletedAt'],
  tasks: ['id', 'title', 'notes', 'goalId', 'activityId', 'status', 'priority', 'dueDate', 'dueTime', 'scheduledDate', 'estimate:n', 'tags:j', 'recurrence', 'completedAt', 'order:n', 'createdAt', 'updatedAt', 'deletedAt'],
  subtasks: ['id', 'taskId', 'title', 'done:b', 'order:n', 'createdAt', 'updatedAt', 'deletedAt'],
  sessions: ['id', 'taskId', 'goalId', 'type', 'date', 'startedAt', 'endedAt', 'minutes:n', 'completed:b', 'createdAt', 'updatedAt', 'deletedAt'],
  reminders: ['id', 'title', 'taskId', 'remindAt', 'repeat', 'firedAt', 'createdAt', 'updatedAt', 'deletedAt'],
  reviews: ['id', 'type', 'period', 'mood:n', 'energy:n', 'wins', 'challenges', 'lessons', 'nextFocus', 'createdAt', 'updatedAt', 'deletedAt'],
};
var SYSTEM_COLUMNS = ['userId', 'syncedAt', 'extra'];
var SHEET_NAMES = {
  goals: 'Goals', activities: 'Activities', tasks: 'Tasks', subtasks: 'Subtasks',
  sessions: 'FocusSessions', reminders: 'Reminders', reviews: 'Reviews',
};

var USERS_SHEET = 'Users';
var USERS_HEADERS = ['id', 'email', 'name', 'passwordHash', 'salt', 'failedAttempts', 'lockedUntil', 'resetCodeHash', 'resetExpiresAt', 'resetAttempts', 'createdAt', 'updatedAt', 'lastLoginAt'];
var AUTH_SESSIONS_SHEET = 'AuthSessions';
var AUTH_SESSIONS_HEADERS = ['tokenHash', 'userId', 'createdAt', 'expiresAt', 'lastSeenAt', 'client'];

// ---------------------------------------------------------------------------
// Admin functions (run from the Apps Script editor)
// ---------------------------------------------------------------------------

/** Run once: creates all sheets and the secret pepper. Safe to run again. */
function setup() {
  var ss = getSpreadsheet_();
  Object.keys(SCHEMA).forEach(function (col) { openTable_(ss, col); });
  openSimple_(ss, USERS_SHEET, USERS_HEADERS);
  openSimple_(ss, AUTH_SESSIONS_SHEET, AUTH_SESSIONS_HEADERS);
  pepper_();
  var props = PropertiesService.getScriptProperties();
  if (props.getProperty('ALLOW_SIGNUP') === null) props.setProperty('ALLOW_SIGNUP', 'true');
  Logger.log('LifeOS backend v%s is ready in "%s". Sign-up is %s.', VERSION, ss.getName(),
    signupOpen_() ? 'OPEN' : 'CLOSED');
  Logger.log('Next: Deploy → New deployment → Web app (Execute as: Me, Access: Anyone).');
}

/** Stop new accounts from being created (existing users can still sign in). */
function closeSignup() {
  PropertiesService.getScriptProperties().setProperty('ALLOW_SIGNUP', 'false');
  Logger.log('Sign-up is now CLOSED.');
}

function openSignup() {
  PropertiesService.getScriptProperties().setProperty('ALLOW_SIGNUP', 'true');
  Logger.log('Sign-up is now OPEN.');
}

/** Sign every user out of every device. */
function revokeAllSessions() {
  var t = openSimple_(getSpreadsheet_(), AUTH_SESSIONS_SHEET, AUTH_SESSIONS_HEADERS);
  deleteRows_(t, t.records);
  Logger.log('All sessions revoked.');
}

/** Clear a lockout after too many failed sign-ins. Edit the email and run. */
function unlockUser(email) {
  email = normalizeEmail_(email || '');
  var users = openSimple_(getSpreadsheet_(), USERS_SHEET, USERS_HEADERS);
  var rec = findBy_(users, 'email', email);
  if (!rec) return Logger.log('No user %s', email);
  rec.obj.failedAttempts = '0';
  rec.obj.lockedUntil = '';
  saveRecord_(users, rec);
  Logger.log('Unlocked %s', email);
}

// ---------------------------------------------------------------------------
// HTTP entry points
// ---------------------------------------------------------------------------

function doGet() {
  return json_({ ok: true, app: 'LifeOS', version: VERSION, message: 'LifeOS backend is running. The app talks to it with POST requests.' });
}

function doPost(e) {
  var body;
  try {
    body = JSON.parse((e && e.postData && e.postData.contents) || '{}');
  } catch (err) {
    return json_({ ok: false, error: 'Invalid request body.' });
  }

  var lock = LockService.getScriptLock();
  if (!lock.tryLock(25000)) return json_({ ok: false, error: 'Server busy, please retry.' });
  try {
    return json_(route_(body));
  } catch (err) {
    if (err && err.isPublic) return json_({ ok: false, error: err.message, code: err.code });
    console.error(err);
    return json_({ ok: false, error: 'Unexpected server error. Please try again.' });
  } finally {
    lock.releaseLock();
  }
}

function route_(body) {
  var ss = getSpreadsheet_();
  switch (body.action) {
    case 'ping':
      return { ok: true, version: VERSION, serverTime: new Date().toISOString(), signupOpen: signupOpen_() };
    case 'signup':
      return signup_(ss, body);
    case 'login':
      return login_(ss, body);
    case 'requestReset':
      return requestReset_(ss, body);
    case 'resetPassword':
      return resetPassword_(ss, body);
  }

  var auth = authenticate_(ss, body.session);
  if (!auth) throw publicError_('Your session has expired. Please sign in again.', 'AUTH');

  switch (body.action) {
    case 'me':
      return { ok: true, user: publicUser_(auth.user.obj) };
    case 'updateProfile':
      return updateProfile_(ss, auth, body);
    case 'changePassword':
      return changePassword_(ss, auth, body);
    case 'logout':
      deleteRows_(auth.sessions, [auth.session]);
      return { ok: true };
    case 'logoutAll':
      deleteRows_(auth.sessions, auth.sessions.records.filter(function (r) { return r.obj.userId === auth.user.obj.id; }));
      return { ok: true };
    case 'sync':
      return sync_(ss, auth.user.obj.id, body);
    default:
      throw publicError_('Unknown action.');
  }
}

// ---------------------------------------------------------------------------
// Accounts
// ---------------------------------------------------------------------------

function signup_(ss, body) {
  if (!signupOpen_()) throw publicError_('Sign-up is closed on this server. Ask the owner for access.');
  var email = requireEmail_(body.email);
  var key = requireKey_(body.passwordKey);
  var name = String(body.name || '').trim().slice(0, 80);
  if (!name) throw publicError_('Please enter your name.');

  var users = openSimple_(ss, USERS_SHEET, USERS_HEADERS);
  if (findBy_(users, 'email', email)) throw publicError_('An account with this email already exists. Try signing in.');

  var now = new Date().toISOString();
  var salt = randomHex_(32);
  var user = {
    id: randomHex_(16), email: email, name: name,
    passwordHash: hashKey_(key, salt), salt: salt,
    failedAttempts: '0', lockedUntil: '', resetCodeHash: '', resetExpiresAt: '', resetAttempts: '0',
    createdAt: now, updatedAt: now, lastLoginAt: now,
  };
  appendRecord_(users, user);
  return { ok: true, session: createSession_(ss, user.id, body.client), user: publicUser_(user) };
}

function login_(ss, body) {
  var email = normalizeEmail_(body.email);
  var key = String(body.passwordKey || '');
  var users = openSimple_(ss, USERS_SHEET, USERS_HEADERS);
  var rec = findBy_(users, 'email', email);
  var generic = 'Email or password is incorrect.';

  if (!rec) {
    hashKey_(key || 'x', 'dummy-salt'); // keep timing similar for unknown emails
    throw publicError_(generic);
  }
  var u = rec.obj;
  var now = Date.now();
  if (u.lockedUntil && Date.parse(u.lockedUntil) > now) {
    var mins = Math.ceil((Date.parse(u.lockedUntil) - now) / 60000);
    throw publicError_('Too many failed attempts. Try again in ' + mins + ' minute' + (mins === 1 ? '' : 's') + ', or reset your password.');
  }
  if (!/^[0-9a-f]{64}$/.test(key) || !safeEqual_(hashKey_(key, u.salt), u.passwordHash)) {
    var failed = (Number(u.failedAttempts) || 0) + 1;
    if (failed >= MAX_FAILED_LOGINS) {
      u.failedAttempts = '0';
      u.lockedUntil = new Date(now + LOCK_MINUTES * 60000).toISOString();
    } else {
      u.failedAttempts = String(failed);
    }
    saveRecord_(users, rec);
    throw publicError_(generic);
  }

  u.failedAttempts = '0';
  u.lockedUntil = '';
  u.lastLoginAt = new Date().toISOString();
  saveRecord_(users, rec);
  return { ok: true, session: createSession_(ss, u.id, body.client), user: publicUser_(u) };
}

function requestReset_(ss, body) {
  var email = requireEmail_(body.email);
  var users = openSimple_(ss, USERS_SHEET, USERS_HEADERS);
  var rec = findBy_(users, 'email', email);
  var response = { ok: true, message: 'If an account exists for that email, a reset code is on its way.' };
  if (!rec) return response;

  var code = randomDigits_(6);
  rec.obj.resetCodeHash = hashKey_(code, rec.obj.salt);
  rec.obj.resetExpiresAt = new Date(Date.now() + RESET_MINUTES * 60000).toISOString();
  rec.obj.resetAttempts = '0';
  saveRecord_(users, rec);

  try {
    MailApp.sendEmail({
      to: email,
      subject: 'Your LifeOS password reset code: ' + code,
      body:
        'Hi ' + rec.obj.name + ',\n\n' +
        'Your LifeOS password reset code is: ' + code + '\n\n' +
        'It expires in ' + RESET_MINUTES + ' minutes. If you did not ask to reset your password, you can ignore this email.\n\n' +
        '— LifeOS',
    });
  } catch (err) {
    console.error(err);
    throw publicError_('The reset email could not be sent. Please contact the server owner.');
  }
  return response;
}

function resetPassword_(ss, body) {
  var email = requireEmail_(body.email);
  var key = requireKey_(body.passwordKey);
  var code = String(body.code || '').replace(/\D/g, '');
  var users = openSimple_(ss, USERS_SHEET, USERS_HEADERS);
  var rec = findBy_(users, 'email', email);
  var invalid = 'That code is invalid or has expired. Request a new one.';
  if (!rec || !rec.obj.resetCodeHash) throw publicError_(invalid);

  var u = rec.obj;
  var attempts = Number(u.resetAttempts) || 0;
  if (Date.parse(u.resetExpiresAt) < Date.now() || attempts >= MAX_RESET_ATTEMPTS) throw publicError_(invalid);
  if (!safeEqual_(hashKey_(code, u.salt), u.resetCodeHash)) {
    u.resetAttempts = String(attempts + 1);
    saveRecord_(users, rec);
    throw publicError_(invalid);
  }

  var now = new Date().toISOString();
  u.salt = randomHex_(32);
  u.passwordHash = hashKey_(key, u.salt);
  u.resetCodeHash = '';
  u.resetExpiresAt = '';
  u.resetAttempts = '0';
  u.failedAttempts = '0';
  u.lockedUntil = '';
  u.updatedAt = now;
  u.lastLoginAt = now;
  saveRecord_(users, rec);

  // A password reset signs out every other device.
  var sessions = openSimple_(ss, AUTH_SESSIONS_SHEET, AUTH_SESSIONS_HEADERS);
  deleteRows_(sessions, sessions.records.filter(function (r) { return r.obj.userId === u.id; }));
  return { ok: true, session: createSession_(ss, u.id, body.client), user: publicUser_(u) };
}

function updateProfile_(ss, auth, body) {
  var name = String(body.name || '').trim().slice(0, 80);
  if (!name) throw publicError_('Please enter your name.');
  var users = openSimple_(ss, USERS_SHEET, USERS_HEADERS);
  var rec = findBy_(users, 'id', auth.user.obj.id);
  rec.obj.name = name;
  rec.obj.updatedAt = new Date().toISOString();
  saveRecord_(users, rec);
  return { ok: true, user: publicUser_(rec.obj) };
}

function changePassword_(ss, auth, body) {
  var currentKey = String(body.currentKey || '');
  var newKey = requireKey_(body.newKey);
  var users = openSimple_(ss, USERS_SHEET, USERS_HEADERS);
  var rec = findBy_(users, 'id', auth.user.obj.id);
  if (!safeEqual_(hashKey_(currentKey, rec.obj.salt), rec.obj.passwordHash)) {
    throw publicError_('Your current password is incorrect.');
  }
  rec.obj.salt = randomHex_(32);
  rec.obj.passwordHash = hashKey_(newKey, rec.obj.salt);
  rec.obj.updatedAt = new Date().toISOString();
  saveRecord_(users, rec);

  // Sign out every other device, keep this one.
  deleteRows_(auth.sessions, auth.sessions.records.filter(function (r) {
    return r.obj.userId === rec.obj.id && r !== auth.session;
  }));
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Sessions
// ---------------------------------------------------------------------------

function createSession_(ss, userId, client) {
  var sessions = openSimple_(ss, AUTH_SESSIONS_SHEET, AUTH_SESSIONS_HEADERS);
  var now = Date.now();
  // Housekeeping: drop expired sessions.
  deleteRows_(sessions, sessions.records.filter(function (r) { return Date.parse(r.obj.expiresAt) < now; }));
  var token = randomHex_(64);
  appendRecord_(sessions, {
    tokenHash: sha256Hex_(token),
    userId: userId,
    createdAt: new Date(now).toISOString(),
    expiresAt: new Date(now + SESSION_DAYS * 86400000).toISOString(),
    lastSeenAt: new Date(now).toISOString(),
    client: String(client || '').slice(0, 120),
  });
  return token;
}

/** Returns { user, session, sessions } for a valid token, otherwise null. Sliding expiry. */
function authenticate_(ss, token) {
  if (!token || typeof token !== 'string' || token.length < 32) return null;
  var sessions = openSimple_(ss, AUTH_SESSIONS_SHEET, AUTH_SESSIONS_HEADERS);
  var session = findBy_(sessions, 'tokenHash', sha256Hex_(token));
  if (!session) return null;
  var now = Date.now();
  if (Date.parse(session.obj.expiresAt) < now) {
    deleteRows_(sessions, [session]);
    return null;
  }
  var users = openSimple_(ss, USERS_SHEET, USERS_HEADERS);
  var user = findBy_(users, 'id', session.obj.userId);
  if (!user) return null;
  if (now - Date.parse(session.obj.lastSeenAt || 0) > 3600000) {
    session.obj.lastSeenAt = new Date(now).toISOString();
    session.obj.expiresAt = new Date(now + SESSION_DAYS * 86400000).toISOString();
    saveRecord_(sessions, session);
  }
  return { user: user, session: session, sessions: sessions };
}

// ---------------------------------------------------------------------------
// Sync
// ---------------------------------------------------------------------------

function sync_(ss, userId, body) {
  var since = typeof body.since === 'string' ? body.since : '';
  var changes = body.changes || {};
  var serverTime = nextServerTime_();
  var out = {};
  var stats = { accepted: 0, rejected: 0 };

  Object.keys(SCHEMA).forEach(function (col) {
    var table = openTable_(ss, col);
    var incoming = Array.isArray(changes[col]) ? changes[col] : [];
    var accepted = {};
    var modified = false;
    var userCol = table.headers.indexOf('userId');

    incoming.forEach(function (rec) {
      if (!rec || !rec.id) return;
      var id = String(rec.id);
      var rowIndex = table.index[id];
      if (rowIndex !== undefined) {
        var row = table.rows[rowIndex];
        if (String(row[userCol]) !== userId) {
          stats.rejected++; // belongs to someone else
          return;
        }
        var existing = rowToRecord_(table, row);
        if (String(existing.updatedAt || '') > String(rec.updatedAt || '')) {
          stats.rejected++; // the sheet has a newer version; the client receives it below
          return;
        }
        table.rows[rowIndex] = recordToRow_(table, rec, userId, serverTime);
      } else {
        table.rows.push(recordToRow_(table, rec, userId, serverTime));
        table.index[id] = table.rows.length - 1;
      }
      accepted[id] = true;
      modified = true;
      stats.accepted++;
    });

    if (modified) writeTable_(table);

    var syncedCol = table.headers.indexOf('syncedAt');
    var idCol = table.headers.indexOf('id');
    out[col] = table.rows
      .filter(function (row) {
        return String(row[userCol]) === userId && String(row[syncedCol] || '') > since && !accepted[String(row[idCol])];
      })
      .map(function (row) { return rowToRecord_(table, row); });
  });

  return { ok: true, serverTime: serverTime, changes: out, stats: stats };
}

// ---------------------------------------------------------------------------
// Data table helpers (typed columns, whole-sheet read/write)
// ---------------------------------------------------------------------------

function parseSchema_(col) {
  return SCHEMA[col].map(function (spec) {
    var parts = spec.split(':');
    return { name: parts[0], type: parts[1] || 's' };
  });
}

function ensureSheet_(ss, name, wanted) {
  var sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
    sheet.getRange(1, 1, 1, wanted.length).setValues([wanted]).setFontWeight('bold');
    sheet.setFrozenRows(1);
    sheet.getRange(1, 1, sheet.getMaxRows(), wanted.length).setNumberFormat('@');
  }
  var lastCol = Math.max(sheet.getLastColumn(), 1);
  var headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0].map(String);
  if (headers.length === 1 && headers[0] === '') headers = []; // sheet exists but is empty
  var missing = wanted.filter(function (h) { return headers.indexOf(h) === -1; });
  if (missing.length) {
    sheet.getRange(1, headers.length + 1, 1, missing.length).setValues([missing]).setFontWeight('bold');
    sheet.getRange(1, headers.length + 1, sheet.getMaxRows(), missing.length).setNumberFormat('@');
    headers = headers.concat(missing);
  }
  return { sheet: sheet, headers: headers };
}

function openTable_(ss, col) {
  var fields = parseSchema_(col);
  var wanted = fields.map(function (f) { return f.name; }).concat(SYSTEM_COLUMNS);
  var base = ensureSheet_(ss, SHEET_NAMES[col], wanted);
  var headers = base.headers;
  var lastRow = base.sheet.getLastRow();
  var rows = lastRow > 1 ? base.sheet.getRange(2, 1, lastRow - 1, headers.length).getValues() : [];
  var idCol = headers.indexOf('id');
  var index = {};
  rows.forEach(function (row, i) {
    if (row[idCol] !== '') index[String(row[idCol])] = i;
  });
  var types = {};
  fields.forEach(function (f) { types[f.name] = f.type; });
  return { sheet: base.sheet, headers: headers, rows: rows, index: index, types: types, known: fields.map(function (f) { return f.name; }) };
}

function writeTable_(table) {
  if (!table.rows.length) return;
  var range = table.sheet.getRange(2, 1, table.rows.length, table.headers.length);
  range.setNumberFormat('@');
  range.setValues(table.rows);
}

function recordToRow_(table, rec, userId, serverTime) {
  var extra = {};
  Object.keys(rec).forEach(function (k) {
    if (table.known.indexOf(k) === -1 && SYSTEM_COLUMNS.indexOf(k) === -1) extra[k] = rec[k];
  });
  return table.headers.map(function (h) {
    if (h === 'userId') return userId;
    if (h === 'syncedAt') return serverTime;
    if (h === 'extra') return Object.keys(extra).length ? JSON.stringify(extra) : '';
    var v = rec[h];
    if (v === null || v === undefined) return '';
    var type = table.types[h] || 's';
    if (type === 'j') return JSON.stringify(v);
    if (type === 'b') return v ? 'TRUE' : 'FALSE';
    return String(v);
  });
}

function rowToRecord_(table, row) {
  var rec = {};
  table.headers.forEach(function (h, i) {
    if (h === 'syncedAt' || h === 'userId' || h === '') return;
    var raw = row[i];
    if (h === 'extra') {
      if (raw) {
        try {
          var extra = JSON.parse(raw);
          Object.keys(extra).forEach(function (k) { rec[k] = extra[k]; });
        } catch (e) { /* ignore corrupt extra */ }
      }
      return;
    }
    rec[h] = parseCell_(raw, table.types[h] || 's');
  });
  return rec;
}

function parseCell_(raw, type) {
  if (raw === '' || raw === null || raw === undefined) {
    if (type === 'j') return [];
    if (type === 'b') return false;
    return null;
  }
  if (raw instanceof Date) return raw.toISOString(); // cell was edited by hand into a date
  switch (type) {
    case 'n': {
      var n = Number(raw);
      return isNaN(n) ? null : n;
    }
    case 'b':
      return raw === true || String(raw).toUpperCase() === 'TRUE';
    case 'j':
      try { return JSON.parse(raw); } catch (e) { return []; }
    default:
      return String(raw);
  }
}

// ---------------------------------------------------------------------------
// Simple record tables (Users, AuthSessions)
// ---------------------------------------------------------------------------

function openSimple_(ss, name, wanted) {
  var base = ensureSheet_(ss, name, wanted);
  var lastRow = base.sheet.getLastRow();
  var values = lastRow > 1 ? base.sheet.getRange(2, 1, lastRow - 1, base.headers.length).getValues() : [];
  var records = values.map(function (row, i) {
    var obj = {};
    base.headers.forEach(function (h, j) { obj[h] = row[j] instanceof Date ? row[j].toISOString() : String(row[j]); });
    return { row: i + 2, obj: obj };
  });
  return { sheet: base.sheet, headers: base.headers, records: records };
}

function findBy_(table, field, value) {
  for (var i = 0; i < table.records.length; i++) {
    if (table.records[i].obj[field] === value) return table.records[i];
  }
  return null;
}

function saveRecord_(table, rec) {
  var values = table.headers.map(function (h) { return rec.obj[h] === undefined ? '' : String(rec.obj[h]); });
  table.sheet.getRange(rec.row, 1, 1, values.length).setNumberFormat('@').setValues([values]);
}

function appendRecord_(table, obj) {
  var row = table.sheet.getLastRow() + 1;
  var rec = { row: row, obj: obj };
  saveRecord_(table, rec);
  table.records.push(rec);
  return rec;
}

function deleteRows_(table, recs) {
  recs
    .map(function (r) { return r.row; })
    .sort(function (a, b) { return b - a; })
    .forEach(function (row) { table.sheet.deleteRow(row); });
  // Re-number the in-memory copy.
  var removed = recs.map(function (r) { return r.row; });
  table.records = table.records.filter(function (r) { return removed.indexOf(r.row) === -1; });
  table.records.forEach(function (r) {
    r.row -= removed.filter(function (x) { return x < r.row; }).length;
  });
}

// ---------------------------------------------------------------------------
// Crypto & validation helpers
// ---------------------------------------------------------------------------

function bytesToHex_(bytes) {
  return bytes.map(function (b) { return ('0' + ((b + 256) % 256).toString(16)).slice(-2); }).join('');
}

function sha256Hex_(value) {
  return bytesToHex_(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, value, Utilities.Charset.UTF_8));
}

/** HMAC-SHA256(value) keyed with pepper + per-user salt. */
function hashKey_(value, salt) {
  return bytesToHex_(Utilities.computeHmacSha256Signature(String(value), pepper_() + ':' + salt));
}

function pepper_() {
  var props = PropertiesService.getScriptProperties();
  var p = props.getProperty('PEPPER');
  if (!p) {
    p = randomHex_(64);
    props.setProperty('PEPPER', p);
  }
  return p;
}

/** Random hex from UUID v4 randomness (122 random bits per UUID). */
function randomHex_(length) {
  var out = '';
  while (out.length < length) out += Utilities.getUuid().replace(/-/g, '');
  return out.slice(0, length);
}

function randomDigits_(n) {
  var out = '';
  while (out.length < n) {
    var hex = Utilities.getUuid().replace(/-/g, '');
    for (var i = 0; i < hex.length && out.length < n; i++) {
      var v = parseInt(hex[i], 16);
      if (v < 10) out += v; // rejection sampling keeps digits uniform
    }
  }
  return out;
}

function safeEqual_(a, b) {
  a = String(a || '');
  b = String(b || '');
  if (a.length !== b.length || !a.length) return false;
  var diff = 0;
  for (var i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function normalizeEmail_(email) {
  return String(email || '').trim().toLowerCase();
}

function requireEmail_(email) {
  var e = normalizeEmail_(email);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) || e.length > 254) throw publicError_('Please enter a valid email address.');
  return e;
}

function requireKey_(key) {
  var k = String(key || '');
  if (!/^[0-9a-f]{64}$/.test(k)) throw publicError_('Invalid password data. Please update the app and try again.');
  return k;
}

function publicUser_(u) {
  return { id: u.id, email: u.email, name: u.name, createdAt: u.createdAt };
}

function publicError_(message, code) {
  var err = new Error(message);
  err.isPublic = true;
  err.code = code || null;
  return err;
}

function signupOpen_() {
  return PropertiesService.getScriptProperties().getProperty('ALLOW_SIGNUP') !== 'false';
}

/** Strictly increasing server timestamp, so sync cursors never miss a write. */
function nextServerTime_() {
  var props = PropertiesService.getScriptProperties();
  var last = Date.parse(props.getProperty('LAST_SERVER_TIME') || '') || 0;
  var now = Math.max(Date.now(), last + 1);
  var iso = new Date(now).toISOString();
  props.setProperty('LAST_SERVER_TIME', iso);
  return iso;
}

function getSpreadsheet_() {
  var active = SpreadsheetApp.getActiveSpreadsheet();
  if (active) return active;
  var id = PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID');
  if (!id) throw new Error('No spreadsheet. Create the script from a Google Sheet (Extensions → Apps Script) or set the SPREADSHEET_ID script property.');
  return SpreadsheetApp.openById(id);
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
