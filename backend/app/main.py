from pathlib import Path
from urllib.parse import urlparse
from fastapi import Depends, FastAPI, File, HTTPException, Response, UploadFile, status
from fastapi.middleware.cors import CORSMiddleware
from .config import Settings
from .answer import AnswerClient, AnswerError
from .bm25 import BM25Retriever, reciprocal_rank_fusion
from .callgraph import build_call_graph
from .depgraph import build_dependency_graph
from .eval_api import load_default_queries, run_internal_evaluation
from .models import AnswerRequest, AnswerResponse, CallGraphBuildResponse, CallGraphEdge, CallGraphResponse, Citation, ChunkListResponse, ChunkResponse, CodeChunk, CodeSymbol, DependencyEdge, DependencyGraphBuildResponse, DependencyGraphResponse, EmbeddingResponse, EvalReportResponse, EvalRequest, FileListResponse, FileMetadata, GitFetchResponse, GitUploadRequest, HybridSearchRequest, HybridSearchResponse, HybridSearchResult, ParseResponse, ScanResponse, SimilarityRequest, SimilarityResponse, SimilarityResult, SymbolListResponse, UploadListResponse, UploadResponse
from .chunker import SourceSymbol, chunk_file
from .embed import EmbeddingClient, FaissIndexStore
from .gitfetch import GitFetchError, download_archive
from .parser import extract_symbols
from .scanner import ScanError, scan_archive
from .storage import UploadStore

settings = Settings()
embedding_client = EmbeddingClient(settings.embedding_model, settings.embedding_max_chars, settings.embedding_min_interval_seconds)
answer_client = AnswerClient(settings.openai_api_key, settings.answer_model)
app = FastAPI(title="CodeSense API", version="0.3.0")
app.add_middleware(CORSMiddleware, allow_origins=list(settings.cors_origins), allow_origin_regex=r"^http://(localhost|127\.0\.0\.1):\d+$", allow_methods=["*"], allow_headers=["*"])

def get_embedding_client() -> EmbeddingClient:
    return embedding_client

def get_answer_client() -> AnswerClient:
    return answer_client

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
    if parsed.scheme != "https" or parsed.netloc.lower() != "github.com": raise HTTPException(400, "Use a public https://github.com/owner/repository URL.")
    return to_response(store.create_git_url(request.url))

@app.delete("/api/uploads/{upload_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_upload(upload_id: str, store: UploadStore = Depends(get_store)) -> Response:
    if not store.delete_upload(upload_id): raise HTTPException(404, "Upload not found.")
    return Response(status_code=status.HTTP_204_NO_CONTENT)
@app.post("/api/uploads/{upload_id}/scan", response_model=ScanResponse)
def scan_upload(upload_id: str, store: UploadStore = Depends(get_store)) -> ScanResponse:
    upload = store.get_upload(upload_id)
    if upload is None: raise HTTPException(404, "Upload not found.")
    source_type, location = upload
    if source_type != "zip": raise HTTPException(409, "Fetch the public GitHub archive before scanning.")
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


@app.post("/api/uploads/{upload_id}/chunk", response_model=ChunkResponse)
def chunk_upload(upload_id: str, store: UploadStore = Depends(get_store)) -> ChunkResponse:
    if store.get_upload(upload_id) is None: raise HTTPException(404, "Upload not found.")
    symbols_by_path = {}
    for path, kind, name, start, end in store.list_symbols(upload_id):
        symbols_by_path.setdefault(path, []).append(SourceSymbol(path, kind, name, start, end))
    chunks = []
    for path, _, _, content in store.list_file_metadata(upload_id):
        chunks.extend(chunk_file(path, content, symbols_by_path.get(path, [])))
    store.replace_chunks(upload_id, chunks)
    return ChunkResponse(upload_id=upload_id, chunks_created=len(chunks))

@app.get("/api/uploads/{upload_id}/chunks", response_model=ChunkListResponse)
def list_chunks(upload_id: str, store: UploadStore = Depends(get_store)) -> ChunkListResponse:
    if store.get_upload(upload_id) is None: raise HTTPException(404, "Upload not found.")
    return ChunkListResponse(upload_id=upload_id, chunks=[CodeChunk(path=path, start_line=start, end_line=end, content=content, symbol_name=symbol_name) for path, start, end, content, symbol_name in store.list_chunks(upload_id)])


@app.post("/api/uploads/{upload_id}/embed", response_model=EmbeddingResponse)
def embed_upload(upload_id: str, store: UploadStore = Depends(get_store), client: EmbeddingClient = Depends(get_embedding_client)) -> EmbeddingResponse:
    chunks = store.list_chunks(upload_id)
    if not chunks: raise HTTPException(409, "Create chunks before embedding.")
    vectors = client.encode_documents([chunk[3] for chunk in chunks])
    FaissIndexStore(settings.data_dir).write(upload_id, vectors)
    return EmbeddingResponse(upload_id=upload_id, vectors_indexed=len(chunks))

@app.post("/api/uploads/{upload_id}/similarity-search", response_model=SimilarityResponse)
def raw_similarity_search(upload_id: str, request: SimilarityRequest, store: UploadStore = Depends(get_store), client: EmbeddingClient = Depends(get_embedding_client)) -> SimilarityResponse:
    chunks = store.list_chunks(upload_id)
    if not chunks: raise HTTPException(409, "Create chunks before searching.")
    try: matches = FaissIndexStore(store.data_dir).search(upload_id, client.encode_query(request.query), request.limit)
    except RuntimeError as error: raise HTTPException(409, "Create embeddings before searching.") from error
    return SimilarityResponse(upload_id=upload_id, results=[SimilarityResult(path=chunks[index][0], start_line=chunks[index][1], end_line=chunks[index][2], content=chunks[index][3], score=score) for index, score in matches])

@app.post("/api/uploads/{upload_id}/hybrid-search", response_model=HybridSearchResponse)
def hybrid_search(upload_id: str, request: HybridSearchRequest, store: UploadStore = Depends(get_store), client: EmbeddingClient = Depends(get_embedding_client)) -> HybridSearchResponse:
    """Combine FAISS vector search and BM25 keyword search via Reciprocal Rank Fusion."""
    chunks = store.list_chunks(upload_id)
    if not chunks: raise HTTPException(409, "Create chunks before searching.")
    # BM25 keyword search (in-memory, no content execution)
    bm25_matches = BM25Retriever([chunk[3] for chunk in chunks]).search(request.query, limit=request.limit * 2)
    # Vector search
    try:
        vector_matches = FaissIndexStore(store.data_dir).search(upload_id, client.encode_query(request.query), request.limit * 2)
    except RuntimeError as error:
        raise HTTPException(409, "Create embeddings before searching.") from error
    # Fuse with RRF
    fused = reciprocal_rank_fusion(vector_matches, bm25_matches, limit=request.limit)
    return HybridSearchResponse(
        upload_id=upload_id,
        results=[
            HybridSearchResult(
                path=chunks[index][0],
                start_line=chunks[index][1],
                end_line=chunks[index][2],
                content=chunks[index][3],
                symbol_name=chunks[index][4],
                rrf_score=rrf_score,
            )
            for index, rrf_score in fused
        ],
    )

@app.post("/api/uploads/{upload_id}/fetch", response_model=GitFetchResponse)
def fetch_github_upload(upload_id: str, store: UploadStore = Depends(get_store)) -> GitFetchResponse:
    upload = store.get_upload(upload_id)
    if upload is None: raise HTTPException(404, "Upload not found.")
    source_type, location = upload
    if source_type != "git_url": raise HTTPException(409, "This repository is already an archive.")
    try: content = download_archive(location, settings.max_upload_bytes)
    except GitFetchError as error: raise HTTPException(400, str(error)) from error
    store.replace_with_archive(upload_id, content)
    return GitFetchResponse(upload_id=upload_id, source_type="zip")

@app.post("/api/uploads/{upload_id}/answer", response_model=AnswerResponse)
def answer_repository(upload_id: str, request: AnswerRequest, store: UploadStore = Depends(get_store), embeddings: EmbeddingClient = Depends(get_embedding_client), client: AnswerClient = Depends(get_answer_client)) -> AnswerResponse:
    chunks = store.list_chunks(upload_id)
    if not chunks: raise HTTPException(409, "Create chunks before answering.")
    # Hybrid retrieval: vector + BM25 fused with RRF
    try:
        vector_matches = FaissIndexStore(store.data_dir).search(upload_id, embeddings.encode_query(request.question), min(request.limit * 2, settings.answer_context_limit * 2))
    except RuntimeError as error:
        raise HTTPException(409, "Create embeddings before answering.") from error
    bm25_matches = BM25Retriever([chunk[3] for chunk in chunks]).search(request.question, limit=min(request.limit * 2, settings.answer_context_limit * 2))
    fused = reciprocal_rank_fusion(vector_matches, bm25_matches, limit=min(request.limit, settings.answer_context_limit))
    contexts = [{"id": position + 1, "path": chunks[index][0], "start_line": chunks[index][1], "end_line": chunks[index][2], "content": chunks[index][3]} for position, (index, _) in enumerate(fused)]
    if not contexts: raise HTTPException(404, "No relevant source chunks were found.")
    try: answer, citation_ids = client.answer(request.question, contexts)
    except AnswerError as error: raise HTTPException(503, str(error)) from error
    by_id = {context["id"]: context for context in contexts}
    return AnswerResponse(upload_id=upload_id, answer=answer, citations=[Citation(path=by_id[item]["path"], start_line=by_id[item]["start_line"], end_line=by_id[item]["end_line"]) for item in citation_ids])


@app.post("/api/uploads/{upload_id}/evaluate", response_model=EvalReportResponse)
def evaluate_upload(
    upload_id: str,
    request: EvalRequest = EvalRequest(),
    store: UploadStore = Depends(get_store),
    client: EmbeddingClient = Depends(get_embedding_client),
) -> EvalReportResponse:
    """Run retrieval evaluation harness against this repository."""
    queries = request.queries if request.queries else load_default_queries()
    if not queries:
        raise HTTPException(400, "No evaluation queries provided or found in default queries.json.")
    return run_internal_evaluation(upload_id, queries, request.top_k, store, client)


@app.post("/api/uploads/{upload_id}/call-graph", response_model=CallGraphBuildResponse)
def build_upload_call_graph(upload_id: str, store: UploadStore = Depends(get_store)) -> CallGraphBuildResponse:
    """Extract and build repository call graph using Tree-sitter static analysis."""
    if store.get_upload(upload_id) is None:
        raise HTTPException(404, "Upload not found.")
    files = store.list_file_metadata(upload_id)
    symbols_raw = store.list_symbols(upload_id)
    symbols_by_path: dict[str, list[tuple[str, str, int, int]]] = {}
    for path, kind, name, start, end in symbols_raw:
        symbols_by_path.setdefault(path, []).append((kind, name, start, end))
    edges = build_call_graph(files, symbols_by_path)
    store.replace_call_graph(upload_id, edges)
    return CallGraphBuildResponse(upload_id=upload_id, edges_indexed=len(edges))


@app.get("/api/uploads/{upload_id}/call-graph", response_model=CallGraphResponse)
def get_upload_call_graph(
    upload_id: str,
    function_name: str | None = None,
    path: str | None = None,
    store: UploadStore = Depends(get_store),
) -> CallGraphResponse:
    """Query callers and callees from the repository call graph."""
    if store.get_upload(upload_id) is None:
        raise HTTPException(404, "Upload not found.")
    rows = store.query_call_graph(upload_id, function_name=function_name, path=path)
    edges = [
        CallGraphEdge(
            caller_path=r[0],
            caller_name=r[1],
            caller_line=r[2],
            callee_path=r[3],
            callee_name=r[4],
            call_line=r[5],
        )
        for r in rows
    ]
    return CallGraphResponse(upload_id=upload_id, edges=edges, total_edges=len(edges))


@app.post("/api/uploads/{upload_id}/dependency-graph", response_model=DependencyGraphBuildResponse)
def build_upload_dependency_graph(upload_id: str, store: UploadStore = Depends(get_store)) -> DependencyGraphBuildResponse:
    """Extract and build repository module dependency graph."""
    if store.get_upload(upload_id) is None:
        raise HTTPException(404, "Upload not found.")
    files = store.list_file_metadata(upload_id)
    edges = build_dependency_graph(files)
    store.replace_dependency_graph(upload_id, edges)
    return DependencyGraphBuildResponse(upload_id=upload_id, edges_indexed=len(edges))


@app.get("/api/uploads/{upload_id}/dependency-graph", response_model=DependencyGraphResponse)
def get_upload_dependency_graph(
    upload_id: str,
    path: str | None = None,
    store: UploadStore = Depends(get_store),
) -> DependencyGraphResponse:
    """Query module dependencies and dependents."""
    if store.get_upload(upload_id) is None:
        raise HTTPException(404, "Upload not found.")
    rows = store.query_dependency_graph(upload_id, path=path)
    edges = [
        DependencyEdge(
            source_path=r[0],
            target_path=r[1],
            import_specifier=r[2],
            is_external=bool(r[3]),
            line_number=r[4],
        )
        for r in rows
    ]
    return DependencyGraphResponse(upload_id=upload_id, edges=edges, total_edges=len(edges))






