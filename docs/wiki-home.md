# Notic-OS Wiki

Lightweight Express + Tailwind ticket desk with optional SQLite storage, email notifications (SMTP or Microsoft Graph), admin SLA dashboard, and attachment support. Built for solo IT managers/system administrators who need a quick, self-hosted helpdesk.

## Overview
- Stack: Node 18+, Express 5, Tailwind CSS, optional better-sqlite3, Nodemailer or Microsoft Graph for email.
- Public side: `index.html` posts to `/submit` (CORS enabled) and shows a receipt; users can view their ticket at `/tickets/:id` and leave thumbs-up/down feedback when complete.
- Admin console: session-based login at `/login`, dashboards for SLA stats, ticket list/detail pages with canned responses, attachment upload, category/status changes, due dates, and merge support.
- Storage: JSON files in `Ticket/` by default (attachments in `Ticket/<id>/`), or SQLite at `data/tickets.db` when `TICKET_BACKEND=db`.
- Health: `/healthz` returns config/storage/email readiness for monitoring.

## Quick start
1) Install: `npm install`  
2) Configure: create `.env` in the repo root (see config below).  
3) Build CSS: `npm run build:css` → outputs `assets/tailwind.css`.  
4) Run: `npm start` then visit `http://localhost:3000` (public) and `http://localhost:3000/login` (admin).  
5) Base URL: set `BASE_URL` to the externally reachable URL so email links work.

## Configuration (.env)
- Admin auth: `ADMIN_USER`, `ADMIN_PASS_HASH` (bcrypt). Generate a hash with `node -e "require('bcryptjs').hash(process.argv[1],10).then(console.log)" yourPassword`.
- Sessions: `SESSION_SECRET`, optional `SESSION_COOKIE_SECURE=true` when behind HTTPS/proxy.
- URLs/ports: `PORT` (default 3000), `BASE_URL` for links in emails.
- SLA: `SLA_HOURS` default window for new tickets.
- Storage: `TICKET_BACKEND=fs|db`, and when using SQLite add `DB_FILE=./data/tickets.db`.
- Email (SMTP): `TO_EMAIL`, `FROM_EMAIL`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`.
- Email (Microsoft Graph): set `USE_GRAPH=true`, `AZURE_TENANT_ID`, `AZURE_CLIENT_ID`, `AZURE_CLIENT_SECRET`, `GRAPH_SENDER_UPN`, `HELPDESK_EMAIL`.
- Contacts: replace `users.json` with your own `{ "name": "...", "email": "..." }` array for auto email lookups and admin name-to-email autofill.

## Running & deployment
- Dev/start: `npm start`.
- CSS rebuild after style changes: `npm run build:css`.
- PM2 example is in `ecosystem.config.js` (apps `ticket-prod` @ port 3000 and `ticket-staging` @ 3001).
- Data/attachments live under `Ticket/` (or the SQLite DB + `Ticket/<id>/` for files). Keep this folder and `data/` backed up but out of git.

## Admin console
- Login at `/login`; sessions are cookie-based.
- Dashboard shows counts, recent tickets, SLA averages, and a doughnut of open vs closed.
- Ticket detail allows status/category/due date updates, SLA recalculation, related-ticket linking, canned responses, attachment upload, and merge into another ticket (moves updates/files and marks source Complete).
- Updates can email all related recipients; resolution triggers a feedback email pointing to `/tickets/:id`.
- Statuses: Acknowledged → Working on it → Pending result → On hold → Complete. Overdue tickets highlight when due date passes (except Complete/On hold).

## Public endpoints / API
- Submit: `POST /submit`  
  - Body: JSON or `application/x-www-form-urlencoded` (`name`, `issue` required), or `multipart/form-data` with `attachment` (max 35 MB).
  - Response: `{ "message": "...", "id": "NTC-XXXXXX" }`
- Upload later: `PUT /tickets/:id/attachments?filename=foo.txt` with raw `application/octet-stream` body (35 MB limit). Header `x-filename` also supported.
- Download: `GET /tickets/:id/attachments/:file`
- Public view/feedback: `GET /tickets/:id` and `POST /tickets/:id/feedback`
- Health check: `GET /healthz` (returns `ok` plus config/storage/email checks; 503 when failing).

## SQLite backend
- Enable with `TICKET_BACKEND=db DB_FILE=./data/tickets.db`.
- Migrate existing JSON tickets: `npm run migrate:sqlite` (or `node scripts/migrate-json-to-sqlite.js <Ticket-dir> <db-file>`).
- If the DB adapter fails to load, the app falls back to the file store automatically.

## Email + inbox poller
- Ticket creation/update emails are sent via SMTP by default or Graph when `USE_GRAPH=true`.
- Optional inbox poller (`jobs/pollMail.js`) can turn unread Graph inbox messages into tickets/updates (IDs prefixed `MBE-`). To use it:
  1. Set Graph creds plus `HELPDESK_EMAIL`.
  2. Require and schedule the poller (e.g., uncomment the `pollMail` section in `server.js` or run it as a separate worker on a 60s interval).
  3. Ensure `BASE_URL` is set so reply links work.

## Operating tips & troubleshooting
- Admin login unavailable? Check `ADMIN_USER`, `ADMIN_PASS_HASH`, `SESSION_SECRET`.
- Email failures: verify SMTP/Graph envs; `/healthz` shows missing vars; Graph requires the sender UPN to be licensed/allowed to send.
- Attachments: 35 MB max; stored under `Ticket/<id>/`. Downloads sanitize paths to prevent traversal.
- Duplicate issues: if a new ticket’s issue matches an open ticket, it auto-links and notes the relationship.
- Backups: snapshot `Ticket/` and `data/` regularly; do not commit runtime data.

## Contributing
- See `CONTRIBUTING.md` and `CODE_OF_CONDUCT.md`.
- No automated tests yet (`npm test` is a placeholder); feel free to add coverage when extending the project.
