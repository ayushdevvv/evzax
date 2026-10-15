from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.api.routes.health import router as health_router
from app.api.routes.repositories import router as repositories_router
from app.core.config import settings
from app.db.mongo import close_client


@asynccontextmanager
async def lifespan(_: FastAPI):
    yield
    close_client()


app = FastAPI(
    title="GitContext API",
    description="Codebase retrieval and revision intelligence for GitContext.",
    version="0.1.0",
    lifespan=lifespan,
    docs_url=None,
    redoc_url=None,
    openapi_url=None,
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.frontend_origin],
    allow_credentials=True,
    allow_methods=["GET", "POST", "DELETE", "OPTIONS"],
    allow_headers=["Content-Type", "Authorization"],
)
app.include_router(health_router, prefix="/api")
app.include_router(repositories_router, prefix="/api")


@app.exception_handler(StarletteHTTPException)
async def clean_http_errors(_, exc: StarletteHTTPException):
    detail = exc.detail if isinstance(exc.detail, str) else "The request could not be completed."
    return JSONResponse(status_code=exc.status_code, content={"detail": detail})


@app.get("/")
def root():
    return {"name": "GitContext", "status": "ready", "message": "API is running."}
