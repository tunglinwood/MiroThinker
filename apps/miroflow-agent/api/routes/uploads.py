# Copyright (c) 2025 MiroMind
# This source code is licensed under the Apache 2.0 License.

"""File upload endpoint for MiroThinker API."""

import uuid
from pathlib import Path

from fastapi import APIRouter, File, HTTPException, UploadFile

from api.models.task import FileInfo

router = APIRouter(prefix="/api", tags=["uploads"])

FILE_TYPE_MAP = {
    ".xlsx": "Excel",
    ".xls": "Excel",
    ".csv": "CSV",
    ".pdf": "PDF",
    ".doc": "Word",
    ".docx": "Word",
    ".txt": "Text",
    ".json": "JSON",
    ".png": "Image",
    ".jpg": "Image",
    ".jpeg": "Image",
    ".mp3": "Audio",
    ".wav": "Audio",
    ".mp4": "Video",
}

ALLOWED_EXTENSIONS = set(FILE_TYPE_MAP.keys())
MAX_UPLOAD_SIZE_MB = 50


@router.post("/upload", response_model=FileInfo)
async def upload_file(file: UploadFile = File(...)) -> FileInfo:
    """Upload a file for task processing."""
    # Validate extension
    ext = Path(file.filename or "").suffix.lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=f"File type {ext} not allowed. Allowed: {', '.join(sorted(ALLOWED_EXTENSIONS))}",
        )

    # Create upload directory
    file_id = uuid.uuid4().hex
    project_root = Path(__file__).parent.parent.parent
    upload_dir = project_root / "uploads" / file_id
    upload_dir.mkdir(parents=True, exist_ok=True)

    # Save file
    file_path = upload_dir / (file.filename or "uploaded_file")
    content = await file.read()

    # Check file size
    if len(content) > MAX_UPLOAD_SIZE_MB * 1024 * 1024:
        raise HTTPException(
            status_code=400,
            detail=f"File too large. Maximum size: {MAX_UPLOAD_SIZE_MB}MB",
        )

    with open(file_path, "wb") as f:
        f.write(content)

    return FileInfo(
        file_id=file_id,
        file_name=file.filename or "uploaded_file",
        file_type=FILE_TYPE_MAP.get(ext, "File"),
        absolute_file_path=str(file_path.absolute()),
    )
