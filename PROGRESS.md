# CodeSense progress

## Phase 1 — Project Scaffold

Completed: FastAPI API, React/Tailwind upload UI, Docker Compose, and SQLite upload persistence. ZIP archives are stored as opaque data; Git URLs are recorded only. Neither is executed, fetched, or cloned.

## Phase 2 — Repository Scanner

Completed: `POST /api/uploads/{id}/scan` safely reads ZIP entries in memory and persists allow-listed source-file metadata to SQLite. The scanner rejects path traversal and archives whose uncompressed content exceeds 200 MiB, ignores configurable non-source directories, identifies language by extension, and stores path, size, and raw UTF-8-decoded content. `GET /api/uploads/{id}/files` makes that metadata queryable. Git URLs intentionally remain unscanned until a safe fetch workflow exists.

Next: Phase 3 can parse the persisted source content with Tree-sitter, without executing it.

## Phase 4 — Chunking

Completed: `POST /api/uploads/{id}/chunk` creates inspectable source chunks from the persisted AST symbols, and `GET /api/uploads/{id}/chunks` returns them with file and line citations. The chunker uses outermost function/class ranges as atomic chunks and groups remaining non-structural lines into bounded blocks. Oversized functions/classes deliberately remain one chunk rather than being split. Chunks are stored in SQLite's `chunks` table.

Next: Phase 5 can embed each persisted chunk and map vector IDs back to this chunk metadata.

## Phase 5 — Embeddings

Completed: `POST /api/uploads/{id}/embed` generates normalized document embeddings through the single rate-limited `EmbeddingClient` wrapper and persists a FAISS `IndexFlatIP` index per repository. Chunk ordering in SQLite supplies the vector-ID-to-chunk/file/line mapping. `POST /api/uploads/{id}/similarity-search` provides a raw vector query for verification. The configured model is `sentence-transformers/all-MiniLM-L6-v2`, with a 256-token model cap and a 12,000-character input guard.

Next: Phase 6 can present semantic search results in the frontend using the existing raw similarity endpoint.
