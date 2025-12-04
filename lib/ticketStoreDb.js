const fs = require("fs");
const path = require("path");
const Database = require("better-sqlite3");
const { hydrate } = require("./ticketHydrate.js");

const TICKET_DIR = path.join(__dirname, "..", "Ticket");
if (!fs.existsSync(TICKET_DIR)) fs.mkdirSync(TICKET_DIR);

const DB_FILE = process.env.DB_FILE || path.join(__dirname, "..", "data", "tickets.db");
const dbDir = path.dirname(DB_FILE);
if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir, { recursive: true });

const db = new Database(DB_FILE);
db.pragma("journal_mode = WAL");
db.exec(`
  CREATE TABLE IF NOT EXISTS tickets (
    id TEXT PRIMARY KEY,
    data TEXT NOT NULL,
    status TEXT,
    category TEXT,
    dueAt TEXT,
    created TEXT,
    updatedAt TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_tickets_status ON tickets(status);
  CREATE INDEX IF NOT EXISTS idx_tickets_category ON tickets(category);
  CREATE INDEX IF NOT EXISTS idx_tickets_dueAt ON tickets(dueAt);
  CREATE INDEX IF NOT EXISTS idx_tickets_created ON tickets(created);
`);

const selectAll = db.prepare("SELECT data FROM tickets ORDER BY datetime(created) DESC, id DESC");
const selectOne = db.prepare("SELECT data FROM tickets WHERE id = ?");
const upsert = db.prepare(`
  INSERT INTO tickets (id, data, status, category, dueAt, created, updatedAt)
  VALUES (@id, @data, @status, @category, @dueAt, @created, @updatedAt)
  ON CONFLICT(id) DO UPDATE SET
    data=excluded.data,
    status=excluded.status,
    category=excluded.category,
    dueAt=excluded.dueAt,
    updatedAt=excluded.updatedAt
`);
const removeStmt = db.prepare("DELETE FROM tickets WHERE id = ?");

function list() {
  return selectAll.all().map((row) => hydrate(JSON.parse(row.data))).filter(Boolean);
}

function get(id) {
  const row = selectOne.get(id);
  if (!row) return null;
  return hydrate(JSON.parse(row.data));
}

function save(ticket) {
  const hydrated = hydrate(ticket);
  if (!hydrated || !hydrated.id) return;
  if (!hydrated.created) hydrated.created = new Date().toISOString();
  const now = new Date().toISOString();

  upsert.run({
    id: hydrated.id,
    data: JSON.stringify(hydrated, null, 2),
    status: hydrated.status || null,
    category: hydrated.category || null,
    dueAt: hydrated.dueAt || null,
    created: hydrated.created,
    updatedAt: now,
  });

  return hydrated;
}

function remove(id) {
  if (!id) return false;

  try {
    removeStmt.run(id);
  } catch (_) {}

  // Clean up any JSON/attachment folder on disk to keep store parity
  try {
    const file = path.join(TICKET_DIR, `${id}.json`);
    if (fs.existsSync(file)) fs.unlinkSync(file);
  } catch (_) {}

  try {
    const dir = path.join(TICKET_DIR, id);
    if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
  } catch (_) {}

  return true;
}

module.exports = { list, get, save, remove, TICKET_DIR };
