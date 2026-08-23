"""Safe public GitHub archive fetcher. It never invokes git or repository code."""
from urllib.parse import urlparse
from urllib.request import Request, urlopen
import json

class GitFetchError(ValueError): pass

def github_archive_url(repository_url: str) -> str:
    parsed=urlparse(repository_url)
    if parsed.scheme != "https" or parsed.netloc.lower() != "github.com": raise GitFetchError("Only public https://github.com/owner/repository URLs can be imported.")
    parts=[part for part in parsed.path.strip('/').split('/') if part]
    if len(parts) != 2: raise GitFetchError("Use a GitHub repository URL in owner/repository form.")
    owner, repo=parts; repo=repo.removesuffix('.git')
    with urlopen(Request(f"https://api.github.com/repos/{owner}/{repo}", headers={"Accept":"application/vnd.github+json", "User-Agent":"CodeSense"}), timeout=10) as response:
        default_branch=json.load(response).get("default_branch")
    if not default_branch: raise GitFetchError("Could not determine the default branch.")
    return f"https://codeload.github.com/{owner}/{repo}/zip/refs/heads/{default_branch}"

def download_archive(repository_url: str, max_bytes: int) -> bytes:
    try:
        with urlopen(Request(github_archive_url(repository_url), headers={"User-Agent":"CodeSense"}), timeout=30) as response:
            content=response.read(max_bytes + 1)
    except GitFetchError: raise
    except Exception as error: raise GitFetchError("GitHub archive download failed.") from error
    if len(content) > max_bytes: raise GitFetchError("GitHub archive exceeds the 50 MiB upload limit.")
    return content
