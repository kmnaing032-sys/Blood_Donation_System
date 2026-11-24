from fastapi import APIRouter

from app.api.v1.endpoints import (
    health,
    auth,
    users,
    donors,
    donations,
    blood_stock,
    blood_requests,
    dashboard,
    notifications,
    audit_logs,
    reports,
    system_settings,
    database_backups,
    email_preferences,
    data_imports,
)


api_router = APIRouter()

api_router.include_router(health.router)
api_router.include_router(auth.router)
api_router.include_router(users.router)
api_router.include_router(donors.router)
api_router.include_router(donations.router)
api_router.include_router(blood_stock.router)
api_router.include_router(blood_requests.router)
api_router.include_router(dashboard.router)
api_router.include_router(notifications.router)
api_router.include_router(audit_logs.router)
api_router.include_router(reports.router)
api_router.include_router(system_settings.router)
api_router.include_router(database_backups.router)
api_router.include_router(email_preferences.router)
api_router.include_router(data_imports.router)
