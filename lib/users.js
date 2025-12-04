const fs = require("fs");
const path = require("path");

const USERS = JSON.parse(
  fs.readFileSync(path.join(__dirname, "..", "users.json"), "utf8")
);

function normalizeName(name) {
  return String(name || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function findByPrefix(prefix) {
  const lower = prefix.toLowerCase();
  return USERS.find(u => u.name.toLowerCase().startsWith(lower));
}

// Attempts to find an email for a given display name.
// Only returns an email when there is a single, unambiguous match.
function findEmailByName(name) {
  const normalizedInput = normalizeName(name);
  if (!normalizedInput) {
    return { email: null, confidence: "empty" };
  }

  const normalizedUsers = USERS.map(user => ({
    ...user,
    normalized: normalizeName(user.name),
  }));

  const exactMatches = normalizedUsers.filter(u => u.normalized === normalizedInput);
  if (exactMatches.length === 1) {
    const match = exactMatches[0];
    return { email: match.email, match: match.name, confidence: "exact" };
  }
  if (exactMatches.length > 1) {
    return { email: null, conflict: true, candidates: exactMatches.map(u => u.name) };
  }

  const tokens = normalizedInput.split(" ").filter(Boolean);
  if (tokens.length >= 2) {
    const hasFullToken = tokens.some(tok => tok.length > 1);
    const tokenMatches = normalizedUsers.filter(u => {
      const parts = u.normalized.split(" ");
      const matches = tokens.every(tok => {
        if (tok.length === 1) return parts.some(p => p.startsWith(tok));
        return parts.includes(tok);
      });
      if (!matches) return false;
      if (!hasFullToken) return false; // avoid matching purely on initials
      return true;
    });
    if (tokenMatches.length === 1) {
      const match = tokenMatches[0];
      return { email: match.email, match: match.name, confidence: "tokens" };
    }
    if (tokenMatches.length > 1) {
      return { email: null, conflict: true, candidates: tokenMatches.map(u => u.name) };
    }
  }

  const prefixMatches = normalizedUsers.filter(u => u.normalized.startsWith(normalizedInput));
  // Prefix-only matches are treated as weak; we don't auto-return an email to avoid wrong choices.
  if (prefixMatches.length === 1) {
    const match = prefixMatches[0];
    return { email: null, match: match.name, confidence: "weak-prefix" };
  }
  if (prefixMatches.length > 1) {
    return { email: null, conflict: true, candidates: prefixMatches.map(u => u.name) };
  }

  return { email: null, confidence: "no-match" };
}

module.exports = { USERS, findByPrefix, findEmailByName };
