# CodeSense progress

## Phase 1 — Project Scaffold

Completed: FastAPI API, React/Tailwind upload UI, Docker Compose, and SQLite upload persistence. ZIP archives are stored as opaque data; Git URLs are recorded only. Neither is executed, fetched, or cloned.

## Phase 2 — Repository Scanner

Completed: `POST /api/uploads/{id}/scan` safely reads ZIP entries in memory and persists allow-listed source-file metadata to SQLite. The scanner rejects path traversal and archives whose uncompressed content exceeds 200 MiB, ignores configurable non-source directories, identifies language by extension, and stores path, size, and raw UTF-8-decoded content. `GET /api/uploads/{id}/files` makes that metadata queryable. Git URLs intentionally remain unscanned until a safe fetch workflow exists.

## Phase 3 — Tree-sitter Parsing

Completed: Tree-sitter parses persisted Python and TypeScript source without executing it. `POST /api/uploads/{id}/parse` extracts functions, classes, imports, and exports (where present) with inclusive 1-based line ranges and writes them to SQLite's `code_symbols` table. `GET /api/uploads/{id}/symbols` exposes the structured results. Unsupported languages are preserved by the scanner but skipped by parsing until their grammar is added.

Next: Phase 4 can chunk source using the persisted symbol ranges so boundaries stay outside functions and classes.
