const express = require("express");
const Tickets = require("../lib/ticketStore.js");
const { USERS } = require("../lib/users.js");
const { sendTicketEmail } = require("../lib/email.js");
const { CATEGORIES, UNCATEGORIZED, normalizeCategory } = require("../lib/categories.js");
const fs = require("fs");
const path = require("path");

const router = express.Router();

function toMs(value) {
  const ms = new Date(value).getTime();
  return Number.isFinite(ms) ? ms : null;
}

function formatDuration(ms) {
  if (!Number.isFinite(ms) || ms <= 0) return "—";
  const totalMinutes = Math.round(ms / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours <= 0) return `${minutes}m`;
  if (minutes === 0) return `${hours}h`;
  return `${hours}h ${minutes}m`;
}

function isOverdue(ticket, nowMs) {
  if (!ticket || ticket.status === "Complete" || ticket.status === "On hold") return false;
  const dueMs = toMs(ticket.dueAt);
  if (!dueMs) return false;
  return dueMs < nowMs;
}

function toDatetimeLocalValue(value) {
  const ms = toMs(value);
  if (!Number.isFinite(ms)) return "";
  // Normalize to local time for datetime-local input
  const offset = new Date(ms).getTimezoneOffset() * 60000;
  return new Date(ms - offset).toISOString().slice(0, 16);
}

/* ADMIN DASHBOARD (STATS) */
router.get("/", (req, res) => {
  const all = Tickets.list();
  const nowMs = Date.now();

  const open = all.filter(t => t.status !== "Complete");
  const closed = all.filter(t => t.status === "Complete");
  const overdue = open.filter(t => isOverdue(t, nowMs));

  let firstResponseTotal = 0;
  let firstResponseCount = 0;
  let resolveTotal = 0;
  let resolveCount = 0;

  for (const t of all) {
    const createdMs = toMs(t.created);
    if (!createdMs) continue;

    if (t.firstResponseAt) {
      const firstMs = toMs(t.firstResponseAt);
      if (firstMs && firstMs >= createdMs) {
        firstResponseTotal += firstMs - createdMs;
        firstResponseCount += 1;
      }
    }

    if (t.resolvedAt) {
      const resolvedMs = toMs(t.resolvedAt);
      if (resolvedMs && resolvedMs >= createdMs) {
        resolveTotal += resolvedMs - createdMs;
        resolveCount += 1;
      }
    }
  }

  const avgFirstResponseMs = firstResponseCount ? firstResponseTotal / firstResponseCount : NaN;
  const avgResolveMs = resolveCount ? resolveTotal / resolveCount : NaN;

  const avgFirstResponse = formatDuration(avgFirstResponseMs);
  const avgResolve = formatDuration(avgResolveMs);

  const slaHours = Number(process.env.SLA_HOURS || 24) || 24;
  const todayLabel = new Date().toLocaleDateString();

  const recent = all.slice(0, 5);
  const statusBadgeClasses = {
    "Acknowledged": "bg-blue-900/70 text-blue-100 border border-blue-800",
    "Working on it": "bg-amber-900/70 text-amber-100 border border-amber-800",
    "Pending result": "bg-sky-900/70 text-sky-100 border border-sky-800",
    "On hold": "bg-slate-800 text-slate-200 border border-slate-700",
    "Complete": "bg-emerald-900/70 text-emerald-100 border border-emerald-800"
  };
  const recentRows = recent.map(t => {
    const badge = statusBadgeClasses[t.status] || "bg-slate-800 text-slate-200 border border-slate-700";
    return `
      <tr class="border-b border-slate-800 last:border-0 hover:bg-slate-800">
        <td class="px-4 py-2 text-sm font-medium text-slate-100">
          <a href="/admin/tickets/${t.id}" class="text-sky-300 hover:underline">${t.id}</a>
        </td>
        <td class="px-4 py-2 text-sm text-slate-200">${t.name}</td>
        <td class="px-4 py-2 text-sm text-slate-200">${t.category || UNCATEGORIZED}</td>
        <td class="px-4 py-2">
          <span class="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${badge}">
            ${t.status}
          </span>
        </td>
        <td class="px-4 py-2 text-xs text-slate-400 whitespace-nowrap">${new Date(t.created).toLocaleString()}</td>
      </tr>
    `;
  }).join("");

  res.send(`
  <html>
  <head>
    <title>Notic OS</title>
    <link href="/assets/tailwind.css" rel="stylesheet" />
    <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
  </head>

  <body class="bg-slate-950 text-slate-100 flex min-h-screen">
    
    <aside class="w-64 bg-slate-900/80 backdrop-blur border-r border-slate-800 p-4 flex flex-col gap-4">
      <div class="leading-tight">
        <h1 class="text-xl font-bold text-sky-300">Notic OS</h1>
        <p class="text-xs text-slate-400">Support Console</p>
      </div>

      <nav class="space-y-2">
        <a href="/admin" class="block bg-gradient-to-r from-sky-600 to-blue-600 text-white px-3 py-2 rounded-md text-sm text-center shadow-lg shadow-sky-900/30">Dashboard</a>
        <a href="/admin/tickets" class="block text-sm text-center px-3 py-2 rounded-md text-slate-200 hover:bg-slate-800 border border-transparent hover:border-slate-700 transition">All tickets</a>
        <a href="/admin/tickets?status=active" class="block text-sm text-center px-3 py-2 rounded-md text-slate-200 hover:bg-slate-800 border border-transparent hover:border-slate-700 transition">Active tickets</a>
        <a href="/admin/tickets?status=complete" class="block text-sm text-center px-3 py-2 rounded-md text-slate-200 hover:bg-slate-800 border border-transparent hover:border-slate-700 transition">Completed tickets</a>
      </nav>

      <form method="POST" action="/logout" class="mt-2">
        <button class="w-full text-sm bg-slate-800 border border-slate-700 rounded-md px-3 py-2 hover:bg-slate-700 text-slate-200">Logout</button>
      </form>

      <div class="text-xs text-slate-500 mt-auto pt-2 border-t border-slate-800">v1.0</div>
    </aside>

    <div class="flex-1 flex flex-col">
      <header class="bg-gradient-to-r from-slate-900 via-slate-800 to-sky-900 text-white shadow-lg shadow-sky-900/30">
        <div class="max-w-6xl mx-auto px-6 py-5 flex items-center justify-between">
          <div>
            <h2 class="text-2xl font-semibold">Service Desk Overview</h2>
            <p class="text-sm text-slate-200 mt-1">Realtime view of ticket volume and SLA performance.</p>
          </div>
          <div class="text-right text-xs text-slate-200 space-y-1">
            <p class="font-medium">${todayLabel}</p>
            <p>SLA target: <span class="font-semibold text-sky-200">${slaHours}h</span></p>
          </div>
        </div>
      </header>

      <main class="p-8 space-y-8 max-w-6xl mx-auto w-full">

        <section class="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
          <div class="bg-slate-900 rounded-xl border border-slate-800 p-4 shadow-lg shadow-black/30">
            <div class="flex items-center justify-between">
              <h3 class="text-xs font-semibold text-slate-300 uppercase tracking-wide">Open tickets</h3>
              <span class="text-[10px] font-medium text-sky-200 bg-sky-900/60 px-2 py-0.5 rounded-full border border-sky-800">Live</span>
            </div>
            <p class="mt-2 text-3xl font-semibold text-white">${open.length}</p>
            <p class="mt-1 text-xs text-slate-400">Tickets currently in progress.</p>
          </div>
          <div class="bg-slate-900 rounded-xl border border-slate-800 p-4 shadow-lg shadow-black/30">
            <h3 class="text-xs font-semibold text-slate-300 uppercase tracking-wide">Overdue tickets</h3>
            <p class="mt-2 text-3xl font-semibold text-rose-300">${overdue.length}</p>
            <p class="mt-1 text-xs text-slate-400">Past SLA due date.</p>
          </div>
          <div class="bg-slate-900 rounded-xl border border-slate-800 p-4 shadow-lg shadow-black/30">
            <h3 class="text-xs font-semibold text-slate-300 uppercase tracking-wide">Completed tickets</h3>
            <p class="mt-2 text-3xl font-semibold text-emerald-300">${closed.length}</p>
            <p class="mt-1 text-xs text-slate-400">Resolved and closed.</p>
          </div>
          <div class="bg-slate-900 rounded-xl border border-slate-800 p-4 shadow-lg shadow-black/30">
            <h3 class="text-xs font-semibold text-slate-300 uppercase tracking-wide">Total tickets</h3>
            <p class="mt-2 text-3xl font-semibold text-white">${all.length}</p>
            <p class="mt-1 text-xs text-slate-400">Overall volume in the system.</p>
          </div>
        </section>

        <section class="grid gap-4 grid-cols-1 lg:grid-cols-3">
          <div class="bg-slate-900 rounded-xl border border-slate-800 p-6 lg:col-span-2 shadow-lg shadow-black/30">
            <h3 class="text-lg font-semibold text-slate-100 mb-4">SLA overview</h3>
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-6">
              <div>
                <p class="text-xs font-semibold text-slate-400 uppercase tracking-wide">Average time to first response</p>
                <p class="mt-2 text-2xl font-semibold text-white">${avgFirstResponse}</p>
                <p class="mt-1 text-xs text-slate-400">From ticket creation to first update.</p>
              </div>
              <div>
                <p class="text-xs font-semibold text-slate-400 uppercase tracking-wide">Average time to resolve</p>
                <p class="mt-2 text-2xl font-semibold text-white">${avgResolve}</p>
                <p class="mt-1 text-xs text-slate-400">From ticket creation to completion.</p>
              </div>
            </div>
          </div>
          <div class="bg-slate-900 rounded-xl border border-slate-800 p-6 shadow-lg shadow-black/30">
            <h3 class="text-lg font-semibold text-slate-100 mb-4">Open vs closed</h3>
            <canvas id="ticketChartMain" class="w-full h-40"></canvas>
          </div>
        </section>

        <section class="bg-slate-900 rounded-xl border border-slate-800 p-6 shadow-lg shadow-black/30">
          <div class="flex items-center justify-between mb-4">
            <div>
              <h3 class="text-lg font-semibold text-slate-100">Recent tickets</h3>
              <p class="text-xs text-slate-400 mt-1">Most recently created tickets.</p>
            </div>
            <a href="/admin/tickets" class="text-xs font-medium text-sky-300 hover:underline">View all</a>
          </div>
          ${
            recent.length
              ? `
          <div class="overflow-x-auto border border-slate-800 rounded-lg">
            <table class="min-w-full text-sm text-left text-slate-200">
              <thead class="bg-slate-800 text-slate-300 uppercase text-xs">
                <tr>
                  <th class="px-4 py-2">ID</th>
                  <th class="px-4 py-2">Name</th>
                  <th class="px-4 py-2">Category</th>
                  <th class="px-4 py-2">Status</th>
                  <th class="px-4 py-2">Created</th>
                </tr>
              </thead>
              <tbody>
                ${recentRows}
              </tbody>
            </table>
          </div>`
              : `<p class="text-sm text-slate-400">No tickets have been created yet.</p>`
          }
        </section>

      </main>
    </div>

    <script>
      Chart.defaults.color = '#e2e8f0';
      Chart.defaults.borderColor = 'rgba(148, 163, 184, 0.35)';
      const ctx = document.getElementById('ticketChartMain');
      if (ctx) {
        new Chart(ctx, {
          type: 'doughnut',
          data: {
            labels: ['Open', 'Closed'],
            datasets: [{
              data: [${open.length}, ${closed.length}],
              backgroundColor: ['#0ea5e9', '#22c55e'],
              borderColor: '#0b1220'
            }]
          },
          options: {
            responsive: true,
            plugins: {
              legend: { position: 'bottom', labels: { color: '#cbd5e1' } }
            }
          }
        });
      }
    </script>

  </body>
  </html>
  `);
});

/* TICKETS LIST (ALL/ACTIVE/COMPLETE) */
router.get("/tickets", (req, res) => {
  const allowedCategories = ["All", ...CATEGORIES, UNCATEGORIZED];
  const requestedCategory = req.query.category;
  const selectedCategory = allowedCategories.includes(requestedCategory) ? requestedCategory : "All";
  const statusFilterRaw = (req.query.status || "").toString();
  const statusFilter = ["active", "complete"].includes(statusFilterRaw) ? statusFilterRaw : "all";

  const categoryOptions = allowedCategories
    .map(cat => `<option value="${cat}" ${selectedCategory === cat ? "selected" : ""}>${cat}</option>`)
    .join("");

  const all = Tickets.list()
    .sort((a, b) => new Date(b.created) - new Date(a.created));
  const filteredByCategory = selectedCategory === "All"
    ? all
    : all.filter(t => (t.category || UNCATEGORIZED) === selectedCategory);

  const active = filteredByCategory.filter(t => t.status !== "Complete");
  const complete = filteredByCategory.filter(t => t.status === "Complete");

  const nowMs = Date.now();
  const showActive = statusFilter !== "complete";
  const showComplete = statusFilter !== "active";

  const viewLabel =
    statusFilter === "active"
      ? "Active tickets"
      : statusFilter === "complete"
      ? "Completed tickets"
      : "All tickets";

  res.send(`
  <html>
  <head>
    <title>Notic Admin — Tickets</title>
    <link href="/assets/tailwind.css" rel="stylesheet" />
  </head>

  <body class="bg-slate-950 text-slate-100 flex min-h-screen">
    
    <aside class="w-64 bg-slate-900/80 backdrop-blur border-r border-slate-800 p-4 flex flex-col gap-4">
      <div class="leading-tight">
        <h1 class="text-xl font-bold text-sky-300">Notic OS</h1>
        <p class="text-xs text-slate-400">Support Console</p>
      </div>

      <nav class="space-y-2">
        <a href="/admin" class="block text-sm text-center px-3 py-2 rounded-md text-slate-200 hover:bg-slate-800 border border-transparent hover:border-slate-700 transition">Dashboard</a>
        <a href="/admin/tickets" class="block bg-gradient-to-r from-sky-600 to-blue-600 text-white px-3 py-2 rounded-md text-sm text-center shadow-lg shadow-sky-900/30">All tickets</a>
        <a href="/admin/tickets?status=active" class="block text-sm text-center px-3 py-2 rounded-md text-slate-200 hover:bg-slate-800 border border-transparent hover:border-slate-700 transition">Active tickets</a>
        <a href="/admin/tickets?status=complete" class="block text-sm text-center px-3 py-2 rounded-md text-slate-200 hover:bg-slate-800 border border-transparent hover:border-slate-700 transition">Completed tickets</a>
      </nav>

      <form method="POST" action="/logout" class="mt-2">
        <button class="w-full text-sm bg-slate-800 border border-slate-700 rounded-md px-3 py-2 hover:bg-slate-700 text-slate-200">Logout</button>
      </form>

      <div class="text-xs text-slate-500 mt-auto pt-2 border-t border-slate-800">v1.0</div>
    </aside>

    <div class="flex-1 flex flex-col">
      <header class="bg-gradient-to-r from-slate-900 via-slate-800 to-sky-900 text-white shadow-lg shadow-sky-900/30">
        <div class="max-w-6xl mx-auto px-6 py-4">
          <h2 class="text-xl font-semibold">Tickets</h2>
          <p class="text-xs text-slate-200 mt-1">View: ${viewLabel}</p>
        </div>
      </header>

      <main class="p-8 space-y-8 max-w-6xl mx-auto w-full">

        <section class="bg-slate-900 rounded-xl border border-slate-800 p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 shadow-lg shadow-black/30">
          <h2 class="text-sm font-semibold text-slate-100">Filters</h2>
          <form method="GET" class="flex flex-col sm:flex-row gap-3 sm:items-center text-sm">
            <input type="hidden" name="status" value="${statusFilter === "all" ? "" : statusFilter}">
            <div class="flex items-center gap-2">
              <label for="categoryFilter" class="text-xs font-medium text-slate-300">Category</label>
              <select
                id="categoryFilter"
                name="category"
                class="border border-slate-700 rounded-md px-2 py-1 text-sm bg-slate-950 text-slate-100"
                onchange="this.form.submit()"
              >
                ${categoryOptions}
              </select>
              ${selectedCategory !== "All"
                ? `<a href="/admin/tickets${statusFilter !== "all" ? `?status=${statusFilter}` : ""}" class="text-xs text-sky-300 hover:underline">Reset</a>`
                : ""}
            </div>
          </form>
        </section>

        ${showActive ? `
        <section class="bg-slate-900 rounded-xl border border-slate-800 p-6 shadow-lg shadow-black/30">
          <div class="flex items-center justify-between mb-4">
            <div>
              <h2 class="text-lg font-semibold text-slate-100">Active tickets</h2>
              <p class="text-xs text-slate-400 mt-1">Open tickets by category and due date.</p>
            </div>
            <span class="text-xs font-medium text-slate-300">Count: ${active.length}</span>
          </div>
          <div class="overflow-x-auto border border-slate-800 rounded-lg">
            <table class="min-w-full text-sm text-left text-slate-200">
              <thead class="bg-slate-800 text-slate-300 uppercase text-xs">
                <tr>
                  <th class="px-4 py-2">ID</th>
                  <th class="px-4 py-2">Name</th>
                  <th class="px-4 py-2">Category</th>
                  <th class="px-4 py-2">Status</th>
                  <th class="px-4 py-2">Due</th>
                  <th class="px-4 py-2">Created</th>
                </tr>
              </thead>
              <tbody>
                ${active.map(t => {
                  const overdue = isOverdue(t, nowMs);
                  const rowClass = overdue
                    ? "border-b border-slate-800 bg-rose-900/40 hover:bg-rose-900/60"
                    : "border-b border-slate-800 hover:bg-slate-800";
                  const dueDisplay = t.dueAt ? new Date(t.dueAt).toLocaleString() : "—";
                  return `
                  <tr class="${rowClass}">
                    <td class="px-4 py-2 text-sm font-medium">
                      <a href="/admin/tickets/${t.id}" class="text-sky-300 hover:underline">${t.id}</a>
                    </td>
                    <td class="px-4 py-2 text-sm text-slate-200">${t.name}</td>
                    <td class="px-4 py-2 text-sm text-slate-200">${t.category || UNCATEGORIZED}</td>
                    <td class="px-4 py-2 text-sm text-slate-200">
                      ${t.status}
                      ${overdue ? '<span class="ml-1 text-[10px] font-medium text-rose-200">(Overdue)</span>' : ""}
                    </td>
                    <td class="px-4 py-2 text-xs text-slate-400 whitespace-nowrap">${dueDisplay}</td>
                    <td class="px-4 py-2 text-xs text-slate-400 whitespace-nowrap">${new Date(t.created).toLocaleString()}</td>
                  </tr>`;
                }).join("")}
              </tbody>
            </table>
          </div>
        </section>
        ` : ""}

        ${showComplete ? `
        <section class="bg-slate-900 rounded-xl border border-slate-800 p-6 shadow-lg shadow-black/30">
          <div class="flex items-center justify-between mb-4">
            <div>
              <h2 class="text-lg font-semibold text-slate-100">Completed tickets</h2>
              <p class="text-xs text-slate-400 mt-1">Recently resolved work.</p>
            </div>
            <span class="text-xs font-medium text-slate-300">Count: ${complete.length}</span>
          </div>
          <div class="overflow-x-auto border border-slate-800 rounded-lg">
            <table class="min-w-full text-sm text-left text-slate-200">
              <thead class="bg-slate-800 text-slate-300 uppercase text-xs">
                <tr>
                  <th class="px-4 py-2">ID</th>
                  <th class="px-4 py-2">Name</th>
                  <th class="px-4 py-2">Category</th>
                  <th class="px-4 py-2">Status</th>
                  <th class="px-4 py-2">Created</th>
                </tr>
              </thead>
              <tbody>
                ${complete.map(t => `
                  <tr class="border-b border-slate-800 bg-emerald-900/30 hover:bg-emerald-900/50">
                    <td class="px-4 py-2 text-sm font-medium">
                      <a href="/admin/tickets/${t.id}" class="text-sky-300 hover:underline">${t.id}</a>
                    </td>
                    <td class="px-4 py-2 text-sm text-slate-200">${t.name}</td>
                    <td class="px-4 py-2 text-sm text-slate-200">${t.category || UNCATEGORIZED}</td>
                    <td class="px-4 py-2 text-sm text-slate-200">${t.status}</td>
                    <td class="px-4 py-2 text-xs text-slate-400 whitespace-nowrap">${new Date(t.created).toLocaleString()}</td>
                  </tr>`).join("")}
              </tbody>
            </table>
          </div>
        </section>
        ` : ""}

      </main>
    </div>

  </body>
  </html>
  `);
});

/* TICKET DETAIL */
router.get("/tickets/:id", (req, res) => {
  const t = Tickets.get(req.params.id);
  if (!t) return res.status(404).send("Not found");

  const statuses = ["Acknowledged","Working on it","Pending result","On hold","Complete"];

  const statusColor = {
    "Acknowledged": "bg-blue-900/70 text-blue-100 border border-blue-800",
    "Working on it": "bg-amber-900/70 text-amber-100 border border-amber-800",
    "Pending result": "bg-sky-900/70 text-sky-100 border border-sky-800",
    "On hold": "bg-slate-800 text-slate-200 border border-slate-700",
    "Complete": "bg-emerald-900/70 text-emerald-100 border border-emerald-800"
  }[t.status] || "bg-slate-800 text-slate-200 border border-slate-700";

  const dueDisplay = t.dueAt ? new Date(t.dueAt).toLocaleString() : "—";
  const overdueFlag = isOverdue(t, Date.now());
  const slaHoursValue = Number.isFinite(Number(t.slaMinutes)) && Number(t.slaMinutes) > 0
    ? (Math.round((Number(t.slaMinutes) / 60) * 10) / 10).toString()
    : "";
  const slaDisplay = slaHoursValue ? `${slaHoursValue}h` : "—";
  const dueInputValue = toDatetimeLocalValue(t.dueAt);

  const updates = t.updates?.map(
    u => `
    <div class="border-l-4 border-sky-600 pl-3 py-2 mb-3 bg-slate-900 rounded">
      <p class="text-xs text-slate-400 mb-1">${new Date(u.at).toLocaleString()}</p>
      <p class="text-slate-100">${u.text}</p>
    </div>`
  ).join("") || `<p class="text-gray-500 italic">No updates yet.</p>`;

  const relatedOptions = Tickets.list()
    .filter(x => x.id !== t.id)
    .map(x => `<option value="${x.id}" ${t.related===x.id?"selected":""}>${x.id} — ${x.name}</option>`)
    .join("");
  const mergeOptions = Tickets.list()
    .filter(x => x.id !== t.id)
    .map(x => `<option value="${x.id}">${x.id} — ${x.name}</option>`)
    .join("");
  const categoryChoices = [...CATEGORIES, UNCATEGORIZED];
  const categorySelectOptions = categoryChoices
    .map(cat => `<option value="${cat}" ${t.category === cat ? "selected":""}>${cat}</option>`)
    .join("");

  let feedbackBlock = "";
  if (t.feedback && (t.feedback.rating === "up" || t.feedback.rating === "down")) {
    const ratingLabel = t.feedback.rating === "up" ? "Satisfied" : "Not satisfied";
    const ratingIcon = t.feedback.rating === "up" ? "👍" : "👎";
    const comment = (t.feedback.comment || "").trim();
    feedbackBlock = `
      <div class="bg-slate-900 rounded-xl shadow-lg shadow-black/30 border border-slate-800 p-6">
        <h3 class="font-semibold text-lg text-slate-100 mb-3">User Feedback</h3>
        <p class="font-medium mb-1 text-slate-100">${ratingIcon} ${ratingLabel}</p>
        ${
          comment
            ? `<p class="text-sm text-slate-200 whitespace-pre-line">${comment}</p>`
            : `<p class="text-sm text-slate-500 italic">No additional comments.</p>`
        }
        <p class="mt-2 text-xs text-slate-500">Submitted ${t.feedback.at ? new Date(t.feedback.at).toLocaleString() : ""}</p>
      </div>`;
  }

  res.send(`
  <html>
  <head>
    <link href="/assets/tailwind.css" rel="stylesheet" />
  </head>

  <body class="bg-slate-950 text-slate-100 min-h-screen flex">

    <aside class="w-64 bg-slate-900/80 backdrop-blur border-r border-slate-800 p-4 flex flex-col gap-4">
      <div class="leading-tight">
        <h1 class="text-xl font-bold text-sky-300">Ticket: ${t.id}</h1>
        <p class="text-xs text-slate-400">Support Console</p>
      </div>
      <a href="/admin/tickets" class="text-sky-300 hover:underline text-xs font-medium">&larr; Back to tickets</a>
      <form method="POST" action="/logout" class="mt-1">
        <button class="w-full text-sm bg-slate-800 border border-slate-700 rounded-md px-3 py-2 hover:bg-slate-700 text-slate-200">Logout</button>
      </form>
      <div class="text-xs text-slate-500 mt-auto pt-2 border-t border-slate-800">v1.0</div>
    </aside>

    <main class="flex-1 p-8 max-w-5xl mx-auto space-y-6">
      
      <div class="bg-slate-900 rounded-xl shadow-lg shadow-black/30 border border-slate-800 p-6">
        <div class="flex justify-between items-center gap-4">
          <div>
            <h2 class="text-2xl font-semibold text-white">${t.name}</h2>
            <p class="text-slate-400 text-sm mt-1">${t.id}</p>
          </div>
            <div class="flex flex-col items-end gap-2">
              <span class="px-3 py-1 text-sm font-medium rounded-full ${statusColor}">
                ${t.status}
              </span>
              <div class="flex gap-2">
              <form method="POST" action="/admin/tickets/${t.id}/update">
                <input type="hidden" name="status" value="Working on it" />
                <button
                  type="submit"
                  class="inline-flex items-center rounded-md border border-slate-700 bg-slate-800 px-2.5 py-1 text-xs font-medium text-slate-100 hover:bg-slate-700"
                >
                  Set to “Working on it”
                </button>
              </form>
              <form method="POST" action="/admin/tickets/${t.id}/update">
                <input type="hidden" name="status" value="On hold" />
                <button
                  type="submit"
                  class="inline-flex items-center rounded-md border border-amber-800 bg-amber-900/60 px-2.5 py-1 text-xs font-medium text-amber-100 hover:bg-amber-900/80"
                >
                  Put on hold
                </button>
              </form>
              <form method="POST" action="/admin/tickets/${t.id}/update" onsubmit="return confirm('Mark this ticket complete and send a resolution email?')">
                <input type="hidden" name="status" value="Complete" />
                <button
                  type="submit"
                  class="inline-flex items-center rounded-md bg-emerald-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-emerald-500"
                >
                  Mark Complete
                </button>
              </form>
              <form method="POST" action="/admin/tickets/${t.id}/delete" onsubmit="return confirm('Delete this ticket and all attachments? This cannot be undone.')">
                <button
                  type="submit"
                  class="inline-flex items-center rounded-md bg-rose-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-rose-500"
                >
                  Delete ticket
                </button>
              </form>
            </div>
          </div>
        </div>
      </div>

      <div class="grid grid-cols-1 md:grid-cols-2 gap-6">

        <div class="bg-slate-900 rounded-xl shadow-lg shadow-black/30 border border-slate-800 p-6 space-y-3">
          <h3 class="font-semibold text-lg text-slate-100 mb-3">Ticket details</h3>

          <p class="text-sm text-slate-200"><span class="font-semibold">Category:</span> ${t.category || UNCATEGORIZED}</p>
          <p class="text-sm text-slate-200"><span class="font-semibold">Created:</span> ${new Date(t.created).toLocaleString()}</p>
          <p class="text-sm text-slate-200">
            <span class="font-semibold">Due:</span> ${dueDisplay}
            ${t.status === "On hold" ? '<span class="ml-2 text-[11px] font-medium text-slate-200 bg-slate-800 border border-slate-700 px-2 py-0.5 rounded-full">On hold</span>' : ""}
            ${overdueFlag ? '<span class="ml-2 text-[11px] font-medium text-rose-100 bg-rose-900/60 border border-rose-800 px-2 py-0.5 rounded-full">Overdue</span>' : ""}
          </p>
          <p class="text-sm text-slate-200"><span class="font-semibold">SLA target:</span> ${slaDisplay}</p>
          <p class="text-sm text-slate-200"><span class="font-semibold">Issue:</span><br>${t.issue}</p>

          <div class="mt-4">
            <p class="font-semibold text-sm text-slate-100 mb-1">Attachments</p>
            ${
              (t.attachments && t.attachments.length)
                ? `<ul class="list-disc pl-5 space-y-1">${t.attachments
                    .map(a => `<li><a class=\"text-sky-300 underline\" href=\"/tickets/${t.id}/attachments/${a.storedName}\">${a.originalName}</a> <span class=\"text-xs text-slate-400\">(${Math.ceil((a.size||0)/1024)} KB)</span></li>`)
                    .join("")}</ul>`
                : `<p class="text-xs text-slate-500 italic">No attachments.</p>`
            }
            <div class="mt-3">
              <label class="text-sm font-medium block mb-1">Upload attachment</label>
              <input type="file" id="uploadFile" class="border border-slate-700 rounded-md p-2 w-full text-sm bg-slate-950 text-slate-100" />
              <button type="button" id="uploadBtn" class="mt-2 bg-sky-600 hover:bg-sky-500 text-white px-3 py-1 rounded-md text-xs font-medium">Upload</button>
              <p id="uploadStatus" class="text-xs text-slate-400 mt-1"></p>
            </div>
          </div>

          <p class="text-sm text-slate-200"><span class="font-semibold">Related ticket:</span>
            ${t.related ? `<a href="/admin/tickets/${t.related}" class="text-sky-300 underline">${t.related}</a>` : "None"}
          </p>
        </div>

        <div class="bg-slate-900 rounded-xl shadow-lg shadow-black/30 border border-slate-800 p-6">
          <h3 class="font-semibold text-lg text-slate-100 mb-3">Update ticket</h3>

          <form method="POST" action="/admin/tickets/${t.id}/update" class="space-y-4">

            <label class="text-sm font-medium text-slate-200">Status</label>
            <select name="status" class="border border-slate-700 p-2 rounded-md w-full text-sm bg-slate-950 text-slate-100">
              ${statuses.map(s => `<option ${t.status===s?"selected":""}>${s}</option>`).join("")}
            </select>

            <label class="text-sm font-medium text-slate-200">Category</label>
            <select name="category" class="border border-slate-700 p-2 rounded-md w-full text-sm bg-slate-950 text-slate-100">
              ${categorySelectOptions}
            </select>

            <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label class="text-sm font-medium text-slate-200">Due date/time</label>
                <input
                  type="datetime-local"
                  name="dueAt"
                  value="${dueInputValue}"
                  class="border border-slate-700 p-2 rounded-md w-full text-sm bg-slate-950 text-slate-100"
                />
                <p class="text-xs text-slate-500 mt-1">Set a new due date/time for this ticket.</p>
              </div>
              <div>
                <label class="text-sm font-medium text-slate-200">SLA window (hours)</label>
                <input
                  type="number"
                  step="0.5"
                  min="0.5"
                  name="slaHours"
                  value="${slaHoursValue}"
                  class="border border-slate-700 p-2 rounded-md w-full text-sm bg-slate-950 text-slate-100"
                />
                <p class="text-xs text-slate-500 mt-1">Recomputes due time from the created date.</p>
              </div>
            </div>

            <label class="text-sm font-medium text-slate-200">Related ticket</label>
            <select name="related" class="border border-slate-700 p-2 rounded-md w-full text-sm bg-slate-950 text-slate-100">
              <option value="">None</option>${relatedOptions}
            </select>

            <label class="text-sm font-medium text-slate-200">Lookup user</label>
            <div class="flex gap-2 items-stretch">
              <input type="text" id="nameLookup" placeholder="Start typing a name..." class="border border-slate-700 p-2 rounded-md w-full text-sm bg-slate-950 text-slate-100 placeholder:text-slate-500"/>
              <button type="button" id="addLookupBtn" class="px-3 py-2 rounded-md bg-slate-800 border border-slate-700 hover:bg-slate-700 text-xs font-medium whitespace-nowrap text-slate-100">Add</button>
            </div>
            <p class="text-xs text-slate-500">Type a name and click Add to append their email.</p>

            <label class="text-sm font-medium text-slate-200">User email</label>
            <input type="text" name="email" id="emailInput" value="${t.email||""}" placeholder="alice@x.com, bob@y.com" class="border border-slate-700 p-2 rounded-md w-full text-sm bg-slate-950 text-slate-100 placeholder:text-slate-500" />
            <p class="text-xs text-slate-500">Separate multiple addresses with commas or semicolons.</p>

            <div>
              <div class="flex items-center justify-between mb-2">
                <label class="text-sm font-medium text-slate-200">Add update</label>
                <div class="flex flex-wrap gap-2 justify-end">
                  <span class="text-[11px] text-slate-500 mr-1">Quick responses:</span>
                  <button
                    type="button"
                    class="px-2 py-1 text-[11px] rounded border border-slate-700 bg-slate-800 hover:bg-slate-700 text-slate-100"
                    data-macro-text="Rebooted router and confirmed connectivity is restored with the user."
                  >
                    Rebooted router
                  </button>
                  <button
                    type="button"
                    class="px-2 py-1 text-[11px] rounded border border-slate-700 bg-slate-800 hover:bg-slate-700 text-slate-100"
                    data-macro-text="Reset the user password and verified successful login."
                  >
                    Password reset
                  </button>
                  <button
                    type="button"
                    class="px-2 py-1 text-[11px] rounded border border-slate-700 bg-slate-800 hover:bg-slate-700 text-slate-100"
                    data-macro-text="Checked logs and monitoring; no ongoing errors detected. Will continue to monitor."
                  >
                    Checked logs
                  </button>
                  <button
                    type="button"
                    class="px-2 py-1 text-[11px] rounded border border-slate-700 bg-slate-800 hover:bg-slate-700 text-slate-100"
                    data-macro-text="Applied system updates and confirmed the issue is resolved."
                  >
                    Applied updates
                  </button>
                </div>
              </div>
              <textarea name="update" class="border border-slate-700 p-2 rounded-md w-full h-28 text-sm bg-slate-950 text-slate-100 placeholder:text-slate-500" placeholder="Describe what you did or what happens next."></textarea>
            </div>

            <button class="w-full bg-sky-600 text-white py-2 rounded-md text-sm font-medium hover:bg-sky-500">
              Save update
            </button>
          </form>
        </div>

        <div class="bg-slate-900 rounded-xl shadow-lg shadow-black/30 border border-slate-800 p-6">
          <h3 class="font-semibold text-lg text-slate-100 mb-3">Merge tickets</h3>
          <p class="text-sm text-slate-300 mb-3">Merge <strong>${t.id}</strong> into another ticket. This will move updates and attachments and mark this ticket Complete.</p>
          <form method="POST" action="/admin/tickets/${t.id}/merge" onsubmit="return confirm('Merge will move updates and attachments and mark this ticket Complete. Continue?')" class="space-y-3">
            <label class="text-sm font-medium text-slate-200">Merge into</label>
            <select name="target" class="border border-slate-700 p-2 rounded-md w-full text-sm bg-slate-950 text-slate-100" required>
              <option value="" disabled selected>Select target ticket</option>
              ${mergeOptions}
            </select>
            <button class="w-full bg-rose-600 text-white py-2 rounded-md text-sm font-medium hover:bg-rose-500">Merge</button>
          </form>
        </div>

      </div>

      <div class="bg-slate-900 rounded-xl shadow-lg shadow-black/30 border border-slate-800 p-6">
        <h3 class="font-semibold text-lg text-slate-100 mb-4">Timeline</h3>
        ${updates}
      </div>

      ${feedbackBlock}
    </main>

    <script>
      const contacts = ${JSON.stringify(USERS)};
      const nameLookup = document.getElementById("nameLookup");
      const emailInput = document.getElementById("emailInput");
      const addLookupBtn = document.getElementById("addLookupBtn");

      if (addLookupBtn && nameLookup && emailInput) {
        addLookupBtn.addEventListener("click", () => {
          const value = (nameLookup.value || "").toLowerCase().trim();
          if (!value) return;
          const match = contacts.find(c => c.name.toLowerCase().startsWith(value));
          if (!match) return;

          const list = (emailInput.value || "").trim();
          const existing = new Set(
            list
              .split(/[;,]/)
              .map(s => s.trim().toLowerCase())
              .filter(Boolean)
          );
          const target = String(match.email || "").toLowerCase();
          if (existing.has(target)) {
            nameLookup.value = "";
            return;
          }

          if (!list) {
            emailInput.value = match.email;
          } else {
            let base = list;
            if (!/[;,]$/.test(base)) base += ",";
            emailInput.value = base.replace(/\s*$/, "") + " " + match.email;
          }
          nameLookup.value = "";
        });
      }

      // Canned responses / macros
      const macroButtons = document.querySelectorAll("[data-macro-text]");
      const updateTextarea = document.querySelector("textarea[name='update']");
      if (macroButtons.length && updateTextarea) {
        macroButtons.forEach(btn => {
          btn.addEventListener("click", () => {
            const macro = (btn.getAttribute("data-macro-text") || "").trim();
            if (!macro) return;
            const current = updateTextarea.value || "";
            if (!current.trim()) {
              updateTextarea.value = macro;
            } else {
              updateTextarea.value = current.replace(/\s*$/, "") + "\\n\\n" + macro;
            }
            updateTextarea.focus();
          });
        });
      }

      // Simple test uploader using the PUT endpoint
      const uploadBtn = document.getElementById('uploadBtn');
      const uploadFile = document.getElementById('uploadFile');
      const uploadStatus = document.getElementById('uploadStatus');
      const uploadUrl = '/tickets/${t.id}/attachments';
      if (uploadBtn && uploadFile) {
        uploadBtn.addEventListener('click', async () => {
          if (!uploadFile.files || uploadFile.files.length === 0) {
            alert('Choose a file first');
            return;
          }
          const f = uploadFile.files[0];
          uploadStatus.textContent = 'Uploading...';
          try {
            const res = await fetch(uploadUrl + '?filename=' + encodeURIComponent(f.name), {
              method: 'PUT',
              headers: { 'Content-Type': f.type || 'application/octet-stream' },
              body: f
            });
            if (!res.ok) throw new Error('Upload failed (' + res.status + ')');
            uploadStatus.textContent = 'Uploaded. Refreshing...';
            location.reload();
          } catch (e) {
            uploadStatus.textContent = 'Error: ' + e.message;
          }
        });
      }
    </script>

  </body>
  </html>
  `);
});

/* UPDATE HANDLER */
router.post("/tickets/:id/update", async (req, res) => {
  const t = Tickets.get(req.params.id);
  if (!t) return res.status(404).send("Not found");

  const previousStatus = t.status;
  const newStatus = req.body.status || t.status;
  let notificationSent = false;

  if (req.body.email) t.email = req.body.email.trim();
  if (req.body.related !== undefined) t.related = req.body.related || null;
  if (req.body.category !== undefined) t.category = normalizeCategory(req.body.category);
  const createdMs = toMs(t.created);

  let updatedSlaMinutes = null;
  let updatedDueAt = null;

  if (req.body.slaHours !== undefined && req.body.slaHours !== "") {
    const parsedHours = Number(req.body.slaHours);
    if (Number.isFinite(parsedHours) && parsedHours > 0) {
      updatedSlaMinutes = Math.round(parsedHours * 60);
      if (Number.isFinite(createdMs)) {
        updatedDueAt = new Date(createdMs + updatedSlaMinutes * 60000).toISOString();
      }
    }
  }

  if (req.body.dueAt !== undefined && req.body.dueAt !== "") {
    const parsedDue = new Date(req.body.dueAt);
    const dueMs = parsedDue.getTime();
    if (Number.isFinite(dueMs)) {
      updatedDueAt = new Date(dueMs).toISOString();
      if (Number.isFinite(createdMs)) {
        const diffMinutes = Math.round((dueMs - createdMs) / 60000);
        if (diffMinutes > 0) {
          updatedSlaMinutes = diffMinutes;
        }
      }
    }
  }

  if (Number.isFinite(updatedSlaMinutes) && updatedSlaMinutes > 0) {
    t.slaMinutes = updatedSlaMinutes;
  }
  if (updatedDueAt) {
    t.dueAt = updatedDueAt;
  }

  if (req.body.update && req.body.update.trim() !== "") {
    const text = req.body.update.trim();
    const nowIso = new Date().toISOString();
    t.updates.push({ at: nowIso, text });

    if (!t.firstResponseAt) {
      t.firstResponseAt = nowIso;
    }

    // Compute recipients across linked tickets (anchor group)
    const anchorId = t.related || t.id;
    const group = Tickets.list().filter(x => x.id === anchorId || x.related === anchorId);
    const recipients = Array.from(new Set(
      group
        .flatMap(x => String(x.email || "").split(/[;,]/))
        .map(s => s.trim())
        .filter(Boolean)
    ));

    if (recipients.length) {
      const closing = previousStatus !== "Complete" && newStatus === "Complete";
      const ticketUrl = `${process.env.BASE_URL}/tickets/${t.id}`;

      const html = closing
        ? `
        <div style="font-family:Arial, sans-serif; background:#f7f7f7; padding:20px;">
          <div style="max-width:600px;margin:auto;background:#ffffff;border-radius:8px;padding:20px;border:1px solid #e2e2e2;">
            <h2 style="color:#0F6CBD;margin-bottom:15px;">Ticket Resolved: ${t.id}</h2>
            <p>Your ticket has been resolved with the following update:</p>
            <blockquote style="border-left:4px solid #0F6CBD;padding-left:10px;color:#333;margin:15px 0;font-style:italic;">
              ${text}
            </blockquote>
            <p>You can review the final details and leave quick thumbs up/down feedback here:</p>
            <a
              href="${ticketUrl}"
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
            >View ticket &amp; give feedback</a>
            <br><br>
            <p style="font-size:12px;color:#666;">Regards,<br>Billy Davison</p>
          </div>
        </div>
      `
        : `
        <div style="font-family:Arial, sans-serif; background:#f7f7f7; padding:20px;">
          <div style="max-width:600px;margin:auto;background:#ffffff;border-radius:8px;padding:20px;border:1px solid #e2e2e2;">
            <h2 style="color:#0F6CBD;margin-bottom:15px;">Ticket Update: ${t.id}</h2>
            <p>Your ticket has been updated:</p>
            <blockquote style="border-left:4px solid #0F6CBD;padding-left:10px;color:#333;margin:15px 0;font-style:italic;">
              ${text}
            </blockquote>
            <p>You can view your ticket here:</p>
            <a
              href="${ticketUrl}"
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
            <p style="font-size:12px;color:#666;">Regards,<br>Billy Davison</p>
          </div>
        </div>
      `;

      const subject = closing
        ? `Ticket ${t.id} resolved - quick feedback?`
        : `Update on ${t.id}`;

      await Promise.race([
        sendTicketEmail({
          useGraph: process.env.USE_GRAPH === "true",
          to: recipients,
          subject,
          html,
          smtp: {
            host: process.env.SMTP_HOST,
            port: Number(process.env.SMTP_PORT),
            secure: process.env.SMTP_SECURE === "true",
            user: process.env.SMTP_USER,
            pass: process.env.SMTP_PASS,
            from: process.env.FROM_EMAIL
          },
          graph: {
            tenantId: process.env.AZURE_TENANT_ID,
            clientId: process.env.AZURE_CLIENT_ID,
            clientSecret: process.env.AZURE_CLIENT_SECRET,
            sender: process.env.GRAPH_SENDER_UPN
          }
        }),
        new Promise(r => setTimeout(r, 2000))
      ]).catch(() => {});
      notificationSent = true;
    }
  }

  t.status = newStatus;

  if (previousStatus !== "Complete" && newStatus === "Complete" && !t.resolvedAt) {
    t.resolvedAt = new Date().toISOString();
  }

  // If status was closed without a text update, still send a feedback email
  if (!notificationSent && previousStatus !== "Complete" && newStatus === "Complete") {
    const anchorId = t.related || t.id;
    const group = Tickets.list().filter(x => x.id === anchorId || x.related === anchorId);
    const recipients = Array.from(new Set(
      group
        .flatMap(x => String(x.email || "").split(/[;,]/))
        .map(s => s.trim())
        .filter(Boolean)
    ));

    if (recipients.length) {
      const ticketUrl = `${process.env.BASE_URL}/tickets/${t.id}`;
      const html = `
        <div style="font-family:Arial, sans-serif; background:#f7f7f7; padding:20px;">
          <div style="max-width:600px;margin:auto;background:#ffffff;border-radius:8px;padding:20px;border:1px solid #e2e2e2;">
            <h2 style="color:#0F6CBD;margin-bottom:15px;">Ticket Resolved: ${t.id}</h2>
            <p>Your ticket has been resolved.</p>
            <p>You can review the final details and leave quick thumbs up/down feedback here:</p>
            <a
              href="${ticketUrl}"
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
            >View ticket &amp; give feedback</a>
            <br><br>
            <p style="font-size:12px;color:#666;">Regards,<br>Billy Davison</p>
          </div>
        </div>
      `;

      await Promise.race([
        sendTicketEmail({
          useGraph: process.env.USE_GRAPH === "true",
          to: recipients,
          subject: `Ticket ${t.id} resolved - quick feedback?`,
          html,
          smtp: {
            host: process.env.SMTP_HOST,
            port: Number(process.env.SMTP_PORT),
            secure: process.env.SMTP_SECURE === "true",
            user: process.env.SMTP_USER,
            pass: process.env.SMTP_PASS,
            from: process.env.FROM_EMAIL
          },
          graph: {
            tenantId: process.env.AZURE_TENANT_ID,
            clientId: process.env.AZURE_CLIENT_ID,
            clientSecret: process.env.AZURE_CLIENT_SECRET,
            sender: process.env.GRAPH_SENDER_UPN
          }
        }),
        new Promise(r => setTimeout(r, 2000))
      ]).catch(() => {});
    }
  }

  Tickets.save(t);
  res.redirect(`/admin/tickets/${t.id}`);
});

/* DELETE HANDLER */
router.post("/tickets/:id/delete", (req, res) => {
  const id = req.params.id;
  const existing = Tickets.get(id);
  if (!existing) return res.status(404).send("Not found");
  if (typeof Tickets.remove !== "function") {
    return res.status(500).send("Delete not supported");
  }

  try {
    Tickets.remove(id);
    return res.redirect("/admin/tickets");
  } catch (e) {
    console.error("Delete error:", e);
    return res.status(500).send("Failed to delete ticket");
  }
});

/* MERGE HANDLER: merge this ticket into a target ticket */
router.post("/tickets/:id/merge", (req, res) => {
  const source = Tickets.get(req.params.id);
  const targetId = (req.body?.target || "").toString().trim();
  const target = Tickets.get(targetId);

  if (!source) return res.status(404).send("Source ticket not found");
  if (!target || target.id === source.id) {
    return res.status(400).send("Invalid merge target");
  }

  try {
    // Ensure arrays
    source.updates = Array.isArray(source.updates) ? source.updates : [];
    source.attachments = Array.isArray(source.attachments) ? source.attachments : [];
    target.updates = Array.isArray(target.updates) ? target.updates : [];
    target.attachments = Array.isArray(target.attachments) ? target.attachments : [];

    // Move attachments from source folder to target folder
    const srcDir = path.join(Tickets.TICKET_DIR, source.id);
    const dstDir = path.join(Tickets.TICKET_DIR, target.id);
    if (!fs.existsSync(dstDir)) fs.mkdirSync(dstDir, { recursive: true });

    for (const meta of source.attachments) {
      const originalName = meta.storedName || meta.originalName || "file.bin";
      const srcPath = path.join(srcDir, originalName);
      if (!fs.existsSync(srcPath)) continue; // skip missing

      // ensure unique dest name
      const ext = path.extname(originalName);
      const base = path.basename(originalName, ext);
      let destName = originalName;
      let destPath = path.join(dstDir, destName);
      let i = 1;
      while (fs.existsSync(destPath)) {
        destName = `${base}-merged-${i}${ext}`;
        destPath = path.join(dstDir, destName);
        i++;
      }

      try {
        fs.renameSync(srcPath, destPath);
      } catch (e) {
        try {
          const buf = fs.readFileSync(srcPath);
          fs.writeFileSync(destPath, buf);
          fs.unlinkSync(srcPath);
        } catch (e2) {
          // skip on failure
          continue;
        }
      }

      target.attachments.push({ ...meta, storedName: destName });
    }
    // Clear attachments from source to avoid broken links
    source.attachments = [];

    // Remove empty source dir if any
    try {
      const srcDirPath = path.join(Tickets.TICKET_DIR, source.id);
      if (fs.existsSync(srcDirPath) && fs.readdirSync(srcDirPath).length === 0) {
        fs.rmdirSync(srcDirPath);
      }
    } catch {}

    // Merge updates and note
    target.updates.push({ at: new Date().toISOString(), text: `Merged ticket ${source.id} into this ticket.` });
    if (source.issue && source.issue.trim() && source.issue !== target.issue) {
      target.updates.push({ at: new Date().toISOString(), text: `Merged ${source.id} issue: ${source.issue}` });
    }
    for (const u of source.updates) target.updates.push(u);

  // Mark source as complete and link to target
  source.status = "Complete";
  source.related = target.id;
  source.updates.push({ at: new Date().toISOString(), text: `Merged into ${target.id}` });
  if (!source.resolvedAt) {
    source.resolvedAt = new Date().toISOString();
  }

    Tickets.save(target);
    Tickets.save(source);

    return res.redirect(`/admin/tickets/${target.id}`);
  } catch (e) {
    console.error("Merge error:", e);
    return res.status(500).send("Failed to merge tickets");
  }
});

/* PIE DATA */
router.get("/stats", (req, res) => {
  const all = Tickets.list();
  const closed = all.filter(t => t.status === "Complete").length;
  res.json({ open: all.length - closed, closed });
});

module.exports = router;
