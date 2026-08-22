"""AST-boundary-aware chunking. Structural nodes are never split."""
from dataclasses import dataclass

@dataclass(frozen=True)
class SourceSymbol:
    path: str
    kind: str
    name: str
    start_line: int
    end_line: int


def chunk_file(path: str, content: str, symbols: list[SourceSymbol], max_lines: int = 120) -> list[tuple[str, int, int, str, str | None]]:
    lines = content.splitlines(keepends=True)
    structural = _outermost_structures(symbols)
    chunks = []
    covered = set()
    for symbol in structural:
        start, end = symbol.start_line, min(symbol.end_line, len(lines))
        if start <= end:
            chunks.append((path, start, end, "".join(lines[start - 1:end]), symbol.name))
            covered.update(range(start, end + 1))
    residual = [line for line in range(1, len(lines) + 1) if line not in covered]
    for group in _contiguous_groups(residual):
        for start in range(group[0], group[-1] + 1, max_lines):
            end = min(start + max_lines - 1, group[-1])
            chunks.append((path, start, end, "".join(lines[start - 1:end]), None))
    return sorted((chunk for chunk in chunks if chunk[3].strip()), key=lambda item: item[1])


def _outermost_structures(symbols: list[SourceSymbol]) -> list[SourceSymbol]:
    candidates = sorted((s for s in symbols if s.kind in {"function", "class"}), key=lambda s: (s.start_line, -s.end_line))
    selected = []
    for symbol in candidates:
        if not any(parent.start_line <= symbol.start_line and parent.end_line >= symbol.end_line for parent in selected):
            selected.append(symbol)
    return selected


def _contiguous_groups(lines: list[int]) -> list[list[int]]:
    groups = []
    for line in lines:
        if not groups or line != groups[-1][-1] + 1: groups.append([line])
        else: groups[-1].append(line)
    return groups
