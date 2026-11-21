from uuid import UUID

import httpx


def get_profile(client: httpx.Client, user_id: UUID) -> dict | None:
    response = client.get(
        "/rest/v1/operator_profiles",
        params={"id": f"eq.{user_id}", "select": "id,created_at,name", "limit": "1"},
    )
    response.raise_for_status()
    profiles = response.json()
    return profiles[0] if profiles else None


def list_locations(
    client: httpx.Client, user_id: UUID, location_id: UUID | None = None
) -> list[dict]:
    params = {"operator_id": f"eq.{user_id}", "select": "location:locations(id,name)"}
    if location_id is not None:
        params["location_id"] = f"eq.{location_id}"
    response = client.get("/rest/v1/operator_locations", params=params)
    response.raise_for_status()
    return sorted(
        [row["location"] for row in response.json() if row.get("location")],
        key=lambda location: location["name"].casefold(),
    )
