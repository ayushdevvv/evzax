from fastapi import HTTPException, status


def integration_error(provider: str, detail: str | None = None) -> HTTPException:
    message = f"{provider} is not configured. Add its credential to backend/.env and restart the API."
    if detail:
        message = f"{provider} request failed: {detail}"
    return HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=message)
