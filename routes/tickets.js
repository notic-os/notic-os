const express = require("express");
const Tickets = require("../lib/ticketStore.js");
const { UNCATEGORIZED } = require("../lib/categories.js");
const { sendTicketEmail } = require("../lib/email.js");
const { findEmailByName } = require("../lib/users.js");
const path = require("path");
const fs = require("fs");
const Settings = require("../lib/settingsStore.js");

const router = express.Router();
const MAX_ATTACHMENT_BYTES = 35 * 1024 * 1024; // 35MB

const cors = require("cors");
router.options("/submit", cors());
router.options("/tickets/:id/attachments", cors());

/* === multipart handling for /submit (file optional) === */
const multer = require("multer");
// Store to a temp folder first; we will move into the ticket folder after ID is created
const upload = multer({
  dest: "uploads/",
  limits: { fileSize: MAX_ATTACHMENT_BYTES },
});
// Only run multer when the request is multipart/form-data; otherwise, skip
function maybeUploadSingle(field) {
  return (req, res, next) => {
    if (req.is && req.is("multipart/form-data")) {
      return upload.single(field)(req, res, next);
    }
    return next();
  };
}

/* CREATE TICKET (now supports optional single 'attachment' file) */
router.post("/submit", maybeUploadSingle("attachment"), async (req, res) => {
  try {
    // With multipart/form-data, fields are on req.body; if JSON hits this route, they'd still be in req.body
    const name = (req.body?.name || "").toString().trim();
    const issue = (req.body?.issue || "").toString().trim();

    if (!name || !issue) {
      return res.status(400).json({ error: "Both 'name' and 'issue' are required." });
    }

    const emailLookup = findEmailByName(name);

    const settings = Settings.load();
    const rawPrefix = (settings.ticketPrefix || "NTC").toString().trim();
    const safePrefix = rawPrefix.replace(/[^a-zA-Z0-9]/g, "").toUpperCase() || "NTC";
    const id = `${safePrefix}-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;

    const createdAt = new Date();
    const slaHours = Number(settings.slaHours || process.env.SLA_HOURS || 24) || 24;
    const slaMinutes = slaHours * 60;
    const dueAt = new Date(createdAt.getTime() + slaMinutes * 60 * 1000);

    const ticket = {
      id,
      name,
      issue,
      category: UNCATEGORIZED,
      created: createdAt.toISOString(),
      updates: [],
      status: "Acknowledged",
      slaMinutes,
      dueAt: dueAt.toISOString(),
    };

    if (emailLookup?.email) {
      ticket.email = emailLookup.email;
    }

    // Auto-link duplicates: if an open ticket has the same issue, relate this to it
    try {
      const normalize = (s) => String(s || "").toLowerCase().replace(/\s+/g, " ").replace(/[^a-z0-9 _-]/g, "").trim();
      const canonicalIssue = normalize(issue);
      const existing = Tickets.list().find(
        (t) => t.status !== "Complete" && normalize(t.issue) === canonicalIssue
      );
      if (existing) {
        ticket.related = existing.id;
        // note on the original ticket for visibility
        existing.updates = Array.isArray(existing.updates) ? existing.updates : [];
        existing.updates.push({
          at: new Date().toISOString(),
          text: `Linked similar ticket ${id} opened by ${name}.`,
        });
        Tickets.save(existing);
      }
    } catch (_) {}

    // If a file was uploaded, move it into the ticket's folder and capture metadata
    if (req.file) {
      const originalName = (req.file.originalname || "upload.bin").toString();
      const safeName = originalName.replace(/[^a-zA-Z0-9._-]/g, "_");

      const ticketDir = path.join(Tickets.TICKET_DIR, id);
      if (!fs.existsSync(ticketDir)) fs.mkdirSync(ticketDir, { recursive: true });

      const now = new Date();
      const stamp = now.toISOString().replace(/[:.]/g, "-");

      let storedName = `${stamp}-${safeName}`;
      let destPath = path.join(ticketDir, storedName);
      let counter = 1;
      while (fs.existsSync(destPath)) {
        storedName = `${stamp}-${counter}-${safeName}`;
        destPath = path.join(ticketDir, storedName);
        counter++;
      }

      // Move the temp file into place (copy then unlink to be safe across devices)
      try {
        const buf = fs.readFileSync(req.file.path);
        fs.writeFileSync(destPath, buf);
        fs.unlinkSync(req.file.path);

        const meta = {
          originalName: originalName,
          storedName,
          size: buf.length,
          mime: req.file.mimetype || "application/octet-stream",
          uploadedAt: new Date().toISOString(),
        };

        if (!Array.isArray(ticket.attachments)) ticket.attachments = [];
        ticket.attachments.push(meta);
      } catch (e) {
        // If we fail to persist the file, still create the ticket but report the file error
        try {
          if (req.file?.path && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
        } catch {}
        return res.status(500).json({ error: "Ticket created, but failed to save attachment." });
      }
    }

    // Persist the ticket
    Tickets.save(ticket);

    // Fire-and-forget email (existing logic)
    const html = `
      <div style="font-family:Arial, sans-serif; background:#f7f7f7; padding:20px;">
        <div style="max-width:600px;margin:auto;background:#ffffff;border-radius:8px;padding:20px;border:1px solid #e2e2e2;">
          <h2 style="color:#0F6CBD;margin-bottom:15px;">New Ticket Created</h2>
          <p><strong>ID:</strong> ${id}</p>
          <p><strong>Name:</strong> ${name}</p>
          <p><strong>Issue:</strong><br>${issue}</p>

          <br>
          <p>You can view it here:</p>
          <a
            href="${process.env.BASE_URL}/tickets/${id}"
            style="
              display:inline-block;
              background:#0F6CBD;
              color:#ffffff !important;
              padding:10px 16px;
              border-radius:6px;
              text-decoration:none;
              font-weight:600;
              font-family:Arial, sans-serif;
            "
          >View Ticket</a>
          <br><br>

          <p style="font-size:12px;color:#666;">Support Console Notification</p>
        </div>
      </div>
    `;

    await Promise.race([
      sendTicketEmail({
        useGraph: process.env.USE_GRAPH === "true",
        to: process.env.TO_EMAIL,
        subject: `New Ticket [${id}]`,
        html,
        smtp: {
          host: process.env.SMTP_HOST,
          port: Number(process.env.SMTP_PORT),
          secure: process.env.SMTP_SECURE === "true",
          user: process.env.SMTP_USER,
          pass: process.env.SMTP_PASS,
          from: process.env.FROM_EMAIL,
        },
        graph: {
          tenantId: process.env.AZURE_TENANT_ID,
          clientId: process.env.AZURE_CLIENT_ID,
          clientSecret: process.env.AZURE_CLIENT_SECRET,
          sender: process.env.GRAPH_SENDER_UPN,
        },
      }),
      new Promise((r) => setTimeout(r, 2000)),
    ]).catch(() => {});

    res.json({ message: `Thanks, ${name}. Your ticket ID is ${id}`, id });
  } catch (err) {
    console.error("Submit error:", err);
    res.status(500).json({ error: "Failed to submit ticket." });
  }
});

/* ATTACHMENT UPLOAD (raw octet-stream) */
router.put(
  "/tickets/:id/attachments",
  express.raw({ type: ["application/octet-stream", "*/*"], limit: MAX_ATTACHMENT_BYTES }),
  (req, res) => {
    const t = Tickets.get(req.params.id);
    if (!t) return res.status(404).json({ error: "Ticket not found" });

    const originalName = (req.query.filename || req.get("x-filename") || "upload.bin").toString();
    const safeName = originalName.replace(/[^a-zA-Z0-9._-]/g, "_");
    const ticketDir = path.join(Tickets.TICKET_DIR, t.id);
    if (!fs.existsSync(ticketDir)) fs.mkdirSync(ticketDir, { recursive: true });

    const now = new Date();
    const stamp = now.toISOString().replace(/[:.]/g, "-");
    let storedName = `${stamp}-${safeName}`;
    let destPath = path.join(ticketDir, storedName);
    let counter = 1;
    while (fs.existsSync(destPath)) {
      storedName = `${stamp}-${counter}-${safeName}`;
      destPath = path.join(ticketDir, storedName);
      counter++;
    }

    const buf = Buffer.isBuffer(req.body) ? req.body : Buffer.from(req.body || "");
    try {
      fs.writeFileSync(destPath, buf);
    } catch (e) {
      return res.status(500).json({ error: "Failed to save file" });
    }

    const meta = {
      originalName: originalName,
      storedName,
      size: buf.length,
      mime: req.get("content-type") || "application/octet-stream",
      uploadedAt: new Date().toISOString(),
    };

    if (!Array.isArray(t.attachments)) t.attachments = [];
    t.attachments.push(meta);
    Tickets.save(t);

    res.status(201).json({ message: "Uploaded", attachment: meta });
  }
);

/* ATTACHMENT DOWNLOAD */
router.get("/tickets/:id/attachments/:file", (req, res) => {
  const t = Tickets.get(req.params.id);
  if (!t) return res.status(404).send("Ticket not found");

  const fileParam = req.params.file.replace(/\.+\//g, "");
  const filePath = path.join(Tickets.TICKET_DIR, t.id, fileParam);
  if (!filePath.startsWith(path.join(Tickets.TICKET_DIR, t.id))) {
    return res.status(400).send("Invalid file path");
  }
  if (!fs.existsSync(filePath)) return res.status(404).send("File not found");
  res.sendFile(path.resolve(filePath));
});

/* PUBLIC TICKET VIEW */
router.get("/tickets/:id", (req, res) => {
  const t = Tickets.get(req.params.id);
  if (!t) return res.status(404).send("Ticket not found");

  const statusColor =
    {
      Acknowledged: "bg-blue-100 text-blue-800",
      "Working on it": "bg-yellow-100 text-yellow-800",
      "Pending result": "bg-indigo-100 text-indigo-800",
      "On hold": "bg-slate-200 text-slate-800",
      Complete: "bg-green-100 text-green-800",
    }[t.status] || "bg-gray-100 text-gray-800";

  const due = t.dueAt ? new Date(t.dueAt) : null;
  const dueMs = due ? due.getTime() : null;
  const nowMs = Date.now();
  const isOverdue = dueMs && dueMs < nowMs && t.status !== "Complete" && t.status !== "On hold";
  const dueLabel = due ? due.toLocaleString() : "Not set";

  const updates =
    t.updates?.map(
      (u) => `
      <div class="border-l-4 border-[#0F6CBD] pl-3 py-2 mb-3 bg-gray-50 rounded">
        <p class="text-xs text-gray-500 mb-1">${new Date(u.at).toLocaleString()}</p>
        <p>${u.text}</p>
      </div>`
    ).join("") || `<p class="text-gray-500 italic">No updates yet.</p>`;

  const categoryDisplay = t.category || UNCATEGORIZED;

  let feedbackSection = "";
  if (t.status === "Complete") {
    if (t.feedback && (t.feedback.rating === "up" || t.feedback.rating === "down")) {
      const ratingLabel = t.feedback.rating === "up" ? "Satisfied" : "Not satisfied";
      const ratingIcon = t.feedback.rating === "up" ? "👍" : "👎";
      const comment = (t.feedback.comment || "").trim();
      feedbackSection = `
      <hr class="my-5">
      <h2 class="text-lg font-semibold mb-3 text-gray-800">Feedback</h2>
      <div class="border border-gray-200 rounded-lg p-4 bg-gray-50">
        <p class="font-medium mb-1">${ratingIcon} ${ratingLabel}</p>
        ${
          comment
            ? `<p class="text-sm text-gray-700 whitespace-pre-line">${comment}</p>`
            : `<p class="text-sm text-gray-500 italic">No additional comments.</p>`
        }
        <p class="mt-2 text-xs text-gray-500">Submitted ${t.feedback.at ? new Date(t.feedback.at).toLocaleString() : ""}</p>
      </div>`;
    } else {
      feedbackSection = `
      <hr class="my-5">
      <h2 class="text-lg font-semibold mb-3 text-gray-800">How did we do?</h2>
      <p class="text-sm text-gray-600 mb-3">This ticket is marked complete. Let us know how the support experience was.</p>
      <form method="POST" action="/tickets/${t.id}/feedback" class="space-y-3">
        <div class="flex gap-4">
          <label class="flex items-center gap-2 text-sm cursor-pointer">
            <input type="radio" name="rating" value="up" class="h-4 w-4" required />
            <span>👍 Satisfied</span>
          </label>
          <label class="flex items-center gap-2 text-sm cursor-pointer">
            <input type="radio" name="rating" value="down" class="h-4 w-4" />
            <span>👎 Not satisfied</span>
          </label>
        </div>
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1">Optional comment</label>
          <textarea name="comment" rows="3" class="w-full border border-gray-300 rounded-md p-2 text-sm" placeholder="Tell us what worked well or what we could improve."></textarea>
        </div>
        <button class="inline-flex items-center justify-center px-4 py-2 rounded-md bg-[#0F6CBD] text-white text-sm font-medium hover:bg-[#115EA3]">
          Send feedback
        </button>
      </form>`;
    }
  }

  res.send(`
  <html>
  <head>
    <title>Ticket ${t.id}</title>
    <link href="/assets/tailwind.css" rel="stylesheet" />
  </head>

  <body class="bg-gray-100 min-h-screen flex items-center justify-center p-6">
    <div class="bg-white shadow-lg rounded-xl p-6 w-full max-w-4xl border border-gray-200">
      
      <h1 class="text-2xl font-bold text-[#0F6CBD] mb-2">${t.id}</h1>
      <p class="text-sm text-gray-500 mb-4">${new Date(t.created).toLocaleString()}</p>

      <div class="flex items-center gap-2 mb-4">
        <span class="px-3 py-1 text-xs rounded-full ${statusColor}">
          ${t.status}
        </span>
      </div>

      <p class="mb-2"><strong>Name:</strong> ${t.name}</p>
      <p class="mb-2"><strong>Due by:</strong> ${dueLabel} ${isOverdue ? '<span class="ml-1 text-xs text-red-600">(Overdue)</span>' : ""}</p>
      <p class="mb-4"><strong>Created:</strong> ${new Date(t.created).toLocaleString()}</p>
      <p class="mb-4"><strong>Category:</strong> ${categoryDisplay}</p>
      <p class="mb-4"><strong>Issue:</strong><br>${t.issue}</p>

      <hr class="my-5">

      <h2 class="text-lg font-semibold mb-3 text-gray-800">Attachments</h2>
      ${
        (t.attachments && t.attachments.length)
          ? `<ul class="list-disc pl-5">${t.attachments
              .map(a => `<li><a class="text-blue-600 underline" href="/tickets/${t.id}/attachments/${a.storedName}">${a.originalName}</a> <span class="text-xs text-gray-500">(${Math.ceil((a.size||0)/1024)} KB)</span></li>`)
              .join("")}</ul>`
          : `<p class="text-gray-500 italic">No attachments.</p>`
      }

      <hr class="my-5">

      <h2 class="text-lg font-semibold mb-3 text-gray-800">Updates</h2>
      ${updates}

      ${feedbackSection}

      <div class="mt-6 text-center">
        <a href="/" class="text-[#0F6CBD] font-medium hover:underline">Return to support page</a>
      </div>
    </div>
  </body>
  </html>
  `);
});

/* FEEDBACK SUBMIT */
router.post("/tickets/:id/feedback", (req, res) => {
  const t = Tickets.get(req.params.id);
  if (!t) return res.status(404).send("Ticket not found");

  if (t.status !== "Complete") {
    return res.status(400).send("Feedback is only available once the ticket is complete.");
  }

  const rating = (req.body?.rating || "").toString();
  if (!["up", "down"].includes(rating)) {
    return res.status(400).send("Please choose thumbs up or thumbs down.");
  }

  const rawComment = (req.body?.comment || "").toString();
  const comment = rawComment.length > 1000 ? rawComment.slice(0, 1000) : rawComment;

  t.feedback = {
    rating,
    comment,
    at: new Date().toISOString(),
  };

  Tickets.save(t);
  return res.redirect(`/tickets/${t.id}`);
});

// Attachment size errors (multer / body-parser)
router.use((err, req, res, next) => {
  if (err?.code === "LIMIT_FILE_SIZE" || err?.type === "entity.too.large") {
    return res.status(413).json({ error: "Attachment too large. Max size is 35MB." });
  }
  return next(err);
});

module.exports = router;
