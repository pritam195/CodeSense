import os
from dataclasses import dataclass
from pathlib import Path
from dotenv import load_dotenv

load_dotenv()
load_dotenv(Path(__file__).resolve().parent.parent.parent / ".env")


@dataclass(frozen=True)
class Settings:
    data_dir: Path = Path(os.getenv("CODESENSE_DATA_DIR", "data"))
    max_upload_bytes: int = 50 * 1024 * 1024
    max_expanded_archive_bytes: int = 200 * 1024 * 1024
    embedding_model: str = os.getenv("EMBEDDING_MODEL", "sentence-transformers/all-MiniLM-L6-v2")
    embedding_max_chars: int = 12000
    embedding_min_interval_seconds: float = 0.2
    openai_api_key: str | None = os.getenv("OPENAI_API_KEY")
    answer_model: str = os.getenv("ANSWER_MODEL", "gpt-5-mini")
    answer_context_limit: int = 5
    ignored_directories: frozenset[str] = frozenset({".git", "node_modules", "dist", "build", "coverage", ".next", ".venv", "venv"})
    ignored_filenames: frozenset[str] = frozenset({"package-lock.json", "yarn.lock", "pnpm-lock.yaml", "poetry.lock", "Pipfile.lock", "composer.lock", "Gemfile.lock", "Cargo.lock", ".DS_Store", "thumbs.db"})
    source_extensions: frozenset[str] = frozenset({".py", ".js", ".jsx", ".ts", ".tsx", ".java", ".go", ".rs", ".rb", ".php", ".cs", ".cpp", ".c", ".h", ".hpp", ".swift", ".kt", ".kts", ".scala", ".sh", ".sql", ".html", ".css", ".json", ".yaml", ".yml", ".md"})
    cors_origins: tuple[str, ...] = tuple(
        origin.strip()
        for origin in os.getenv("CORS_ORIGINS", "http://localhost:5173,https://codesense-v10.vercel.app").split(",")
        if origin.strip()
    )



