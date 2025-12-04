# Contributing

Thanks for helping improve this project! Please follow the guidelines below to make reviews fast and releases safe.

## Getting started
1. Install Node 18+ and npm.
2. `npm install`
3. Copy `.env.example` to `.env`, set admin credentials, and configure email/storage as needed.
4. Build CSS once: `npm run build:css`
5. Run the app: `npm start` (public form at `/`, admin at `/login`).

## Development workflow
- Keep PRs focused and describe the change, risks, and testing in the pull request template.
- Update docs when behavior or configuration changes.
- Avoid committing secrets or runtime data (tickets, uploads, logs, real contact lists). Use the git-ignored directories locally.
- Prefer small, readable commits; rebase instead of merge when updating your branch.

## Scripts
- `npm start` – run the server
- `npm run build:css` – rebuild Tailwind output
- `npm run migrate:sqlite` – import JSON tickets into SQLite
- `npm test` – placeholder (add real tests alongside new features)

## Coding notes
- CommonJS modules are used (`require`/`module.exports`).
- Keep routes lean; move helpers to `lib/` or `scripts/` when reused.
- Server-side rendering lives in Express route handlers; styles live in `styles/` and output to `assets/`.

## Reporting bugs or requesting features
- Use the issue templates (`Bug report` / `Feature request`) to share reproduction steps and expected behavior.
- For security issues, follow `SECURITY.md` and avoid public issues.
