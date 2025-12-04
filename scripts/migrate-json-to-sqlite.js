#!/usr/bin/env node
const fs = require("fs");
const path = require("path");
const Database = require("better-sqlite3");
const { hydrate } = require("../lib/ticketHydrate.js");

const srcDir = path.resolve(process.argv[2] || path.join(__dirname, "..", "Ticket"));
const dbFile = path.resolve(process.argv[3] || path.join(__dirname, "..", "data", "tickets.db"));

if (!fs.existsSync(srcDir)) {
  console.error(`Source directory does not exist: ${srcDir}`);
  process.exit(1);
}

const dbDir = path.dirname(dbFile);
if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir, { recursive: true });

const db = new Database(dbFile);
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

let count = 0;
for (const file of fs.readdirSync(srcDir).filter((f) => f.endsWith(".json"))) {
  const raw = fs.readFileSync(path.join(srcDir, file));
  let ticket;
  try {
    ticket = hydrate(JSON.parse(raw));
  } catch (err) {
    console.error(`Skipping ${file}: ${err.message}`);
    continue;
  }
  if (!ticket || !ticket.id) {
    console.warn(`Skipping ${file}: missing id`);
    continue;
  }

  const now = new Date().toISOString();
  if (!ticket.created) ticket.created = now;

  upsert.run({
    id: ticket.id,
    data: JSON.stringify(ticket, null, 2),
    status: ticket.status || null,
    category: ticket.category || null,
    dueAt: ticket.dueAt || null,
    created: ticket.created,
    updatedAt: now,
  });
  count++;
}

console.log(`Imported ${count} tickets from ${srcDir} into ${dbFile}`);
