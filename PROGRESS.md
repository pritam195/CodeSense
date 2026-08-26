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

## Phase 6 — Semantic Search

Completed: the frontend now presents saved repositories and indexed files on the left, displays an opened file's source on the right, and offers an "Ask about this repository" input. Preparing a ZIP runs scan → parse → chunk → embed; search calls the FAISS-backed similarity endpoint and presents cited file/line chunks. ZIP upload remains available in the repository panel.

## Phase 7 — Grounded Answers

Completed: `POST /api/uploads/{id}/answer` retrieves the relevant FAISS chunks, sends only those excerpts to the configured OpenAI Responses model, and rejects output with missing or invalid citations. The frontend renders the answer with file/line citation links. Set `OPENAI_API_KEY` on the backend to enable answers.


## GitHub archive import

Completed: public https://github.com/owner/repository URLs are fetched only as bounded default-branch ZIP archives before the existing scan → parse → chunk → embed workflow. CodeSense never clones or executes a repository.

## Phase 8 — Hybrid Retrieval

Completed: `POST /api/uploads/{id}/hybrid-search` fuses BM25 keyword search (via `rank_bm25`) and FAISS vector search using Reciprocal Rank Fusion (RRF, k=60). BM25 handles exact identifier queries that vector search misses; vector search handles paraphrased/semantic queries that keyword search misses. The `/answer` endpoint now uses hybrid retrieval internally for better grounding. All FAISS endpoints now use `store.data_dir` instead of the global settings path, fixing test isolation. 11/11 tests pass.

## Phase 9 — Evaluation Harness

Completed: Built an evaluation harness that measures Precision@k, Recall@k, MRR (Mean Reciprocal Rank), and latency (p50/p95) against a hand-labeled query set. Ships with a seed benchmark (`eval/queries.json`), a standalone CLI (`eval/harness.py`), and a `POST /api/uploads/{id}/evaluate` endpoint with structured reporting and failure analysis. 13/13 tests pass.

## Phase 10 — Call Graph

Completed: `POST /api/uploads/{id}/call-graph` statically extracts call expressions inside functions using Tree-sitter CST nodes for Python, TypeScript, and JavaScript, resolves caller-callee links across repository files, and persists directed edges in SQLite's `call_graph_edges` table. `GET /api/uploads/{id}/call-graph` queries direct callers and callees for any function. 15/15 tests pass.

## Phase 11 — Dependency Graph

Completed: `POST /api/uploads/{id}/dependency-graph` extracts import and export statements using Tree-sitter CST nodes for Python, TypeScript, and JavaScript, resolves relative (`./router`, `.config`) and package-absolute (`app.models`) import specifiers against the repository file index, distinguishes internal from third-party/stdlib dependencies, and persists edges in SQLite's `dependency_graph_edges` table. `GET /api/uploads/{id}/dependency-graph` queries imported dependencies and upstream dependents for any module. 17/17 tests pass.

## Phase 12 — Neo4j Integration

Completed: Integrated Neo4j in `docker-compose.yml`, added Python `neo4j` driver, and built `neo4j_client.py` for Cypher query execution. Updated `POST /api/uploads/{id}/call-graph` and `POST /api/uploads/{id}/dependency-graph` to write to Neo4j. Added `GET /api/uploads/{upload_id}/call-graph/traverse` and `GET /api/uploads/{upload_id}/dependency-graph/traverse` endpoints for multi-hop graph queries. Hooked graph deletion into `UploadStore.delete_upload`.

## Phase 13 — Execution Flow Synthesis

Completed: `POST /api/uploads/{id}/flow` synthesizes a step-by-step execution flow for broad natural-language questions (e.g. "Explain authentication"). The pipeline: hybrid retrieval finds seed functions → BFS walks the call-graph edges (SQLite) up to configurable depth → Kahn's topological sort orders nodes callers-before-callees → code snippets are attached from the chunk table → a Mermaid `flowchart TD` diagram is built from pure graph structure (no LLM required) → the LLM annotates the ordered steps with prose if an API key is configured, otherwise returns a graceful fallback message. The response includes `steps[]` (function_name, path, line range, depth, snippet), `mermaid_diagram`, `prose_summary`, and `citations[]`. Degrades cleanly to retrieval-order steps when no call graph has been built. 19/19 tests pass.
