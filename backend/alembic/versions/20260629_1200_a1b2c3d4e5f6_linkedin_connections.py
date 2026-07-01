"""Create linkedin_connections table.

Revision ID: a1b2c3d4e5f6
Revises:
Create Date: 2026-06-29 12:00:00.000000

"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision = "a1b2c3d4e5f6"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "linkedin_connections",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
            nullable=False,
        ),
        sa.Column("tenant_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("linkedin_user_id", sa.Text(), nullable=False),
        sa.Column("access_token", sa.Text(), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("scope", sa.Text(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.UniqueConstraint(
            "tenant_id", "user_id", name="uq_linkedin_connections_tenant_user"
        ),
    )
    op.create_index(
        "ix_linkedin_connections_tenant_id",
        "linkedin_connections",
        ["tenant_id"],
    )
    op.create_index(
        "ix_linkedin_connections_user_id",
        "linkedin_connections",
        ["user_id"],
    )
    op.create_index(
        "ix_linkedin_connections_id",
        "linkedin_connections",
        ["id"],
    )


def downgrade() -> None:
    op.drop_index("ix_linkedin_connections_id", table_name="linkedin_connections")
    op.drop_index("ix_linkedin_connections_user_id", table_name="linkedin_connections")
    op.drop_index("ix_linkedin_connections_tenant_id", table_name="linkedin_connections")
    op.drop_table("linkedin_connections")
