"""add pr analysis locking and status fields

Revision ID: c5e4d3b2a101
Revises: 984f13d2acfe
Create Date: 2026-08-31 12:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = 'c5e4d3b2a101'
down_revision: Union[str, None] = '984f13d2acfe'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Create enum type for analysis status
    analysisstatus = postgresql.ENUM(
        'PENDING', 'PROCESSING', 'COMPLETED', 'FAILED',
        name='analysisstatus',
        create_type=True,
    )
    analysisstatus.create(op.get_bind(), checkfirst=True)

    # Add columns to pull_requests
    op.add_column(
        'pull_requests',
        sa.Column(
            'analysis_status',
            sa.Enum('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED', name='analysisstatus'),
            server_default='PENDING',
            nullable=False,
        ),
    )
    op.add_column(
        'pull_requests',
        sa.Column(
            'is_locked',
            sa.Boolean(),
            server_default=sa.text('false'),
            nullable=False,
        ),
    )
    op.add_column(
        'pull_requests',
        sa.Column(
            'locked_at',
            sa.DateTime(timezone=True),
            nullable=True,
        ),
    )
    op.add_column(
        'pull_requests',
        sa.Column(
            'locked_by',
            sa.String(length=255),
            nullable=True,
        ),
    )

    # Add composite index for efficient worker lock querying
    op.create_index(
        'ix_pr_repo_lock_status',
        'pull_requests',
        ['repository_id', 'is_locked', 'analysis_status'],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index('ix_pr_repo_lock_status', table_name='pull_requests')
    op.drop_column('pull_requests', 'locked_by')
    op.drop_column('pull_requests', 'locked_at')
    op.drop_column('pull_requests', 'is_locked')
    op.drop_column('pull_requests', 'analysis_status')

    # Drop enum type
    analysisstatus = postgresql.ENUM(
        'PENDING', 'PROCESSING', 'COMPLETED', 'FAILED',
        name='analysisstatus',
    )
    analysisstatus.drop(op.get_bind(), checkfirst=True)
