// lib/email.js
const nodemailer = require("nodemailer");
const { sendViaGraph } = require("./graph");

function normalizeRecipientList(to) {
  if (!to) return [];
  const uniq = new Set();
  const push = (s) => {
    const v = String(s || "").trim();
    if (!v) return;
    // split in case a single item contains multiple with commas/semicolons
    for (const part of v.split(/[;,]/)) {
      const p = part.trim();
      if (p) uniq.add(p);
    }
  };

  if (Array.isArray(to)) {
    for (const item of to) push(item);
  } else if (typeof to === "string") {
    push(to);
  }
  return Array.from(uniq);
}

async function sendTicketEmail({ useGraph, smtp, graph, to, subject, html }) {
  const recipients = normalizeRecipientList(to);
  if (!recipients.length) return;

  if (useGraph) {
    return sendViaGraph({
      tenantId: graph?.tenantId,
      clientId: graph?.clientId,
      clientSecret: graph?.clientSecret,
      sender: graph?.sender,
      to: recipients,
      subject,
      html,
    });
  }

  // SMTP
  const transporter = nodemailer.createTransport({
    host: smtp?.host,
    port: smtp?.port,
    secure: !!smtp?.secure,
    requireTLS: true,
    auth: smtp?.user && smtp?.pass ? { user: smtp.user, pass: smtp.pass } : undefined,
  });

  return transporter.sendMail({
    from: smtp?.from,
    to: recipients.join(", "),
    subject,
    html,
    text: String(html || "").replace(/<[^>]*>/g, ""),
    headers: {
      "Content-Type": "text/html; charset=UTF-8",
      "MIME-Version": "1.0",
    },
  });
}

module.exports = { sendTicketEmail };
