import sqlite3
import uuid
from datetime import UTC, datetime
from pathlib import Path
from .models import StoredUpload
class UploadStore:
    def __init__(self, data_dir: Path):
        self.data_dir=data_dir; self.archive_dir=data_dir/"uploads"; self.database_path=data_dir/"codesense.sqlite3"
        self.data_dir.mkdir(parents=True, exist_ok=True); self.archive_dir.mkdir(exist_ok=True); self._initialize()
    def _connection(self): return sqlite3.connect(self.database_path)
    def _initialize(self):
        with self._connection() as c:
            c.execute("CREATE TABLE IF NOT EXISTS uploads (id TEXT PRIMARY KEY, source_type TEXT NOT NULL, original_name TEXT NOT NULL, location TEXT NOT NULL, created_at TEXT NOT NULL)")
            c.execute("CREATE TABLE IF NOT EXISTS file_metadata (upload_id TEXT NOT NULL, path TEXT NOT NULL, language TEXT NOT NULL, size_bytes INTEGER NOT NULL, content TEXT NOT NULL, PRIMARY KEY (upload_id,path))")
            c.execute("CREATE TABLE IF NOT EXISTS chunks (upload_id TEXT NOT NULL, path TEXT NOT NULL, start_line INTEGER NOT NULL, end_line INTEGER NOT NULL, content TEXT NOT NULL, symbol_name TEXT, PRIMARY KEY (upload_id,path,start_line,end_line))")
            c.execute("CREATE TABLE IF NOT EXISTS code_symbols (upload_id TEXT NOT NULL, path TEXT NOT NULL, kind TEXT NOT NULL, name TEXT NOT NULL, start_line INTEGER NOT NULL, end_line INTEGER NOT NULL, PRIMARY KEY (upload_id,path,kind,name,start_line))")
            c.execute("CREATE TABLE IF NOT EXISTS call_graph_edges (upload_id TEXT NOT NULL, caller_path TEXT NOT NULL, caller_name TEXT NOT NULL, caller_line INTEGER NOT NULL, callee_path TEXT, callee_name TEXT NOT NULL, call_line INTEGER NOT NULL, PRIMARY KEY (upload_id,caller_path,caller_name,callee_name,call_line))")
    def create_archive(self, original_name, content):
        upload_id=str(uuid.uuid4()); archive_path=self.archive_dir/f"{upload_id}.zip"; archive_path.write_bytes(content); return self._insert(upload_id,"zip",original_name,str(archive_path))
    def create_git_url(self,url): return self._insert(str(uuid.uuid4()),"git_url",url,url)
    def list_uploads(self):
        with self._connection() as c: return c.execute("SELECT id,source_type,original_name,created_at FROM uploads ORDER BY created_at DESC").fetchall()
    def replace_with_archive(self, upload_id, content):
        archive_path=self.archive_dir/f"{upload_id}.zip"; archive_path.write_bytes(content)
        with self._connection() as c: c.execute("UPDATE uploads SET source_type=?, location=? WHERE id=?", ("zip", str(archive_path), upload_id))
    def get_upload(self,upload_id):
        with self._connection() as c: return c.execute("SELECT source_type,location FROM uploads WHERE id=?",(upload_id,)).fetchone()
    def delete_upload(self, upload_id):
        upload = self.get_upload(upload_id)
        if upload is None: return False
        source_type, location = upload
        with self._connection() as c:
            for table in ("file_metadata", "chunks", "code_symbols", "call_graph_edges", "uploads"):
                c.execute(f"DELETE FROM {table} WHERE upload_id=?" if table != "uploads" else "DELETE FROM uploads WHERE id=?", (upload_id,))
        index_path = self.data_dir / "indices" / f"{upload_id}.faiss"
        if index_path.is_file(): index_path.unlink()
        if source_type == "zip":
            archive_path = Path(location).resolve()
            if archive_path.is_relative_to(self.archive_dir.resolve()) and archive_path.is_file(): archive_path.unlink()
        return True
    def replace_file_metadata(self,upload_id,files):
        with self._connection() as c:
            c.execute("DELETE FROM file_metadata WHERE upload_id=?",(upload_id,)); c.executemany("INSERT OR REPLACE INTO file_metadata VALUES (?,?,?,?,?)",[(upload_id,*item) for item in files])
    def list_file_metadata(self,upload_id):
        with self._connection() as c: return c.execute("SELECT path,language,size_bytes,content FROM file_metadata WHERE upload_id=? ORDER BY path",(upload_id,)).fetchall()
    def replace_chunks(self,upload_id,chunks):
        with self._connection() as c:
            c.execute("DELETE FROM chunks WHERE upload_id=?",(upload_id,)); c.executemany("INSERT OR REPLACE INTO chunks VALUES (?,?,?,?,?,?)",[(upload_id,*item) for item in chunks])
    def list_chunks(self,upload_id):
        with self._connection() as c: return c.execute("SELECT path,start_line,end_line,content,symbol_name FROM chunks WHERE upload_id=? ORDER BY path,start_line",(upload_id,)).fetchall()
    def replace_symbols(self,upload_id,symbols):
        with self._connection() as c:
            c.execute("DELETE FROM code_symbols WHERE upload_id=?",(upload_id,)); c.executemany("INSERT OR REPLACE INTO code_symbols VALUES (?,?,?,?,?,?)",[(upload_id,*item) for item in symbols])

    def list_symbols(self,upload_id):
        with self._connection() as c: return c.execute("SELECT path,kind,name,start_line,end_line FROM code_symbols WHERE upload_id=? ORDER BY path,start_line,kind",(upload_id,)).fetchall()
    def replace_call_graph(self, upload_id, edges):
        with self._connection() as c:
            c.execute("DELETE FROM call_graph_edges WHERE upload_id=?", (upload_id,))
            c.executemany("INSERT OR REPLACE INTO call_graph_edges VALUES (?,?,?,?,?,?,?)", [(upload_id, *item) for item in edges])
    def query_call_graph(self, upload_id, function_name=None, path=None):
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
    def _insert(self,upload_id,source_type,original_name,location):
        created_at=datetime.now(UTC)
        with self._connection() as c: c.execute("INSERT INTO uploads VALUES (?,?,?,?,?)",(upload_id,source_type,original_name,location,created_at.isoformat()))
        return StoredUpload(upload_id,source_type,original_name,created_at)


