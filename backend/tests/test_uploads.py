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
