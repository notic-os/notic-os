const CATEGORIES = ["Hardware", "Software", "Networking", "Access", "Other"];
const UNCATEGORIZED = "Uncategorized";

function normalizeCategory(value) {
  if (CATEGORIES.includes(value)) return value;
  if (value === UNCATEGORIZED) return UNCATEGORIZED;
  return UNCATEGORIZED;
}

module.exports = { CATEGORIES, UNCATEGORIZED, normalizeCategory };
