"""Document categories, project docs, templates, generation profiles (Domain 9)."""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import (
    Boolean,
    DateTime,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base
from app.models.base import UUIDBase


class DocumentCategory(UUIDBase):
    """Per-tenant (or global, tenant_id NULL) document category."""

    __tablename__ = "document_categories"
    __table_args__ = (
        UniqueConstraint("tenant_id", "key", name="uq_document_categories_tenant_key"),
    )

    tenant_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("tenants.id", ondelete="CASCADE"),
        nullable=True,
        index=True,
    )
    key: Mapped[str] = mapped_column(String(100), nullable=False)
    label: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")
    meta: Mapped[dict[str, Any] | None] = mapped_column("metadata", JSONB, nullable=True)


class ProjectDocument(UUIDBase):
    """File / link attached to a project."""

    __tablename__ = "project_documents"

    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("tenants.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    project_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("projects.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    category_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("document_categories.id", ondelete="SET NULL"),
        nullable=True,
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    file_path: Mapped[str | None] = mapped_column(Text, nullable=True)
    mime_type: Mapped[str | None] = mapped_column(String(100), nullable=True)
    source_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    meta: Mapped[dict[str, Any] | None] = mapped_column("metadata", JSONB, nullable=True)
    uploaded_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )


class DocumentType(Base):
    """Reference table of document types (TEXT pk = key)."""

    __tablename__ = "document_types"

    key: Mapped[str] = mapped_column(String(100), primary_key=True)
    label: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    default_governance_tier: Mapped[str] = mapped_column(
        String(50), nullable=False, default="operational", server_default="operational"
    )
    meta: Mapped[dict[str, Any] | None] = mapped_column("metadata", JSONB, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )


class DocumentTemplate(Base):
    """Template (TEXT pk = id) tied to a document_type."""

    __tablename__ = "document_templates"

    id: Mapped[str] = mapped_column(String(255), primary_key=True)
    document_type_key: Mapped[str | None] = mapped_column(
        String(100),
        ForeignKey("document_types.key"),  # NO ACTION (reference table)
        nullable=True,
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(
        String(50), nullable=False, default="active", server_default="active"
    )
    code_ref: Mapped[str | None] = mapped_column(String(255), nullable=True)
    meta: Mapped[dict[str, Any] | None] = mapped_column("metadata", JSONB, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )


class DocumentTemplateVersion(Base):
    """Versioned template body."""

    __tablename__ = "document_template_versions"
    __table_args__ = (
        UniqueConstraint(
            "template_id", "version", name="uq_document_template_versions_template_version"
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, index=True
    )
    template_id: Mapped[str] = mapped_column(
        String(255),
        ForeignKey("document_templates.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    version: Mapped[int] = mapped_column(Integer, nullable=False)
    code_ref: Mapped[str | None] = mapped_column(String(255), nullable=True)
    sections: Mapped[dict[str, Any] | None] = mapped_column(JSONB, nullable=True)
    meta: Mapped[dict[str, Any] | None] = mapped_column("metadata", JSONB, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )


class DocumentExportProfile(UUIDBase):
    """Reusable export profile (format + options)."""

    __tablename__ = "document_export_profiles"

    key: Mapped[str] = mapped_column(String(100), nullable=False, unique=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    format: Mapped[str | None] = mapped_column(String(50), nullable=True)
    options: Mapped[dict[str, Any] | None] = mapped_column(JSONB, nullable=True)
    meta: Mapped[dict[str, Any] | None] = mapped_column("metadata", JSONB, nullable=True)


class ModuleDocumentBinding(UUIDBase):
    """Binds a module to one or more document templates."""

    __tablename__ = "module_document_bindings"
    __table_args__ = (
        UniqueConstraint(
            "tenant_id",
            "module_key",
            "template_id",
            name="uq_module_document_bindings_tenant_module_template",
        ),
    )

    tenant_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("tenants.id", ondelete="CASCADE"),
        nullable=True,
        index=True,
    )
    module_key: Mapped[str] = mapped_column(String(100), nullable=False)
    template_id: Mapped[str] = mapped_column(
        String(255),
        ForeignKey("document_templates.id", ondelete="CASCADE"),
        nullable=False,
    )
    is_default: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default="false"
    )
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")
    meta: Mapped[dict[str, Any] | None] = mapped_column("metadata", JSONB, nullable=True)


class GenerationProfile(UUIDBase):
    """Per-tenant generation defaults (one row per tenant)."""

    __tablename__ = "generation_profiles"
    __table_args__ = (
        UniqueConstraint("tenant_id", name="uq_generation_profiles_tenant"),
    )

    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("tenants.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    brand_voice: Mapped[str] = mapped_column(
        String(50),
        nullable=False,
        default="formal_consultative",
        server_default="formal_consultative",
    )
    reading_level: Mapped[str] = mapped_column(
        String(50), nullable=False, default="manager", server_default="manager"
    )
    default_export_profile_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("document_export_profiles.id", ondelete="SET NULL"),
        nullable=True,
    )
    meta: Mapped[dict[str, Any] | None] = mapped_column("metadata", JSONB, nullable=True)


class GeneratedDocument(UUIDBase):
    """Persisted AI-generated document snapshot."""

    __tablename__ = "generated_documents"

    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("tenants.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    template_id: Mapped[str | None] = mapped_column(
        String(255),
        ForeignKey("document_templates.id", ondelete="SET NULL"),
        nullable=True,
    )
    document_type_key: Mapped[str | None] = mapped_column(
        String(100),
        ForeignKey("document_types.key"),  # NO ACTION
        nullable=True,
    )
    category_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("document_categories.id", ondelete="SET NULL"),
        nullable=True,
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    status: Mapped[str] = mapped_column(
        String(50), nullable=False, default="draft", server_default="draft"
    )
    ir_snapshot: Mapped[dict[str, Any] | None] = mapped_column(JSONB, nullable=True)
    context_payload: Mapped[dict[str, Any] | None] = mapped_column(JSONB, nullable=True)
    framework_snapshot: Mapped[dict[str, Any] | None] = mapped_column(JSONB, nullable=True)
    ai_provider: Mapped[str] = mapped_column(
        String(50), nullable=False, default="noop", server_default="noop"
    )
    ai_provenance: Mapped[dict[str, Any] | None] = mapped_column(JSONB, nullable=True)
    version: Mapped[int] = mapped_column(Integer, nullable=False, default=1, server_default="1")
    created_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )
    meta: Mapped[dict[str, Any] | None] = mapped_column("metadata", JSONB, nullable=True)


class GeneratedDocumentSectionOverride(UUIDBase):
    """User-edited section override for a generated document."""

    __tablename__ = "generated_document_section_overrides"
    __table_args__ = (
        UniqueConstraint(
            "document_id",
            "section_id",
            name="uq_generated_document_section_overrides_doc_section",
        ),
    )

    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("tenants.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    document_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("generated_documents.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    section_id: Mapped[str] = mapped_column(String(255), nullable=False)
    content: Mapped[dict[str, Any] | None] = mapped_column(JSONB, nullable=True)
    edited_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )
    meta: Mapped[dict[str, Any] | None] = mapped_column("metadata", JSONB, nullable=True)
