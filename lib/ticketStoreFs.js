const fs = require("fs");
const path = require("path");
const { hydrate } = require("./ticketHydrate.js");

const TICKET_DIR = path.join(__dirname, "..", "Ticket");
if (!fs.existsSync(TICKET_DIR)) fs.mkdirSync(TICKET_DIR);

function list() {
  return fs
    .readdirSync(TICKET_DIR)
    .filter((f) => f.endsWith(".json"))
    .map((f) => hydrate(JSON.parse(fs.readFileSync(path.join(TICKET_DIR, f)))))
    .filter(Boolean);
}

function get(id) {
  const file = path.join(TICKET_DIR, `${id}.json`);
  if (!fs.existsSync(file)) return null;
  return hydrate(JSON.parse(fs.readFileSync(file)));
}

function save(ticket) {
  const hydrated = hydrate(ticket);
  if (!hydrated) return;
  const file = path.join(TICKET_DIR, `${hydrated.id}.json`);
  fs.writeFileSync(file, JSON.stringify(hydrated, null, 2));
}

function remove(id) {
  if (!id) return false;

  // Remove the ticket JSON file
  try {
    const file = path.join(TICKET_DIR, `${id}.json`);
    if (fs.existsSync(file)) fs.unlinkSync(file);
  } catch (_) {}

  // Remove any attachment folder for the ticket
  try {
    const dir = path.join(TICKET_DIR, id);
    if (fs.existsSync(dir)) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  } catch (_) {}

  return true;
}

module.exports = { list, get, save, remove, TICKET_DIR };
