"""Esegue i test backend in un cluster PostgreSQL locale effimero, senza Supabase."""
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile

root = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(root / 'backend'))
import psycopg  # noqa: E402

initdb = shutil.which('initdb')
pg_ctl = shutil.which('pg_ctl')
if not initdb or not pg_ctl:
    raise SystemExit('Servono i binari PostgreSQL locali initdb e pg_ctl.')

with tempfile.TemporaryDirectory(prefix='skirenting-confirmation-', dir='/private/tmp') as folder:
    data = str(Path(folder) / 'data')
    subprocess.run([initdb, '-D', data, '-A', 'trust', '--no-locale', '-E', 'UTF8'], check=True, capture_output=True)
    started = False
    try:
        subprocess.run([pg_ctl, '-D', data, '-l', str(Path(folder) / 'server.log'), '-o', f"-k {folder} -p 55449 -h ''", 'start'], check=True, capture_output=True)
        started = True
        with psycopg.connect(dbname='postgres', host=folder, port=55449, autocommit=True) as conn:
            conn.execute('create role anon; create role authenticated;')
        result = subprocess.run([sys.executable, '-m', 'pytest', '-q'], cwd=root / 'backend', env={
            **os.environ, 'SKIRENTING_TEST_PG_HOST': folder, 'SKIRENTING_TEST_PG_PORT': '55449',
        })
    finally:
        if started:
            subprocess.run([pg_ctl, '-D', data, 'stop', '-m', 'fast'], check=True, capture_output=True)
    raise SystemExit(result.returncode)
