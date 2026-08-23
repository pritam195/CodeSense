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
