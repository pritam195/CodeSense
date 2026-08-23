"""Static call graph extractor and resolver using Tree-sitter concrete syntax trees.
Never executes or evaluates source code.
"""
from tree_sitter import Language, Node, Parser
import tree_sitter_python as tspython
import tree_sitter_typescript as tstypescript

LANGUAGES = {
    "Python": Language(tspython.language()),
    "TypeScript": Language(tstypescript.language_typescript()),
    "JavaScript": Language(tstypescript.language_typescript()),
}

CALL_NODE_TYPES = {
    "Python": {"call"},
    "TypeScript": {"call_expression"},
    "JavaScript": {"call_expression"},
}


def _extract_callee_name(node: Node, content: str) -> str:
    """Extract identifier or method name from a call AST node."""
    func_node = node.child_by_field_name("function")
    if func_node is None and node.named_children:
        func_node = node.named_children[0]
    if func_node is None:
        return "<unknown>"
    
    # In attribute access (e.g. self.get_user or db.query), extract the rightmost attribute name
    if func_node.type in {"attribute", "member_expression"}:
        prop_node = func_node.child_by_field_name("attribute") or func_node.child_by_field_name("property")
        if prop_node is not None:
            return content[prop_node.start_byte:prop_node.end_byte]
    
    text = content[func_node.start_byte:func_node.end_byte]
    # In case of multiline or long expressions, keep clean name
    return text.splitlines()[0].strip()[:100]


def extract_calls_from_file(
    language_name: str,
    path: str,
    content: str,
    symbols: list[tuple[str, str, int, int]],  # (kind, name, start_line, end_line)
) -> list[tuple[str, str, int, str, int]]:
    """Extract all (caller_path, caller_name, caller_line, callee_name, call_line) from a single source file."""
    language = LANGUAGES.get(language_name)
    if language is None:
        return []

    # Filter for functions/methods
    function_scopes = [
        (s[1], s[2], s[3])
        for s in symbols
        if s[0] == "function"
    ]
    if not function_scopes:
        return []

    tree = Parser(language).parse(content.encode("utf-8"))
    call_types = CALL_NODE_TYPES.get(language_name, set())

    raw_calls = []
    stack = [tree.root_node]
    while stack:
        node = stack.pop()
        if node.type in call_types:
            call_line = node.start_point.row + 1
            # Find the most immediate enclosing function scope
            enclosing = None
            for fn_name, fn_start, fn_end in function_scopes:
                if fn_start <= call_line <= fn_end:
                    if enclosing is None or (fn_end - fn_start) < (enclosing[2] - enclosing[1]):
                        enclosing = (fn_name, fn_start, fn_end)
            if enclosing:
                callee_name = _extract_callee_name(node, content)
                if callee_name and callee_name != "<unknown>":
                    raw_calls.append((path, enclosing[0], enclosing[1], callee_name, call_line))
        stack.extend(reversed(node.named_children))

    return raw_calls


def build_call_graph(
    files: list[tuple[str, str, int, str]],  # (path, language, size, content)
    symbols_by_path: dict[str, list[tuple[str, str, int, int]]],  # path -> [(kind, name, start, end)]
) -> list[tuple[str, str, int, str | None, str, int]]:
    """Build and resolve repository-wide call graph edges:
    (caller_path, caller_name, caller_line, callee_path, callee_name, call_line)
    """
    # Index all known defined functions in the repo: function_name -> list of paths where defined
    known_functions: dict[str, list[str]] = {}
    for path, syms in symbols_by_path.items():
        for kind, name, _, _ in syms:
            if kind == "function":
                known_functions.setdefault(name, []).append(path)

    all_raw_calls = []
    for path, language, _, content in files:
        file_syms = symbols_by_path.get(path, [])
        calls = extract_calls_from_file(language, path, content, file_syms)
        all_raw_calls.extend(calls)

    edges = []
    for caller_path, caller_name, caller_line, callee_name, call_line in all_raw_calls:
        # Resolve callee_path:
        # 1. Prefer definition in same file
        # 2. Else if defined uniquely in another file, link to it
        # 3. Else if defined in multiple files, pick the first matching file
        # 4. Otherwise None (external or unresolved)
        target_paths = known_functions.get(callee_name, [])
        if caller_path in target_paths:
            callee_path = caller_path
        elif target_paths:
            callee_path = target_paths[0]
        else:
            callee_path = None

        edges.append((caller_path, caller_name, caller_line, callee_path, callee_name, call_line))

    # Deduplicate edges
    unique_edges = list({(e[0], e[1], e[2], e[3], e[4], e[5]): e for e in edges}.values())
    return unique_edges
