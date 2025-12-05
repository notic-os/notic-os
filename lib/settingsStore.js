const fs = require("fs");
const path = require("path");

const DATA_DIR = path.join(__dirname, "..", "data");
const SETTINGS_FILE = path.join(DATA_DIR, "settings.json");

const defaults = {
  theme: "dark",
  ticketPrefix: "NTC",
  loginLogo: "",
  slaHours: 24
};

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

function load() {
  ensureDataDir();
  if (!fs.existsSync(SETTINGS_FILE)) return { ...defaults };
  try {
    const parsed = JSON.parse(fs.readFileSync(SETTINGS_FILE, "utf8"));
    return { ...defaults, ...parsed };
  } catch (e) {
    console.warn("Failed to read settings, using defaults:", e.message);
    return { ...defaults };
  }
}

function save(patch = {}) {
  ensureDataDir();
  const merged = { ...defaults, ...load(), ...patch };
  fs.writeFileSync(SETTINGS_FILE, JSON.stringify(merged, null, 2));
  return merged;
}

module.exports = { load, save, defaults, SETTINGS_FILE };
