"""Execution Flow Synthesizer — Phase 13.

Combines hybrid retrieval, call-graph BFS, and topological ordering to
produce a structured execution flow for broad natural-language questions.
Never executes uploaded code; all analysis is static graph traversal.
"""
from __future__ import annotations

from collections import defaultdict, deque
from dataclasses import dataclass, field
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from .answer import AnswerClient
    from .embed import EmbeddingClient
    from .models import FlowSynthesisResponse
    from .storage import UploadStore


# ---------------------------------------------------------------------------
# Data structures
# ---------------------------------------------------------------------------

@dataclass
class FlowNode:
    function_name: str
    path: str
    start_line: int
    end_line: int
    depth: int
    content_snippet: str = ""


# ---------------------------------------------------------------------------
# BFS over SQLite call-graph edges
# ---------------------------------------------------------------------------

def _bfs_call_graph(
    edges: list[tuple],           # (caller_path, caller_name, caller_line, callee_path, callee_name, call_line)
    seed_names: set[str],
    max_depth: int,
) -> tuple[list[FlowNode], list[tuple[str, str]]]:
    """Walk call edges breadth-first from seed function names.

    Returns (nodes_in_discovery_order, directed_edges_as_name_pairs).
    Edges are stored in SQLite without full resolution in all cases, so we
    match by *callee_name* rather than requiring a known path.
    """
    # Build adjacency: caller_name -> list[(callee_name, callee_path)]
    adjacency: dict[str, list[tuple[str, str | None]]] = defaultdict(list)
    for row in edges:
        caller_name = row[1]
        callee_name = row[4]
        callee_path = row[3]
        adjacency[caller_name].append((callee_name, callee_path))

    # name -> (path, start_line, end_line) from caller side
    name_to_location: dict[str, tuple[str, int, int]] = {}
    for row in edges:
        name_to_location.setdefault(row[1], (row[0], row[2], row[2]))  # caller
        if row[3]:
            name_to_location.setdefault(row[4], (row[3], row[5], row[5]))  # callee

    visited: dict[str, int] = {}   # name -> depth first seen
    queue: deque[tuple[str, int]] = deque()
    discovered_nodes: list[FlowNode] = []
    result_edges: list[tuple[str, str]] = []

    for name in seed_names:
        if name not in visited:
            visited[name] = 0
            queue.append((name, 0))

    while queue:
        current_name, depth = queue.popleft()
        loc = name_to_location.get(current_name, ("unknown", 0, 0))
        discovered_nodes.append(FlowNode(
            function_name=current_name,
            path=loc[0],
            start_line=loc[1],
            end_line=loc[2],
            depth=depth,
        ))

        if depth >= max_depth:
            continue

        for callee_name, callee_path in adjacency.get(current_name, []):
            result_edges.append((current_name, callee_name))
            if callee_name not in visited:
                visited[callee_name] = depth + 1
                queue.append((callee_name, depth + 1))
                if callee_path:
                    name_to_location.setdefault(callee_name, (callee_path, 0, 0))

    return discovered_nodes, result_edges


# ---------------------------------------------------------------------------
# Topological sort (Kahn's algorithm) — gives execution order
# ---------------------------------------------------------------------------

def _topo_sort(node_names: list[str], edges: list[tuple[str, str]]) -> list[str]:
    """Return nodes in topological order (callers before callees).

    Falls back to discovery order if a cycle is detected.
    """
    name_set = set(node_names)
    in_degree: dict[str, int] = {n: 0 for n in name_set}
    adj: dict[str, list[str]] = defaultdict(list)

    for src, dst in edges:
        if src in name_set and dst in name_set:
            adj[src].append(dst)
            in_degree[dst] = in_degree.get(dst, 0) + 1

    queue: deque[str] = deque(n for n in name_set if in_degree[n] == 0)
    order: list[str] = []
    while queue:
        node = queue.popleft()
        order.append(node)
        for neighbour in adj[node]:
            in_degree[neighbour] -= 1
            if in_degree[neighbour] == 0:
                queue.append(neighbour)

    # If cycle detected, return original order
    if len(order) < len(name_set):
        return node_names
    return order


# ---------------------------------------------------------------------------
# Mermaid diagram builder — no LLM needed, pure graph structure
# ---------------------------------------------------------------------------

def _build_mermaid(ordered_steps: list[FlowNode], edges: list[tuple[str, str]]) -> str:
    """Produce a Mermaid flowchart from the ordered execution steps."""
    edge_set = {(s, d) for s, d in edges}
    lines = ["flowchart TD"]

    # Node definitions
    seen_ids: dict[str, str] = {}
    for step in ordered_steps:
        safe_id = "".join(c if c.isalnum() else "_" for c in step.function_name)
        if safe_id in seen_ids.values():
            safe_id = safe_id + str(step.depth)
        seen_ids[step.function_name] = safe_id
        short_path = step.path.split("/")[-1] if step.path != "unknown" else "?"
        lines.append(f'    {safe_id}["{step.function_name}\\n{short_path}:{step.start_line}"]')

    # Edges
    for src, dst in edge_set:
        src_id = seen_ids.get(src)
        dst_id = seen_ids.get(dst)
        if src_id and dst_id:
            lines.append(f"    {src_id} --> {dst_id}")

    return "\n".join(lines)


# ---------------------------------------------------------------------------
# Content enrichment — attach code snippets to each node
# ---------------------------------------------------------------------------

def _enrich_with_chunks(
    nodes: list[FlowNode],
    chunks: list[tuple],   # (path, start_line, end_line, content, symbol_name)
) -> None:
    """Populate content_snippet on each FlowNode from the chunk table."""
    # Build lookup: (path, symbol_name) -> content
    by_symbol: dict[tuple[str, str], str] = {}
    for path, start, end, content, symbol_name in chunks:
        if symbol_name:
            by_symbol[(path, symbol_name)] = content[:400]

    for node in nodes:
        snippet = by_symbol.get((node.path, node.function_name), "")
        if not snippet:
            # Try path-only match for the closest line range
            for path, start, end, content, _ in chunks:
                if path == node.path and start <= node.start_line <= end:
                    snippet = content[:400]
                    break
        node.content_snippet = snippet


# ---------------------------------------------------------------------------
# LLM prose synthesis
# ---------------------------------------------------------------------------

def _synthesize_prose(
    question: str,
    ordered_steps: list[FlowNode],
    answer_client: "AnswerClient",
) -> tuple[str, list[int]]:
    """Ask the LLM to produce a numbered prose explanation of the flow."""
    import json

    contexts = [
        {
            "id": i + 1,
            "path": step.path,
            "start_line": step.start_line,
            "end_line": step.end_line,
            "content": step.content_snippet or f"Function: {step.function_name}",
        }
        for i, step in enumerate(ordered_steps)
    ]

    # Inject flow-specific instruction via the question wrapper
    flow_question = (
        f"{question}\n\n"
        "Explain this as a numbered execution flow, one sentence per step. "
        "Follow the order of the excerpts — they are already sorted by execution order."
    )

    return answer_client.answer(flow_question, contexts)


# ---------------------------------------------------------------------------
# Public entry point
# ---------------------------------------------------------------------------

def synthesize_flow(
    upload_id: str,
    question: str,
    depth: int,
    limit: int,
    data_dir,
    store: "UploadStore",
    embed_client: "EmbeddingClient",
    answer_client: "AnswerClient",
    settings,
) -> "FlowSynthesisResponse":
    """Synthesize an execution flow for the given question.

    Steps:
      1. Hybrid retrieval → seed functions (chunks whose symbol_name is set)
      2. BFS over SQLite call-graph edges from those seeds
      3. Topological sort → execution order
      4. Enrich nodes with code snippets from chunk table
      5. Build Mermaid diagram (pure graph, no LLM)
      6. LLM annotates with prose if api_key is configured
    """
    from .bm25 import BM25Retriever, reciprocal_rank_fusion
    from .embed import FaissIndexStore
    from .models import Citation, FlowStep, FlowSynthesisResponse

    # --- Step 1: hybrid retrieval to find seed chunks ---
    chunks = store.list_chunks(upload_id)
    if not chunks:
        raise ValueError("chunk")

    try:
        vector_matches = FaissIndexStore(data_dir).search(
            upload_id, embed_client.encode_query(question), limit * 2
        )
    except RuntimeError:
        raise ValueError("embed")

    bm25_matches = BM25Retriever([c[3] for c in chunks]).search(question, limit=limit * 2)
    fused = reciprocal_rank_fusion(vector_matches, bm25_matches, limit=limit)

    # Collect seed function names from matched chunks that have a symbol_name
    seed_names: set[str] = set()
    for index, _ in fused:
        symbol_name = chunks[index][4]
        if symbol_name:
            seed_names.add(symbol_name)

    # --- Step 2: BFS over call graph ---
    call_edges = store.query_call_graph(upload_id)
    if not call_edges:
        # No call graph built — degrade gracefully: just return retrieval chunks as steps
        steps = []
        for i, (index, _) in enumerate(fused):
            path, start, end, content, symbol_name = chunks[index]
            steps.append(FlowStep(
                function_name=symbol_name or "unknown",
                path=path,
                start_line=start,
                end_line=end,
                depth=i,
                content_snippet=content[:400],
            ))
        mermaid = _build_mermaid(
            [FlowNode(s.function_name, s.path, s.start_line, s.end_line, s.depth) for s in steps],
            [],
        )
        return FlowSynthesisResponse(
            upload_id=upload_id,
            question=question,
            steps=steps,
            mermaid_diagram=mermaid,
            prose_summary="(Graph not built — showing retrieval order only.)",
            citations=[Citation(path=s.path, start_line=s.start_line, end_line=s.end_line) for s in steps],
        )

    bfs_nodes, bfs_edges = _bfs_call_graph(call_edges, seed_names, max_depth=depth)

    # Deduplicate nodes (BFS may rediscover same name from different seeds)
    seen: set[str] = set()
    unique_nodes: list[FlowNode] = []
    for node in bfs_nodes:
        if node.function_name not in seen:
            seen.add(node.function_name)
            unique_nodes.append(node)

    # Limit to `limit` nodes to keep LLM context manageable
    unique_nodes = unique_nodes[:limit]

    # --- Step 3: Topological sort ---
    topo_order = _topo_sort([n.function_name for n in unique_nodes], bfs_edges)
    name_to_node = {n.function_name: n for n in unique_nodes}
    ordered_nodes = [name_to_node[name] for name in topo_order if name in name_to_node]

    # Re-assign depth based on topo position for clean display
    for i, node in enumerate(ordered_nodes):
        node.depth = i

    # --- Step 4: Enrich with code snippets ---
    _enrich_with_chunks(ordered_nodes, chunks)

    # --- Step 5: Build Mermaid diagram ---
    mermaid = _build_mermaid(ordered_nodes, bfs_edges)

    # --- Step 6: LLM prose annotation ---
    prose = ""
    citation_ids: list[int] = []
    try:
        prose, citation_ids = _synthesize_prose(question, ordered_nodes, answer_client)
    except Exception as exc:
        prose = f"(LLM unavailable — {exc})"

    steps = [
        FlowStep(
            function_name=node.function_name,
            path=node.path,
            start_line=node.start_line,
            end_line=node.end_line,
            depth=node.depth,
            content_snippet=node.content_snippet,
        )
        for node in ordered_nodes
    ]

    # Map citation_ids (1-based positions in ordered_nodes) back to steps
    by_id = {i + 1: ordered_nodes[i] for i in range(len(ordered_nodes))}
    citations = [
        Citation(path=by_id[cid].path, start_line=by_id[cid].start_line, end_line=by_id[cid].end_line)
        for cid in citation_ids if cid in by_id
    ]
    if not citations:
        citations = [Citation(path=s.path, start_line=s.start_line, end_line=s.end_line) for s in steps[:3]]

    return FlowSynthesisResponse(
        upload_id=upload_id,
        question=question,
        steps=steps,
        mermaid_diagram=mermaid,
        prose_summary=prose,
        citations=citations,
    )
