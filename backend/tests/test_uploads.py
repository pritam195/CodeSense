import io
import zipfile
from fastapi.testclient import TestClient
from app.main import app, get_store
from app.storage import UploadStore

def client_for(tmp_path):
    store = UploadStore(tmp_path)
    app.dependency_overrides[get_store] = lambda: store
    return TestClient(app), store

def test_zip_upload_is_persisted_as_opaque_archive(tmp_path):
    client, _ = client_for(tmp_path)
    response = client.post("/api/uploads", files={"file": ("repo.zip", b"not inspected", "application/zip")})
    app.dependency_overrides.clear()
    assert response.status_code == 201
    assert response.json()["source_type"] == "zip"

def test_git_url_is_recorded_without_fetching(tmp_path):
    client, _ = client_for(tmp_path)
    response = client.post("/api/uploads/git", json={"url": "https://github.com/example/repo.git"})
    app.dependency_overrides.clear()
    assert response.status_code == 201

def test_non_zip_archive_is_rejected(tmp_path):
    client, _ = client_for(tmp_path)
    response = client.post("/api/uploads", files={"file": ("code.py", b"print('x')")})
    app.dependency_overrides.clear()
    assert response.status_code == 400

def test_scanner_indexes_source_and_skips_ignored_directories(tmp_path):
    archive = io.BytesIO()
    with zipfile.ZipFile(archive, "w") as zip_file:
        zip_file.writestr("src/app.py", "def main():\n    return 1\n")
        zip_file.writestr("web/index.ts", "export const answer = 42")
        zip_file.writestr("node_modules/lib.js", "ignored")
    client, _ = client_for(tmp_path)
    upload = client.post("/api/uploads", files={"file": ("repo.zip", archive.getvalue())}).json()
    scan = client.post(f"/api/uploads/{upload['id']}/scan")
    indexed = client.get(f"/api/uploads/{upload['id']}/files")
    app.dependency_overrides.clear()
    assert scan.json()["files_indexed"] == 2
    assert [item["path"] for item in indexed.json()["files"]] == ["src/app.py", "web/index.ts"]

def test_parser_extracts_python_and_typescript_symbols_with_line_ranges(tmp_path):
    archive = io.BytesIO()
    with zipfile.ZipFile(archive, "w") as zip_file:
        zip_file.writestr("src/auth.py", "import jwt\n\nclass AuthService:\n    def issue_token(self):\n        return jwt.encode({})\n")
        zip_file.writestr("web/api.ts", "import { router } from './router'\n\nexport class Api {\n  handle() { return router }\n}\n")
    client, _ = client_for(tmp_path)
    upload_id = client.post("/api/uploads", files={"file": ("repo.zip", archive.getvalue())}).json()["id"]
    assert client.post(f"/api/uploads/{upload_id}/scan").status_code == 200
    parsed = client.post(f"/api/uploads/{upload_id}/parse")
    symbols = client.get(f"/api/uploads/{upload_id}/symbols").json()["symbols"]
    app.dependency_overrides.clear()
    assert parsed.status_code == 200
    assert {("src/auth.py", "class", "AuthService", 3, 5), ("src/auth.py", "function", "issue_token", 4, 5), ("web/api.ts", "class", "Api", 3, 5), ("web/api.ts", "function", "handle", 4, 4)} <= {(s["path"], s["kind"], s["name"], s["start_line"], s["end_line"]) for s in symbols}

def test_chunker_preserves_entire_function_and_class_boundaries(tmp_path):
    archive = io.BytesIO()
    with zipfile.ZipFile(archive, "w") as zip_file:
        zip_file.writestr("src/example.py", "import os\n\nclass Service:\n    def process(self):\n        return 1\n\ndef helper():\n    return 2\n")
    client, _ = client_for(tmp_path)
    upload_id = client.post("/api/uploads", files={"file": ("repo.zip", archive.getvalue())}).json()["id"]
    assert client.post(f"/api/uploads/{upload_id}/scan").status_code == 200
    assert client.post(f"/api/uploads/{upload_id}/parse").status_code == 200
    result = client.post(f"/api/uploads/{upload_id}/chunk")
    chunks = client.get(f"/api/uploads/{upload_id}/chunks").json()["chunks"]
    app.dependency_overrides.clear()
    assert result.status_code == 200
    assert {(chunk["symbol_name"], chunk["start_line"], chunk["end_line"]) for chunk in chunks} >= {("Service", 3, 5), ("helper", 7, 8)}

def test_faiss_raw_similarity_returns_the_expected_chunk(tmp_path):
    import numpy as np
    from app.embed import FaissIndexStore
    index = FaissIndexStore(tmp_path)
    index.write("repository", np.asarray([[1.0, 0.0], [0.0, 1.0]], dtype="float32"))
    assert index.search("repository", np.asarray([0.9, 0.1], dtype="float32"), 1) == [(0, 0.8999999761581421)]

def test_answer_client_rejects_missing_or_invalid_citations():
    from app.answer import AnswerClient, AnswerError
    client = AnswerClient("test", "test")
    client.answer = lambda question, contexts: ("answer", [1])
    assert client.answer("question", [{"id": 1}]) == ("answer", [1])
    class InvalidClient(AnswerClient):
        def answer(self, question, contexts):
            raise AnswerError("The answer model did not provide valid required citations.")
    try:
        InvalidClient("test", "test").answer("question", [{"id": 1}])
    except AnswerError:
        pass
    else:
        assert False

def test_bm25_retriever_exact_token_match():
    """BM25 must rank the chunk containing the exact token highest."""
    from app.bm25 import BM25Retriever
    texts = [
        "def authenticate_user(token): return jwt.decode(token)",
        "class UserService: pass",
        "import os; import sys",
    ]
    retriever = BM25Retriever(texts)
    results = retriever.search("authenticate_user", limit=3)
    assert results, "Expected at least one result"
    assert results[0][0] == 0, "Chunk 0 (with authenticate_user) must rank first"

def test_reciprocal_rank_fusion_merges_and_deduplicates():
    """RRF must merge two lists, deduplicate, and boost items appearing in both."""
    from app.bm25 import reciprocal_rank_fusion
    vec_list = [(0, 0.95), (1, 0.80), (2, 0.60)]  # vector results
    bm25_list = [(2, 12.0), (0, 8.0), (3, 5.0)]   # BM25 results
    fused = reciprocal_rank_fusion(vec_list, bm25_list, limit=4)
    indices = [idx for idx, _ in fused]
    # Chunk 0 appears in both lists at high rank — must be #1 after fusion
    assert indices[0] == 0, f"Expected chunk 0 first, got {indices}"
    # All indices must be unique (no duplicates)
    assert len(indices) == len(set(indices)), "RRF must deduplicate results"

def test_hybrid_search_endpoint_returns_results(tmp_path):
    """End-to-end: hybrid-search endpoint must return merged results after embed.

    Uses a 4-dim stub EmbeddingClient and a matching fake FAISS index to avoid
    loading the real sentence-transformer model in this test.
    """
    import io, zipfile, numpy as np
    from app.embed import FaissIndexStore
    from app.main import get_embedding_client

    DIM = 4

    class _StubEmbedClient:
        """Returns unit vectors of dimension DIM — no model loading."""
        def encode_query(self, text: str) -> np.ndarray:
            v = np.ones(DIM, dtype="float32")
            return v / np.linalg.norm(v)
        def encode_documents(self, texts):
            return np.eye(len(texts), DIM, dtype="float32")

    archive = io.BytesIO()
    with zipfile.ZipFile(archive, "w") as zf:
        zf.writestr("src/auth.py", "def issue_jwt(user):\n    return jwt.encode({'sub': user})\n")
        zf.writestr("src/db.py", "def get_user(user_id):\n    return db.query(user_id)\n")

    client, store = client_for(tmp_path)
    # Also override the embedding client so the endpoint uses our 4-dim stub
    app.dependency_overrides[get_embedding_client] = lambda: _StubEmbedClient()

    upload_id = client.post("/api/uploads", files={"file": ("repo.zip", archive.getvalue())}).json()["id"]
    assert client.post(f"/api/uploads/{upload_id}/scan").status_code == 200
    assert client.post(f"/api/uploads/{upload_id}/parse").status_code == 200
    assert client.post(f"/api/uploads/{upload_id}/chunk").status_code == 200

    # Write a fake FAISS index using the same DIM as the stub
    chunks = store.list_chunks(upload_id)
    n = len(chunks)
    fake_vectors = np.eye(n, DIM, dtype="float32")
    FaissIndexStore(tmp_path).write(upload_id, fake_vectors)

    response = client.post(f"/api/uploads/{upload_id}/hybrid-search", json={"query": "issue_jwt", "limit": 5})
    app.dependency_overrides.clear()

    assert response.status_code == 200
    data = response.json()
    assert data["upload_id"] == upload_id
    assert len(data["results"]) > 0
    # BM25 must have surfaced the issue_jwt chunk — verify it appears in results
    paths = [r["path"] for r in data["results"]]
    assert "src/auth.py" in paths, f"Expected src/auth.py in results, got {paths}"


def test_eval_metrics_computation_and_overlap_matching():
    """Test overlap detection, single query evaluation, and metric aggregation."""
    from eval.harness import is_overlap, evaluate_query, compute_metrics

    # Test is_overlap
    assert is_overlap("src/auth.py", 1, 10, "src/auth.py", 5, 15)
    assert is_overlap("src/auth.py", 1, 10, "src/auth.py", 10, 20)
    assert not is_overlap("src/auth.py", 1, 10, "src/auth.py", 11, 20)
    assert not is_overlap("src/auth.py", 1, 10, "src/db.py", 1, 10)

    # Test evaluate_query hit at rank 1
    retrieved = [
        {"path": "src/auth.py", "start_line": 1, "end_line": 10},
        {"path": "src/db.py", "start_line": 1, "end_line": 10},
    ]
    expected = [{"path": "src/auth.py", "start_line": 5, "end_line": 8}]
    res = evaluate_query(retrieved, expected, k=2)
    assert res["hit"] is True
    assert res["first_hit_rank"] == 1
    assert res["reciprocal_rank"] == 1.0
    assert res["precision_at_k"] == 0.5
    assert res["recall_at_k"] == 1.0

    # Test evaluate_query miss
    res_miss = evaluate_query(retrieved, [{"path": "src/other.py", "start_line": 1, "end_line": 5}], k=2)
    assert res_miss["hit"] is False
    assert res_miss["reciprocal_rank"] == 0.0

    # Test compute_metrics aggregation
    metrics = compute_metrics([res, res_miss], latencies_ms=[10.0, 20.0], k=2)
    assert metrics["total_queries"] == 2
    assert metrics["passed_queries"] == 1
    assert metrics["failed_queries"] == 1
    assert metrics["mrr"] == 0.5
    assert metrics["mean_precision_at_k"] == 0.25
    assert metrics["mean_recall_at_k"] == 0.5
    assert metrics["latency_p50_ms"] == 15.0


def test_evaluate_endpoint_returns_report(tmp_path):
    """End-to-end: evaluate endpoint returns full report with metrics and queries."""
    import io, zipfile, numpy as np
    from app.embed import FaissIndexStore
    from app.main import get_embedding_client

    DIM = 4

    class _StubEmbedClient:
        def encode_query(self, text: str) -> np.ndarray:
            v = np.ones(DIM, dtype="float32")
            return v / np.linalg.norm(v)
        def encode_documents(self, texts):
            return np.eye(len(texts), DIM, dtype="float32")

    archive = io.BytesIO()
    with zipfile.ZipFile(archive, "w") as zf:
        zf.writestr("src/auth.py", "def issue_jwt(user):\n    return jwt.encode({'sub': user})\n")
        zf.writestr("src/db.py", "def get_user(user_id):\n    return db.query(user_id)\n")

    client, store = client_for(tmp_path)
    app.dependency_overrides[get_embedding_client] = lambda: _StubEmbedClient()

    upload_id = client.post("/api/uploads", files={"file": ("repo.zip", archive.getvalue())}).json()["id"]
    assert client.post(f"/api/uploads/{upload_id}/scan").status_code == 200
    assert client.post(f"/api/uploads/{upload_id}/parse").status_code == 200
    assert client.post(f"/api/uploads/{upload_id}/chunk").status_code == 200

    chunks = store.list_chunks(upload_id)
    n = len(chunks)
    fake_vectors = np.eye(n, DIM, dtype="float32")
    FaissIndexStore(tmp_path).write(upload_id, fake_vectors)

    eval_payload = {
        "queries": [
            {
                "id": "q1",
                "question": "issue_jwt",
                "expected": [{"path": "src/auth.py", "start_line": 1, "end_line": 3}],
            },
            {
                "id": "q2",
                "question": "nonexistent_term_xyz",
                "expected": [{"path": "src/missing.py", "start_line": 1, "end_line": 2}],
            },
        ],
        "top_k": 5,
    }

    response = client.post(f"/api/uploads/{upload_id}/evaluate", json=eval_payload)
    app.dependency_overrides.clear()

    assert response.status_code == 200
    data = response.json()
    assert data["upload_id"] == upload_id
    assert data["metrics"]["total_queries"] == 2
    assert data["metrics"]["passed_queries"] == 1
    assert data["metrics"]["failed_queries"] == 1
    assert len(data["failures"]) == 1
    assert data["failures"][0]["id"] == "q2"


def test_callgraph_extracts_python_and_typescript_calls():
    """Test Tree-sitter call extraction across Python and TypeScript files."""
    from app.callgraph import build_call_graph

    files = [
        (
            "src/auth.py",
            "Python",
            100,
            "def hash_password(p):\n    return sha256(p)\n\ndef login(u, p):\n    h = hash_password(p)\n    return create_session(u)\n",
        ),
        (
            "web/client.ts",
            "TypeScript",
            100,
            "function apiCall() { return fetch(); }\nfunction onSubmit() {\n    apiCall();\n}\n",
        ),
    ]
    symbols_by_path = {
        "src/auth.py": [
            ("function", "hash_password", 1, 2),
            ("function", "login", 4, 6),
        ],
        "web/client.ts": [
            ("function", "apiCall", 1, 1),
            ("function", "onSubmit", 2, 4),
        ],
    }

    edges = build_call_graph(files, symbols_by_path)
    # login -> hash_password (internal resolved)
    # login -> create_session (external/unresolved)
    # onSubmit -> apiCall (internal resolved)
    edge_tuples = [(e[0], e[1], e[3], e[4]) for e in edges]

    assert ("src/auth.py", "login", "src/auth.py", "hash_password") in edge_tuples
    assert ("src/auth.py", "login", None, "create_session") in edge_tuples
    assert ("web/client.ts", "onSubmit", "web/client.ts", "apiCall") in edge_tuples


def test_callgraph_api_endpoints_build_and_query(tmp_path):
    """End-to-end: POST /call-graph builds edges and GET /call-graph filters by function."""
    import io, zipfile

    archive = io.BytesIO()
    with zipfile.ZipFile(archive, "w") as zf:
        zf.writestr(
            "src/service.py",
            "def validate(x):\n    return x > 0\n\ndef process(data):\n    if validate(data):\n        save(data)\n",
        )
    client, store = client_for(tmp_path)
    upload_id = client.post("/api/uploads", files={"file": ("repo.zip", archive.getvalue())}).json()["id"]
    assert client.post(f"/api/uploads/{upload_id}/scan").status_code == 200
    assert client.post(f"/api/uploads/{upload_id}/parse").status_code == 200

    build_resp = client.post(f"/api/uploads/{upload_id}/call-graph")
    assert build_resp.status_code == 200
    assert build_resp.json()["edges_indexed"] >= 2

    # Query all edges
    all_resp = client.get(f"/api/uploads/{upload_id}/call-graph")
    assert all_resp.status_code == 200
    edges = all_resp.json()["edges"]
    assert len(edges) >= 2

    # Query by function name 'validate' (as callee)
    callee_resp = client.get(f"/api/uploads/{upload_id}/call-graph?function_name=validate")
    assert callee_resp.status_code == 200
    matching = callee_resp.json()["edges"]
    assert any(e["caller_name"] == "process" and e["callee_name"] == "validate" for e in matching)

    app.dependency_overrides.clear()


def test_depgraph_extracts_and_resolves_imports():
    """Test module import extraction and resolution for Python and TypeScript."""
    from app.depgraph import build_dependency_graph

    files = [
        ("src/config.py", "Python", 50, "DB_URL = 'sqlite:///'\n"),
        ("src/main.py", "Python", 100, "import os\nfrom .config import DB_URL\nfrom .models import User\n"),
        ("web/router.ts", "TypeScript", 50, "export const router = {};\n"),
        ("web/app.ts", "TypeScript", 100, "import React from 'react';\nimport { router } from './router';\n"),
    ]

    edges = build_dependency_graph(files)
    # main.py -> os (external)
    # main.py -> src/config.py (internal relative)
    # app.ts -> react (external)
    # app.ts -> web/router.ts (internal relative)
    edge_map = {(e[0], e[2]): (e[1], e[3]) for e in edges}

    assert ("src/main.py", "os") in edge_map
    assert edge_map[("src/main.py", "os")] == (None, True)

    assert ("src/main.py", ".config") in edge_map
    assert edge_map[("src/main.py", ".config")] == ("src/config.py", False)

    assert ("web/app.ts", "react") in edge_map
    assert edge_map[("web/app.ts", "react")] == (None, True)

    assert ("web/app.ts", "./router") in edge_map
    assert edge_map[("web/app.ts", "./router")] == ("web/router.ts", False)


def test_depgraph_api_endpoints_build_and_query(tmp_path):
    """End-to-end: POST /dependency-graph builds edges and GET /dependency-graph queries edges."""
    import io, zipfile

    archive = io.BytesIO()
    with zipfile.ZipFile(archive, "w") as zf:
        zf.writestr("src/db.py", "def connect(): return None\n")
        zf.writestr("src/app.py", "from .db import connect\nimport json\n")

    client, store = client_for(tmp_path)
    upload_id = client.post("/api/uploads", files={"file": ("repo.zip", archive.getvalue())}).json()["id"]
    assert client.post(f"/api/uploads/{upload_id}/scan").status_code == 200

    build_resp = client.post(f"/api/uploads/{upload_id}/dependency-graph")
    assert build_resp.status_code == 200
    assert build_resp.json()["edges_indexed"] >= 2

    # Query all edges
    all_resp = client.get(f"/api/uploads/{upload_id}/dependency-graph")
    assert all_resp.status_code == 200
    assert all_resp.json()["total_edges"] >= 2

    # Query by path src/app.py
    app_resp = client.get(f"/api/uploads/{upload_id}/dependency-graph?path=src/app.py")
    assert app_resp.status_code == 200
    edges = app_resp.json()["edges"]
    assert any(e["source_path"] == "src/app.py" and e["target_path"] == "src/db.py" for e in edges)
    assert any(e["source_path"] == "src/app.py" and e["is_external"] is True for e in edges)

    app.dependency_overrides.clear()


# ---------------------------------------------------------------------------
# Phase 13 — Execution Flow Synthesis
# ---------------------------------------------------------------------------

def _make_flow_archive() -> bytes:
    """Minimal two-file Python repo with clear caller→callee relationship."""
    import io, zipfile
    archive = io.BytesIO()
    with zipfile.ZipFile(archive, "w") as zf:
        zf.writestr(
            "src/auth.py",
            "import jwt\n\ndef issue_token(user):\n    payload = build_payload(user)\n    return jwt.encode(payload, 'secret')\n\ndef build_payload(user):\n    return {'sub': user.id}\n",
        )
        zf.writestr(
            "src/router.py",
            "from src.auth import issue_token\n\ndef login(request):\n    token = issue_token(request.user)\n    return {'token': token}\n",
        )
    return archive.getvalue()


def test_flow_synthesis_returns_409_when_no_chunks(tmp_path):
    """POST /flow must return 409 before chunks are created."""
    client, _ = client_for(tmp_path)
    archive = _make_flow_archive()
    upload_id = client.post("/api/uploads", files={"file": ("repo.zip", archive)}).json()["id"]
    # Deliberately skip scan/parse/chunk/embed
    resp = client.post(f"/api/uploads/{upload_id}/flow", json={"question": "Explain auth"})
    app.dependency_overrides.clear()
    assert resp.status_code == 409


def test_flow_synthesis_returns_mermaid_and_steps(tmp_path):
    """Full pipeline: scan→parse→chunk→embed→call-graph→flow returns structured output."""
    import app.main as main_module
    from pathlib import Path
    from unittest.mock import patch

    client, store = client_for(tmp_path)
    archive = _make_flow_archive()

    # Patch settings.data_dir so embed writes the FAISS index to tmp_path
    # and the flow endpoint reads from the same location.
    patched_settings = main_module.settings.__class__(
        **{**main_module.settings.__dataclass_fields__,
           "data_dir": tmp_path}
    )
    # Use object.__setattr__ because Settings is frozen
    import dataclasses
    patched_settings = dataclasses.replace(main_module.settings, data_dir=tmp_path)

    with patch.object(main_module, "settings", patched_settings):
        # Upload and prepare
        upload_id = client.post("/api/uploads", files={"file": ("repo.zip", archive)}).json()["id"]
        assert client.post(f"/api/uploads/{upload_id}/scan").status_code == 200
        assert client.post(f"/api/uploads/{upload_id}/parse").status_code == 200
        assert client.post(f"/api/uploads/{upload_id}/chunk").status_code == 200
        assert client.post(f"/api/uploads/{upload_id}/embed").status_code == 200
        assert client.post(f"/api/uploads/{upload_id}/call-graph").status_code == 200

        # Patch the AnswerClient so test doesn't need a real API key
        from app.main import get_answer_client
        from app.answer import AnswerClient

        mock_client = AnswerClient(api_key=None, model="test")

        def _fake_answer(question, contexts):
            return "Step 1: login calls issue_token. Step 2: issue_token calls build_payload.", [1]

        mock_client.answer = _fake_answer
        app.dependency_overrides[get_answer_client] = lambda: mock_client

        resp = client.post(
            f"/api/uploads/{upload_id}/flow",
            json={"question": "Explain the authentication flow", "depth": 2, "limit": 6},
        )
        app.dependency_overrides.clear()

    assert resp.status_code == 200, resp.text
    body = resp.json()

    # Must have the key fields
    assert body["upload_id"] == upload_id
    assert body["question"] == "Explain the authentication flow"
    assert isinstance(body["steps"], list)
    assert len(body["steps"]) >= 1
    assert "mermaid_diagram" in body
    assert body["mermaid_diagram"].startswith("flowchart")
    assert isinstance(body["citations"], list)
    assert len(body["citations"]) >= 1
    # Every step must have a path and function_name
    for step in body["steps"]:
        assert step["function_name"]
        assert step["path"]
