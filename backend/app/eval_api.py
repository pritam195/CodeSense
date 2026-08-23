"""Evaluation API router and evaluation runner."""
import json
import time
from pathlib import Path
from fastapi import APIRouter, Depends, HTTPException

from .bm25 import BM25Retriever, reciprocal_rank_fusion
from .config import Settings
from .embed import EmbeddingClient, FaissIndexStore
from .models import (
    EvalExpectedItem,
    EvalMetrics,
    EvalQuery,
    EvalQueryDetail,
    EvalReportResponse,
    EvalRequest,
    HybridSearchResult,
)
from .storage import UploadStore
from eval.harness import compute_metrics, evaluate_query

router = APIRouter(prefix="/api/uploads", tags=["evaluation"])
DEFAULT_QUERIES_PATH = Path(__file__).resolve().parent.parent / "eval" / "queries.json"


def load_default_queries() -> list[EvalQuery]:
    if not DEFAULT_QUERIES_PATH.is_file():
        return []
    with open(DEFAULT_QUERIES_PATH, "r", encoding="utf-8") as f:
        data = json.load(f)
    return [
        EvalQuery(
            id=item.get("id", ""),
            question=item["question"],
            expected=[
                EvalExpectedItem(path=e["path"], start_line=e["start_line"], end_line=e["end_line"])
                for e in item.get("expected", item.get("expected_paths", []))
            ],
        )
        for item in data
    ]


def run_internal_evaluation(
    upload_id: str,
    queries: list[EvalQuery],
    top_k: int,
    store: UploadStore,
    client: EmbeddingClient,
) -> EvalReportResponse:
    chunks = store.list_chunks(upload_id)
    if not chunks:
        raise HTTPException(409, "Create chunks before evaluating.")

    bm25 = BM25Retriever([chunk[3] for chunk in chunks])
    faiss_store = FaissIndexStore(store.data_dir)

    query_evals = []
    latencies_ms = []
    query_details = []

    for q in queries:
        t0 = time.perf_counter()
        # BM25 keyword search
        bm25_matches = bm25.search(q.question, limit=top_k * 2)
        # Vector search
        try:
            vector_matches = faiss_store.search(upload_id, client.encode_query(q.question), top_k * 2)
        except RuntimeError as error:
            raise HTTPException(409, "Create embeddings before evaluating.") from error

        fused = reciprocal_rank_fusion(vector_matches, bm25_matches, limit=top_k)
        latency = (time.perf_counter() - t0) * 1000.0
        latencies_ms.append(latency)

        retrieved = [
            {
                "path": chunks[index][0],
                "start_line": chunks[index][1],
                "end_line": chunks[index][2],
                "content": chunks[index][3],
                "symbol_name": chunks[index][4],
                "rrf_score": rrf_score,
            }
            for index, rrf_score in fused
        ]

        expected_dicts = [{"path": e.path, "start_line": e.start_line, "end_line": e.end_line} for e in q.expected]
        eval_res = evaluate_query(retrieved, expected_dicts, top_k)
        query_evals.append(eval_res)

        top_k_results = [
            HybridSearchResult(
                path=r["path"],
                start_line=r["start_line"],
                end_line=r["end_line"],
                content=r["content"],
                symbol_name=r["symbol_name"],
                rrf_score=r["rrf_score"],
            )
            for r in retrieved
        ]

        query_details.append(
            EvalQueryDetail(
                id=q.id,
                question=q.question,
                expected=q.expected,
                hit=eval_res["hit"],
                first_hit_rank=eval_res["first_hit_rank"],
                reciprocal_rank=eval_res["reciprocal_rank"],
                precision_at_k=eval_res["precision_at_k"],
                recall_at_k=eval_res["recall_at_k"],
                relevant_retrieved_count=eval_res["relevant_retrieved_count"],
                expected_count=eval_res["expected_count"],
                matched_expected_count=eval_res["matched_expected_count"],
                latency_ms=round(latency, 2),
                top_k=top_k_results,
            )
        )

    metrics_dict = compute_metrics(query_evals, latencies_ms, top_k)
    metrics = EvalMetrics(**metrics_dict)
    failures = [qd for qd in query_details if not qd.hit]

    return EvalReportResponse(
        upload_id=upload_id,
        metrics=metrics,
        queries=query_details,
        failures=failures,
    )
