# Notic-OS 

Lightweight Express + Tailwind ticket desk with optional SQLite storage, email notifications (SMTP or Microsoft Graph), admin SLA dashboard, and attachment support.

Built for solo IT Managers/System Administrators

## Features
- Public ticket submission with optional attachments (35 MB limit).
- Session-based admin console with status updates, SLA/due dates, overdue highlighting, and feedback capture after completion.
- Email notifications via SMTP or Microsoft Graph; optional inbox poller that turns unread emails into tickets or updates.
- File-based JSON storage by default, with an optional SQLite backend plus a migration script.
- Local Tailwind build (no CDN dependency).
- Automatic email lookup: when a ticket is submitted, the app tries to auto-fill `ticket.email` from `users.json` if there is a single, unambiguous name match (exact full name or unique token match). Ambiguous names are left blank so admins can fill them manually.

## API integration / custom public forms
- CORS is enabled for `/submit` so you can post from other origins.
- Create a ticket: `POST /submit`
  - Body (JSON or `application/x-www-form-urlencoded`): `name` (string, required), `issue` (string, required).
  - To include one file up to 35 MB, send `multipart/form-data` with fields `name`, `issue`, and file field `attachment`.
  - Response: `{ "message": "...", "id": "NTC-XXXXXX" }`.
- Upload another attachment later: `PUT /tickets/:id/attachments` with `Content-Type: application/octet-stream` and the raw file body. Provide `?filename=your-file.ext` (or header `x-filename`). Limit 35 MB.
- Ticket links use `BASE_URL` for email buttons; set it to the externally reachable URL for your deployment.

## Quick start
1) Requirements: Node 18+, npm.  
2) Install: `npm install`  
3) Configure: copy `.env.example` to `.env` and fill values (see below).  
4) Build CSS: `npm run build:css` (outputs to `assets/tailwind.css`).  
5) Run: `npm start` then open `http://localhost:3000` (public) or `http://localhost:3000/login` (admin).

## Configuration (`.env`)
See `.env.example` for a full list. Key settings:
- `ADMIN_USER` / `ADMIN_PASS_HASH` – admin credentials (bcrypt hash). Generate one with `node -e "require('bcryptjs').hash(process.argv[1],10).then(console.log)" yourPassword`.
- `SESSION_SECRET` – random string for session cookies; set `SESSION_COOKIE_SECURE=true` when behind HTTPS.
- `BASE_URL` – external URL used in email links (e.g., `http://localhost:3000`).
- `SLA_HOURS` – default SLA window (hours) for new tickets.
- `TICKET_BACKEND` – `fs` (default JSON files) or `db` for SQLite. When using SQLite, set `DB_FILE=./data/tickets.db`.
- Email (SMTP): `TO_EMAIL`, `FROM_EMAIL`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`.
- Email (Microsoft Graph): set `USE_GRAPH=true` plus `AZURE_TENANT_ID`, `AZURE_CLIENT_ID`, `AZURE_CLIENT_SECRET`, `GRAPH_SENDER_UPN`, `HELPDESK_EMAIL`.

## Data, uploads, and contacts
- Tickets are stored in `Ticket/` (JSON) or the configured SQLite DB. Attachments live under `Ticket/<id>/`.
- Runtime data, uploads, and logs are git-ignored. Keep production data out of commits.
- The sample contact list in `users.json` is placeholder data. Replace it locally with your own names/emails to enable automatic lookup during ticket submission. You can export a name/email list from your mail system or directory and paste it into `users.json` as an array of `{ "name": "...", "email": "..." }` objects.

## Optional SQLite backend
- Migrate existing JSON tickets: `npm run migrate:sqlite` (or `node scripts/migrate-json-to-sqlite.js <Ticket-dir> <db-file>`).
- Run with DB: `TICKET_BACKEND=db DB_FILE=./data/tickets.db npm start`.
- If the DB adapter fails to load, the server falls back to the JSON store automatically.

## Email poller
`jobs/pollMail.js` checks an inbox (Graph) every 60 seconds. Unread messages are turned into new tickets or appended as updates when the subject contains a ticket ID (e.g., `NTC-ABC123`). Ensure Graph credentials and `HELPDESK_EMAIL` are set before enabling in production.

## Development
- Build CSS after style changes: `npm run build:css`.
- Scripts: `npm start`, `npm run build:css`, `npm run migrate:sqlite`, `npm test` (placeholder).
- Linting/tests are not set up yet—add them in PRs if you extend the project.

## Security
See `SECURITY.md` for how to report vulnerabilities. Do not file public issues for security reports.

## Contributing
Guidelines are in `CONTRIBUTING.md`. Please review the `CODE_OF_CONDUCT.md` before participating.

## License
Licensed under the ISC License. See `LICENSE` for details.
