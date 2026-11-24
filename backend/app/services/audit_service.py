import logging
from sqlalchemy.ext.asyncio import AsyncSession
from app.models.audit_log import AuditLog

logger = logging.getLogger(__name__)


async def create_audit_log(
    db: AsyncSession,
    action: str,
    entity_type: str,
    description: str,
    user_id: int | None = None,
    entity_id: int | None = None,
    ip_address: str | None = None,
) -> AuditLog | None:
    """Record an audit log entry within the caller's database session/transaction.
    
    Safe failure design: If logging encounters an unexpected exception, it logs an
    error without raising, so business operations are not compromised.
    """
    try:
        # Sanitization: Truncate description and fields to fit column sizes
        safe_action = (action or "")[:100]
        safe_entity_type = (entity_type or "")[:50]
        safe_description = (description or "")[:500]
        safe_ip = (ip_address or "")[:45] if ip_address else None

        log_entry = AuditLog(
            user_id=user_id,
            action=safe_action,
            entity_type=safe_entity_type,
            entity_id=entity_id,
            description=safe_description,
            ip_address=safe_ip,
        )
        db.add(log_entry)
        await db.flush()  # Ensures entity gets an ID and validates constraints within the existing transaction
        return log_entry
    except Exception as exc:
        logger.error(f"Failed to create audit log for action '{action}' on entity '{entity_type}': {exc}", exc_info=True)
        return None
