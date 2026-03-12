const express = require('express');
const fs = require('fs');
const path = require('path');
const initSqlJs = require('sql.js');

const app = express();
const port = process.env.PORT || 3000;
const dataDir = process.env.RENDER_DISK_PATH || path.join(__dirname, 'data');
const dbPath = path.join(dataDir, 'event_registrations.sqlite');

let SQL;
let db;

function ensureDataDir() {
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
}

function saveDatabase() {
  const data = db.export();
  fs.writeFileSync(dbPath, Buffer.from(data));
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function initSchema() {
  db.run(`
    CREATE TABLE IF NOT EXISTS singapore_registrations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      first_name TEXT NOT NULL,
      last_name TEXT NOT NULL,
      company TEXT NOT NULL,
      email TEXT NOT NULL,
      city TEXT NOT NULL DEFAULT 'Singapore',
      created_at TEXT NOT NULL
    );
  `);
  saveDatabase();
}

async function initDatabase() {
  ensureDataDir();
  SQL = await initSqlJs({
    locateFile: (file) => path.join(__dirname, 'node_modules', 'sql.js', 'dist', file),
  });

  if (fs.existsSync(dbPath)) {
    db = new SQL.Database(fs.readFileSync(dbPath));
  } else {
    db = new SQL.Database();
  }

  initSchema();
}

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use('/assets', express.static(path.join(__dirname, 'assets')));
app.use(express.static(__dirname, { index: false }));

function getRegistrationPayload(body) {
  const firstName = String(body.firstName || '').trim();
  const lastName = String(body.lastName || '').trim();
  const company = String(body.company || '').trim();
  const email = String(body.email || '').trim();
  const city = String(body.city || 'Singapore').trim() || 'Singapore';
  return { firstName, lastName, company, email, city };
}

function validateRegistration(payload) {
  if (!payload.firstName || !payload.lastName || !payload.company || !payload.email) {
    return 'All fields are required.';
  }

  const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailPattern.test(payload.email)) {
    return 'Please enter a valid email address.';
  }

  return null;
}

function saveRegistration(payload) {
  db.run(
    `INSERT INTO singapore_registrations (first_name, last_name, company, email, city, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [payload.firstName, payload.lastName, payload.company, payload.email, payload.city, new Date().toISOString()]
  );
  saveDatabase();
}

app.get('/health', (_req, res) => {
  res.json({ ok: true });
});

app.post('/api/registrations', (req, res) => {
  const payload = getRegistrationPayload(req.body);
  const error = validateRegistration(payload);
  if (error) {
    return res.status(400).json({ ok: false, error });
  }

  saveRegistration(payload);

  return res.json({ ok: true });
});

app.post('/register', (req, res) => {
  const payload = getRegistrationPayload(req.body);
  const error = validateRegistration(payload);
  if (error) {
    return res.status(400).send(`<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Registration Error</title>
  <style>
    body { font-family: "Segoe UI", sans-serif; margin: 0; background: #f4f7fb; color: #0f1b2d; display: grid; place-items: center; min-height: 100vh; }
    .card { width: min(420px, 92vw); background: #fff; border-radius: 20px; padding: 24px; box-shadow: 0 24px 50px rgba(10, 31, 68, 0.18); }
    h1 { margin: 0 0 10px; font-size: 24px; }
    p { margin: 0 0 18px; color: #5d6d84; }
    a { display: inline-block; padding: 12px 18px; border-radius: 12px; background: #0a66ff; color: #fff; text-decoration: none; font-weight: 600; }
  </style>
</head>
<body>
  <div class="card">
    <h1>Registration Failed</h1>
    <p>${escapeHtml(error)}</p>
    <a href="/">Back to Registration</a>
  </div>
</body>
</html>`);
  }

  saveRegistration(payload);
  return res.redirect('/registration-success.html');
});

app.get('/registration-success.html', (_req, res) => {
  res.send(`<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Registration Submitted</title>
  <style>
    body { font-family: "Segoe UI", sans-serif; margin: 0; background: #f4f7fb; color: #0f1b2d; display: grid; place-items: center; min-height: 100vh; }
    .card { width: min(420px, 92vw); background: #fff; border-radius: 20px; padding: 24px; box-shadow: 0 24px 50px rgba(10, 31, 68, 0.18); }
    h1 { margin: 0 0 10px; font-size: 24px; }
    p { margin: 0 0 18px; color: #5d6d84; }
    .actions { display: flex; gap: 12px; flex-wrap: wrap; }
    a { display: inline-block; padding: 12px 18px; border-radius: 12px; background: #0a66ff; color: #fff; text-decoration: none; font-weight: 600; }
  </style>
</head>
<body>
  <div class="card">
    <h1>Registration Submitted</h1>
    <p>Your registration has been submitted successfully.</p>
    <div class="actions">
      <a href="/">OK</a>
      <a href="/admin/registrations.html">View Registrations</a>
    </div>
  </div>
</body>
</html>`);
});

function renderRegistrationsPage(_req, res) {
  const result = db.exec(`
    SELECT id, first_name, last_name, company, email, city, created_at
    FROM singapore_registrations
    ORDER BY id DESC
  `);

  const rows = result[0]
    ? result[0].values.map((row) => ({
        id: row[0],
        firstName: row[1],
        lastName: row[2],
        company: row[3],
        email: row[4],
        city: row[5],
        createdAt: row[6],
      }))
    : [];

  const tableRows = rows.length
    ? rows
        .map(
          (row) => `
            <tr>
              <td>${escapeHtml(row.id)}</td>
              <td>${escapeHtml(row.firstName)}</td>
              <td>${escapeHtml(row.lastName)}</td>
              <td>${escapeHtml(row.company)}</td>
              <td>${escapeHtml(row.email)}</td>
              <td>${escapeHtml(row.city)}</td>
              <td>${escapeHtml(row.createdAt)}</td>
            </tr>
          `
        )
        .join('')
    : '<tr><td colspan="7">No registrations yet.</td></tr>';

  res.send(`<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Registrations</title>
  <style>
    body { font-family: "Segoe UI", sans-serif; margin: 0; background: #f4f7fb; color: #0f1b2d; }
    .wrap { width: min(1180px, 94vw); margin: 20px auto; }
    table { width: 100%; border-collapse: collapse; background: #fff; border-radius: 14px; overflow: hidden; box-shadow: 0 12px 30px rgba(10,31,68,.08); }
    th, td { padding: 12px 14px; border-bottom: 1px solid #dde5ef; text-align: left; vertical-align: top; font-size: 14px; }
    th { background: #eef4ff; }
    tr:last-child td { border-bottom: none; }
  </style>
</head>
<body>
  <div class="wrap">
    <table>
      <thead>
        <tr>
          <th>ID</th>
          <th>First Name</th>
          <th>Last Name</th>
          <th>Company</th>
          <th>Email</th>
          <th>City</th>
          <th>Submitted At</th>
        </tr>
      </thead>
      <tbody>${tableRows}</tbody>
    </table>
  </div>
</body>
</html>`);
}

app.get('/admin/registrations', renderRegistrationsPage);
app.get('/admin/registrations.html', renderRegistrationsPage);

app.use((_req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

initDatabase()
  .then(() => {
    app.listen(port, () => {
      console.log(`Server listening on port ${port}`);
    });
  })
  .catch((error) => {
    console.error('Failed to initialize database', error);
    process.exit(1);
  });
