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

app.get('/health', (_req, res) => {
  res.json({ ok: true });
});

app.post('/api/registrations', (req, res) => {
  const firstName = String(req.body.firstName || '').trim();
  const lastName = String(req.body.lastName || '').trim();
  const company = String(req.body.company || '').trim();
  const email = String(req.body.email || '').trim();
  const city = String(req.body.city || 'Singapore').trim() || 'Singapore';

  if (!firstName || !lastName || !company || !email) {
    return res.status(400).json({ ok: false, error: 'All fields are required.' });
  }

  const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailPattern.test(email)) {
    return res.status(400).json({ ok: false, error: 'Please enter a valid email address.' });
  }

  db.run(
    `INSERT INTO singapore_registrations (first_name, last_name, company, email, city, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [firstName, lastName, company, email, city, new Date().toISOString()]
  );
  saveDatabase();

  return res.json({ ok: true });
});

app.get('/admin/registrations', (_req, res) => {
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
});

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
