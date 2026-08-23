"""BM25 keyword retriever over persisted chunks. Never executes chunk content."""
import re
from rank_bm25 import BM25Okapi


def _tokenize(text: str) -> list[str]:
    """Lowercase and split on non-alphanumeric characters (underscores kept as separators too)."""
    return [token for token in re.split(r"[^a-zA-Z0-9]+", text.lower()) if token]


class BM25Retriever:
    """In-memory BM25 index built from a list of chunk texts.

    Chunks are treated as untrusted data — only their token frequencies are
    used; no content is evaluated or executed.
    """

    def __init__(self, texts: list[str]) -> None:
        tokenized = [_tokenize(t) for t in texts]
        self._index = BM25Okapi(tokenized)

    def search(self, query: str, limit: int) -> list[tuple[int, float]]:
        """Return up to *limit* (index, score) pairs, best first.

        Chunks with a score of 0.0 are excluded — they have no keyword overlap
        with the query at all.
        """
        scores = self._index.get_scores(_tokenize(query))
        ranked = sorted(enumerate(scores), key=lambda pair: pair[1], reverse=True)
        return [(index, float(score)) for index, score in ranked[:limit] if score > 0.0]


def reciprocal_rank_fusion(
    *ranked_lists: list[tuple[int, float]],
    k: int = 60,
    limit: int = 10,
) -> list[tuple[int, float]]:
    """Merge ranked result lists using Reciprocal Rank Fusion.

    RRF score for a chunk = Σ  1 / (k + rank)  over all lists that contain it.
    A higher k (default 60, standard in literature) dampens the influence of
    top-ranked results and prevents one list from dominating the fusion.

    Args:
        *ranked_lists: Each list is [(chunk_index, score), ...] sorted best-first.
        k: RRF constant (default 60).
        limit: Maximum number of results to return.

    Returns:
        Merged [(chunk_index, rrf_score), ...] sorted best-first, capped at *limit*.
    """
    rrf_scores: dict[int, float] = {}
    for ranked in ranked_lists:
        for rank, (chunk_index, _) in enumerate(ranked):
            rrf_scores[chunk_index] = rrf_scores.get(chunk_index, 0.0) + 1.0 / (k + rank + 1)
    merged = sorted(rrf_scores.items(), key=lambda pair: pair[1], reverse=True)
    return merged[:limit]
