"""HC platform projects router."""

from __future__ import annotations

import uuid
from datetime import datetime

from fastapi import APIRouter, HTTPException, Query, status
from pydantic import BaseModel, ConfigDict
from sqlalchemy import select

from app.api.deps import CurrentTenant, CurrentUser, DBDep
from app.models.hc_platform.projects import Project
from app.services.audit import log_event

router = APIRouter()


# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------


class ProjectCreate(BaseModel):
    name: str
    description: str | None = None
    industry: str | None = None
    company_size: str | None = None
    region: str | None = None


class ProjectUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    status: str | None = None
    industry: str | None = None
    company_size: str | None = None
    region: str | None = None


class ProjectRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    tenant_id: uuid.UUID
    name: str
    description: str | None = None
    status: str
    industry: str | None = None
    company_size: str | None = None
    region: str | None = None
    created_at: datetime
    updated_at: datetime


async def _audit(tenant_id: uuid.UUID, user_id: uuid.UUID, action: str, payload: dict) -> None:
    try:
        await log_event(tenant_id=tenant_id, user_id=user_id, action=action, payload=payload)
    except Exception:
        pass


@router.post("", response_model=ProjectRead, status_code=status.HTTP_201_CREATED)
async def create_project(
    payload: ProjectCreate,
    current_user: CurrentUser,
    current_tenant: CurrentTenant,
    db: DBDep,
) -> ProjectRead:
    project = Project(
        tenant_id=current_tenant.id,
        name=payload.name,
        description=payload.description,
        industry=payload.industry,
        company_size=payload.company_size,
        region=payload.region,
        created_by=current_user.id,
    )
    db.add(project)
    await db.flush()
    await db.refresh(project)
    await _audit(
        current_tenant.id,
        current_user.id,
        "hc_platform.projects.create",
        {"project_id": str(project.id)},
    )
    return ProjectRead.model_validate(project)


@router.get("", response_model=list[ProjectRead])
async def list_projects(
    current_tenant: CurrentTenant,
    db: DBDep,
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    status_filter: str | None = Query(None, alias="status"),
) -> list[ProjectRead]:
    stmt = select(Project).where(Project.tenant_id == current_tenant.id)
    if status_filter:
        stmt = stmt.where(Project.status == status_filter)
    stmt = stmt.order_by(Project.created_at.desc()).offset(skip).limit(limit)
    rows = (await db.execute(stmt)).scalars().all()
    return [ProjectRead.model_validate(r) for r in rows]


@router.get("/{project_id}", response_model=ProjectRead)
async def get_project(
    project_id: uuid.UUID,
    current_tenant: CurrentTenant,
    db: DBDep,
) -> ProjectRead:
    stmt = select(Project).where(
        Project.id == project_id, Project.tenant_id == current_tenant.id
    )
    project = (await db.execute(stmt)).scalar_one_or_none()
    if project is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")
    return ProjectRead.model_validate(project)


@router.patch("/{project_id}", response_model=ProjectRead)
async def update_project(
    project_id: uuid.UUID,
    payload: ProjectUpdate,
    current_user: CurrentUser,
    current_tenant: CurrentTenant,
    db: DBDep,
) -> ProjectRead:
    stmt = select(Project).where(
        Project.id == project_id, Project.tenant_id == current_tenant.id
    )
    project = (await db.execute(stmt)).scalar_one_or_none()
    if project is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")
    data = payload.model_dump(exclude_unset=True)
    for k, v in data.items():
        setattr(project, k, v)
    await db.flush()
    await db.refresh(project)
    await _audit(
        current_tenant.id,
        current_user.id,
        "hc_platform.projects.update",
        {"project_id": str(project.id), "fields": list(data.keys())},
    )
    return ProjectRead.model_validate(project)


@router.delete("/{project_id}", status_code=status.HTTP_200_OK)
async def archive_project(
    project_id: uuid.UUID,
    current_user: CurrentUser,
    current_tenant: CurrentTenant,
    db: DBDep,
) -> dict[str, str]:
    stmt = select(Project).where(
        Project.id == project_id, Project.tenant_id == current_tenant.id
    )
    project = (await db.execute(stmt)).scalar_one_or_none()
    if project is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")
    project.status = "archived"
    await db.flush()
    await _audit(
        current_tenant.id,
        current_user.id,
        "hc_platform.projects.archive",
        {"project_id": str(project.id)},
    )
    return {"status": "archived", "project_id": str(project.id)}
