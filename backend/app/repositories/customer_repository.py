import httpx

CUSTOMER_FIELDS = 'id,first_name,last_name,email,phone,notes'


def list_customers(client: httpx.Client) -> list[dict]:
    customers = []
    while True:
        response = client.get(
            '/rest/v1/customers',
            params={
                'select': CUSTOMER_FIELDS,
                'order': 'last_name,first_name,id',
                'limit': '500',
                'offset': str(len(customers)),
            },
        )
        response.raise_for_status()
        page = response.json()
        if not page:
            return customers
        customers.extend(page)


def create_customer(client: httpx.Client, data: dict) -> dict:
    response = client.post(
        '/rest/v1/customers',
        params={'select': CUSTOMER_FIELDS},
        headers={'Prefer': 'return=representation'},
        json=data,
    )
    response.raise_for_status()
    return response.json()[0]
