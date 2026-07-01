from __future__ import annotations

import io
import re
import uuid
from datetime import date as date_cls

import httpx
from fastapi import APIRouter, File, HTTPException, Response, UploadFile
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import select

from app.api.deps import AdminUser, CurrentUser, DBDep
from app.models.knowledge import KnowledgeArticle

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


# ---------------------------------------------------------------------------
# Knowledge base articles (CRUD)
# ---------------------------------------------------------------------------

class ArticleSection(BaseModel):
    heading: str
    body: str


class ArticleOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    slug: str
    title: str
    category: str
    dimensions: list[str] = Field(default_factory=list)
    readMinutes: int = Field(alias="read_minutes")
    author: str
    date: str
    summary: str
    tags: list[str] = Field(default_factory=list)
    sections: list[ArticleSection] = Field(default_factory=list)


class ArticleWrite(BaseModel):
    title: str
    category: str
    dimensions: list[str] = Field(default_factory=list)
    readMinutes: int = Field(default=5, ge=1, le=180)
    author: str = "Aivora Editorial"
    date: str | None = None
    summary: str
    tags: list[str] = Field(default_factory=list)
    sections: list[ArticleSection] = Field(default_factory=list)
    slug: str | None = None


def _serialize(article: KnowledgeArticle) -> dict:
    return {
        "id": str(article.id),
        "slug": article.slug,
        "title": article.title,
        "category": article.category,
        "dimensions": article.dimensions or [],
        "readMinutes": article.read_minutes,
        "author": article.author,
        "date": article.date,
        "summary": article.summary,
        "tags": article.tags or [],
        "sections": article.sections or [],
    }


def _slugify(text: str) -> str:
    s = re.sub(r"[^a-z0-9\s-]", "", text.lower())
    s = re.sub(r"[\s-]+", "-", s).strip("-")
    return s[:70] or f"article-{uuid.uuid4().hex[:8]}"


async def _unique_slug(db, base: str, exclude_id: uuid.UUID | None = None) -> str:
    candidate = base
    suffix = 2
    while True:
        stmt = select(KnowledgeArticle).where(KnowledgeArticle.slug == candidate)
        if exclude_id is not None:
            stmt = stmt.where(KnowledgeArticle.id != exclude_id)
        existing = (await db.execute(stmt)).scalar_one_or_none()
        if existing is None:
            return candidate
        candidate = f"{base}-{suffix}"
        suffix += 1


@router.get("/articles", response_model=list[dict])
async def list_articles(_user: CurrentUser, db: DBDep) -> list[dict]:
    result = await db.execute(
        select(KnowledgeArticle).order_by(KnowledgeArticle.date.desc(), KnowledgeArticle.title)
    )
    return [_serialize(a) for a in result.scalars().all()]


@router.get("/articles/{article_id}", response_model=dict)
async def get_article(article_id: str, _user: CurrentUser, db: DBDep) -> dict:
    try:
        uid = uuid.UUID(article_id)
        article = (
            await db.execute(select(KnowledgeArticle).where(KnowledgeArticle.id == uid))
        ).scalar_one_or_none()
    except ValueError:
        article = (
            await db.execute(select(KnowledgeArticle).where(KnowledgeArticle.slug == article_id))
        ).scalar_one_or_none()
    if article is None:
        raise HTTPException(404, "Article not found")
    return _serialize(article)


@router.post("/articles", response_model=dict, status_code=201)
async def create_article(body: ArticleWrite, _admin: AdminUser, db: DBDep) -> dict:
    slug_base = _slugify(body.slug or body.title)
    slug = await _unique_slug(db, slug_base)
    article = KnowledgeArticle(
        slug=slug,
        title=body.title.strip(),
        category=body.category.strip(),
        dimensions=body.dimensions,
        read_minutes=body.readMinutes,
        author=body.author.strip() or "Aivora Editorial",
        date=body.date or date_cls.today().isoformat(),
        summary=body.summary.strip(),
        tags=body.tags,
        sections=[s.model_dump() for s in body.sections],
    )
    db.add(article)
    await db.commit()
    await db.refresh(article)
    return _serialize(article)


@router.patch("/articles/{article_id}", response_model=dict)
async def update_article(article_id: str, body: ArticleWrite, _admin: AdminUser, db: DBDep) -> dict:
    try:
        uid = uuid.UUID(article_id)
    except ValueError:
        raise HTTPException(400, "Invalid article id")
    article = (
        await db.execute(select(KnowledgeArticle).where(KnowledgeArticle.id == uid))
    ).scalar_one_or_none()
    if article is None:
        raise HTTPException(404, "Article not found")

    article.title = body.title.strip()
    article.category = body.category.strip()
    article.dimensions = body.dimensions
    article.read_minutes = body.readMinutes
    article.author = body.author.strip() or "Aivora Editorial"
    if body.date:
        article.date = body.date
    article.summary = body.summary.strip()
    article.tags = body.tags
    article.sections = [s.model_dump() for s in body.sections]
    if body.slug and body.slug != article.slug:
        article.slug = await _unique_slug(db, _slugify(body.slug), exclude_id=article.id)

    await db.commit()
    await db.refresh(article)
    return _serialize(article)


@router.delete("/articles/{article_id}", status_code=204, response_class=Response)
async def delete_article(article_id: str, _admin: AdminUser, db: DBDep) -> Response:
    try:
        uid = uuid.UUID(article_id)
    except ValueError:
        raise HTTPException(400, "Invalid article id")
    article = (
        await db.execute(select(KnowledgeArticle).where(KnowledgeArticle.id == uid))
    ).scalar_one_or_none()
    if article is None:
        raise HTTPException(404, "Article not found")
    await db.delete(article)
    await db.commit()
    return Response(status_code=204)
