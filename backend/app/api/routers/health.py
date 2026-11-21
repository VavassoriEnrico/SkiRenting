from fastapi import APIRouter

from app.schemas.health import HealthRead

router = APIRouter(prefix="/health", tags=["health"])


@router.get("", response_model=HealthRead)
def health() -> HealthRead:
    """Verifica che l'API risponda, senza contattare database o servizi esterni."""
    return HealthRead(status="ok")
