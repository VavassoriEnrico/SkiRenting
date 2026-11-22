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
        if request.url.path == "/rest/v1/rental_bookings":
            assert request.method == "GET"
            if 'customer_id' in request.url.params:
                locations = request.url.params['location_id']
                assert locations.startswith('in.(')
                allowed_ids = locations[4:-1].split(',')
                assert set(allowed_ids) <= set(state['locations'])
                assert request.url.params['order'] == 'starts_on.desc,ends_on.desc,booking_number.desc,id'
            else:
                assert request.url.params["location_id"] == f"eq.{LOCATION_A}"
            if state.get("history_error"):
                return httpx.Response(400, json={"code": state["history_error"]})
            rows = state.get("bookings", [])
            if 'customer_id' in request.url.params:
                rows = [r for r in rows if r['location_id'] in allowed_ids and request.url.params['customer_id'] == f"eq.{r['customer_id']}"]
                rows = sorted(rows,key=lambda r:(r['starts_on'],r['ends_on'],r['booking_number'],r['id']),reverse=True)
            if "id" in request.url.params:
                rows = [r for r in rows if request.url.params["id"] == f"eq.{r['id']}"]
            if "status" in request.url.params:
                statuses = request.url.params['status']
                assert statuses in ('in.(completed,cancelled)', 'in.(confirmed,preparing,active,completed)')
                rows = [r for r in rows if r['status'] in statuses[4:-1].split(',')]
            if 'ends_on' in request.url.params:
                rows = [r for r in rows if request.url.params['ends_on'] == f"eq.{r['ends_on']}"]
            offset = int(request.url.params["offset"])
            return httpx.Response(200, json=rows[offset:offset + 300])
        if request.url.path == '/rest/v1/rental_booking_items' and 'rental_inventory_id' in request.url.params:
            assert request.method == 'GET'
            assert request.url.params['returned_at'] == 'is.null'
            assert 'booking:rental_bookings!inner' in request.url.params['select']
            if state.get('availability_error'):
                return httpx.Response(503, json={'message': 'Availability unavailable'})
            identifiers = request.url.params['rental_inventory_id'][4:-1].split(',')
            rows = [r for r in state.get('availability_items', [])
                    if r['rental_inventory_id'] in identifiers and r.get('returned_at') is None]
            offset = int(request.url.params['offset'])
            return httpx.Response(200, json=rows[offset:offset + 300])
        if request.url.path in ("/rest/v1/rental_booking_items", "/rest/v1/rental_payments"):
            assert request.method == "GET"
            requested = request.url.params["booking_id"][4:-1].split(',')
            key = "history_items" if request.url.path.endswith("rental_booking_items") else "history_payments"
            rows = [r for r in state.get(key, []) if r["booking_id"] in requested]
            offset = int(request.url.params["offset"])
            return httpx.Response(200, json=rows[offset:offset + 300])
        if request.url.path == '/rest/v1/rpc/skirenting_register_rental_payment':
            data = json.loads(request.content)
            assert data['p_location_id'] == LOCATION_A
            state['payment_payload'] = data
            if state.get('payment_error'):
                return httpx.Response(400, json={'code': state['payment_error'], 'message': 'Saldo già registrato'})
            return httpx.Response(200, json={'booking_id': data['p_booking_id']})
        if request.url.path == '/rest/v1/rpc/skirenting_register_rental_return':
            data = json.loads(request.content)
            assert data['p_location_id'] == LOCATION_A
            state['return_payload'] = data
            if state.get('return_error'):
                return httpx.Response(400, json={'code': state['return_error'], 'message': 'Codice non disponibile'})
            return httpx.Response(200, json={'booking_id': state['bookings'][0]['id']})
        if request.url.path == "/rest/v1/rpc/skirenting_confirm_rental_booking":
            data = json.loads(request.content)
            assert data["p_location_id"] == LOCATION_A
            state["confirmation_payload"] = data
            if state.get("confirmation_error"):
                return httpx.Response(400, json={"code": state["confirmation_error"], "message": "Articolo già assegnato"})
            payment = data["p_data"]["payment"]
            paid = payment["amount"] if payment else "0"
            return httpx.Response(200, json={
                "id": data["p_booking_id"], "booking_number": 125,
                "starts_on": data["p_data"]["starts_on"], "ends_on": data["p_data"]["ends_on"],
                "status": "confirmed", "total": "100.00", "paid_amount": paid, "balance": str(100-float(paid)),
                "notes": data["p_data"].get("notes"),
            })
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
            if "group_id" in request.url.params:
                requested = request.url.params["group_id"][4:-1].split(',')
                rates = [rate for rate in rates if rate["group_id"] in requested]
            else:
                assert request.url.params["group.is_active"] == "eq.true"
                assert "!inner" in request.url.params["select"]
            offset = int(request.url.params["offset"])
            return httpx.Response(200, json=rates[offset:offset + 300])
        if request.url.path == "/rest/v1/hotels":
            assert request.url.params["select"] in ("id,name,is_active,discount", "id,name,discount")
            if state.get("hotel_error"):
                return httpx.Response(400, json={"code": state["hotel_error"]})
            rows = state.setdefault("hotels", [])
            if request.method == "GET" and "id" in request.url.params:
                return httpx.Response(200, json=[h for h in rows
                    if request.url.params["id"] == f"eq.{h['id']}" and h["is_active"]])
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
        if request.url.path == '/rest/v1/rpc/skirenting_delete_customer':
            state['delete_customer_payload'] = json.loads(request.content)
            if state.get('customer_error'):
                return httpx.Response(400, json={'code':state['customer_error']})
            matches = [c for c in state.get('customers',[]) if c['id'] == state['delete_customer_payload']['p_customer_id']]
            if not matches:
                return httpx.Response(400, json={'code':'P0002'})
            matches[0].setdefault('deleted_at','2026-11-21T12:00:00Z')
            return httpx.Response(200, json=None)
        if request.url.path == "/rest/v1/customers":
            assert request.url.params["select"] == "id,first_name,last_name,email,phone,notes,birth_date,skill_level,language,country_code,is_legacy"
            assert "location_id" not in request.url.params
            if state.get("customer_error"):
                return httpx.Response(400, json={"code": state["customer_error"]})
            if request.method == "POST":
                assert request.headers["prefer"] == "return=representation"
                data = json.loads(request.content)
                customer = {"id": USER_ID, **data}
                state.setdefault("customers", []).append(customer)
                return httpx.Response(201, json=[customer])
            assert request.url.params['deleted_at'] == 'is.null'
            if request.method == 'PATCH':
                matches = [c for c in state.get('customers',[]) if request.url.params['id'] == f"eq.{c['id']}" and not c.get('deleted_at')]
                data = json.loads(request.content)
                if matches and not matches[0].get('is_legacy') and any(key in data and not data[key] for key in ['first_name','last_name']):
                    return httpx.Response(400, json={'code':'23514'})
                if matches:
                    matches[0].update(data)
                return httpx.Response(200, json=matches)
            if request.method == 'GET' and 'id' in request.url.params:
                return httpx.Response(200, json=[c for c in state.get('customers',[]) if not c.get('deleted_at') and request.url.params['id'] == f"eq.{c['id']}"])
            assert request.url.params["order"] == "last_name,first_name,id"
            offset = int(request.url.params["offset"])
            size = min(int(request.url.params["limit"]), 300)
            rows = [c for c in state.get('customers',[]) if not c.get('deleted_at')]
            return httpx.Response(200, json=rows[offset:offset + size])
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
        if request.url.path == '/rest/v1/material_repairs':
            if state.get('repair_error'):
                return httpx.Response(400,json={'code':state['repair_error'],'message':'Riparazione non disponibile'})
            assert request.url.params['status'] == 'eq.in_progress'
            rows = [r.copy() for r in state.get('repairs',[]) if r.get('status','in_progress')=='in_progress']
            if 'rental_inventory_id' in request.url.params:
                ids = request.url.params['rental_inventory_id'][4:-1].split(',')
                rows = [r for r in rows if r['rental_inventory_id'] in ids]
            else:
                assert request.url.params['item.location_id'] == f'eq.{LOCATION_A}'
                rows = [r for r in rows if r.get('location_id',LOCATION_A)==LOCATION_A]
                items = {i['id']:i for i in state.get('items',[])}
                for row in rows: row['item'] = items[row['rental_inventory_id']]
            offset = int(request.url.params['offset'])
            return httpx.Response(200,json=rows[offset:offset+300])
        if request.url.path in ('/rest/v1/rpc/skirenting_create_material_repair','/rest/v1/rpc/skirenting_complete_material_repair'):
            data = json.loads(request.content)
            state['repair_payload'] = data
            if state.get('repair_error'):
                return httpx.Response(400,json={'code':state['repair_error'],'message':'Riparazione non disponibile'})
            if request.url.path.endswith('create_material_repair'):
                item = next(i for i in state['items'] if i['code']==data['p_code'])
                item['status'] = 'maintenance'
                state.setdefault('repairs',[]).append({'id':data['p_repair_id'],'rental_inventory_id':item['id'],
                    'repair_type':data['p_repair_type'],'sent_at':'2026-11-22T10:00:00Z','notes':data['p_notes'],'status':'in_progress'})
            else:
                item = next(i for i in state['items'] if i['id']==data['p_item_id'])
                item['status'] = 'active'
                next(r for r in state['repairs'] if r['id']==data['p_repair_id'])['status'] = 'completed'
            return httpx.Response(200,json={'id':data['p_repair_id'],'rental_inventory_id':item['id']})
        if request.url.path == '/rest/v1/sale_inventory':
            assert request.method == 'GET'
            allowed = request.url.params['location_id'][4:-1].split(',')
            assert set(allowed) == set(state['locations'])
            assert request.url.params['quantity'] == 'gt.0'
            assert request.url.params['order'] == 'id'
            assert 'location:locations(id,name)' in request.url.params['select']
            if state.get('sale_inventory_unavailable'):
                return httpx.Response(503, json={'message': 'Unavailable'})
            rows = [row for row in state.get('sale_items', [])
                    if row['location']['id'] in allowed and row['quantity'] > 0]
            offset = int(request.url.params['offset'])
            return httpx.Response(200, json=rows[offset:offset + 300])
        if request.url.path == "/rest/v1/rental_inventory":
            location_filter = request.url.params["location_id"]
            general = location_filter.startswith('in.(')
            if general:
                allowed = location_filter[4:-1].split(',')
                assert set(allowed) == set(state['locations'])
                assert 'location:locations(id,name)' in request.url.params['select']
                assert request.method == 'GET'
            else:
                assert location_filter == f"eq.{LOCATION_A}"
            assert request.url.params["order"] == "id"
            if state.get("inventory_unavailable"):
                return httpx.Response(503, json={"message": "Database unavailable"})
            offset = int(request.url.params["offset"])
            # Simulate a configured Supabase cap smaller than the requested page.
            page_size = min(int(request.url.params["limit"]), 300)
            rows = state.get("items", [])
            if general:
                rows = [row for row in rows if row['location']['id'] in allowed]
            if "id" in request.url.params:
                identifier = request.url.params['id']
                requested = [identifier[3:]] if identifier.startswith('eq.') else identifier[4:-1].split(',')
                rows = [row for row in rows if row['id'] in requested]
            return httpx.Response(200, json=rows[offset:offset + page_size])
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
        "birth_date": None, "skill_level": None, "language": None, "country_code": None, "is_legacy": False,
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



def test_rental_quote_uses_actual_stock_group_prices_and_hotel_discount(api):
    client, state = api
    state["items"] = [rental_item(0), rental_item(1)]
    state["rates"] = [rate_row()]
    state["hotels"] = [{"id": LOCATION_B, "name": "Albergo", "is_active": True, "discount": 15}]
    response = client.post(f"/api/v1/locations/{LOCATION_A}/rental-quote", headers=HEADERS, json={
        "starts_on": "2026-12-01", "ends_on": "2026-12-03", "hotel_id": LOCATION_B,
        "inventory_ids": [row["id"] for row in state["items"]],
    })
    assert response.status_code == 200
    body = response.json()
    assert body["days"] == 3
    assert body["subtotal"] == "96"
    assert body["total"] == "81.60"
    assert body["discount_amount"] == "14.40"
    assert body["items"][0]["daily_price"] == "16"
    assert not any(r.method != "GET" for r in state["requests"])


@pytest.mark.parametrize("issue", ["moved", "disabled", "removed_hotel"])
def test_rental_quote_rejects_stale_selection(api, issue):
    client, state = api
    state["items"] = [rental_item(0)]
    data = {"starts_on": "2026-12-01", "ends_on": "2026-12-03",
            "inventory_ids": [state["items"][0]["id"]]}
    if issue == "moved":
        state["items"] = []
    if issue == "disabled":
        state["items"][0]["is_bookable"] = False
    if issue == "removed_hotel":
        data["hotel_id"] = LOCATION_B
    response = client.post(f"/api/v1/locations/{LOCATION_A}/rental-quote", headers=HEADERS, json=data)
    assert response.status_code == 409


def test_rental_quote_preserves_missing_prices_and_access_controls(api):
    client, state = api
    state["items"] = [rental_item(0)]
    data = {"starts_on": "2026-12-01", "ends_on": "2026-12-03",
            "inventory_ids": [state["items"][0]["id"]]}
    path = f"/api/v1/locations/{LOCATION_A}/rental-quote"
    assert client.post(path, json=data).status_code == 401
    assert client.post(f"/api/v1/locations/{UNASSIGNED_LOCATION}/rental-quote",
                       headers=HEADERS, json=data).status_code == 403
    body = client.post(path, headers=HEADERS, json=data).json()
    assert body["total"] is None
    assert body["missing_rate_codes"] == ["+00"]
    assert client.post(path, headers=HEADERS, json={**data, "total": 1}).status_code == 422


BOOKING_DATA = {
    "booking_id": USER_ID, "customer_id": USER_ID, "starts_on": "2026-12-01", "ends_on": "2026-12-03",
    "inventory_ids": [LOCATION_A], "hotel_id": None, "expected_total": "100.00", "payment": None,
}


def test_confirm_booking_converts_italian_payment_time_and_calls_one_rpc(api):
    client, state = api
    response = client.post(f"/api/v1/locations/{LOCATION_A}/rental-bookings", headers=HEADERS,
        json={**BOOKING_DATA, "payment": {"amount": "30.00", "payment_method": "Carta",
                                        "paid_at_local": "2026-11-21T14:30", "notes": None}})
    assert response.status_code == 201
    assert response.json()["booking_number"] == 125
    assert state["confirmation_payload"]["p_data"]["payment"]["paid_at"] == "2026-11-21T13:30:00+00:00"
    assert len([r for r in state["requests"] if r.method == "POST"]) == 1


@pytest.mark.parametrize("code,status", [("P0001", 409), ("PGRST202", 503), ("42501", 403), ("23514", 422)])
def test_confirm_booking_errors(api, code, status):
    client, state = api
    state["confirmation_error"] = code
    response = client.post(f"/api/v1/locations/{LOCATION_A}/rental-bookings", headers=HEADERS, json=BOOKING_DATA)
    assert response.status_code == status


def test_confirm_booking_access_and_nonexistent_local_time(api):
    client, state = api
    path = f"/api/v1/locations/{LOCATION_A}/rental-bookings"
    assert client.post(path, json=BOOKING_DATA).status_code == 401
    assert client.post(f"/api/v1/locations/{UNASSIGNED_LOCATION}/rental-bookings", headers=HEADERS,
                       json=BOOKING_DATA).status_code == 403
    response = client.post(path, headers=HEADERS, json={**BOOKING_DATA, "payment": {
        "amount": "30", "payment_method": "Carta", "paid_at_local": "2026-03-29T02:30"}})
    assert response.status_code == 422
    assert not any(r.method == "POST" for r in state["requests"])



def test_booking_notes_are_optional_normalized_and_returned(api):
    client, state = api
    path = f"/api/v1/locations/{LOCATION_A}/rental-bookings"
    response = client.post(path, headers=HEADERS, json={**BOOKING_DATA, "notes": " Ritiro ore 9\nDue persone "})
    assert response.status_code == 201
    assert response.json()["notes"] == "Ritiro ore 9\nDue persone"
    assert state["confirmation_payload"]["p_data"]["notes"] == "Ritiro ore 9\nDue persone"
    response = client.post(path, headers=HEADERS, json={**BOOKING_DATA, "notes": " "})
    assert response.json()["notes"] is None
    assert "notes" not in state["confirmation_payload"]["p_data"]
    assert client.post(path, headers=HEADERS, json={**BOOKING_DATA, "notes": "X" * 5001}).status_code == 422



def history_header(index=1, status="confirmed"):
    return {
        "id": str(UUID(int=index)), "booking_number": index, "customer_id": USER_ID,
        "location_id": LOCATION_A, "customer": {"id": USER_ID, "first_name": "Mario", "last_name": "Rossi",
            "email": "mario@example.test", "phone": "+39 00123", "notes": "Nota cliente"},
        "hotel": {"id": LOCATION_B, "name": "Albergo"},
        "starts_on": "2026-12-01", "ends_on": "2026-12-03", "status": status,
        "discount_percent": 15, "notes": "Nota prenotazione", "created_by": USER_ID,
        "created_at": "2026-11-21T10:00:00Z", "updated_at": "2026-11-21T10:00:00Z",
    }


def history_children(booking_id):
    items = [{"id": str(UUID(int=100 + i)), "booking_id": booking_id, "rental_inventory_id": USER_ID,
              "code_snapshot": f"CODE{i}", "brand_snapshot": "Marca storica", "model_snapshot": "Modello",
              "size_snapshot": "164 cm", "daily_price": None, "amount": amount,
              "delivered_at": None, "returned_at": None,
              "created_at": "2026-11-21T10:00:00Z", "updated_at": "2026-11-21T10:00:00Z"}
             for i, amount in enumerate([40, 60])]
    payments = [{"id": str(UUID(int=200 + i)), "booking_id": booking_id, "payment_method": "Carta",
                 "amount": amount, "paid_at": "2026-11-21T11:30:00Z", "created_by": USER_ID,
                 "notes": "Nota pagamento", "created_at": "2026-11-21T12:00:00Z"}
                for i, amount in enumerate([20, 30])]
    return items, payments


def test_history_lists_all_statuses_and_keeps_independent_money_totals(api):
    client, state = api
    state["bookings"] = [history_header(), history_header(2, "completed")]
    state["history_items"], state["history_payments"] = history_children(state["bookings"][0]["id"])
    response = client.get(f"/api/v1/locations/{LOCATION_A}/rental-bookings?scope=all", headers=HEADERS)
    assert response.status_code == 200
    body = response.json()
    assert len(body) == 2
    assert body[0]["subtotal"] == "100"
    assert body[0]["total"] == "85.00"
    assert body[0]["paid_amount"] == "50"
    assert body[0]["balance"] == "35.00"
    assert body[0]["item_count"] == 2
    assert body[0]["returned_item_count"] == 0
    history = client.get(f"/api/v1/locations/{LOCATION_A}/rental-bookings?scope=history", headers=HEADERS)
    assert [r["status"] for r in history.json()] == ["completed"]


def test_history_details_include_snapshots_notes_and_payment_times(api):
    client, state = api
    header = history_header()
    state["bookings"] = [header]
    state["history_items"], state["history_payments"] = history_children(header["id"])
    state["history_items"][0]['returned_at'] = '2026-12-03T10:00:00Z'
    response = client.get(f"/api/v1/locations/{LOCATION_A}/rental-bookings/{header['id']}", headers=HEADERS)
    assert response.status_code == 200
    body = response.json()
    assert body["returned_item_count"] == 1
    assert body["notes"] == "Nota prenotazione"
    assert body["customer"]["notes"] == "Nota cliente"
    assert body["items"][0]["brand_snapshot"] == "Marca storica"
    assert body["payments"][0]["notes"] == "Nota pagamento"
    assert body["payments"][0]["paid_at"] == "2026-11-21T11:30:00Z"
    assert all(r.method == "GET" for r in state["requests"])


def test_history_reads_all_header_and_child_pages(api):
    client, state = api
    state["bookings"] = [history_header(i + 1) for i in range(1005)]
    response = client.get(f"/api/v1/locations/{LOCATION_A}/rental-bookings", headers=HEADERS)
    assert response.status_code == 200 and len(response.json()) == 1005
    first = state["bookings"][0]
    row = history_children(first["id"])[1][0]
    state["history_payments"] = [{**row, "id": str(UUID(int=3000 + i)), "amount": 1} for i in range(1005)]
    detail = client.get(f"/api/v1/locations/{LOCATION_A}/rental-bookings/{first['id']}", headers=HEADERS)
    assert detail.status_code == 200
    assert len(detail.json()["payments"]) == 1005
    assert detail.json()["paid_amount"] == "1005"


def test_history_access_empty_and_missing_booking(api):
    client, state = api
    path = f"/api/v1/locations/{LOCATION_A}/rental-bookings"
    assert client.get(path).status_code == 401
    assert client.get(f"/api/v1/locations/{UNASSIGNED_LOCATION}/rental-bookings", headers=HEADERS).status_code == 403
    assert client.get(path, headers=HEADERS).json() == []
    assert client.get(f"{path}/{USER_ID}", headers=HEADERS).status_code == 404
    assert not any(r.url.path.endswith("rental_booking_items") for r in state["requests"])
    state["history_error"] = "PGRST205"
    assert client.get(path, headers=HEADERS).status_code == 503


def test_selection_hides_outstanding_and_overlapping_items_without_hiding_stock(api):
    client, state = api
    state['items'] = [rental_item(i) for i in range(9)]
    rows = []
    # Same availability rule as atomic confirmation, including inclusive boundaries.
    for i, (status, start, end, delivered, returned) in enumerate([
        ('confirmed', '2026-12-01', '2026-12-03', None, None),
        ('preparing', '2026-12-03', '2026-12-05', None, None),
        ('active', '2026-10-01', '2026-10-02', None, None),
        ('completed', '2026-10-01', '2026-10-02', '2026-10-01T08:00:00Z', None),
        ('confirmed', '2026-12-06', '2026-12-07', None, None),
        ('cancelled', '2026-12-01', '2026-12-03', None, None),
        ('completed', '2026-12-01', '2026-12-03', None, None),
        ('active', '2026-12-01', '2026-12-03', '2026-12-01T08:00:00Z', '2026-12-02T08:00:00Z'),
    ]):
        rows.append({'id': str(i), 'rental_inventory_id': state['items'][i]['id'],
                     'delivered_at': delivered, 'returned_at': returned,
                     'booking': {'status': status, 'starts_on': start, 'ends_on': end}})
    state['availability_items'] = rows
    path = f'/api/v1/locations/{LOCATION_A}/rental-inventory'
    response = client.get(path + '?available_only=true&starts_on=2026-12-03&ends_on=2026-12-04', headers=HEADERS)
    assert response.status_code == 200
    assert [i['id'] for i in response.json()['items']] == [i['id'] for i in state['items'][4:]]
    assert len(client.get(path, headers=HEADERS).json()['items']) == 9


def test_selection_defaults_to_today_and_does_not_ignore_availability_errors(api):
    client, state = api
    state['items'] = [rental_item(0)]
    state['availability_items'] = [{'id': 'line', 'rental_inventory_id': rental_item(0)['id'],
        'delivered_at': None, 'booking': {'status': 'active', 'starts_on': '2020-01-01', 'ends_on': '2020-01-02'}}]
    path = f'/api/v1/locations/{LOCATION_A}/rental-inventory?available_only=true'
    assert client.get(path, headers=HEADERS).json()['items'] == []
    state['availability_error'] = True
    assert client.get(path, headers=HEADERS).status_code == 503
    for query in ('&starts_on=2026-12-01', '&starts_on=2026-12-03&ends_on=2026-12-01'):
        assert client.get(path + query, headers=HEADERS).status_code == 422
    state['requests'].clear()
    assert client.get(path.replace(LOCATION_A, UNASSIGNED_LOCATION), headers=HEADERS).status_code == 403
    assert not any('rental_booking_items' in r.url.path for r in state['requests'])


def test_selection_reads_every_assignment_and_inventory_chunk(api):
    client, state = api
    state['items'] = [rental_item(i) for i in range(101)]
    state['availability_items'] = [{'id': str(i), 'rental_inventory_id': rental_item(0 if i < 1004 else 100)['id'],
        'delivered_at': None, 'booking': {'status': 'active', 'starts_on': '2020-01-01', 'ends_on': '2020-01-02'}}
        for i in range(1005)]
    response = client.get(f'/api/v1/locations/{LOCATION_A}/rental-inventory?available_only=true', headers=HEADERS)
    assert response.status_code == 200
    assert len(response.json()['items']) == 99
    assert {rental_item(0)['id'], rental_item(100)['id']}.isdisjoint({i['id'] for i in response.json()['items']})
    requests = [r for r in state['requests'] if r.url.path.endswith('rental_booking_items')]
    assert any(r.url.params['offset'] == '900' for r in requests)


def test_today_returns_filters_date_status_and_outstanding_items(api, monkeypatch):
    from datetime import date
    monkeypatch.setattr('app.services.rental_history_service.current_return_date', lambda: date(2026, 11, 21))
    client, state = api
    bookings, items = [], []
    cases = [
        ('confirmed', '2026-11-21', [False]),
        ('preparing', '2026-11-21', [False]),
        ('active', '2026-11-21', [True, False]),
        ('active', '2026-11-20', [False]),
        ('active', '2026-11-22', [False]),
        ('cancelled', '2026-11-21', [False]),
        ('completed', '2026-11-21', [True]),
        ('active', '2026-11-21', [True]),
        ('confirmed', '2026-11-21', []),
    ]
    for index, (status, ends_on, returned) in enumerate(cases):
        header = {**history_header(index + 1, status), 'starts_on': '2026-11-01', 'ends_on': ends_on}
        bookings.append(header)
        for line_index, is_returned in enumerate(returned):
            line = history_children(header['id'])[0][line_index]
            items.append({**line, 'returned_at': '2026-11-21T08:00:00Z' if is_returned else None})
    state.update(bookings=bookings, history_items=items)
    response = client.get(f'/api/v1/locations/{LOCATION_A}/rental-returns', headers=HEADERS)
    assert response.status_code == 200
    body = response.json()
    assert body['due_on'] == '2026-11-21'
    assert [row['id'] for row in body['bookings']] == [header['id'] for header in [*bookings[:3], *bookings[6:8]]]
    assert len(body['bookings'][2]['items']) == 2
    assert body['bookings'][2]['items'][0]['returned_at'] is not None
    assert body['bookings'][2]['items'][1]['returned_at'] is None
    assert all(r.method == 'GET' for r in state['requests'])


def test_today_returns_security_empty_errors_and_pagination(api, monkeypatch):
    from datetime import date
    monkeypatch.setattr('app.services.rental_history_service.current_return_date', lambda: date(2026, 11, 21))
    client, state = api
    path = f'/api/v1/locations/{LOCATION_A}/rental-returns'
    assert client.get(path).status_code == 401
    assert client.get(path.replace(LOCATION_A, UNASSIGNED_LOCATION), headers=HEADERS).status_code == 403
    assert not any(r.url.path.endswith('rental_bookings') for r in state['requests'])
    assert client.get(path, headers=HEADERS).json() == {'due_on': '2026-11-21', 'bookings': []}
    state['history_error'] = 'PGRST205'
    assert client.get(path, headers=HEADERS).status_code == 503
    state.pop('history_error')
    state['bookings'] = [{**history_header(i + 1), 'ends_on': '2026-11-21'} for i in range(305)]
    state['history_items'] = [history_children(h['id'])[0][0] for h in state['bookings']]
    state['history_items'] += [{**state['history_items'][0], 'id': str(UUID(int=10000 + i))} for i in range(1005)]
    response = client.get(path, headers=HEADERS)
    assert response.status_code == 200
    assert len(response.json()['bookings']) == 305
    assert len(response.json()['bookings'][0]['items']) == 1006


def test_return_day_uses_italian_timezone(monkeypatch):
    from datetime import datetime, date, timezone
    from app.services import rental_history_service
    class FixedTime:
        @staticmethod
        def now(tz):
            return datetime(2026, 11, 20, 23, 30, tzinfo=timezone.utc).astimezone(tz)
    monkeypatch.setattr(rental_history_service, 'datetime', FixedTime)
    assert rental_history_service.current_return_date() == date(2026, 11, 21)


def test_register_return_calls_atomic_rpc_and_returns_updated_booking(api):
    client, state = api
    header = history_header()
    state['bookings'] = [header]
    state['history_items'], state['history_payments'] = history_children(header['id'])
    request_id = USER_ID
    response = client.post(f'/api/v1/locations/{LOCATION_A}/rental-returns', headers=HEADERS,
                           json={'request_id': request_id, 'code': ' +001 '})
    assert response.status_code == 200
    assert state['return_payload'] == {'p_request_id': request_id, 'p_location_id': LOCATION_A, 'p_code': '+001'}
    assert response.json()['id'] == header['id']
    assert response.json()['balance'] == '35.00'


@pytest.mark.parametrize('error,status', [('PGRST202',503),('42501',403),('P0001',409),('P0002',409),('22023',422)])
def test_register_return_maps_errors_and_authorizes_before_writing(api, error, status):
    client, state = api
    path = f'/api/v1/locations/{LOCATION_A}/rental-returns'
    data = {'request_id': USER_ID, 'code': '+001'}
    assert client.post(path, json=data).status_code == 401
    assert client.post(path.replace(LOCATION_A, UNASSIGNED_LOCATION), headers=HEADERS, json=data).status_code == 403
    assert 'return_payload' not in state
    assert client.post(path, headers=HEADERS, json={**data, 'code': '  '}).status_code == 422
    state['return_error'] = error
    assert client.post(path, headers=HEADERS, json=data).status_code == status


def test_return_payment_records_italian_timestamp_and_returns_updated_balance(api):
    client, state = api
    header = history_header()
    state['bookings'] = [header]
    state['history_items'], state['history_payments'] = history_children(header['id'])
    data = {'payment_id': USER_ID, 'amount': '35.00', 'payment_method': ' Carta ', 'paid_at_local': '2026-11-21T14:30', 'notes': 'Saldo'}
    response = client.post(f'/api/v1/locations/{LOCATION_A}/rental-bookings/{header["id"]}/payments', headers=HEADERS, json=data)
    assert response.status_code == 200
    assert state['payment_payload']['p_data'] == {'amount': '35.00', 'payment_method': 'Carta', 'notes': 'Saldo', 'paid_at': '2026-11-21T13:30:00+00:00'}
    assert state['payment_payload']['p_payment_id'] == USER_ID


@pytest.mark.parametrize('code,status', [('PGRST202',503),('42501',403),('P0001',409),('P0002',409),('22023',422)])
def test_return_payment_security_validation_and_errors(api, code, status):
    client, state = api
    path = f'/api/v1/locations/{LOCATION_A}/rental-bookings/{USER_ID}/payments'
    data = {'payment_id': USER_ID, 'amount': '10', 'payment_method': 'Carta', 'paid_at_local': '2026-11-21T14:30'}
    assert client.post(path, json=data).status_code == 401
    assert client.post(path.replace(LOCATION_A, UNASSIGNED_LOCATION), headers=HEADERS, json=data).status_code == 403
    for changes in [{'amount':'0'}, {'amount':'NaN'}, {'amount':'1.001'}, {'payment_method':' '}, {'paid_at_local':'2026-03-29T02:30'}]:
        assert client.post(path, headers=HEADERS, json={**data, **changes}).status_code == 422
    assert 'payment_payload' not in state
    state['payment_error'] = code
    assert client.post(path, headers=HEADERS, json=data).status_code == status


def test_customer_profile_fields_are_normalized_and_returned(api):
    client, state = api
    data = {**NEW_CUSTOMER, 'birth_date': '1990-04-15', 'skill_level': ' INTERMEDIATE ', 'language': ' it ', 'country_code': ' ch '}
    response = client.post('/api/v1/customers', headers=HEADERS, json=data)
    assert response.status_code == 201
    body = response.json()
    assert {key: body[key] for key in ['birth_date','skill_level','language','country_code']} == {
        'birth_date':'1990-04-15', 'skill_level':'intermediate', 'language':'IT', 'country_code':'CH'}
    assert client.get('/api/v1/customers', headers=HEADERS).json() == [body]
    payload = json.loads(next(r.content for r in state['requests'] if r.method == 'POST'))
    assert payload['birth_date'] == '1990-04-15'


@pytest.mark.parametrize('field,value', [
    ('birth_date','9999-01-01'), ('birth_date','2001-02-29'), ('skill_level','advanced'),
    ('language','italiano'), ('country_code','I1'), ('eta',30), ('pagato','100'), ('stagionale',True),
])
def test_customer_profile_rejects_invalid_and_unapproved_import_fields(api, field, value):
    client, state = api
    response = client.post('/api/v1/customers', headers=HEADERS, json={**NEW_CUSTOMER, field:value})
    assert response.status_code == 422
    assert not any(r.method == 'POST' for r in state['requests'])


def test_customer_profile_empty_values_and_missing_migration(api):
    client, state = api
    response = client.post('/api/v1/customers', headers=HEADERS, json={**NEW_CUSTOMER,
        'birth_date':'', 'skill_level':' ', 'language':' ', 'country_code':''})
    assert response.status_code == 201
    assert all(response.json()[field] is None for field in ['birth_date','skill_level','language','country_code'])
    state['customer_error'] = '42703'
    assert '015_customer_profile_fields.sql' in client.get('/api/v1/customers', headers=HEADERS).json()['detail']
    assert '015_customer_profile_fields.sql' in client.post('/api/v1/customers', headers=HEADERS, json=NEW_CUSTOMER).json()['detail']


def test_edit_customer_changes_only_provided_fields_and_preserves_legacy_empty_names(api):
    client, state = api
    state['customers'] = [{'id':USER_ID, 'first_name':'', 'last_name':'', 'is_legacy':True,
                           'email':'legacy email', 'phone':'000123', 'notes':None}]
    path = f'/api/v1/customers/{USER_ID}'
    response = client.patch(path, headers=HEADERS, json={'notes':'Corretta', 'birth_date':'1990-04-15'})
    assert response.status_code == 200
    assert response.json()['first_name'] == '' and response.json()['is_legacy'] is True
    assert response.json()['email'] == 'legacy email'
    assert response.json()['phone'] == '000123'
    assert state['customers'][0]['birth_date'] == '1990-04-15'
    assert client.patch(path, headers=HEADERS, json={'first_name':'Mario','last_name':'Rossi'}).status_code == 200
    assert client.patch(path, headers=HEADERS, json={'email':None}).json()['email'] is None
    state['customers'][0]['is_legacy'] = False
    assert client.patch(path, headers=HEADERS, json={'first_name':''}).status_code == 422


def test_deleted_customer_is_hidden_and_no_longer_editable(api):
    client, state = api
    state['customers'] = [{'id':USER_ID, 'first_name':'Mario', 'last_name':'Rossi'}]
    path = f'/api/v1/customers/{USER_ID}'
    assert client.delete(path, headers=HEADERS).status_code == 204
    assert client.delete(path, headers=HEADERS).status_code == 204
    assert client.get('/api/v1/customers', headers=HEADERS).json() == []
    assert client.patch(path, headers=HEADERS, json={'notes':'Modifica tardiva'}).status_code == 404
    assert client.delete(f'/api/v1/customers/{LOCATION_A}', headers=HEADERS).status_code == 404
    assert len(state['customers']) == 1  # Rimane disponibile per lo storico.


@pytest.mark.parametrize('payload', [{}, {'first_name':None}, {'email':'invalid'}, {'is_legacy':True}, {'deleted_at':'2026-11-21'}, {'birth_date':'9999-01-01'}])
def test_edit_customer_validates_fields_and_authorization(api, payload):
    client, state = api
    path = f'/api/v1/customers/{USER_ID}'
    assert client.patch(path, json={'notes':'Nota'}).status_code == 401
    assert client.delete(path).status_code == 401
    assert client.patch(path, headers=HEADERS, json=payload).status_code == 422
    assert not any(r.method == 'PATCH' for r in state['requests'])
    state['profile'] = None
    assert client.patch(path, headers=HEADERS, json={'notes':'Nota'}).status_code == 403
    assert client.delete(path, headers=HEADERS).status_code == 403
    assert 'delete_customer_payload' not in state


@pytest.mark.parametrize('code,status', [('PGRST202',503), ('42501',403), ('P0002',404), ('23514',422)])
def test_customer_management_errors(api, code, status):
    client, state = api
    state['customer_error'] = code
    path = f'/api/v1/customers/{USER_ID}'
    response = client.delete(path, headers=HEADERS)
    assert response.status_code == status
    if code == 'PGRST202':
        assert '017_customer_management.sql' in response.json()['detail']
    assert client.patch(path, headers=HEADERS, json={'notes':'Nota'}).status_code == status


def test_customer_bookings_are_scoped_ordered_and_use_saved_prices(api):
    client, state = api
    customer = {'id':USER_ID,'first_name':'Mario','last_name':'Rossi'}
    state['customers'] = [customer]
    older = {**history_header(1), 'starts_on':'2026-10-01','ends_on':'2026-10-02'}
    newer = {**history_header(2), 'location_id':LOCATION_B,'starts_on':'2026-11-20','ends_on':'2026-11-22'}
    other_customer = {**history_header(3), 'customer_id':LOCATION_B}
    other_site = {**history_header(4), 'location_id':UNASSIGNED_LOCATION}
    state['bookings'] = [older,other_site,newer,other_customer]
    state['history_items'],state['history_payments'] = history_children(newer['id'])
    response = client.get(f'/api/v1/customers/{USER_ID}/bookings',headers=HEADERS)
    assert response.status_code == 200
    body = response.json()
    assert body['booking_count'] == 2
    assert [row['id'] for row in body['bookings']] == [newer['id'],older['id']]
    assert body['bookings'][0]['total'] == '85.00'
    assert body['bookings'][0]['paid_amount'] == '50'
    assert body['bookings'][0]['location_name'] == 'Sede 2'
    assert body['customer']['first_name'] == 'Mario'
    assert all(r.method=='GET' for r in state['requests'])
    assert not any('import' in r.url.path for r in state['requests'])


def test_customer_bookings_handles_empty_missing_deleted_and_errors(api):
    client,state = api
    path = f'/api/v1/customers/{USER_ID}/bookings'
    assert client.get(path).status_code == 401
    assert client.get(path,headers=HEADERS).status_code == 404
    assert not any(r.url.path.endswith('rental_bookings') for r in state['requests'])
    state['customers'] = [{'id':USER_ID,'first_name':'Mario','last_name':'Rossi','deleted_at':'2026-11-22T08:00:00Z'}]
    assert client.get(path,headers=HEADERS).status_code == 404
    state['customers'][0].pop('deleted_at')
    assert client.get(path,headers=HEADERS).json()['booking_count'] == 0
    assert client.get(path,headers=HEADERS).json()['bookings'] == []
    state['history_error'] = 'PGRST205'
    assert client.get(path,headers=HEADERS).status_code == 503
    state['profile'] = None
    state['requests'].clear()
    assert client.get(path,headers=HEADERS).status_code == 403
    assert not any(r.url.path.endswith('customers') for r in state['requests'])


def test_customer_bookings_does_not_truncate_at_supabase_row_limits(api):
    client,state = api
    state['customers'] = [{'id':USER_ID,'first_name':'Mario','last_name':'Rossi'}]
    state['bookings'] = [history_header(i+1) for i in range(1005)]
    newest = state['bookings'][-1]
    line,payment = history_children(newest['id'])
    state['history_items'] = [{**line[0],'id':str(UUID(int=20000+i)),'amount':'1'} for i in range(1005)]
    state['history_payments'] = [{**payment[0],'id':str(UUID(int=30000+i)),'amount':'1'} for i in range(1005)]
    response = client.get(f'/api/v1/customers/{USER_ID}/bookings',headers=HEADERS)
    assert response.status_code == 200
    assert response.json()['booking_count'] == 1005
    first = response.json()['bookings'][0]
    assert first['id'] == newest['id']
    assert first['total'] == '854.25'  # Sconto storico 15% di 1005.
    assert first['paid_amount'] == '1005'


def test_repairs_flow_annotates_inventory_and_finishes_only_on_explicit_post(api):
    client,state = api
    item = rental_item(0)
    state['items'] = [item]
    path = f'/api/v1/locations/{LOCATION_A}/repairs'
    data = {'repair_id':USER_ID,'code':item['code'],'repair_type':'edges_and_wax','notes':'Lamine rovinate'}
    response = client.post(path,headers=HEADERS,json=data)
    assert response.status_code == 201
    assert client.get(path,headers=HEADERS).json()[0]['item']['code'] == item['code']
    inventory = client.get(f'/api/v1/locations/{LOCATION_A}/rental-inventory?available_only=true',headers=HEADERS).json()
    assert inventory['items'][0]['status'] == 'maintenance'
    assert inventory['items'][0]['open_repair']['id'] == USER_ID
    assert state['repairs'][0]['status'] == 'in_progress'
    completed = client.post(f'{path}/{USER_ID}/complete',headers=HEADERS,json={'rental_inventory_id':item['id']})
    assert completed.status_code == 200
    assert completed.json()['status'] == 'active' and completed.json()['open_repair'] is None
    assert client.get(path,headers=HEADERS).json() == []


@pytest.mark.parametrize('code,status',[('PGRST202',503),('42501',403),('P0002',404),('P0001',409),('23505',409),('22023',422)])
def test_repairs_authorization_validation_and_errors(api,code,status):
    client,state = api
    path = f'/api/v1/locations/{LOCATION_A}/repairs'
    data = {'repair_id':USER_ID,'code':'+001','repair_type':'wax'}
    assert client.get(path).status_code == 401
    assert client.post(path,json=data).status_code == 401
    assert client.get(path.replace(LOCATION_A,UNASSIGNED_LOCATION),headers=HEADERS).status_code == 403
    assert client.post(path.replace(LOCATION_A,UNASSIGNED_LOCATION),headers=HEADERS,json=data).status_code == 403
    assert client.post(path,headers=HEADERS,json={**data,'code':''}).status_code == 422
    assert 'repair_payload' not in state
    state['repair_error'] = code
    response = client.post(path,headers=HEADERS,json=data)
    assert response.status_code == status
    if code=='PGRST202': assert '019_material_repairs_workflow.sql' in response.json()['detail']


def test_general_inventory_reads_every_authorized_site_and_unit_with_repairs(api):
    client, state = api
    state['items'] = [
        {**rental_item(index), 'location': {'id': site, 'name': name}}
        for index, (site, name) in enumerate(
            [(LOCATION_A, 'Madesimo')] * 700 + [(LOCATION_B, 'Boscone')] * 605
            + [(UNASSIGNED_LOCATION, 'Sede esclusa')]
        )
    ]
    state['items'][0]['status'] = 'maintenance'
    state['repairs'] = [{
        'id': USER_ID, 'rental_inventory_id': state['items'][0]['id'],
        'repair_type': 'wax', 'sent_at': '2026-11-22T10:00:00Z',
    }]
    response = client.get('/api/v1/rental-inventory', headers=HEADERS)
    assert response.status_code == 200
    body = response.json()
    assert len(body['items']) == 1305
    assert len({item['id'] for item in body['items']}) == 1305
    assert {item['location']['name'] for item in body['items']} == {'Madesimo', 'Boscone'}
    assert {location['id'] for location in body['locations']} == {LOCATION_A, LOCATION_B}
    assert body['items'][0]['open_repair']['repair_type'] == 'wax'
    assert body['items'][1]['open_repair'] is None
    requests = [r for r in state['requests'] if r.url.path.endswith('/rental_inventory')]
    assert [r.url.params['offset'] for r in requests] == ['0','300','600','900','1200','1305']
    assert all(r.method == 'GET' for r in state['requests'])


def test_general_inventory_rechecks_authorized_locations(api):
    client, state = api
    state['locations'] = [LOCATION_B]
    state['items'] = [
        {**rental_item(0), 'location': {'id': LOCATION_A, 'name': 'Madesimo'}},
        {**rental_item(1), 'location': {'id': LOCATION_B, 'name': 'Boscone'}},
    ]
    response = client.get('/api/v1/rental-inventory', headers=HEADERS)
    assert response.status_code == 200
    assert [item['code'] for item in response.json()['items']] == ['+01']


@pytest.mark.parametrize('profile,locations', [(None,[LOCATION_A]), (PROFILE,[])])
def test_general_inventory_checks_profile_and_locations_before_reading(api,profile,locations):
    client,state=api
    state['profile'],state['locations']=profile,locations
    assert client.get('/api/v1/rental-inventory',headers=HEADERS).status_code == 403
    assert not any('inventory' in r.url.path or 'material' in r.url.path for r in state['requests'])


def test_general_inventory_requires_login_and_reports_database_failure(api):
    client,state=api
    assert client.get('/api/v1/rental-inventory').status_code == 401
    assert not state['requests']
    state['inventory_unavailable']=True
    assert client.get('/api/v1/rental-inventory',headers=HEADERS).status_code == 503


def test_general_sale_inventory_reads_authorized_stock_prices_and_all_pages(api):
    client, state = api
    state['sale_items'] = [
        {'id': str(UUID(int=index+1)), 'quantity': 3, 'price': '199.90', 'notes': None,
         'variant': rental_item(0)['variant'], 'location': {'id': site, 'name': name}}
        for index, (site,name) in enumerate(
            [(LOCATION_A,'Madesimo')]*700+[(LOCATION_B,'Boscone')]*605
            +[(UNASSIGNED_LOCATION,'Esclusa')]
        )
    ]
    state['sale_items'][0]['price'] = None
    state['sale_items'][1]['price'] = '0.00'
    state['sale_items'].append({**state['sale_items'][0], 'id': USER_ID, 'quantity': 0})
    response = client.get('/api/v1/sale-inventory',headers=HEADERS)
    assert response.status_code == 200
    items = response.json()['items']
    assert len(items) == 1305
    assert sum(item['quantity'] for item in items) == 3915
    assert items[0]['price'] is None
    assert items[1]['price'] == 0
    assert items[2]['price'] == 199.90
    assert {item['location']['name'] for item in items} == {'Madesimo','Boscone'}
    requests = [r for r in state['requests'] if r.url.path.endswith('/sale_inventory')]
    assert [r.url.params['offset'] for r in requests] == ['0','300','600','900','1200','1305']
    assert all(r.method == 'GET' for r in state['requests'])
    state['locations'] = [LOCATION_B]
    response = client.get('/api/v1/sale-inventory',headers=HEADERS)
    assert len(response.json()['items']) == 605


def test_general_sale_inventory_empty_and_failure(api):
    client,state=api
    response=client.get('/api/v1/sale-inventory',headers=HEADERS)
    assert response.status_code == 200
    assert response.json()['items'] == []
    state['sale_inventory_unavailable']=True
    assert client.get('/api/v1/sale-inventory',headers=HEADERS).status_code == 503


@pytest.mark.parametrize('profile,locations',[(None,[LOCATION_A]),(PROFILE,[])])
def test_general_sale_inventory_requires_operator_and_locations(api,profile,locations):
    client,state=api
    assert client.get('/api/v1/sale-inventory').status_code == 401
    assert not state['requests']
    state['profile'],state['locations']=profile,locations
    assert client.get('/api/v1/sale-inventory',headers=HEADERS).status_code == 403
    assert not any('inventory' in r.url.path or 'material' in r.url.path for r in state['requests'])
