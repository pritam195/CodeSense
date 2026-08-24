"""Static module-level dependency graph extractor and resolver using Tree-sitter AST.
Never executes or imports source code.
"""
from pathlib import PurePosixPath
from tree_sitter import Language, Node, Parser
import tree_sitter_python as tspython
import tree_sitter_typescript as tstypescript

LANGUAGES = {
    "Python": Language(tspython.language()),
    "TypeScript": Language(tstypescript.language_typescript()),
    "JavaScript": Language(tstypescript.language_typescript()),
}


def _extract_py_imports(root: Node, content: str) -> list[tuple[str, int]]:
    """Extract (import_specifier, line_number) from Python AST."""
    imports = []
    stack = [root]
    while stack:
        node = stack.pop()
        if node.type == "import_statement":
            line = node.start_point.row + 1
            for child in node.named_children:
                if child.type in {"dotted_name", "aliased_import"}:
                    name_node = child.child_by_field_name("name") or child
                    mod_name = content[name_node.start_byte:name_node.end_byte].strip()
                    if mod_name:
                        imports.append((mod_name, line))
        elif node.type == "import_from_statement":
            line = node.start_point.row + 1
            mod_node = node.child_by_field_name("module_name")
            # Handle relative imports like from .config import Settings or from ..models import User
            dots = ""
            for child in node.children:
                if child.type == "relative_import":
                    # Count leading dots
                    dots = content[child.start_byte:child.end_byte].strip()
                    break
                elif child.type == "import_prefix":
                    dots = content[child.start_byte:child.end_byte].strip()
                    break
            
            if mod_node is not None:
                mod_name = content[mod_node.start_byte:mod_node.end_byte].strip()
                full_spec = f"{dots}{mod_name}" if dots and not mod_name.startswith(".") else mod_name
                imports.append((full_spec, line))
            elif dots:
                imports.append((dots, line))
        stack.extend(reversed(node.named_children))
    return imports


def _extract_ts_js_imports(root: Node, content: str) -> list[tuple[str, int]]:
    """Extract (import_specifier, line_number) from TypeScript/JavaScript AST."""
    imports = []
    stack = [root]
    while stack:
        node = stack.pop()
        if node.type in {"import_statement", "export_statement"}:
            source_node = node.child_by_field_name("source")
            if source_node is not None:
                line = node.start_point.row + 1
                raw_source = content[source_node.start_byte:source_node.end_byte].strip().strip("'\"`")
                if raw_source:
                    imports.append((raw_source, line))
        stack.extend(reversed(node.named_children))
    return imports


def resolve_js_ts_path(source_path: str, specifier: str, all_files: set[str]) -> str | None:
    """Resolve JavaScript/TypeScript relative import specifier against repository files."""
    if not (specifier.startswith(".") or specifier.startswith("/")):
        return None

    src_dir = PurePosixPath(source_path).parent
    target_base = (src_dir / specifier).as_posix()
    # Normalize path (handling ./ and ../)
    parts = []
    for part in target_base.split("/"):
        if part in {"", "."}:
            continue
        elif part == "..":
            if parts:
                parts.pop()
        else:
            parts.append(part)
    norm_base = "/".join(parts)

    candidates = [
        norm_base,
        f"{norm_base}.ts",
        f"{norm_base}.tsx",
        f"{norm_base}.js",
        f"{norm_base}.jsx",
        f"{norm_base}/index.ts",
        f"{norm_base}/index.tsx",
        f"{norm_base}/index.js",
        f"{norm_base}/index.jsx",
    ]

    for cand in candidates:
        if cand in all_files:
            return cand
    return None


def resolve_py_path(source_path: str, specifier: str, all_files: set[str]) -> str | None:
    """Resolve Python import specifier against repository files."""
    src_dir = PurePosixPath(source_path).parent

    # Relative import (e.g. .config, ..utils)
    if specifier.startswith("."):
        leading_dots = len(specifier) - len(specifier.lstrip("."))
        mod_part = specifier.lstrip(".")
        rel_dir = src_dir
        for _ in range(leading_dots - 1):
            rel_dir = rel_dir.parent

        rel_path = (rel_dir / mod_part.replace(".", "/")).as_posix().rstrip("/")
        # Normalize
        parts = []
        for part in rel_path.split("/"):
            if part in {"", "."}:
                continue
            elif part == "..":
                if parts:
                    parts.pop()
            else:
                parts.append(part)
        norm = "/".join(parts)

        candidates = [
            f"{norm}.py",
            f"{norm}/__init__.py",
            norm,
        ]
        for cand in candidates:
            if cand in all_files:
                return cand
        return None

    # Absolute / package import (e.g. app.models or src.auth)
    as_path = specifier.replace(".", "/")
    candidates = [
        f"{as_path}.py",
        f"{as_path}/__init__.py",
        as_path,
    ]
    # Check exact match from root
    for cand in candidates:
        if cand in all_files:
            return cand

    # Check if suffix matches any file in repo
    for f in all_files:
        for cand in candidates:
            if f.endswith(cand) or f.endswith(f"/{cand}"):
                return f

    return None


def build_dependency_graph(
    files: list[tuple[str, str, int, str]],  # (path, language, size, content)
) -> list[tuple[str, str | None, str, bool, int]]:
    """Build repository module dependency graph:
    (source_path, target_path, import_specifier, is_external, line_number)
    """
    all_files_set = {f[0] for f in files}
    edges = []

    for path, language, _, content in files:
        lang = LANGUAGES.get(language)
        if lang is None:
            continue

        tree = Parser(lang).parse(content.encode("utf-8"))
        if language == "Python":
            raw_imports = _extract_py_imports(tree.root_node, content)
            for spec, line in raw_imports:
                target_path = resolve_py_path(path, spec, all_files_set)
                is_external = target_path is None
                edges.append((path, target_path, spec, is_external, line))
        elif language in {"TypeScript", "JavaScript"}:
            raw_imports = _extract_ts_js_imports(tree.root_node, content)
            for spec, line in raw_imports:
                target_path = resolve_js_ts_path(path, spec, all_files_set)
                is_external = target_path is None
                edges.append((path, target_path, spec, is_external, line))

    # Deduplicate edges
    unique = list({(e[0], e[2], e[4]): e for e in edges}.values())
    return unique
