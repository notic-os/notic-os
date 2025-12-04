const { UNCATEGORIZED } = require("./categories.js");

const DEFAULT_SLA_HOURS = Number(process.env.SLA_HOURS || 24) || 24;
const DEFAULT_SLA_MINUTES = DEFAULT_SLA_HOURS * 60;

function hydrate(ticket) {
  if (!ticket || typeof ticket !== "object") return null;

  if (!ticket.category) ticket.category = UNCATEGORIZED;
  if (!Array.isArray(ticket.updates)) ticket.updates = [];
  if (!Array.isArray(ticket.attachments)) ticket.attachments = [];

  const slaMinutes =
    typeof ticket.slaMinutes === "number" && ticket.slaMinutes > 0
      ? ticket.slaMinutes
      : DEFAULT_SLA_MINUTES;
  ticket.slaMinutes = slaMinutes;

  if (!ticket.dueAt && ticket.created) {
    const createdMs = new Date(ticket.created).getTime();
    if (Number.isFinite(createdMs)) {
      const due = new Date(createdMs + slaMinutes * 60 * 1000);
      ticket.dueAt = due.toISOString();
    }
  }

  return ticket;
}

module.exports = { hydrate, DEFAULT_SLA_MINUTES };
