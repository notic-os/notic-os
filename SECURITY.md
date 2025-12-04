# Security Policy

## Reporting a vulnerability
- Email security@example.com (update this to your project's security contact). Please include a description, steps to reproduce, and any logs you can share.
- Do not open public issues for security reports. We aim to acknowledge within 3 business days.

## Hardening tips
- Set strong secrets in `.env` (`SESSION_SECRET`, `ADMIN_PASS_HASH`, SMTP/Graph credentials) and never commit the filled `.env`.
- Enable `SESSION_COOKIE_SECURE=true` when serving over HTTPS or behind a reverse proxy that terminates TLS.
- Restrict access to `/login` and `/admin` with network controls when possible.
- Keep the data directories (`Ticket/`, `uploads/`, `data/`) on secure storage with appropriate backups and permissions.
