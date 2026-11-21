from functools import lru_cache

from sqlalchemy import Engine, create_engine
from sqlalchemy.engine import make_url
from sqlalchemy.orm import Session, sessionmaker

from app.core.config import get_settings


def get_database_url() -> str:
    configured_url = get_settings().database_url
    if configured_url is None:
        raise RuntimeError("Configurare DATABASE_URL nel file backend/.env.")
    url = make_url(configured_url.get_secret_value())
    if url.drivername != "postgresql+psycopg":
        raise RuntimeError("DATABASE_URL deve usare il driver postgresql+psycopg.")
    return url.render_as_string(hide_password=False)


@lru_cache
def get_engine() -> Engine:
    return create_engine(get_database_url(), pool_pre_ping=True)


@lru_cache
def get_session_factory() -> sessionmaker[Session]:
    return sessionmaker(bind=get_engine(), autoflush=False, expire_on_commit=False)
