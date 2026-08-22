"""Tree-sitter extraction for stored, untrusted source text. Never executes source."""
from tree_sitter import Language, Parser
import tree_sitter_python as tspython
import tree_sitter_typescript as tstypescript

LANGUAGES = {"Python": Language(tspython.language()), "TypeScript": Language(tstypescript.language_typescript()), "JavaScript": Language(tstypescript.language_typescript())}
NODE_KINDS = {"Python": {"function_definition": "function", "class_definition": "class", "import_statement": "import", "import_from_statement": "import"}, "TypeScript": {"function_declaration": "function", "method_definition": "function", "arrow_function": "function", "class_declaration": "class", "import_statement": "import", "export_statement": "export"}, "JavaScript": {"function_declaration": "function", "method_definition": "function", "arrow_function": "function", "class_declaration": "class", "import_statement": "import", "export_statement": "export"}}

def extract_symbols(language_name: str, content: str) -> list[tuple[str, str, int, int]]:
    language = LANGUAGES.get(language_name)
    if language is None:
        return []
    tree = Parser(language).parse(content.encode("utf-8"))
    symbols = []
    stack = [tree.root_node]
    while stack:
        node = stack.pop()
        kind = NODE_KINDS[language_name].get(node.type)
        if kind:
            symbols.append((kind, _symbol_name(node, kind, content), node.start_point.row + 1, node.end_point.row + 1))
        stack.extend(reversed(node.named_children))
    return symbols

def _symbol_name(node, kind: str, content: str) -> str:
    name_node = node.child_by_field_name("name")
    if name_node is not None:
        return content[name_node.start_byte:name_node.end_byte]
    if kind in {"import", "export"}:
        return content[node.start_byte:node.end_byte].splitlines()[0][:200]
    return "<anonymous>"
