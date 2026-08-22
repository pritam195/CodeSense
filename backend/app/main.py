from pathlib import Path
from urllib.parse import urlparse
from fastapi import Depends, FastAPI, File, HTTPException, UploadFile, status
from fastapi.middleware.cors import CORSMiddleware
from .config import Settings
from .models import CodeSymbol, FileListResponse, FileMetadata, GitUploadRequest, ParseResponse, ScanResponse, SymbolListResponse, UploadListResponse, UploadResponse
from .parser import extract_symbols
from .scanner import ScanError, scan_archive
from .storage import UploadStore

settings = Settings()
app = FastAPI(title="CodeSense API", version="0.3.0")
app.add_middleware(CORSMiddleware, allow_origins=list(settings.cors_origins), allow_methods=["*"], allow_headers=["*"])

def get_store() -> UploadStore:
    return UploadStore(settings.data_dir)

def to_response(upload) -> UploadResponse:
    return UploadResponse(id=upload.id, source_type=upload.source_type, original_name=upload.original_name, created_at=upload.created_at)

@app.get("/health")
def health() -> dict[str, str]: return {"status": "ok"}

@app.get("/api/uploads", response_model=UploadListResponse)
def list_uploads(store: UploadStore = Depends(get_store)) -> UploadListResponse:
    return UploadListResponse(uploads=[UploadResponse(id=item[0], source_type=item[1], original_name=item[2], created_at=item[3]) for item in store.list_uploads()])

@app.post("/api/uploads", response_model=UploadResponse, status_code=status.HTTP_201_CREATED)
async def upload_archive(file: UploadFile = File(...), store: UploadStore = Depends(get_store)) -> UploadResponse:
    filename = file.filename or ""
    if Path(filename).suffix.lower() != ".zip": raise HTTPException(400, "Only .zip repository archives are accepted.")
    content = await file.read(settings.max_upload_bytes + 1)
    if len(content) > settings.max_upload_bytes: raise HTTPException(413, "Archive exceeds the 50 MiB upload limit.")
    return to_response(store.create_archive(filename, content))

@app.post("/api/uploads/git", response_model=UploadResponse, status_code=status.HTTP_201_CREATED)
def upload_git_url(request: GitUploadRequest, store: UploadStore = Depends(get_store)) -> UploadResponse:
    parsed = urlparse(request.url)
    if parsed.scheme not in {"https", "git"} or not parsed.netloc: raise HTTPException(400, "Use an absolute HTTPS or Git repository URL.")
    return to_response(store.create_git_url(request.url))

@app.post("/api/uploads/{upload_id}/scan", response_model=ScanResponse)
def scan_upload(upload_id: str, store: UploadStore = Depends(get_store)) -> ScanResponse:
    upload = store.get_upload(upload_id)
    if upload is None: raise HTTPException(404, "Upload not found.")
    source_type, location = upload
    if source_type != "zip": raise HTTPException(409, "Git URLs are stored but cannot be scanned until a safe fetch workflow is added.")
    try: files = scan_archive(location, settings)
    except ScanError as error: raise HTTPException(400, str(error)) from error
    store.replace_file_metadata(upload_id, files)
    return ScanResponse(upload_id=upload_id, files_indexed=len(files))

@app.get("/api/uploads/{upload_id}/files", response_model=FileListResponse)
def list_files(upload_id: str, store: UploadStore = Depends(get_store)) -> FileListResponse:
    if store.get_upload(upload_id) is None: raise HTTPException(404, "Upload not found.")
    return FileListResponse(upload_id=upload_id, files=[FileMetadata(path=path, language=language, size_bytes=size, content=content) for path, language, size, content in store.list_file_metadata(upload_id)])

@app.post("/api/uploads/{upload_id}/parse", response_model=ParseResponse)
def parse_upload(upload_id: str, store: UploadStore = Depends(get_store)) -> ParseResponse:
    if store.get_upload(upload_id) is None: raise HTTPException(404, "Upload not found.")
    symbols = []
    for path, language, _, content in store.list_file_metadata(upload_id):
        symbols.extend((path, *symbol) for symbol in extract_symbols(language, content))
    store.replace_symbols(upload_id, symbols)
    return ParseResponse(upload_id=upload_id, symbols_indexed=len(symbols))

@app.get("/api/uploads/{upload_id}/symbols", response_model=SymbolListResponse)
def list_symbols(upload_id: str, store: UploadStore = Depends(get_store)) -> SymbolListResponse:
    if store.get_upload(upload_id) is None: raise HTTPException(404, "Upload not found.")
    return SymbolListResponse(upload_id=upload_id, symbols=[CodeSymbol(path=path, kind=kind, name=name, start_line=start, end_line=end) for path, kind, name, start, end in store.list_symbols(upload_id)])


