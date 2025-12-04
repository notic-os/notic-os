// Chooses between the file-based store (default) and the SQLite-backed store when enabled.
const backend = (process.env.TICKET_BACKEND || "").toLowerCase();
const preferDb = backend === "db" || backend === "sqlite" || Boolean(process.env.DB_FILE);

let impl;

if (preferDb) {
  try {
    impl = require("./ticketStoreDb.js");
    impl.backend = "db";
  } catch (err) {
    console.warn("Falling back to JSON store; failed to load DB adapter:", err.message);
  }
}

if (!impl) {
  impl = require("./ticketStoreFs.js");
  impl.backend = "fs";
}

module.exports = impl;
