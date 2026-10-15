from fastapi import HTTPException, status


def integration_error(provider: str, detail: str | None = None) -> HTTPException:
    # Never expose provider payloads, credentials, hostnames, or SDK exceptions to clients.
    message = (
        "A required service is not configured. Please contact the workspace administrator."
        if not detail else
        "A service could not complete this request. Please try again shortly."
    )
    return HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=message)
