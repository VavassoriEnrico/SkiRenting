from uuid import UUID

import httpx
from fastapi import HTTPException

from app.repositories import operator_repository
from app.schemas.operator import LocationRead, OperatorSessionRead


def get_operator_session(client: httpx.Client, user_id: UUID) -> OperatorSessionRead:
    try:
        profile = operator_repository.get_profile(client, user_id)
        if profile is None:
            raise HTTPException(403, "Profilo operatore non configurato. Contatta il responsabile.")
        locations = operator_repository.list_locations(client, user_id)
        if not locations:
            raise HTTPException(403, "Nessuna sede autorizzata. Contatta il responsabile.")
        return OperatorSessionRead(profile=profile, locations=locations)
    except httpx.HTTPError as error:
        raise HTTPException(503, "Impossibile caricare profilo e sedi da Supabase.") from error


def get_authorized_location(client: httpx.Client, user_id: UUID, location_id: UUID) -> LocationRead:
    try:
        if operator_repository.get_profile(client, user_id) is None:
            raise HTTPException(403, "Profilo operatore non configurato.")
        locations = operator_repository.list_locations(client, user_id, location_id)
        if not locations:
            raise HTTPException(403, "Non sei autorizzato ad accedere a questa sede.")
        return LocationRead(**locations[0])
    except httpx.HTTPError as error:
        raise HTTPException(503, "Impossibile verificare l'accesso alla sede.") from error
