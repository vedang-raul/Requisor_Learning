"""IMSCC → Alma 41 lesson drafts, over HTTP.

  GET  /health               liveness check
  POST /v1/imscc/parse       multipart field "file": a Canvas .imscc export.
                             Returns the course outline and one draft per lesson,
                             split by the lesson wizard's steps (see schema.py).
                             ?include_unpublished=true also maps hidden content.

Server-to-server only: the Alma 41 app calls it with the shared key in the
X-API-Key header (IMSCC_API_KEY). Nothing is stored; the upload lives in memory
for the length of the request.

Settings (environment):
  IMSCC_API_KEY          required shared secret
  IMSCC_ALLOW_NO_KEY=1   local development only: accept calls without a key
  IMSCC_MAX_UPLOAD_MB    largest upload accepted (default 300)
  IMSCC_ENABLE_DOCS=1    serve the interactive docs at /docs
"""
from __future__ import annotations

import hmac
import os

from fastapi import Depends, FastAPI, File, Header, HTTPException, Query, UploadFile
from fastapi.concurrency import run_in_threadpool

from . import __version__
from .mapper import map_cartridge
from .package import Package, PackageError
from .schema import ImportResult

MAX_UPLOAD_BYTES = int(float(os.environ.get("IMSCC_MAX_UPLOAD_MB", "300")) * 1024 * 1024)
CHUNK = 1024 * 1024

docs = os.environ.get("IMSCC_ENABLE_DOCS") == "1"
app = FastAPI(title="Alma 41 IMSCC import API", version=__version__,
              docs_url="/docs" if docs else None, redoc_url=None, openapi_url="/openapi.json" if docs else None)


def require_key(x_api_key: str | None = Header(default=None)) -> None:
    expected = os.environ.get("IMSCC_API_KEY", "")
    if not expected:
        if os.environ.get("IMSCC_ALLOW_NO_KEY") == "1":
            return
        raise HTTPException(503, "The service has no API key configured.")
    if not x_api_key or not hmac.compare_digest(x_api_key.encode(), expected.encode()):
        raise HTTPException(401, "Missing or wrong API key.")


@app.get("/health")
def health() -> dict:
    return {"ok": True, "version": __version__}


@app.post("/v1/imscc/parse", response_model=ImportResult, response_model_by_alias=True, dependencies=[Depends(require_key)])
async def parse(file: UploadFile = File(..., description="A Canvas Common Cartridge export (.imscc)"),
                include_unpublished: bool = Query(False, description="Also map unpublished modules and items.")) -> ImportResult:
    name = (file.filename or "").lower()
    if name and not name.endswith((".imscc", ".zip")):
        raise HTTPException(415, "Upload a Canvas Common Cartridge export (.imscc).")
    data = bytearray()
    while chunk := await file.read(CHUNK):
        data.extend(chunk)
        if len(data) > MAX_UPLOAD_BYTES:
            raise HTTPException(413, f"The file is larger than {MAX_UPLOAD_BYTES // (1024 * 1024)} MB.")
    try:
        # Parsing is CPU work: keep it off the event loop.
        return await run_in_threadpool(lambda: map_cartridge(Package(bytes(data)), include_unpublished))
    except PackageError as exc:
        raise HTTPException(400, str(exc)) from exc
