"""Read-only repository archive scanner. It never imports or executes repository content."""
from pathlib import PurePosixPath
from zipfile import BadZipFile, ZipFile
from .config import Settings

LANGUAGES = {".py": "Python", ".js": "JavaScript", ".jsx": "JavaScript", ".ts": "TypeScript", ".tsx": "TypeScript", ".java": "Java", ".go": "Go", ".rs": "Rust", ".rb": "Ruby", ".php": "PHP", ".cs": "C#", ".cpp": "C++", ".c": "C", ".h": "C/C++", ".hpp": "C++", ".swift": "Swift", ".kt": "Kotlin", ".kts": "Kotlin", ".scala": "Scala", ".sh": "Shell", ".sql": "SQL", ".html": "HTML", ".css": "CSS", ".json": "JSON", ".yaml": "YAML", ".yml": "YAML", ".md": "Markdown"}

class ScanError(ValueError):
    pass

def scan_archive(archive_path: str, settings: Settings) -> list[tuple[str, str, int, str]]:
    try:
        with ZipFile(archive_path) as archive:
            entries = [entry for entry in archive.infolist() if not entry.is_dir()]
            _validate_archive(entries, settings)
            files = []
            for entry in entries:
                path = PurePosixPath(entry.filename)
                suffix = path.suffix.lower()
                if suffix not in settings.source_extensions or _is_ignored(path, settings):
                    continue
                content = archive.read(entry).decode("utf-8", errors="replace")
                files.append((path.as_posix(), LANGUAGES.get(suffix, "Unknown"), entry.file_size, content))
            return files
    except BadZipFile as error:
        raise ScanError("Uploaded file is not a valid ZIP archive.") from error

def _validate_archive(entries, settings: Settings) -> None:
    if sum(entry.file_size for entry in entries) > settings.max_expanded_archive_bytes:
        raise ScanError("Archive exceeds the expanded-size safety limit.")
    for entry in entries:
        path = PurePosixPath(entry.filename)
        if path.is_absolute() or ".." in path.parts:
            raise ScanError("Archive contains an unsafe path.")

def _is_ignored(path: PurePosixPath, settings: Settings) -> bool:
    return path.name in settings.ignored_filenames or any(part in settings.ignored_directories for part in path.parts[:-1])
