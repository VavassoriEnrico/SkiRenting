from fastapi import APIRouter

from app.api.routers import health, operator, rental_inventory

api_router = APIRouter()
api_router.include_router(health.router)
api_router.include_router(operator.router)
api_router.include_router(rental_inventory.router)
