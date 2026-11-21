from collections.abc import Iterator

from sqlalchemy.orm import Session

from app.db.session import get_session_factory


def get_db() -> Iterator[Session]:
    # I servizi gestiscono commit e transazioni; la chiusura annulla lavoro non confermato.
    with get_session_factory()() as session:
        yield session
