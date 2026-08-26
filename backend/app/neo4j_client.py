import os
from typing import List, Dict, Any, Optional
from neo4j import GraphDatabase

class Neo4jClient:
    def __init__(self, uri=None, user=None, password=None):
        self.uri = uri or os.getenv("NEO4J_URI", "bolt://localhost:7687")
        self.user = user or os.getenv("NEO4J_USER", "neo4j")
        self.password = password or os.getenv("NEO4J_PASSWORD", "password")
        
        # Connect to Neo4j
        self.driver = GraphDatabase.driver(self.uri, auth=(self.user, self.password))
        
    def close(self):
        self.driver.close()
        
    def _execute_write(self, query: str, parameters: Optional[Dict[str, Any]] = None):
        with self.driver.session() as session:
            return session.run(query, parameters).data()
            
    def _execute_read(self, query: str, parameters: Optional[Dict[str, Any]] = None):
        with self.driver.session() as session:
            return session.run(query, parameters).data()

    def replace_call_graph(self, upload_id: str, edges: List[Any]):
        """
        Replaces the call graph for a given upload_id.
        Edges format: (caller_path, caller_name, caller_line, callee_path, callee_name, call_line)
        """
        # First clear out existing call graph relationships for this upload
        query = """
        UNWIND $edges AS edge
        MERGE (caller:Function {name: edge.caller_name, path: edge.caller_path, upload_id: $upload_id})
        MERGE (callee:Function {name: edge.callee_name, path: COALESCE(edge.callee_path, 'UNKNOWN'), upload_id: $upload_id})
        MERGE (caller)-[r:CALLS {line: edge.call_line}]->(callee)
        """
        formatted_edges = [
            {
                "caller_path": e[0],
                "caller_name": e[1],
                "caller_line": e[2],
                "callee_path": e[3],
                "callee_name": e[4],
                "call_line": e[5],
            } for e in edges
        ]
        if formatted_edges:
            self._execute_write(query, {"upload_id": upload_id, "edges": formatted_edges})

    def replace_dependency_graph(self, upload_id: str, edges: List[Any]):
        """
        Replaces the dependency graph for a given upload_id.
        Edges format: (source_path, target_path, import_specifier, is_external, line_number)
        """
        query = """
        UNWIND $edges AS edge
        MERGE (source:Module {path: edge.source_path, upload_id: $upload_id})
        MERGE (target:Module {path: COALESCE(edge.target_path, edge.import_specifier), upload_id: $upload_id})
        SET target.is_external = edge.is_external
        MERGE (source)-[r:DEPENDS_ON {line: edge.line_number, specifier: edge.import_specifier}]->(target)
        """
        formatted_edges = [
            {
                "source_path": e[0],
                "target_path": e[1],
                "import_specifier": e[2],
                "is_external": e[3],
                "line_number": e[4]
            } for e in edges
        ]
        if formatted_edges:
            self._execute_write(query, {"upload_id": upload_id, "edges": formatted_edges})

    def delete_upload_graph(self, upload_id: str):
        """Deletes all nodes and relationships associated with the upload_id"""
        query = """
        MATCH (n) WHERE n.upload_id = $upload_id
        DETACH DELETE n
        """
        self._execute_write(query, {"upload_id": upload_id})
        
    def query_call_graph_traverse(self, upload_id: str, function_name: str, path: str = None, depth: int = 3):
        """Queries the call graph up to a certain depth"""
        match_clause = "MATCH p=(start:Function {name: $function_name, upload_id: $upload_id})-[r:CALLS*1..%d]-(end:Function)" % depth
        if path:
            match_clause = "MATCH p=(start:Function {name: $function_name, path: $path, upload_id: $upload_id})-[r:CALLS*1..%d]-(end:Function)" % depth
            
        query = match_clause + """
        RETURN [node in nodes(p) | {name: node.name, path: node.path}] AS path,
               [rel in relationships(p) | {line: rel.line}] AS relationships
        """
        params = {"upload_id": upload_id, "function_name": function_name, "path": path}
        return self._execute_read(query, params)

    def query_dependency_graph_traverse(self, upload_id: str, path: str, depth: int = 3):
        """Queries the dependency graph up to a certain depth"""
        query = """
        MATCH p=(start:Module {path: $path, upload_id: $upload_id})-[r:DEPENDS_ON*1..%d]-(end:Module)
        RETURN [node in nodes(p) | {path: node.path, is_external: node.is_external}] AS path,
               [rel in relationships(p) | {line: rel.line, specifier: rel.specifier}] AS relationships
        """ % depth
        return self._execute_read(query, {"upload_id": upload_id, "path": path})

neo4j_client = Neo4jClient()
