from collections.abc import Iterator
from typing import Annotated
from uuid import UUID

import httpx
from fastapi import Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.core.config import get_settings

bearer = HTTPBearer(auto_error=False)


def get_supabase_client(
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer)],
) -> Iterator[httpx.Client]:
    if credentials is None or credentials.scheme.lower() != "bearer":
        raise HTTPException(401, "Accesso richiesto.", headers={"WWW-Authenticate": "Bearer"})

    settings = get_settings()
    if not settings.supabase_url or not settings.supabase_publishable_key:
        raise HTTPException(503, "Configurare SUPABASE_URL e SUPABASE_PUBLISHABLE_KEY nel backend.")

    # Un client per richiesta: il token di un utente non viene condiviso con altri.
    with httpx.Client(
        base_url=settings.supabase_url.rstrip("/"),
        headers={
            "apikey": settings.supabase_publishable_key.get_secret_value(),
            "Authorization": f"Bearer {credentials.credentials}",
        },
        timeout=10,
    ) as client:
        yield client


def get_current_user_id(client: Annotated[httpx.Client, Depends(get_supabase_client)]) -> UUID:
    try:
        response = client.get("/auth/v1/user")
        if response.status_code in (401, 403):
            raise HTTPException(
                401, "Sessione non valida o scaduta.", headers={"WWW-Authenticate": "Bearer"}
            )
        response.raise_for_status()
        return UUID(response.json()["id"])
    except (httpx.HTTPError, ValueError, KeyError, TypeError) as error:
        raise HTTPException(503, "Impossibile verificare l'utente con Supabase.") from error
