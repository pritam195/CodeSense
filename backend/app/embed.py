"""Single guarded embedding client and FAISS persistence."""
from pathlib import Path
from threading import Lock
from time import monotonic, sleep
import faiss
import numpy as np

class EmbeddingClient:
    def __init__(self, model_name="sentence-transformers/all-MiniLM-L6-v2", max_chars=12000, min_interval_seconds=0.2):
        self.model_name=model_name; self.max_chars=max_chars; self.min_interval_seconds=min_interval_seconds
        self._model=None; self._last_call=0.0; self._lock=Lock()
    def encode_documents(self, texts): return self._encode(texts, "document")
    def encode_query(self, text): return self._encode([text], "query")[0]
    def _encode(self, texts, mode):
        if any(len(text) > self.max_chars for text in texts): raise ValueError("Chunk exceeds embedding input limit.")
        with self._lock:
            delay=self.min_interval_seconds-(monotonic()-self._last_call)
            if delay > 0: sleep(delay)
            if self._model is None:
                from sentence_transformers import SentenceTransformer
                self._model=SentenceTransformer(self.model_name)
                self._model.max_seq_length=256
            if hasattr(self._model, "encode_document") and mode == "document":
                raw_vectors = self._model.encode_document(texts, normalize_embeddings=True)
            elif hasattr(self._model, "encode_query") and mode == "query":
                raw_vectors = self._model.encode_query(texts, normalize_embeddings=True)
            else:
                raw_vectors = self._model.encode(texts, normalize_embeddings=True)
            vectors = np.asarray(raw_vectors, dtype="float32")
            self._last_call=monotonic(); return vectors

class FaissIndexStore:
    def __init__(self, data_dir: Path): self.directory=data_dir/"indices"; self.directory.mkdir(parents=True, exist_ok=True)
    def write(self, upload_id, vectors):
        index=faiss.IndexFlatIP(vectors.shape[1]); index.add(vectors); faiss.write_index(index, str(self.directory/f"{upload_id}.faiss"))
    def search(self, upload_id, vector, limit):
        index=faiss.read_index(str(self.directory/f"{upload_id}.faiss")); scores, ids=index.search(np.asarray([vector], dtype="float32"), limit); return [(int(i), float(score)) for i, score in zip(ids[0], scores[0]) if i >= 0]
