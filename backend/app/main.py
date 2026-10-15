from contextlib import asynccontextmanager
import logging
from fastapi import FastAPI
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.api.routes.health import router as health_router
from app.api.routes.auth import router as auth_router
from app.api.routes.repositories import router as repositories_router
from app.core.config import settings
from app.db.mongo import close_client


@asynccontextmanager
async def lifespan(_: FastAPI):
    yield
    close_client()


logger = logging.getLogger("evzax.api")

app = FastAPI(
    title="EVZAX",
    description="Codebase retrieval and revision intelligence.",
    version="0.1.0",
    lifespan=lifespan,
    docs_url=None,
    redoc_url=None,
    openapi_url=None,
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_frontend_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "DELETE", "OPTIONS"],
    allow_headers=["Content-Type", "Authorization"],
)
app.include_router(health_router, prefix="/api")
app.include_router(auth_router, prefix="/api")
app.include_router(repositories_router, prefix="/api")


@app.exception_handler(StarletteHTTPException)
async def clean_http_errors(_, exc: StarletteHTTPException):
    detail = exc.detail if isinstance(exc.detail, str) else "The request could not be completed."
    return JSONResponse(status_code=exc.status_code, content={"detail": detail})


@app.exception_handler(RequestValidationError)
async def clean_validation_errors(_, exc: RequestValidationError):
    return JSONResponse(status_code=422, content={"detail": "Please check the information and try again."})


@app.get("/")
def root():
    return {"name": "EVZAX", "status": "ready", "message": "Service is running."}


@app.exception_handler(Exception)
async def clean_unexpected_errors(_, exc: Exception):
    logger.exception("Unhandled request error", exc_info=exc)
    return JSONResponse(status_code=500, content={"detail": "Something went wrong. Please try again shortly."})
