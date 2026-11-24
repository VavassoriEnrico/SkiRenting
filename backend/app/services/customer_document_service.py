"""Foto documento in Storage privato, usando il JWT dell'operatore."""
import logging
import re
from uuid import UUID, uuid4

import httpx
from fastapi import HTTPException

from app.services.operator_service import get_operator_session

BUCKET = 'customer-documents'
MAX_DOCUMENT_BYTES = 5 * 1024 * 1024
IMAGE_EXTENSIONS = {'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp'}
logger = logging.getLogger(__name__)


def customer_document(client: httpx.Client, customer_id: UUID):
    response = client.get('/rest/v1/customers', params={
        'id': f'eq.{customer_id}', 'deleted_at': 'is.null', 'select': 'id,document_path', 'limit': '1',
    })
    response.raise_for_status()
    rows = response.json()
    if not rows:
        raise HTTPException(404, 'Cliente non trovato o già eliminato.')
    return rows[0]


def valid_path(path: str | None, customer_id: UUID):
    return bool(path and re.fullmatch(rf'{customer_id}/[a-f0-9-]{{36}}\.(jpg|png|webp)', path))


def document_link(client: httpx.Client, path: str | None, customer_id: UUID):
    if not path:
        return {'url': None}
    if not valid_path(path, customer_id):
        raise HTTPException(409, 'Il vecchio documento non è disponibile in questo archivio. Puoi caricare una nuova foto.')
    response = client.post(f'/storage/v1/object/sign/{BUCKET}/{path}', json={'expiresIn': 120})
    response.raise_for_status()
    signed = response.json().get('signedURL')
    if not isinstance(signed, str) or not signed.startswith(f'/object/sign/{BUCKET}/'):
        raise HTTPException(503, 'Impossibile aprire la foto del documento.')
    return {'url': f'{str(client.base_url).rstrip("/")}/storage/v1{signed}'}


def set_document(client: httpx.Client, customer_id: UUID, path: str | None):
    response = client.patch('/rest/v1/customers', params={
        'id': f'eq.{customer_id}', 'deleted_at': 'is.null', 'select': 'id,document_path',
    }, headers={'Prefer': 'return=representation'}, json={'document_path': path})
    response.raise_for_status()
    if not response.json():
        raise HTTPException(404, 'Cliente non trovato o già eliminato.')


def remove_file(client: httpx.Client, path: str | None, customer_id: UUID):
    if not valid_path(path, customer_id):
        return
    try:
        response = client.request('DELETE', f'/storage/v1/object/{BUCKET}', json={'prefixes': [path]})
        response.raise_for_status()
    except httpx.HTTPError:
        # Un errore di pulizia non rende fallito un aggiornamento già confermato.
        logger.warning('Pulizia di una foto documento precedente non riuscita.')


def document_error(error: httpx.HTTPError):
    return HTTPException(503, 'Operazione sul documento non riuscita. Verifica la foto prima di riprovare e che 036_customer_documents.sql sia stata eseguita.')


def read_document(client: httpx.Client, user_id: UUID, customer_id: UUID):
    get_operator_session(client, user_id)
    try:
        return document_link(client, customer_document(client, customer_id)['document_path'], customer_id)
    except httpx.HTTPError as error:
        raise document_error(error) from error


def validate_image(data: bytes, content_type: str):
    if len(data) > MAX_DOCUMENT_BYTES:
        raise HTTPException(413, 'La foto può occupare al massimo 5 MB.')
    matches = {
        'image/jpeg': data.startswith(b'\xff\xd8\xff'),
        'image/png': data.startswith(b'\x89PNG\r\n\x1a\n'),
        'image/webp': len(data) >= 12 and data[:4] == b'RIFF' and data[8:12] == b'WEBP',
    }
    if content_type not in IMAGE_EXTENSIONS or not matches.get(content_type):
        raise HTTPException(422, 'Seleziona una foto JPEG, PNG o WebP valida.')


def upload_document(client: httpx.Client, user_id: UUID, customer_id: UUID, data: bytes, content_type: str):
    get_operator_session(client, user_id)
    validate_image(data, content_type)
    path = f'{customer_id}/{uuid4()}.{IMAGE_EXTENSIONS[content_type]}'
    try:
        previous = customer_document(client, customer_id)['document_path']
        response = client.post(f'/storage/v1/object/{BUCKET}/{path}', content=data,
                              headers={'Content-Type': content_type, 'x-upsert': 'false', 'cache-control': 'private, max-age=0'})
        response.raise_for_status()
        try:
            set_document(client, customer_id, path)
        except (httpx.HTTPError, HTTPException):
            # Non eliminare il file se il salvataggio è riuscito ma la risposta è andata persa.
            try:
                current = customer_document(client, customer_id)['document_path']
                if current != path:
                    remove_file(client, path, customer_id)
            except (httpx.HTTPError, HTTPException):
                pass
            raise
        if previous != path:
            remove_file(client, previous, customer_id)
        return document_link(client, path, customer_id)
    except httpx.HTTPError as error:
        raise document_error(error) from error


def delete_document(client: httpx.Client, user_id: UUID, customer_id: UUID):
    get_operator_session(client, user_id)
    try:
        previous = customer_document(client, customer_id)['document_path']
        set_document(client, customer_id, None)
        remove_file(client, previous, customer_id)
        return {'url': None}
    except httpx.HTTPError as error:
        raise document_error(error) from error
