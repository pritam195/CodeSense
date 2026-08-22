from datetime import datetime
from typing import Literal
from pydantic import BaseModel
class UploadResponse(BaseModel):
    id: str; source_type: Literal["zip", "git_url"]; original_name: str; created_at: datetime
class UploadListResponse(BaseModel): uploads: list[UploadResponse]
class GitUploadRequest(BaseModel): url: str
class FileMetadata(BaseModel): path: str; language: str; size_bytes: int; content: str
class ScanResponse(BaseModel): upload_id: str; files_indexed: int
class FileListResponse(BaseModel): upload_id: str; files: list[FileMetadata]
class CodeSymbol(BaseModel): path: str; kind: str; name: str; start_line: int; end_line: int
class ParseResponse(BaseModel): upload_id: str; symbols_indexed: int
class SymbolListResponse(BaseModel): upload_id: str; symbols: list[CodeSymbol]
class StoredUpload:
    def __init__(self, upload_id, source_type, original_name, created_at): self.id=upload_id; self.source_type=source_type; self.original_name=original_name; self.created_at=created_at
