from __future__ import annotations

from sqlalchemy import JSON, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import UUIDBase


class KnowledgeArticle(UUIDBase):
    __tablename__ = "knowledge_articles"

    slug: Mapped[str] = mapped_column(String(80), nullable=False, unique=True, index=True)
    title: Mapped[str] = mapped_column(String(500), nullable=False)
    category: Mapped[str] = mapped_column(String(80), nullable=False, index=True)
    dimensions: Mapped[list] = mapped_column(JSON, nullable=False, default=list)
    read_minutes: Mapped[int] = mapped_column(Integer, nullable=False, default=5)
    author: Mapped[str] = mapped_column(String(200), nullable=False, default="Aivora Editorial")
    date: Mapped[str] = mapped_column(String(20), nullable=False)
    summary: Mapped[str] = mapped_column(Text, nullable=False)
    tags: Mapped[list] = mapped_column(JSON, nullable=False, default=list)
    sections: Mapped[list] = mapped_column(JSON, nullable=False, default=list)
