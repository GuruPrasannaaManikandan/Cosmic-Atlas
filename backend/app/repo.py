"""Repository abstraction (SQLite now, PostgreSQL later) for datasets, profiles and the connector cache."""
from __future__ import annotations

import hashlib
import json
import os
import sqlite3
import threading
import time
import uuid
from typing import Protocol


class Repository(Protocol):
    def save_dataset(self, ds: dict) -> str: ...
    def get_dataset(self, dataset_id: str) -> dict | None: ...
    def find_profile(self, signature: str) -> dict | None: ...
    def save_profile(self, signature: str, name: str, mapping: list[dict]) -> str: ...
    def cache_get(self, key: str, ttl_s: int) -> str | None: ...
    def cache_put(self, key: str, value: str) -> None: ...


def signature_of(columns: list[str]) -> str:
    return hashlib.sha1("|".join(sorted(c.strip().lower() for c in columns)).encode()).hexdigest()[:16]


class SqliteRepository:
    def __init__(self, path: str | None = None):
        self.path = path or os.environ.get("ATLAS_DB", os.path.join(os.path.dirname(__file__), "..", "atlas.sqlite3"))
        os.makedirs(os.path.dirname(os.path.abspath(self.path)), exist_ok=True)
        self._lock = threading.Lock()
        with self._conn() as c:
            c.executescript(
                """CREATE TABLE IF NOT EXISTS datasets(id TEXT PRIMARY KEY, filename TEXT, fmt TEXT, columns TEXT, rows TEXT, mapping TEXT, created REAL);
                   CREATE TABLE IF NOT EXISTS profiles(id TEXT PRIMARY KEY, signature TEXT UNIQUE, name TEXT, mapping TEXT, updated REAL);
                   CREATE TABLE IF NOT EXISTS cache(key TEXT PRIMARY KEY, value TEXT, ts REAL);"""
            )

    def _conn(self):
        c = sqlite3.connect(self.path, timeout=10)
        c.row_factory = sqlite3.Row
        return c

    def ping(self) -> None:
        with self._conn() as c:
            c.execute("SELECT 1 FROM datasets LIMIT 1").fetchall()

    def save_dataset(self, ds: dict) -> str:
        did = ds.get("id") or uuid.uuid4().hex[:12]
        with self._lock, self._conn() as c:
            c.execute("INSERT OR REPLACE INTO datasets VALUES(?,?,?,?,?,?,?)", (did, ds["filename"], ds["format"], json.dumps(ds["columns"]), json.dumps(ds["rows"], default=str), json.dumps(ds["mapping"]), time.time()))
        return did

    def get_dataset(self, dataset_id: str) -> dict | None:
        with self._conn() as c:
            r = c.execute("SELECT * FROM datasets WHERE id=?", (dataset_id,)).fetchone()
        if not r:
            return None
        return {"id": r["id"], "filename": r["filename"], "format": r["fmt"], "columns": json.loads(r["columns"]), "rows": json.loads(r["rows"]), "mapping": json.loads(r["mapping"])}

    def find_profile(self, signature: str) -> dict | None:
        with self._conn() as c:
            r = c.execute("SELECT * FROM profiles WHERE signature=?", (signature,)).fetchone()
        return {"id": r["id"], "name": r["name"], "mapping": json.loads(r["mapping"])} if r else None

    def save_profile(self, signature: str, name: str, mapping: list[dict]) -> str:
        pid = "prof-" + signature[:8]
        with self._lock, self._conn() as c:
            c.execute("INSERT OR REPLACE INTO profiles VALUES(?,?,?,?,?)", (pid, signature, name, json.dumps(mapping), time.time()))
        return pid

    def cache_get(self, key: str, ttl_s: int) -> str | None:
        with self._conn() as c:
            r = c.execute("SELECT value, ts FROM cache WHERE key=?", (key,)).fetchone()
        return r["value"] if r and time.time() - r["ts"] < ttl_s else None

    def cache_put(self, key: str, value: str) -> None:
        with self._lock, self._conn() as c:
            c.execute("INSERT OR REPLACE INTO cache VALUES(?,?,?)", (key, value, time.time()))
