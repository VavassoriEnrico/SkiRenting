from fastapi import APIRouter

from app.api.routers import customers, health, hotels, operator, rental_bookings, rental_inventory, rental_quote, rental_rates

api_router = APIRouter()
api_router.include_router(health.router)
api_router.include_router(operator.router)
api_router.include_router(rental_inventory.router)
api_router.include_router(customers.router)
api_router.include_router(hotels.router)
api_router.include_router(rental_rates.router)
api_router.include_router(rental_quote.router)
api_router.include_router(rental_bookings.router)
