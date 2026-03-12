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
