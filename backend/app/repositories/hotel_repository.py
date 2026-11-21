from uuid import UUID

import httpx

FIELDS = 'id,name,is_active,discount'


def list_hotels(client: httpx.Client, include_inactive: bool = False) -> list[dict]:
    hotels = []
    while True:
        params = {'select': FIELDS, 'order': 'name,id', 'limit': '500', 'offset': str(len(hotels))}
        if not include_inactive:
            params['is_active'] = 'eq.true'
        response = client.get('/rest/v1/hotels', params=params)
        response.raise_for_status()
        page = response.json()
        if not page:
            return hotels
        hotels.extend(page)


def create_hotel(client: httpx.Client, name: str, discount: float = 0) -> dict:
    response = client.post('/rest/v1/hotels', params={'select': FIELDS},
                           headers={'Prefer': 'return=representation'},
                           json={'name': name, 'discount': discount})
    response.raise_for_status()
    return response.json()[0]


def set_active(
    client: httpx.Client, hotel_id: UUID, active: bool, discount: float | None = None,
) -> dict | None:
    data: dict[str, bool | float] = {'is_active': active}
    if discount is not None:
        data['discount'] = discount
    response = client.patch('/rest/v1/hotels', params={'id': f'eq.{hotel_id}', 'select': FIELDS},
                            headers={'Prefer': 'return=representation'}, json=data)
    response.raise_for_status()
    rows = response.json()
    return rows[0] if rows else None


def update_discount(client: httpx.Client, hotel_id: UUID, discount: float) -> dict | None:
    response = client.patch(
        '/rest/v1/hotels',
        params={'id': f'eq.{hotel_id}', 'is_active': 'eq.true', 'select': FIELDS},
        headers={'Prefer': 'return=representation'}, json={'discount': discount},
    )
    response.raise_for_status()
    rows = response.json()
    return rows[0] if rows else None
