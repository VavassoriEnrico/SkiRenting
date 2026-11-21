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
        if request.url.path == "/rest/v1/rpc/skirenting_transfer_rental_item":
            assert request.method == "POST"
            body = json.loads(request.content)
            assert body["p_source_location_id"] == LOCATION_A
            assert body["p_target_location_id"] == LOCATION_B
            if state.get("transfer_error"):
                return httpx.Response(400, json={"code": state["transfer_error"]})
            return httpx.Response(200, json={
                "id": body["p_item_id"], "code": "+001", "from_location_id": LOCATION_A,
                "to_location_id": LOCATION_B,
            })
        if request.url.path == "/rest/v1/rental_rates":
            if state.get("rate_error"):
                return httpx.Response(400, json={"code": state["rate_error"]})
            rates = state.setdefault("rates", [])
            if request.method == "PATCH":
                assert request.headers["prefer"] == "return=representation"
                matches = [r for r in rates if request.url.params["id"] == f"eq.{r['id']}"]
                for rate in matches:
                    rate.update(json.loads(request.content))
                return httpx.Response(200, json=matches)
            assert request.url.params["group.is_active"] == "eq.true"
            assert "!inner" in request.url.params["select"]
            offset = int(request.url.params["offset"])
            return httpx.Response(200, json=rates[offset:offset + 300])
        if request.url.path == "/rest/v1/hotels":
            assert request.url.params["select"] == "id,name,is_active,discount"
            if state.get("hotel_error"):
                return httpx.Response(400, json={"code": state["hotel_error"]})
            rows = state.setdefault("hotels", [])
            if request.method == "POST":
                assert request.headers["prefer"] == "return=representation"
                body = json.loads(request.content)
                assert set(body) == {"name", "discount"}
                if any(h["name"].casefold() == body["name"].casefold() for h in rows):
                    return httpx.Response(409, json={"code": "23505"})
                hotel = {"id": str(UUID(int=9000 + len(rows))), "name": body["name"], "is_active": True, "discount": body["discount"]}
                rows.append(hotel)
                return httpx.Response(201, json=[hotel])
            if request.method == "PATCH":
                body = json.loads(request.content)
                assert set(body) in ({"is_active"}, {"discount"}, {"is_active", "discount"})
                found = [h for h in rows if request.url.params["id"] == f"eq.{h['id']}"
                         and (request.url.params.get("is_active") != "eq.true" or h["is_active"])]
                for hotel in found:
                    hotel.update(body)
                return httpx.Response(200, json=found)
            assert request.method == "GET"
            if "is_active" in request.url.params:
                assert request.url.params["is_active"] == "eq.true"
                rows = [h for h in rows if h["is_active"]]
            offset = int(request.url.params["offset"])
            return httpx.Response(200, json=rows[offset:offset + 300])
        if request.url.path == "/rest/v1/customers":
            assert request.url.params["select"] == "id,first_name,last_name,email,phone,notes"
            assert "location_id" not in request.url.params
            if state.get("customer_error"):
                return httpx.Response(400, json={"code": state["customer_error"]})
            if request.method == "POST":
                assert request.headers["prefer"] == "return=representation"
                data = json.loads(request.content)
                customer = {"id": USER_ID, **data}
                state.setdefault("customers", []).append(customer)
                return httpx.Response(201, json=[customer])
            assert request.url.params["order"] == "last_name,first_name,id"
            offset = int(request.url.params["offset"])
            size = min(int(request.url.params["limit"]), 300)
            return httpx.Response(200, json=state.get("customers", [])[offset:offset + size])
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



def test_customer_list_loads_every_page_and_excludes_document_data(api):
    client, state = api
    state["customers"] = [
        {"id": str(UUID(int=index + 1)), "first_name": "Mario", "last_name": "Rossi",
         "email": None, "phone": "+39 00123", "notes": "Nota", "document_path": "private.jpg"}
        for index in range(1005)
    ]
    response = client.get("/api/v1/customers", headers=HEADERS)
    assert response.status_code == 200
    assert len(response.json()) == 1005
    assert response.json()[0]["phone"] == "+39 00123"
    assert "document_path" not in response.json()[0]
    requests = [r for r in state["requests"] if r.url.path == "/rest/v1/customers"]
    assert [r.url.params["offset"] for r in requests] == ["0", "300", "600", "900", "1005"]


def test_customer_list_empty_returns_no_samples(api):
    client, _ = api
    assert client.get("/api/v1/customers", headers=HEADERS).json() == []


def test_customer_list_requires_login(api):
    client, state = api
    assert client.get("/api/v1/customers").status_code == 401
    assert not state["requests"]


@pytest.mark.parametrize("missing", ["profile", "locations"])
def test_customer_list_requires_configured_operator(api, missing):
    client, state = api
    state[missing] = None if missing == "profile" else []
    assert client.get("/api/v1/customers", headers=HEADERS).status_code == 403
    assert not any(r.url.path == "/rest/v1/customers" for r in state["requests"])


@pytest.mark.parametrize("code", ["PGRST205", "42P01", "XX000"])
def test_customer_list_database_failure_is_not_an_empty_list(api, code):
    client, state = api
    state["customer_error"] = code
    response = client.get("/api/v1/customers", headers=HEADERS)
    assert response.status_code == 503
    if code != "XX000":
        assert "006_customers.sql" in response.json()["detail"]


NEW_CUSTOMER = {"first_name": " Mario ", "last_name": " Rossi ",
                "email": " mario@example.test ", "phone": "+39 001234", "notes": " Nota "}


def test_customer_create_and_directory_read(api):
    client, _ = api
    response = client.post("/api/v1/customers", headers=HEADERS, json=NEW_CUSTOMER)
    assert response.status_code == 201
    assert response.json() == {
        "id": USER_ID, "first_name": "Mario", "last_name": "Rossi",
        "email": "mario@example.test", "phone": "+39 001234", "notes": "Nota",
    }
    assert client.get("/api/v1/customers", headers=HEADERS).json() == [response.json()]


def test_customer_create_optional_values_and_homonyms(api):
    client, _ = api
    for _ in range(2):
        response = client.post("/api/v1/customers", headers=HEADERS, json={
            "first_name": "Mario", "last_name": "Rossi", "email": " ", "phone": "", "notes": "",
        })
        assert response.status_code == 201
        assert response.json()["email"] is None
        assert response.json()["phone"] is None
        assert response.json()["notes"] is None


@pytest.mark.parametrize("field,value", [
    ("first_name", " "), ("last_name", ""), ("email", "invalid-email"),
    ("hotel", "Albergo"), ("id", USER_ID), ("document_path", "unverified.jpg"),
])
def test_customer_create_validates_fields(api, field, value):
    client, state = api
    response = client.post("/api/v1/customers", headers=HEADERS,
                           json={**NEW_CUSTOMER, field: value})
    assert response.status_code == 422
    assert not any(r.method == "POST" for r in state["requests"])


def test_customer_create_requires_login(api):
    client, state = api
    assert client.post("/api/v1/customers", json=NEW_CUSTOMER).status_code == 401
    assert not state["requests"]


@pytest.mark.parametrize("missing", ["profile", "locations"])
def test_customer_create_requires_configured_operator(api, missing):
    client, state = api
    state[missing] = None if missing == "profile" else []
    response = client.post("/api/v1/customers", headers=HEADERS, json=NEW_CUSTOMER)
    assert response.status_code == 403
    assert not any(r.method == "POST" for r in state["requests"])


@pytest.mark.parametrize("code,status", [("PGRST205", 503), ("42501", 403),
                                        ("23514", 422), ("XX000", 503)])
def test_customer_create_database_errors(api, code, status):
    client, state = api
    state["customer_error"] = code
    response = client.post("/api/v1/customers", headers=HEADERS, json=NEW_CUSTOMER)
    assert response.status_code == status
    assert "id" not in response.json()



def test_hotel_create_remove_and_restore_preserves_id(api):
    client, state = api
    response = client.post("/api/v1/hotels", headers=HEADERS, json={"name": " Hotel Test "})
    assert response.status_code == 201
    hotel = response.json()
    assert hotel["name"] == "Hotel Test"
    assert client.get("/api/v1/hotels", headers=HEADERS).json() == [hotel]
    assert client.delete(f"/api/v1/hotels/{hotel['id']}", headers=HEADERS).status_code == 204
    assert client.get("/api/v1/hotels", headers=HEADERS).json() == []
    assert state["hotels"][0]["is_active"] is False
    restored = client.post("/api/v1/hotels", headers=HEADERS, json={"name": "HOTEL TEST"})
    assert restored.status_code == 201
    assert restored.json()["id"] == hotel["id"]
    assert restored.json()["is_active"] is True
    assert len(state["hotels"]) == 1
    assert not any(r.method == "DELETE" for r in state["requests"])


def test_hotel_duplicate_name_is_rejected(api):
    client, _ = api
    assert client.post("/api/v1/hotels", headers=HEADERS, json={"name": "Albergo"}).status_code == 201
    assert client.post("/api/v1/hotels", headers=HEADERS, json={"name": "albergo"}).status_code == 409


@pytest.mark.parametrize("name", [" ", "X" * 201])
def test_hotel_name_validation(api, name):
    client, _ = api
    assert client.post("/api/v1/hotels", headers=HEADERS, json={"name": name}).status_code == 422


def test_hotel_list_includes_all_pages(api):
    client, state = api
    state["hotels"] = [{"id": str(UUID(int=index + 1)), "name": str(index), "is_active": True}
                       for index in range(605)]
    assert len(client.get("/api/v1/hotels", headers=HEADERS).json()) == 605


def test_hotel_removal_missing_id(api):
    client, _ = api
    assert client.delete(f"/api/v1/hotels/{LOCATION_A}", headers=HEADERS).status_code == 404


def test_hotel_routes_require_login(api):
    client, state = api
    assert client.get("/api/v1/hotels").status_code == 401
    assert client.post("/api/v1/hotels", json={"name": "Test"}).status_code == 401
    assert client.delete(f"/api/v1/hotels/{LOCATION_A}").status_code == 401
    assert not state["requests"]


@pytest.mark.parametrize("missing", ["profile", "locations"])
def test_hotel_writes_require_configured_operator(api, missing):
    client, state = api
    state[missing] = None if missing == "profile" else []
    assert client.post("/api/v1/hotels", headers=HEADERS, json={"name": "Test"}).status_code == 403
    assert client.delete(f"/api/v1/hotels/{LOCATION_A}", headers=HEADERS).status_code == 403
    assert not any(r.url.path == "/rest/v1/hotels" for r in state["requests"])


@pytest.mark.parametrize("code,status", [("42501", 403), ("PGRST205", 503), ("23505", 409)])
def test_hotel_database_errors(api, code, status):
    client, state = api
    state["hotel_error"] = code
    assert client.post("/api/v1/hotels", headers=HEADERS, json={"name": "Test"}).status_code == status



def test_hotel_create_and_edit_discount(api):
    client, _ = api
    created = client.post("/api/v1/hotels", headers=HEADERS,
                          json={"name": "Convenzionato", "discount": 15}).json()
    assert created["discount"] == 15
    response = client.patch(f"/api/v1/hotels/{created['id']}", headers=HEADERS,
                            json={"discount": 12.5})
    assert response.status_code == 200
    assert response.json()["discount"] == 12.5
    assert client.get("/api/v1/hotels", headers=HEADERS).json()[0]["discount"] == 12.5
    assert client.delete(f"/api/v1/hotels/{created['id']}", headers=HEADERS).status_code == 204
    response = client.patch(f"/api/v1/hotels/{created['id']}", headers=HEADERS,
                            json={"discount": 10})
    assert response.status_code == 404
    restored = client.post("/api/v1/hotels", headers=HEADERS,
                           json={"name": "Convenzionato", "discount": 20})
    assert restored.json()["id"] == created["id"]
    assert restored.json()["discount"] == 20


@pytest.mark.parametrize("discount", [-1, 100.01, 12.345, None, "invalid"])
def test_hotel_discount_validation(api, discount):
    client, state = api
    assert client.post("/api/v1/hotels", headers=HEADERS,
                       json={"name": "Test", "discount": discount}).status_code == 422
    assert client.patch(f"/api/v1/hotels/{LOCATION_A}", headers=HEADERS,
                        json={"discount": discount}).status_code == 422
    assert not any(r.method in ("POST", "PATCH") for r in state["requests"])


@pytest.mark.parametrize("discount", [0, 100])
def test_hotel_discount_boundaries(api, discount):
    client, _ = api
    response = client.post("/api/v1/hotels", headers=HEADERS,
                           json={"name": "Test", "discount": discount})
    assert response.status_code == 201
    assert response.json()["discount"] == discount


def test_hotel_discount_update_auth_and_scope(api):
    client, state = api
    path = f"/api/v1/hotels/{LOCATION_A}"
    assert client.patch(path, json={"discount": 15}).status_code == 401
    state["locations"] = []
    assert client.patch(path, headers=HEADERS, json={"discount": 15}).status_code == 403
    assert not any(r.method == "PATCH" for r in state["requests"])


def test_hotel_discount_missing_migration(api):
    client, state = api
    state["hotel_error"] = "42703"
    response = client.get("/api/v1/hotels", headers=HEADERS)
    assert response.status_code == 503
    assert "009" in response.json()["detail"]


RATE_PRICES = {
    "daily_price_1_day": 20, "daily_price_2_days": 18, "daily_price_3_days": 16,
    "daily_price_4_days": None, "daily_price_5_days": 0, "daily_price_6_days": 12.5,
    "daily_price_7_plus_days": 10,
}


def rate_row(index=1):
    return {
        "id": str(UUID(int=index)), "group_id": LOCATION_A, **RATE_PRICES,
        "group": {"id": LOCATION_A, "name": "RACE",
                  "category": {"id": LOCATION_A, "code": "ski", "name": "Sci"}},
    }


def test_rental_rates_list_all_pages_and_prices(api):
    client, state = api
    state["rates"] = [rate_row(index + 1) for index in range(1005)]
    response = client.get("/api/v1/rental-rates", headers=HEADERS)
    assert response.status_code == 200
    assert len(response.json()["rates"]) == 1005
    assert response.json()["rates"][0]["daily_price_5_days"] == 0
    assert response.json()["rates"][0]["daily_price_4_days"] is None


def test_rental_rate_update_preserves_daily_prices_and_can_clear_a_price(api):
    client, state = api
    state["rates"] = [rate_row()]
    payload = {**RATE_PRICES, "daily_price_2_days": 17.5, "daily_price_7_plus_days": None}
    response = client.patch(f"/api/v1/rental-rates/{rate_row()['id']}", headers=HEADERS, json=payload)
    assert response.status_code == 200
    assert response.json()["daily_price_2_days"] == 17.5
    assert response.json()["daily_price_7_plus_days"] is None
    assert response.json()["daily_price_5_days"] == 0
    assert len(state["rates"]) == 1


@pytest.mark.parametrize("price", [-1, 12.345, 10000000000, "invalid"])
def test_rental_rate_rejects_invalid_prices(api, price):
    client, state = api
    response = client.patch(f"/api/v1/rental-rates/{LOCATION_A}", headers=HEADERS,
                            json={**RATE_PRICES, "daily_price_1_day": price})
    assert response.status_code == 422
    assert not any(r.method == "PATCH" for r in state["requests"])


def test_rental_rate_cannot_change_group_or_omit_columns(api):
    client, _ = api
    path = f"/api/v1/rental-rates/{LOCATION_A}"
    assert client.patch(path, headers=HEADERS, json={**RATE_PRICES, "group_id": LOCATION_B}).status_code == 422
    assert client.patch(path, headers=HEADERS, json={"daily_price_1_day": 10}).status_code == 422


def test_rental_rates_require_login_and_configured_operator(api):
    client, state = api
    assert client.get("/api/v1/rental-rates").status_code == 401
    assert client.patch(f"/api/v1/rental-rates/{LOCATION_A}", json=RATE_PRICES).status_code == 401
    state["locations"] = []
    assert client.get("/api/v1/rental-rates", headers=HEADERS).status_code == 403
    assert client.patch(f"/api/v1/rental-rates/{LOCATION_A}", headers=HEADERS, json=RATE_PRICES).status_code == 403


def test_rental_rates_report_missing_migration_and_missing_row(api):
    client, state = api
    state["rate_error"] = "PGRST205"
    response = client.get("/api/v1/rental-rates", headers=HEADERS)
    assert response.status_code == 503
    assert "010" in response.json()["detail"]
    del state["rate_error"]
    assert client.patch(f"/api/v1/rental-rates/{LOCATION_A}", headers=HEADERS, json=RATE_PRICES).status_code == 404



def test_rental_item_transfer_checks_both_locations_and_uses_atomic_rpc(api):
    client, state = api
    response = client.post(f"/api/v1/locations/{LOCATION_A}/rental-inventory/{USER_ID}/transfer",
                           headers=HEADERS, json={"destination_location_id": LOCATION_B})
    assert response.status_code == 200
    assert response.json() == {"id": USER_ID, "code": "+001",
                               "from_location_id": LOCATION_A, "to_location_id": LOCATION_B}
    checks = [r.url.params.get("location_id") for r in state["requests"]
              if r.url.path == "/rest/v1/operator_locations"]
    assert checks == [f"eq.{LOCATION_A}", f"eq.{LOCATION_B}"]
    assert len([r for r in state["requests"] if r.method == "POST"]) == 1


@pytest.mark.parametrize("source,target,status", [
    (LOCATION_A, UNASSIGNED_LOCATION, 403),
    (UNASSIGNED_LOCATION, LOCATION_B, 403),
    (LOCATION_A, LOCATION_A, 422),
])
def test_rental_item_transfer_rejects_unauthorized_or_same_site(api, source, target, status):
    client, state = api
    response = client.post(f"/api/v1/locations/{source}/rental-inventory/{USER_ID}/transfer",
                           headers=HEADERS, json={"destination_location_id": target})
    assert response.status_code == status
    assert not any(r.method == "POST" for r in state["requests"])


@pytest.mark.parametrize("code,status", [("PGRST202", 503), ("42501", 403), ("P0002", 404),
                                        ("23514", 409), ("55000", 409)])
def test_rental_item_transfer_database_guards(api, code, status):
    client, state = api
    state["transfer_error"] = code
    response = client.post(f"/api/v1/locations/{LOCATION_A}/rental-inventory/{USER_ID}/transfer",
                           headers=HEADERS, json={"destination_location_id": LOCATION_B})
    assert response.status_code == status
    if code == "PGRST202":
        assert "011" in response.json()["detail"]


def test_rental_item_transfer_requires_login_and_valid_payload(api):
    client, state = api
    path = f"/api/v1/locations/{LOCATION_A}/rental-inventory/{USER_ID}/transfer"
    assert client.post(path, json={"destination_location_id": LOCATION_B}).status_code == 401
    assert client.post(path, headers=HEADERS, json={"destination_location_id": "invalid"}).status_code == 422
    assert client.post(path, headers=HEADERS, json={"destination_location_id": LOCATION_B,
                       "code": "overwrite"}).status_code == 422
    assert not any(r.method == "POST" for r in state["requests"])
