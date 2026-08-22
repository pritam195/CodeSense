# CodeSense progress

## Phase 1 — Project Scaffold

Completed: FastAPI API, React/Tailwind upload UI, Docker Compose, and SQLite upload persistence. ZIP archives are stored as opaque data; Git URLs are recorded only. Neither is executed, fetched, or cloned.

## Phase 2 — Repository Scanner

Completed: `POST /api/uploads/{id}/scan` safely reads ZIP entries in memory and persists allow-listed source-file metadata to SQLite. The scanner rejects path traversal and archives whose uncompressed content exceeds 200 MiB, ignores configurable non-source directories, identifies language by extension, and stores path, size, and raw UTF-8-decoded content. `GET /api/uploads/{id}/files` makes that metadata queryable. Git URLs intentionally remain unscanned until a safe fetch workflow exists.

Next: Phase 3 can parse the persisted source content with Tree-sitter, without executing it.
