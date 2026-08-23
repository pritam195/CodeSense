"""Evaluation harness measuring precision, recall, MRR, and latency against labeled queries."""
import argparse
import json
import os
import sys
import time
from pathlib import Path
import httpx
import numpy as np


def is_overlap(chunk_path: str, chunk_start: int, chunk_end: int,
               exp_path: str, exp_start: int, exp_end: int) -> bool:
    """Check if a retrieved chunk matches the expected file path and overlaps line ranges."""
    c_norm = chunk_path.lstrip("/").replace("\\", "/")
    e_norm = exp_path.lstrip("/").replace("\\", "/")
    if c_norm != e_norm and not c_norm.endswith(e_norm) and not e_norm.endswith(c_norm):
        return False
    return max(chunk_start, exp_start) <= min(chunk_end, exp_end)


def evaluate_query(retrieved_chunks: list[dict], expected_items: list[dict], k: int) -> dict:
    """Evaluate retrieval results for a single query."""
    top_k = retrieved_chunks[:k]
    
    # Identify which retrieved chunks are relevant
    relevant_retrieved_indices = []
    matched_expected_indices = set()
    first_hit_rank = None

    for rank, chunk in enumerate(top_k):
        c_path = chunk.get("path", "")
        c_start = chunk.get("start_line", 0)
        c_end = chunk.get("end_line", 0)
        
        chunk_is_relevant = False
        for exp_idx, exp in enumerate(expected_items):
            if is_overlap(c_path, c_start, c_end, exp["path"], exp["start_line"], exp["end_line"]):
                chunk_is_relevant = True
                matched_expected_indices.add(exp_idx)
                if first_hit_rank is None:
                    first_hit_rank = rank
        
        if chunk_is_relevant:
            relevant_retrieved_indices.append(rank)

    hit = len(matched_expected_indices) > 0
    reciprocal_rank = 1.0 / (first_hit_rank + 1) if first_hit_rank is not None else 0.0
    precision = len(relevant_retrieved_indices) / k if k > 0 else 0.0
    recall = len(matched_expected_indices) / len(expected_items) if expected_items else 0.0

    return {
        "hit": hit,
        "first_hit_rank": first_hit_rank + 1 if first_hit_rank is not None else None,
        "reciprocal_rank": reciprocal_rank,
        "precision_at_k": precision,
        "recall_at_k": recall,
        "relevant_retrieved_count": len(relevant_retrieved_indices),
        "expected_count": len(expected_items),
        "matched_expected_count": len(matched_expected_indices),
        "top_k": top_k,
    }


def compute_metrics(query_evals: list[dict], latencies_ms: list[float], k: int) -> dict:
    """Aggregate individual query evaluations into a comprehensive evaluation report."""
    n = len(query_evals)
    if n == 0:
        return {
            "total_queries": 0,
            "passed_queries": 0,
            "failed_queries": 0,
            "mrr": 0.0,
            "mean_precision_at_k": 0.0,
            "mean_recall_at_k": 0.0,
            "latency_p50_ms": 0.0,
            "latency_p95_ms": 0.0,
            "mean_latency_ms": 0.0,
            "k": k,
        }

    mrr = float(np.mean([q["reciprocal_rank"] for q in query_evals]))
    mean_p = float(np.mean([q["precision_at_k"] for q in query_evals]))
    mean_r = float(np.mean([q["recall_at_k"] for q in query_evals]))
    passed = sum(1 for q in query_evals if q["hit"])
    failed = n - passed

    p50_lat = float(np.percentile(latencies_ms, 50)) if latencies_ms else 0.0
    p95_lat = float(np.percentile(latencies_ms, 95)) if latencies_ms else 0.0
    mean_lat = float(np.mean(latencies_ms)) if latencies_ms else 0.0

    return {
        "total_queries": n,
        "passed_queries": passed,
        "failed_queries": failed,
        "mrr": round(mrr, 4),
        "mean_precision_at_k": round(mean_p, 4),
        "mean_recall_at_k": round(mean_r, 4),
        "latency_p50_ms": round(p50_lat, 2),
        "latency_p95_ms": round(p95_lat, 2),
        "mean_latency_ms": round(mean_lat, 2),
        "k": k,
    }


def run_evaluation(base_url: str, upload_id: str, queries: list[dict], k: int = 5) -> dict:
    """Run evaluation by querying the hybrid-search endpoint for all labeled queries."""
    client = httpx.Client(base_url=base_url.rstrip("/"), timeout=30.0)
    query_evals = []
    latencies_ms = []
    details = []

    for item in queries:
        qid = item.get("id", "")
        question = item["question"]
        expected = item.get("expected", item.get("expected_paths", []))

        t0 = time.perf_counter()
        resp = client.post(f"/api/uploads/{upload_id}/hybrid-search", json={"query": question, "limit": k})
        latency = (time.perf_counter() - t0) * 1000.0
        latencies_ms.append(latency)

        if resp.status_code != 200:
            eval_res = {
                "hit": False,
                "first_hit_rank": None,
                "reciprocal_rank": 0.0,
                "precision_at_k": 0.0,
                "recall_at_k": 0.0,
                "relevant_retrieved_count": 0,
                "expected_count": len(expected),
                "matched_expected_count": 0,
                "top_k": [],
                "error": resp.text,
            }
        else:
            data = resp.json()
            retrieved = data.get("results", [])
            eval_res = evaluate_query(retrieved, expected, k)

        query_evals.append(eval_res)
        details.append({
            "id": qid,
            "question": question,
            "expected": expected,
            "latency_ms": round(latency, 2),
            **eval_res,
        })

    metrics = compute_metrics(query_evals, latencies_ms, k)
    failures = [d for d in details if not d["hit"]]

    return {
        "upload_id": upload_id,
        "metrics": metrics,
        "queries": details,
        "failures": failures,
    }


def main():
    parser = argparse.ArgumentParser(description="CodeSense Retrieval Evaluation Harness")
    parser.add_argument("upload_id", help="Upload ID of the prepared repository to evaluate")
    parser.add_argument("--base-url", default="http://localhost:8000", help="CodeSense API base URL")
    parser.add_argument("--queries-file", default=str(Path(__file__).parent / "queries.json"), help="Path to queries JSON file")
    parser.add_argument("--top-k", type=int, default=5, help="Top-K results to evaluate")
    parser.add_argument("--output", default="eval/report.json", help="Path to write output report JSON")

    args = parser.parse_args()

    queries_path = Path(args.queries_file)
    if not queries_path.is_file():
        print(f"Error: queries file not found at {queries_path}", file=sys.stderr)
        sys.exit(1)

    with open(queries_path, "r", encoding="utf-8") as f:
        queries = json.load(f)

    print(f"Running evaluation against upload '{args.upload_id}' with {len(queries)} queries (top-k={args.top_k})...")
    report = run_evaluation(args.base_url, args.upload_id, queries, k=args.top_k)

    m = report["metrics"]
    print("\n--- Evaluation Summary ---")
    print(f"Total Queries:      {m['total_queries']}")
    print(f"Passed (Hit):       {m['passed_queries']} / {m['total_queries']} ({m['passed_queries']/m['total_queries']*100:.1f}%)")
    print(f"MRR:                {m['mrr']}")
    print(f"Mean Precision@{m['k']}: {m['mean_precision_at_k']}")
    print(f"Mean Recall@{m['k']}:    {m['mean_recall_at_k']}")
    print(f"Latency p50:        {m['latency_p50_ms']} ms")
    print(f"Latency p95:        {m['latency_p95_ms']} ms")

    if report["failures"]:
        print(f"\n--- Failures ({len(report['failures'])}) ---")
        for fail in report["failures"]:
            print(f"[{fail['id']}] {fail['question']}")
            print(f"  Expected: {fail['expected']}")
            print(f"  Top-1 returned: {fail['top_k'][0]['path'] if fail['top_k'] else 'None'}")

    out_path = Path(args.output)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(report, f, indent=2)
    print(f"\nReport written to {out_path}")


if __name__ == "__main__":
    main()
