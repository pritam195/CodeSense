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
class CodeChunk(BaseModel):
    path: str; start_line: int; end_line: int; content: str; symbol_name: str | None = None
class ChunkResponse(BaseModel): upload_id: str; chunks_created: int
class ChunkListResponse(BaseModel): upload_id: str; chunks: list[CodeChunk]
class EmbeddingResponse(BaseModel): upload_id: str; vectors_indexed: int
class SimilarityRequest(BaseModel): query: str; limit: int = 5
class SimilarityResult(BaseModel): path: str; start_line: int; end_line: int; content: str; score: float
class SimilarityResponse(BaseModel): upload_id: str; results: list[SimilarityResult]

class GitFetchResponse(BaseModel):
    upload_id: str
    source_type: Literal['zip']


class AnswerRequest(BaseModel): question: str; limit: int = 5
class Citation(BaseModel): path: str; start_line: int; end_line: int
class AnswerResponse(BaseModel): upload_id: str; answer: str; citations: list[Citation]
class HybridSearchRequest(BaseModel): query: str; limit: int = 5; vector_weight: float = 0.5
class HybridSearchResult(BaseModel): path: str; start_line: int; end_line: int; content: str; symbol_name: str | None; rrf_score: float
class HybridSearchResponse(BaseModel): upload_id: str; results: list[HybridSearchResult]

class EvalExpectedItem(BaseModel): path: str; start_line: int; end_line: int
class EvalQuery(BaseModel): id: str = ""; question: str; expected: list[EvalExpectedItem]
class EvalRequest(BaseModel): queries: list[EvalQuery] | None = None; top_k: int = 5
class EvalMetrics(BaseModel):
    total_queries: int
    passed_queries: int
    failed_queries: int
    mrr: float
    mean_precision_at_k: float
    mean_recall_at_k: float
    latency_p50_ms: float
    latency_p95_ms: float
    mean_latency_ms: float
    k: int

class EvalQueryDetail(BaseModel):
    id: str
    question: str
    expected: list[EvalExpectedItem]
    hit: bool
    first_hit_rank: int | None
    reciprocal_rank: float
    precision_at_k: float
    recall_at_k: float
    relevant_retrieved_count: int
    expected_count: int
    matched_expected_count: int
    latency_ms: float
    top_k: list[HybridSearchResult]

class EvalReportResponse(BaseModel):
    upload_id: str
    metrics: EvalMetrics
    queries: list[EvalQueryDetail]
    failures: list[EvalQueryDetail]

