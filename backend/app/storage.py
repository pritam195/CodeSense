import hashlib
import json
import secrets
import sqlite3
import uuid
from datetime import UTC, datetime
from pathlib import Path
from .models import StoredUpload


def hash_password(password: str, salt: str | None = None) -> tuple[str, str]:
    if salt is None:
        salt = secrets.token_hex(16)
    key = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt.encode("utf-8"), 100_000)
    return key.hex(), salt


class UploadStore:
    def __init__(self, data_dir: Path):
        self.data_dir = data_dir
        self.archive_dir = data_dir / "uploads"
        self.database_path = data_dir / "codesense.sqlite3"
        self.data_dir.mkdir(parents=True, exist_ok=True)
        self.archive_dir.mkdir(exist_ok=True)
        self._initialize()

    def _connection(self):
        return sqlite3.connect(self.database_path)

    def _initialize(self):
        with self._connection() as c:
            c.execute("CREATE TABLE IF NOT EXISTS uploads (id TEXT PRIMARY KEY, source_type TEXT NOT NULL, original_name TEXT NOT NULL, location TEXT NOT NULL, created_at TEXT NOT NULL, user_id TEXT)")
            cols = [col[1] for col in c.execute("PRAGMA table_info(uploads)").fetchall()]
            if "user_id" not in cols:
                c.execute("ALTER TABLE uploads ADD COLUMN user_id TEXT")

            c.execute("CREATE TABLE IF NOT EXISTS file_metadata (upload_id TEXT NOT NULL, path TEXT NOT NULL, language TEXT NOT NULL, size_bytes INTEGER NOT NULL, content TEXT NOT NULL, PRIMARY KEY (upload_id,path))")
            c.execute("CREATE TABLE IF NOT EXISTS chunks (upload_id TEXT NOT NULL, path TEXT NOT NULL, start_line INTEGER NOT NULL, end_line INTEGER NOT NULL, content TEXT NOT NULL, symbol_name TEXT, PRIMARY KEY (upload_id,path,start_line,end_line))")
            c.execute("CREATE TABLE IF NOT EXISTS code_symbols (upload_id TEXT NOT NULL, path TEXT NOT NULL, kind TEXT NOT NULL, name TEXT NOT NULL, start_line INTEGER NOT NULL, end_line INTEGER NOT NULL, PRIMARY KEY (upload_id,path,kind,name,start_line))")
            c.execute("CREATE TABLE IF NOT EXISTS call_graph_edges (upload_id TEXT NOT NULL, caller_path TEXT NOT NULL, caller_name TEXT NOT NULL, caller_line INTEGER NOT NULL, callee_path TEXT, callee_name TEXT NOT NULL, call_line INTEGER NOT NULL, PRIMARY KEY (upload_id,caller_path,caller_name,callee_name,call_line))")
            c.execute("CREATE TABLE IF NOT EXISTS dependency_graph_edges (upload_id TEXT NOT NULL, source_path TEXT NOT NULL, target_path TEXT, import_specifier TEXT NOT NULL, is_external BOOLEAN NOT NULL, line_number INTEGER NOT NULL, PRIMARY KEY (upload_id,source_path,import_specifier,line_number))")
            c.execute("CREATE TABLE IF NOT EXISTS chat_messages (id TEXT PRIMARY KEY, upload_id TEXT NOT NULL, role TEXT NOT NULL, content TEXT NOT NULL, format TEXT NOT NULL, citations_json TEXT NOT NULL, created_at TEXT NOT NULL)")
            c.execute("CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, email TEXT UNIQUE NOT NULL, username TEXT NOT NULL, password_hash TEXT NOT NULL, salt TEXT NOT NULL, avatar_url TEXT, created_at TEXT NOT NULL)")
            c.execute("CREATE TABLE IF NOT EXISTS user_sessions (token TEXT PRIMARY KEY, user_id TEXT NOT NULL, created_at TEXT NOT NULL)")

    # ---------------- Auth & User Management ----------------
    def create_user(self, email: str, username: str, password: str, avatar_url: str | None = None) -> dict:
        user_id = str(uuid.uuid4())
        pwd_hash, salt = hash_password(password)
        created_at = datetime.now(UTC).isoformat()
        with self._connection() as c:
            existing = c.execute("SELECT id FROM users WHERE email=?", (email.strip().lower(),)).fetchone()
            if existing:
                raise ValueError("Email already registered.")
            c.execute(
                "INSERT INTO users (id, email, username, password_hash, salt, avatar_url, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
                (user_id, email.strip().lower(), username.strip(), pwd_hash, salt, avatar_url, created_at)
            )
        return {"id": user_id, "email": email.strip().lower(), "username": username.strip(), "avatar_url": avatar_url, "created_at": created_at}

    def authenticate_user(self, email: str, password: str) -> dict:
        with self._connection() as c:
            row = c.execute("SELECT id, email, username, password_hash, salt, avatar_url, created_at FROM users WHERE email=?", (email.strip().lower(),)).fetchone()
        if not row:
            raise ValueError("Invalid email or password.")
        user_id, u_email, username, expected_hash, salt, avatar_url, created_at = row
        test_hash, _ = hash_password(password, salt)
        if not secrets.compare_digest(expected_hash, test_hash):
            raise ValueError("Invalid email or password.")
        return {"id": user_id, "email": u_email, "username": username, "avatar_url": avatar_url, "created_at": created_at}

    def create_session(self, user_id: str) -> str:
        token = secrets.token_urlsafe(32)
        created_at = datetime.now(UTC).isoformat()
        with self._connection() as c:
            c.execute("INSERT INTO user_sessions (token, user_id, created_at) VALUES (?, ?, ?)", (token, user_id, created_at))
        return token

    def get_user_by_token(self, token: str) -> dict | None:
        if not token:
            return None
        with self._connection() as c:
            row = c.execute(
                "SELECT u.id, u.email, u.username, u.avatar_url, u.created_at FROM users u JOIN user_sessions s ON u.id = s.user_id WHERE s.token=?",
                (token,)
            ).fetchone()
        if not row:
            return None
        return {"id": row[0], "email": row[1], "username": row[2], "avatar_url": row[3], "created_at": row[4]}

    def delete_session(self, token: str):
        with self._connection() as c:
            c.execute("DELETE FROM user_sessions WHERE token=?", (token,))

    def update_user_profile(self, user_id: str, username: str | None = None, avatar_url: str | None = None) -> dict | None:
        with self._connection() as c:
            if username:
                c.execute("UPDATE users SET username=? WHERE id=?", (username.strip(), user_id))
            if avatar_url is not None:
                c.execute("UPDATE users SET avatar_url=? WHERE id=?", (avatar_url, user_id))
            row = c.execute("SELECT id, email, username, avatar_url, created_at FROM users WHERE id=?", (user_id,)).fetchone()
        if not row:
            return None
        return {"id": row[0], "email": row[1], "username": row[2], "avatar_url": row[3], "created_at": row[4]}

    def get_user_stats(self, user_id: str) -> dict:
        with self._connection() as c:
            repo_count = c.execute("SELECT COUNT(*) FROM uploads").fetchone()[0]
            chat_count = c.execute("SELECT COUNT(*) FROM chat_messages WHERE role='user'").fetchone()[0]
            files_count = c.execute("SELECT COUNT(*) FROM file_metadata").fetchone()[0]
        return {
            "total_repositories": repo_count,
            "total_questions_asked": chat_count,
            "total_files_indexed": files_count,
        }

    # ---------------- Chat Persistence ----------------
    def add_chat_message(self, upload_id: str, role: str, content: str, format: str = "text", citations: list[dict] | None = None) -> dict:
        msg_id = str(uuid.uuid4())
        created_at = datetime.now(UTC).isoformat()
        citations_json = json.dumps(citations or [])
        with self._connection() as c:
            c.execute(
                "INSERT INTO chat_messages (id, upload_id, role, content, format, citations_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
                (msg_id, upload_id, role, content, format, citations_json, created_at)
            )
        return {
            "id": msg_id,
            "upload_id": upload_id,
            "role": role,
            "content": content,
            "format": format,
            "citations": citations or [],
            "created_at": created_at
        }

    def list_chat_messages(self, upload_id: str) -> list[dict]:
        with self._connection() as c:
            rows = c.execute(
                "SELECT id, upload_id, role, content, format, citations_json, created_at FROM chat_messages WHERE upload_id=? ORDER BY created_at ASC",
                (upload_id,)
            ).fetchall()
        result = []
        for r in rows:
            try:
                cits = json.loads(r[5])
            except Exception:
                cits = []
            result.append({
                "id": r[0],
                "upload_id": r[1],
                "role": r[2],
                "content": r[3],
                "format": r[4],
                "citations": cits,
                "created_at": r[6]
            })
        return result

    def clear_chat_messages(self, upload_id: str):
        with self._connection() as c:
            c.execute("DELETE FROM chat_messages WHERE upload_id=?", (upload_id,))

    # ---------------- Uploads & AST Chunks ----------------
    def create_archive(self, original_name: str, content: bytes, user_id: str | None = None):
        upload_id = str(uuid.uuid4())
        archive_path = self.archive_dir / f"{upload_id}.zip"
        archive_path.write_bytes(content)
        return self._insert(upload_id, "zip", original_name, str(archive_path), user_id=user_id)

    def create_git_url(self, url: str, user_id: str | None = None):
        return self._insert(str(uuid.uuid4()), "git_url", url, url, user_id=user_id)

    def list_uploads(self, user_id: str | None = None):
        with self._connection() as c:
            if user_id:
                return c.execute(
                    "SELECT id, source_type, original_name, created_at FROM uploads WHERE user_id=? ORDER BY created_at DESC",
                    (user_id,)
                ).fetchall()
            return c.execute(
                "SELECT id, source_type, original_name, created_at FROM uploads WHERE user_id IS NULL OR user_id='guest' ORDER BY created_at DESC"
            ).fetchall()

    def replace_with_archive(self, upload_id: str, content: bytes):
        archive_path = self.archive_dir / f"{upload_id}.zip"
        archive_path.write_bytes(content)
        with self._connection() as c:
            c.execute("UPDATE uploads SET source_type=?, location=? WHERE id=?", ("zip", str(archive_path), upload_id))

    def get_upload(self, upload_id: str):
        with self._connection() as c:
            return c.execute("SELECT source_type, location FROM uploads WHERE id=?", (upload_id,)).fetchone()

    def delete_upload(self, upload_id: str):
        upload = self.get_upload(upload_id)
        if upload is None:
            return False
        source_type, location = upload
        with self._connection() as c:
            for table in ("file_metadata", "chunks", "code_symbols", "call_graph_edges", "dependency_graph_edges", "chat_messages", "uploads"):
                c.execute(f"DELETE FROM {table} WHERE upload_id=?" if table != "uploads" else "DELETE FROM uploads WHERE id=?", (upload_id,))
        index_path = self.data_dir / "indices" / f"{upload_id}.faiss"
        if index_path.is_file():
            index_path.unlink()
        if source_type == "zip":
            archive_path = Path(location).resolve()
            if archive_path.is_relative_to(self.archive_dir.resolve()) and archive_path.is_file():
                archive_path.unlink()

        try:
            from .neo4j_client import neo4j_client
            neo4j_client.delete_upload_graph(upload_id)
        except Exception as e:
            print(f"Failed to delete Neo4j graph for {upload_id}: {e}")

        return True

    def replace_file_metadata(self, upload_id: str, files: list):
        with self._connection() as c:
            c.execute("DELETE FROM file_metadata WHERE upload_id=?", (upload_id,))
            c.executemany("INSERT OR REPLACE INTO file_metadata VALUES (?,?,?,?,?)", [(upload_id, *item) for item in files])

    def list_file_metadata(self, upload_id: str):
        with self._connection() as c:
            return c.execute("SELECT path, language, size_bytes, content FROM file_metadata WHERE upload_id=? ORDER BY path", (upload_id,)).fetchall()

    def replace_chunks(self, upload_id: str, chunks: list):
        with self._connection() as c:
            c.execute("DELETE FROM chunks WHERE upload_id=?", (upload_id,))
            c.executemany("INSERT OR REPLACE INTO chunks VALUES (?,?,?,?,?,?)", [(upload_id, *item) for item in chunks])

    def list_chunks(self, upload_id: str):
        with self._connection() as c:
            return c.execute("SELECT path, start_line, end_line, content, symbol_name FROM chunks WHERE upload_id=? ORDER BY path, start_line", (upload_id,)).fetchall()

    def replace_symbols(self, upload_id: str, symbols: list):
        with self._connection() as c:
            c.execute("DELETE FROM code_symbols WHERE upload_id=?", (upload_id,))
            c.executemany("INSERT OR REPLACE INTO code_symbols VALUES (?,?,?,?,?,?)", [(upload_id, *item) for item in symbols])

    def list_symbols(self, upload_id: str):
        with self._connection() as c:
            return c.execute("SELECT path, kind, name, start_line, end_line FROM code_symbols WHERE upload_id=? ORDER BY path, start_line, kind", (upload_id,)).fetchall()

    def replace_call_graph(self, upload_id: str, edges: list):
        with self._connection() as c:
            c.execute("DELETE FROM call_graph_edges WHERE upload_id=?", (upload_id,))
            c.executemany("INSERT OR REPLACE INTO call_graph_edges VALUES (?,?,?,?,?,?,?)", [(upload_id, *item) for item in edges])

    def query_call_graph(self, upload_id: str, function_name: str | None = None, path: str | None = None):
        query = "SELECT caller_path, caller_name, caller_line, callee_path, callee_name, call_line FROM call_graph_edges WHERE upload_id=?"
        params = [upload_id]
        if function_name:
            query += " AND (caller_name=? OR callee_name=?)"
            params.extend([function_name, function_name])
        if path:
            query += " AND (caller_path=? OR callee_path=?)"
            params.extend([path, path])
        query += " ORDER BY caller_path, caller_line"
        with self._connection() as c:
            return c.execute(query, params).fetchall()

    def replace_dependency_graph(self, upload_id: str, edges: list):
        with self._connection() as c:
            c.execute("DELETE FROM dependency_graph_edges WHERE upload_id=?", (upload_id,))
            c.executemany("INSERT OR REPLACE INTO dependency_graph_edges VALUES (?,?,?,?,?,?)", [(upload_id, *item) for item in edges])

    def query_dependency_graph(self, upload_id: str, path: str | None = None):
        query = "SELECT source_path, target_path, import_specifier, is_external, line_number FROM dependency_graph_edges WHERE upload_id=?"
        params = [upload_id]
        if path:
            query += " AND (source_path=? OR target_path=?)"
            params.extend([path, path])
        query += " ORDER BY source_path, line_number"
        with self._connection() as c:
            return c.execute(query, params).fetchall()

    def _insert(self, upload_id: str, source_type: str, original_name: str, location: str, user_id: str | None = None):
        created_at = datetime.now(UTC)
        with self._connection() as c:
            c.execute("INSERT INTO uploads VALUES (?,?,?,?,?,?)", (upload_id, source_type, original_name, location, created_at.isoformat(), user_id))
        return StoredUpload(upload_id, source_type, original_name, created_at)
