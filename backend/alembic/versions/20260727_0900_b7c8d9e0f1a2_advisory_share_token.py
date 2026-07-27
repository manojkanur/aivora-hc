"""Add public share_token + share_revoked to advisory_sessions (client #5).

Revision ID: b7c8d9e0f1a2
Revises:
Create Date: 2026-07-27 09:00:00.000000

"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "b7c8d9e0f1a2"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "advisory_sessions",
        sa.Column("share_token", sa.String(length=48), nullable=True),
    )
    op.add_column(
        "advisory_sessions",
        sa.Column(
            "share_revoked",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("false"),
        ),
    )
    op.create_index(
        "ix_advisory_sessions_share_token",
        "advisory_sessions",
        ["share_token"],
        unique=True,
    )


def downgrade() -> None:
    op.drop_index("ix_advisory_sessions_share_token", table_name="advisory_sessions")
    op.drop_column("advisory_sessions", "share_revoked")
    op.drop_column("advisory_sessions", "share_token")
