from __future__ import annotations

import io
import re

import httpx
from fastapi import APIRouter, File, HTTPException, UploadFile
from pydantic import BaseModel

from app.api.deps import CurrentUser

router = APIRouter(prefix="/kb", tags=["knowledge-base"])

# ---------------------------------------------------------------------------
# URL scrape
# ---------------------------------------------------------------------------

class ScrapeRequest(BaseModel):
    url: str

class ScrapeResponse(BaseModel):
    url: str
    text: str
    title: str | None = None


def _clean(raw: str) -> str:
    # Strip excessive blank lines and leading whitespace
    lines = [l.rstrip() for l in raw.splitlines()]
    cleaned: list[str] = []
    blank = 0
    for line in lines:
        if line == "":
            blank += 1
            if blank <= 2:
                cleaned.append(line)
        else:
            blank = 0
            cleaned.append(line)
    return "\n".join(cleaned).strip()


@router.post("/scrape", response_model=ScrapeResponse)
async def scrape_url(body: ScrapeRequest, _user: CurrentUser):
    url = body.url.strip()
    if not url.startswith(("http://", "https://")):
        raise HTTPException(400, "URL must start with http:// or https://")

    # Try Jina Reader first (returns clean markdown)
    jina_url = f"https://r.jina.ai/{url}"
    async with httpx.AsyncClient(timeout=20, follow_redirects=True) as client:
        try:
            r = await client.get(jina_url, headers={"Accept": "text/plain"})
            if r.status_code == 200 and len(r.text) > 100:
                text = _clean(r.text)
                # Extract title from first line if it looks like one
                title = None
                first = text.splitlines()[0] if text else ""
                if first.startswith("Title:"):
                    title = first.replace("Title:", "").strip()
                    text = text[len(first):].strip()
                return ScrapeResponse(url=url, text=text[:12000], title=title)
        except Exception:
            pass

        # Fallback: raw fetch + strip HTML tags
        try:
            r = await client.get(url, headers={"User-Agent": "Mozilla/5.0"})
            r.raise_for_status()
            raw = r.text
            # Very basic HTML strip
            text = re.sub(r"<style[^>]*>.*?</style>", " ", raw, flags=re.DOTALL | re.IGNORECASE)
            text = re.sub(r"<script[^>]*>.*?</script>", " ", text, flags=re.DOTALL | re.IGNORECASE)
            text = re.sub(r"<[^>]+>", " ", text)
            text = re.sub(r"&nbsp;", " ", text)
            text = re.sub(r"&[a-z]+;", "", text)
            text = _clean(text)
            return ScrapeResponse(url=url, text=text[:12000])
        except Exception as e:
            raise HTTPException(502, f"Could not fetch URL: {e}")


# ---------------------------------------------------------------------------
# File upload → extract text
# ---------------------------------------------------------------------------

class ExtractResponse(BaseModel):
    filename: str
    text: str
    size: int


@router.post("/upload", response_model=ExtractResponse)
async def extract_file(_user: CurrentUser, file: UploadFile = File(...)):
    name = file.filename or "upload"
    data = await file.read()
    ext = name.rsplit(".", 1)[-1].lower() if "." in name else ""

    text = ""

    if ext in ("txt", "md", "csv", "json", "yaml", "yml"):
        try:
            text = data.decode("utf-8", errors="replace")
        except Exception:
            text = data.decode("latin-1", errors="replace")

    elif ext == "pdf":
        try:
            import pypdf  # type: ignore
            reader = pypdf.PdfReader(io.BytesIO(data))
            pages = [page.extract_text() or "" for page in reader.pages]
            text = "\n\n".join(p for p in pages if p.strip())
        except ImportError:
            raise HTTPException(422, "PDF support not available on this server")
        except Exception as e:
            raise HTTPException(422, f"Could not extract PDF text: {e}")

    elif ext in ("docx",):
        try:
            import docx as _docx  # type: ignore
            doc = _docx.Document(io.BytesIO(data))
            text = "\n".join(p.text for p in doc.paragraphs if p.text.strip())
        except Exception as e:
            raise HTTPException(422, f"Could not extract DOCX text: {e}")

    else:
        # Try plain text decode anyway
        try:
            text = data.decode("utf-8", errors="replace")
        except Exception:
            raise HTTPException(422, f"Unsupported file type: {ext}")

    if not text.strip():
        raise HTTPException(422, "No text could be extracted from this file")

    return ExtractResponse(filename=name, text=text[:20000], size=len(data))
