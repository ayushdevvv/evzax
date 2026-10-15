import ast
import fnmatch
import re
from dataclasses import dataclass
from pathlib import PurePosixPath

ALLOWED_EXTENSIONS = {
    ".py", ".pyi", ".js", ".jsx", ".mjs", ".cjs", ".ts", ".tsx", ".vue",
    ".java", ".kt", ".kts", ".go", ".rs", ".c", ".h", ".cc", ".cpp", ".hpp",
    ".cs", ".php", ".rb", ".swift", ".scala", ".sql", ".html", ".css", ".scss",
    ".json", ".yaml", ".yml", ".toml", ".md", ".mdx", ".sh", ".bash", ".ps1",
    ".xml", ".graphql", ".gql", ".proto", ".dockerfile", ".tf", ".prisma", ".svelte", ".txt", ".rst", ".ini", ".cfg", ".conf", ".properties",
}
IGNORED_DIRS = {
    ".git", ".hg", ".svn", "node_modules", "vendor", "dist", "build", "out",
    "target", ".next", ".nuxt", ".venv", "venv", "env", "__pycache__", ".pytest_cache",
    "coverage", "storybook-static", "Pods", "DerivedData", ".idea", ".vscode",
}
IGNORED_NAMES = {
    ".ds_store", "thumbs.db", "package-lock.json", "pnpm-lock.yaml", "yarn.lock",
    "poetry.lock", "uv.lock", "cargo.lock", "composer.lock", "gemfile.lock",
}
SECRET_FILE_PATTERNS = (".env", ".env.*", "*.pem", "*.key", "id_rsa", "id_ed25519", "*.p12", "*.pfx", "secrets.*")
SECRET_LINE_PATTERNS = [
    re.compile(r"(?i)(api[_-]?key|secret|access[_-]?token|password|private[_-]?key)\s*[:=]\s*['\"]?([A-Za-z0-9_./+=:-]{12,})"),
    re.compile(r"-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----"),
    re.compile(r"\bgh[pousr]_[A-Za-z0-9]{20,}\b"),
    re.compile(r"\bsk-[A-Za-z0-9_-]{24,}\b"),
    re.compile(r"\bAKIA[0-9A-Z]{16}\b"),
]
SYMBOL_RE = re.compile(
    r"^\s*(?:async\s+)?(?:def|class|function|interface|type|enum|struct|func|fn|pub\s+fn)\s+([A-Za-z_$][\w$]*)"
    r"|^\s*(?:export\s+)?(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?(?:\(|function)"
)


@dataclass
class CodeFile:
    path: str
    content: str
    language: str


@dataclass
class CodeChunk:
    chunk_id: str
    file_path: str
    line_start: int
    line_end: int
    language: str
    symbol: str | None
    content: str


def language_for_path(path: str) -> str:
    suffix = PurePosixPath(path).suffix.lower()
    mapping = {
        ".py": "python", ".pyi": "python", ".js": "javascript", ".jsx": "jsx",
        ".mjs": "javascript", ".cjs": "javascript", ".ts": "typescript", ".tsx": "tsx",
        ".java": "java", ".kt": "kotlin", ".go": "go", ".rs": "rust", ".c": "c",
        ".h": "c", ".cc": "cpp", ".cpp": "cpp", ".hpp": "cpp", ".cs": "csharp",
        ".php": "php", ".rb": "ruby", ".swift": "swift", ".sql": "sql", ".html": "html",
        ".css": "css", ".scss": "scss", ".json": "json", ".yaml": "yaml", ".yml": "yaml",
        ".toml": "toml", ".md": "markdown", ".mdx": "markdown", ".sh": "bash", ".bash": "bash",
        ".ps1": "powershell", ".xml": "xml", ".graphql": "graphql", ".gql": "graphql",
        ".proto": "protobuf", ".tf": "hcl", ".prisma": "prisma", ".vue": "vue", ".svelte": "svelte",
    }
    if PurePosixPath(path).name.lower() == "dockerfile":
        return "dockerfile"
    return mapping.get(suffix, "text")


def should_skip_path(path: str) -> bool:
    normalized = path.replace("\\", "/").lstrip("./")
    parts = PurePosixPath(normalized).parts
    if not normalized or any(part.lower() in IGNORED_DIRS for part in parts):
        return True
    name = PurePosixPath(normalized).name.lower()
    if name in IGNORED_NAMES or name.endswith(".min.js") or name.endswith(".map"):
        return True
    if any(fnmatch.fnmatch(name, pattern) for pattern in SECRET_FILE_PATTERNS):
        return True
    suffix = PurePosixPath(normalized).suffix.lower()
    return suffix not in ALLOWED_EXTENSIONS and name.lower() != "dockerfile"


def redact_secret_lines(text: str) -> str:
    output = []
    for line in text.splitlines():
        if any(pattern.search(line) for pattern in SECRET_LINE_PATTERNS):
            output.append("[REDACTED: possible secret removed from indexed context]")
        else:
            output.append(line)
    return "\n".join(output)


def find_symbol(lines: list[str], line_index: int) -> str | None:
    for index in range(line_index, -1, -1):
        match = SYMBOL_RE.search(lines[index])
        if match:
            return match.group(1) or match.group(2)
    return None


def chunk_code(file_path: str, content: str, max_lines: int = 88, overlap: int = 12) -> list[CodeChunk]:
    content = redact_secret_lines(content.replace("\r\n", "\n").replace("\r", "\n"))
    lines = content.splitlines()
    if not lines or not content.strip():
        return []
    result: list[CodeChunk] = []
    start = 0
    ordinal = 0
    while start < len(lines):
        proposed_end = min(start + max_lines, len(lines))
        end = proposed_end
        if proposed_end < len(lines):
            candidates = range(max(start + max_lines // 2, start + 1), min(proposed_end + 1, len(lines)))
            boundaries = [idx for idx in candidates if not lines[idx].strip() or SYMBOL_RE.search(lines[idx])]
            if boundaries:
                end = boundaries[-1] if boundaries[-1] > start else proposed_end
        text = "\n".join(lines[start:end]).strip("\n")
        if text.strip():
            result.append(CodeChunk(
                chunk_id=f"{ordinal}:{start + 1}:{end}",
                file_path=file_path,
                line_start=start + 1,
                line_end=end,
                language=language_for_path(file_path),
                symbol=find_symbol(lines, start),
                content=text[:14000],
            ))
            ordinal += 1
        if end >= len(lines):
            break
        start = max(end - overlap, start + 1)
    return result


def parse_python_symbols(file_path: str, content: str) -> list[dict]:
    try:
        tree = ast.parse(content)
    except (SyntaxError, ValueError):
        return []
    output = []
    for node in ast.walk(tree):
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef)):
            output.append({
                "symbol": node.name,
                "kind": "class" if isinstance(node, ast.ClassDef) else "function",
                "line_start": getattr(node, "lineno", 1),
                "line_end": getattr(node, "end_lineno", getattr(node, "lineno", 1)),
            })
    return sorted(output, key=lambda item: (item["line_start"], item["line_end"]))
