import re

_GREETING = re.compile(r"^(hi|hello|hey|yo|thanks|thank you|good morning|good afternoon|good evening)[!. ]*$", re.IGNORECASE)
_DEEP_MARKERS = (
    "stack trace", "traceback", "root cause", "debug", "debugging", "bug", "error", "exception",
    "across files", "across modules", "request flow", "execution flow", "architecture", "end to end",
    "compare", "dependency", "call chain", "why does", "why is", "failing test", "crash",
)


def choose_retrieval_policy(question: str) -> dict:
    text = question.strip()
    lowered = text.lower()
    if _GREETING.fullmatch(text):
        return {"mode": "no_retrieval", "code_k": 0, "document_k": 0, "reason": "simple_greeting"}
    is_deep = any(marker in lowered for marker in _DEEP_MARKERS) or len(text.split()) >= 28
    if is_deep:
        return {"mode": "deep_hybrid", "code_k": 12, "document_k": 5, "reason": "multi_step_or_debug_question"}
    is_precise = bool(re.search(r"(?:[\w./-]+\.(?:py|js|jsx|ts|tsx|go|rs|java|md|json|yml|yaml)|`[^`]+`|\b[A-Z][a-z]+[A-Z]\w*\b)", text))
    if is_precise:
        return {"mode": "targeted_hybrid", "code_k": 5, "document_k": 2, "reason": "specific_path_or_symbol"}
    return {"mode": "standard_hybrid", "code_k": 8, "document_k": 3, "reason": "standard_codebase_question"}
