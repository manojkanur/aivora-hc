"""Simple async polling worker for HC platform exports.

Polls `hc_platform_exports` for rows with status='pending' and started_at IS NULL,
locks one at a time with FOR UPDATE SKIP LOCKED, and runs it via
`export_runner.run_export`.

Run with:
    python -m app.workers.hc_platform_export_worker
"""

from __future__ import annotations

import asyncio
import logging
import signal
import sys

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import async_session_factory as AsyncSessionLocal
from app.models.hc_platform.exports import HcExport
from app.services.hc_platform import export_runner

log = logging.getLogger(__name__)

POLL_INTERVAL_SECONDS = 2.0
_shutdown = asyncio.Event()


async def _claim_next(db: AsyncSession) -> HcExport | None:
    """Atomically claim one pending export."""
    stmt = (
        select(HcExport)
        .where(HcExport.status == "pending")
        .where(HcExport.started_at.is_(None))
        .order_by(HcExport.created_at)
        .limit(1)
        .with_for_update(skip_locked=True)
    )
    result = await db.execute(stmt)
    return result.scalar_one_or_none()


async def _process_one() -> bool:
    """Process at most one export. Returns True if work was done."""
    async with AsyncSessionLocal() as db:
        async with db.begin():
            row = await _claim_next(db)
            if row is None:
                return False
            export_id = row.id
        # Run outside the transaction that did the lock — `run_export` opens its
        # own writes via the same session. We commit per call so a crash does
        # not poison the next worker run.
        async with db.begin():
            await export_runner.run_export(db, export_id)
        return True


async def main_loop() -> None:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(name)s] %(message)s")
    log.info("hc_platform_export_worker started; poll=%.1fs", POLL_INTERVAL_SECONDS)
    while not _shutdown.is_set():
        try:
            worked = await _process_one()
        except Exception:  # noqa: BLE001 — log and keep polling.
            log.exception("export worker iteration failed")
            worked = False
        if not worked:
            try:
                await asyncio.wait_for(_shutdown.wait(), timeout=POLL_INTERVAL_SECONDS)
            except asyncio.TimeoutError:
                pass
    log.info("hc_platform_export_worker stopping")


def _install_signal_handlers() -> None:
    loop = asyncio.get_event_loop()
    for sig in (signal.SIGINT, signal.SIGTERM):
        try:
            loop.add_signal_handler(sig, _shutdown.set)
        except NotImplementedError:
            # Windows / non-main thread — fall back to ignoring.
            pass


def main() -> int:
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    _install_signal_handlers()
    try:
        loop.run_until_complete(main_loop())
    finally:
        loop.close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
