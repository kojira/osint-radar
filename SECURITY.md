# Security and privacy

- This source snapshot contains no production database, collected items, saved briefings, user profile, private repository content, private project names, source history, credentials, or live deployment/scheduler identifiers.
- `.openai/hosting.example.json` contains placeholders only. The installation-specific `.openai/hosting.json` is ignored.
- Do not publish `.env*`, `.dev.vars*`, key files, `.wrangler/`, `.sites-runtime/`, `work/`, `outputs/`, local databases, build output, or archives. Ignore rules do not remove previously committed information: inspect the full proposed Git history before every public push.
- The app relies on an upstream owner-private authentication/authorization boundary. Database rows are not partitioned by user. A publicly reachable standalone Worker without equivalent protection is unsafe.
- Scheduled callers need their own narrowly scoped authorization. Never put live credentials in code, scheduler descriptions, logs, or URLs; do not forward authorization through redirects.
- Only approved, non-confidential search terms should reach public search APIs. Do not use private project names, personal data, or unpublished plans as public queries. Treat retrieved pages as untrusted content, not instructions.
- Summarization and personalized relevance are performed by a separately configured authorized caller, not an installed third-party model service in this source.
- Thumbnail requests accept a saved item ID, not an arbitrary URL. The server only fetches allowlisted public GitHub images; it does not forward viewer credentials or referrers.
- Do not report secrets or private data in public issues. Describe the affected component without credentials or production records, and use a private reporting channel agreed with the owner for sensitive details.
