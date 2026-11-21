import json
from uuid import UUID

import httpx
import pytest
from fastapi.testclient import TestClient

from app.core.config import get_settings
from app.main import create_app

USER_ID = "10000000-0000-0000-0000-000000000001"
LOCATION_A = "20000000-0000-0000-0000-000000000001"
LOCATION_B = "20000000-0000-0000-0000-000000000002"
UNASSIGNED_LOCATION = "20000000-0000-0000-0000-000000000003"
PROFILE = {"id": USER_ID, "created_at": "2026-11-10T10:00:00Z", "name": "Banco"}
HEADERS = {"Authorization": "Bearer valid-token"}


@pytest.fixture
def api(monkeypatch):
    monkeypatch.setenv("SUPABASE_URL", "https://supabase.example.test")
    monkeypatch.setenv("SUPABASE_PUBLISHABLE_KEY", "test-publishable-key")
    get_settings.cache_clear()
    state = {"profile": PROFILE, "locations": [LOCATION_A, LOCATION_B], "requests": []}

    def respond(request: httpx.Request):
        state["requests"].append(request)
        if state.get("unavailable"):
            raise httpx.ConnectError("Test connection failure", request=request)
        assert request.headers["apikey"] == "test-publishable-key"
        if request.headers["Authorization"] != "Bearer valid-token":
            return httpx.Response(401, json={"message": "Invalid token"})
        if request.url.path == "/auth/v1/user":
            return httpx.Response(200, json={"id": USER_ID})
        if request.url.path == "/rest/v1/operator_profiles":
            assert request.url.params["id"] == f"eq.{USER_ID}"
            return httpx.Response(200, json=[state["profile"]] if state["profile"] else [])
        if request.url.path == "/rest/v1/operator_locations":
            assert request.url.params["operator_id"] == f"eq.{USER_ID}"
            requested_id = request.url.params.get("location_id")
            return httpx.Response(
                200,
                json=[
                    {"location": {"id": identifier, "name": f"Sede {identifier[-1]}"}}
                    for identifier in state["locations"]
                    if requested_id is None or requested_id == f"eq.{identifier}"
                ],
            )
        if request.url.path == "/rest/v1/material_categories":
            if state.get("migration_missing"):
                return httpx.Response(400, json={"code": "42703"})
            rows = state.get("categories", [])
            offset = int(request.url.params["offset"])
            return httpx.Response(200, json=rows[offset:offset + 500])
        if request.url.path in ("/rest/v1/material_groups", "/rest/v1/material_variants"):
            assert request.url.params["is_active"] == "eq.true"
            key = "groups" if request.url.path.endswith("material_groups") else "variants"
            offset = int(request.url.params["offset"])
            return httpx.Response(200, json=state.get(key, [])[offset:offset + 500])
        if request.url.path == "/rest/v1/rpc/skirenting_create_rental_item":
            assert request.method == "POST"
            body = json.loads(request.content)
            assert body["p_location_id"] == LOCATION_A
            if state.get("rpc_error"):
                return httpx.Response(400, json={"code": state["rpc_error"]})
            return httpx.Response(200, json={
                "id": USER_ID, "category_id": LOCATION_A, "group_id": LOCATION_A,
                "variant_id": LOCATION_A, "code": body["p_data"]["code"],
            })
        if request.url.path == "/rest/v1/rental_inventory":
            assert request.url.params["location_id"] == f"eq.{LOCATION_A}"
            assert request.url.params["order"] == "id"
            if state.get("inventory_unavailable"):
                return httpx.Response(503, json={"message": "Database unavailable"})
            offset = int(request.url.params["offset"])
            # Simulate a configured Supabase cap smaller than the requested page.
            page_size = min(int(request.url.params["limit"]), 300)
            return httpx.Response(200, json=state.get("items", [])[offset:offset + page_size])
        raise AssertionError(f"Unexpected request: {request.url}")

    original_client = httpx.Client

    def client_with_transport(*args, **kwargs):
        return original_client(*args, **kwargs, transport=httpx.MockTransport(respond))

    monkeypatch.setattr("app.dependencies.auth.httpx.Client", client_with_transport)
    with TestClient(create_app()) as client:
        yield client, state
    get_settings.cache_clear()


def test_missing_token_is_rejected_before_supabase(api):
    client, state = api
    response = client.get("/api/v1/me")
    assert response.status_code == 401
    assert response.headers["www-authenticate"] == "Bearer"
    assert not state["requests"]


def test_invalid_token_cannot_read_profile(api):
    client, state = api
    response = client.get("/api/v1/me", headers={"Authorization": "Bearer invalid"})
    assert response.status_code == 401
    assert [request.url.path for request in state["requests"]] == ["/auth/v1/user"]


def test_profile_and_assigned_locations(api):
    client, _ = api
    response = client.get("/api/v1/me", headers=HEADERS)
    assert response.status_code == 200
    assert response.json()["profile"]["id"] == USER_ID
    assert {location["id"] for location in response.json()["locations"]} == {LOCATION_A, LOCATION_B}


@pytest.mark.parametrize("location_id", [LOCATION_A, LOCATION_B])
def test_both_assigned_locations_are_accessible(api, location_id):
    client, _ = api
    response = client.get(f"/api/v1/me/locations/{location_id}", headers=HEADERS)
    assert response.status_code == 200
    assert UUID(response.json()["id"]) == UUID(location_id)


def test_modified_location_id_is_rejected(api):
    client, _ = api
    response = client.get(f"/api/v1/me/locations/{UNASSIGNED_LOCATION}", headers=HEADERS)
    assert response.status_code == 403


def test_membership_is_checked_again_when_switching(api):
    client, state = api
    assert client.get("/api/v1/me", headers=HEADERS).status_code == 200
    state["locations"] = [LOCATION_A]
    response = client.get(f"/api/v1/me/locations/{LOCATION_B}", headers=HEADERS)
    assert response.status_code == 403


@pytest.mark.parametrize("missing", ["profile", "locations"])
def test_unconfigured_operator_is_rejected(api, missing):
    client, state = api
    state[missing] = None if missing == "profile" else []
    assert client.get("/api/v1/me", headers=HEADERS).status_code == 403


def test_missing_configuration_is_reported(api, monkeypatch):
    client, state = api
    monkeypatch.setenv("SUPABASE_URL", "")
    get_settings.cache_clear()
    assert client.get("/api/v1/me", headers=HEADERS).status_code == 503
    assert not state["requests"]


def test_health_remains_public(api):
    client, _ = api
    assert client.get("/api/v1/health").json() == {"status": "ok"}


def test_supabase_unavailable_does_not_open_access(api):
    client, state = api
    state["unavailable"] = True
    response = client.get("/api/v1/me", headers=HEADERS)
    assert response.status_code == 503


def rental_item(index):
    return {
        "id": str(UUID(int=index + 1)), "code": f"+0{index}", "status": "active",
        "is_rentable": True, "is_bookable": True,
        "group": {"id": LOCATION_A, "name": "RACE"},
        "variant": {
            "id": LOCATION_A, "brand": "Brand", "model": "Model", "year": 2025,
            "category": {"id": LOCATION_A, "code": "ski", "name": "Sci"},
            "ski_details": {"length_cm": 164, "radius_m": None, "style": None},
        },
    }


def test_rental_inventory_reads_all_1305_items_despite_supabase_row_cap(api):
    client, state = api
    state["items"] = [rental_item(index) for index in range(1305)]
    response = client.get(f"/api/v1/locations/{LOCATION_A}/rental-inventory", headers=HEADERS)
    assert response.status_code == 200
    items = response.json()["items"]
    assert len(items) == 1305
    assert len({item["id"] for item in items}) == 1305
    assert items[0]["code"] == "+00"
    assert items[-1]["variant"]["ski_details"]["length_cm"] == 164
    requests = [r for r in state["requests"] if r.url.path.endswith("rental_inventory")]
    assert [r.url.params["offset"] for r in requests] == ["0", "300", "600", "900", "1200", "1305"]


def test_rental_inventory_rejects_unassigned_site_before_reading_materials(api):
    client, state = api
    response = client.get(
        f"/api/v1/locations/{UNASSIGNED_LOCATION}/rental-inventory", headers=HEADERS,
    )
    assert response.status_code == 403
    assert not any("material" in r.url.path or "inventory" in r.url.path for r in state["requests"])


def test_rental_inventory_rechecks_revoked_access(api):
    client, state = api
    state["locations"] = [LOCATION_B]
    response = client.get(f"/api/v1/locations/{LOCATION_A}/rental-inventory", headers=HEADERS)
    assert response.status_code == 403


def test_rental_inventory_requires_login(api):
    client, state = api
    assert client.get(f"/api/v1/locations/{LOCATION_A}/rental-inventory").status_code == 401
    assert not state["requests"]


def test_rental_inventory_empty_does_not_return_demo_items(api):
    client, _ = api
    response = client.get(f"/api/v1/locations/{LOCATION_A}/rental-inventory", headers=HEADERS)
    assert response.status_code == 200
    assert response.json() == {"categories": [], "items": []}


def test_rental_inventory_database_error(api):
    client, state = api
    state["inventory_unavailable"] = True
    response = client.get(f"/api/v1/locations/{LOCATION_A}/rental-inventory", headers=HEADERS)
    assert response.status_code == 503


CREATE_DATA = {
    "category_id": LOCATION_A, "group_id": LOCATION_A, "variant_id": LOCATION_A,
    "code": "+0001", "purchase_price": 120.5,
}


def test_catalog_contains_existing_groups_and_variants(api):
    client, state = api
    state["categories"] = [{"id": LOCATION_A, "code": "ski", "name": "Sci", "detail_type": "ski"}]
    state["groups"] = [{"id": LOCATION_A, "category_id": LOCATION_A, "name": "RACE"}]
    state["variants"] = [rental_item(0)["variant"]]
    response = client.get(f"/api/v1/locations/{LOCATION_A}/rental-catalog", headers=HEADERS)
    assert response.status_code == 200
    assert response.json()["groups"][0]["name"] == "RACE"
    assert response.json()["variants"][0]["brand"] == "Brand"


def test_create_rental_item_uses_authenticated_atomic_rpc(api):
    client, state = api
    response = client.post(f"/api/v1/locations/{LOCATION_A}/rental-inventory",
                           headers=HEADERS, json=CREATE_DATA)
    assert response.status_code == 201
    assert response.json()["code"] == "+0001"
    requests = [r for r in state["requests"] if r.method == "POST"]
    assert len(requests) == 1
    assert requests[0].url.path == "/rest/v1/rpc/skirenting_create_rental_item"


@pytest.mark.parametrize("field,value", [
    ("code", "  "), ("purchase_price", -1), ("variant_id", None),
    ("new_group", "Conflicting new group"), ("source_file", "forbidden.pdf"),
])
def test_create_rental_item_rejects_invalid_payload(api, field, value):
    client, state = api
    response = client.post(f"/api/v1/locations/{LOCATION_A}/rental-inventory",
                           headers=HEADERS, json={**CREATE_DATA, field: value})
    assert response.status_code == 422
    assert not any(r.method == "POST" for r in state["requests"])


@pytest.mark.parametrize("code,status", [("23505", 409), ("42501", 403),
                                        ("22023", 422), ("PGRST202", 503)])
def test_create_rental_item_translates_database_errors(api, code, status):
    client, state = api
    state["rpc_error"] = code
    response = client.post(f"/api/v1/locations/{LOCATION_A}/rental-inventory",
                           headers=HEADERS, json=CREATE_DATA)
    assert response.status_code == status
    if code == "PGRST202":
        assert "005_create_rental_item.sql" in response.json()["detail"]


def test_create_cannot_write_to_unassigned_site(api):
    client, state = api
    response = client.post(f"/api/v1/locations/{UNASSIGNED_LOCATION}/rental-inventory",
                           headers=HEADERS, json=CREATE_DATA)
    assert response.status_code == 403
    assert not any(r.method == "POST" for r in state["requests"])


def test_catalog_reports_missing_migration(api):
    client, state = api
    state["migration_missing"] = True
    response = client.get(f"/api/v1/locations/{LOCATION_A}/rental-catalog", headers=HEADERS)
    assert response.status_code == 503
    assert "005_create_rental_item.sql" in response.json()["detail"]
