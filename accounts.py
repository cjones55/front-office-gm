"""Player accounts and saved careers.

Uses the Postgres database in the DATABASE_URL secret when one is set (for
example a free Neon database). Without it, falls back to a SQLite file next to
the app, which is fine locally but is wiped whenever Streamlit Cloud restarts
the app.
"""
from __future__ import annotations

import hashlib
import hmac
import os
import re
import secrets
import sqlite3
import threading
import time
from pathlib import Path

NAME_RE = re.compile(r"^[A-Za-z0-9_.-]{3,20}$")
DOC_RE = re.compile(r"^(index|c_[A-Z]{2,3})$")
MAX_DOC = 1_500_000          # characters; a compressed save is about 150 KB
MAX_DOCS = 40                # 30 clubs plus the index, with room to spare
SESSION_DAYS = 60
PBKDF2_ROUNDS = 240_000

_SCHEMA = {
    "sqlite": [
        """CREATE TABLE IF NOT EXISTS users (
             id INTEGER PRIMARY KEY AUTOINCREMENT,
             name TEXT NOT NULL UNIQUE,
             display TEXT NOT NULL,
             pw TEXT NOT NULL,
             created BIGINT NOT NULL)""",
        """CREATE TABLE IF NOT EXISTS sessions (
             token TEXT PRIMARY KEY,
             user_id BIGINT NOT NULL,
             expires BIGINT NOT NULL)""",
        """CREATE TABLE IF NOT EXISTS docs (
             user_id BIGINT NOT NULL,
             name TEXT NOT NULL,
             body TEXT NOT NULL,
             at BIGINT NOT NULL,
             PRIMARY KEY (user_id, name))""",
    ],
    "pg": [
        """CREATE TABLE IF NOT EXISTS users (
             id BIGSERIAL PRIMARY KEY,
             name TEXT NOT NULL UNIQUE,
             display TEXT NOT NULL,
             pw TEXT NOT NULL,
             created BIGINT NOT NULL)""",
        """CREATE TABLE IF NOT EXISTS sessions (
             token TEXT PRIMARY KEY,
             user_id BIGINT NOT NULL,
             expires BIGINT NOT NULL)""",
        """CREATE TABLE IF NOT EXISTS docs (
             user_id BIGINT NOT NULL,
             name TEXT NOT NULL,
             body TEXT NOT NULL,
             at BIGINT NOT NULL,
             PRIMARY KEY (user_id, name))""",
    ],
}


class AccountError(Exception):
    """A problem to show the player (bad name, wrong password, ...)."""


class Store:
    def __init__(self, url: str | None = None, sqlite_path: str | Path | None = None):
        self.url = url
        self.kind = "pg" if url else "sqlite"
        self.sqlite_path = str(sqlite_path or Path(__file__).parent / "accounts.db")
        self._lock = threading.Lock()
        self._conn = None
        with self._lock:
            for sql in _SCHEMA[self.kind]:
                self._run(sql)

    # ---- connection -------------------------------------------------------
    def _connect(self):
        if self.kind == "pg":
            import psycopg  # only needed when a Postgres URL is configured

            url = self.url
            if url.startswith("postgres://"):
                url = "postgresql://" + url[len("postgres://"):]
            return psycopg.connect(url, autocommit=True, connect_timeout=15)
        conn = sqlite3.connect(self.sqlite_path, check_same_thread=False, isolation_level=None)
        conn.execute("PRAGMA journal_mode=WAL")
        return conn

    def _run(self, sql: str, args: tuple = (), fetch: str | None = None):
        """Runs one statement. Caller holds self._lock. Reconnects once if the
        database dropped the connection (Neon closes idle ones)."""
        if self.kind == "pg":
            sql = sql.replace("?", "%s")
        for attempt in (0, 1):
            try:
                if self._conn is None:
                    self._conn = self._connect()
                cur = self._conn.cursor()
                cur.execute(sql, args)
                if fetch == "one":
                    return cur.fetchone()
                if fetch == "all":
                    return cur.fetchall()
                return cur.rowcount
            except Exception as e:  # noqa: BLE001 - decide below whether to retry
                if attempt == 0 and _is_connection_error(e):
                    try:
                        self._conn.close()
                    except Exception:  # noqa: BLE001
                        pass
                    self._conn = None
                    continue
                raise

    def q(self, sql: str, args: tuple = (), fetch: str | None = None):
        with self._lock:
            return self._run(sql, args, fetch)

    # ---- accounts ---------------------------------------------------------
    def create_user(self, name: str, password: str) -> dict:
        name = (name or "").strip()
        if not NAME_RE.match(name):
            raise AccountError("Usernames are 3 to 20 letters, numbers, dots, dashes or underscores.")
        if len(password or "") < 6:
            raise AccountError("Passwords need at least 6 characters.")
        if len(password) > 200:
            raise AccountError("That password is too long.")
        key = name.lower()
        if self.q("SELECT id FROM users WHERE name = ?", (key,), "one"):
            raise AccountError("That username is taken.")
        try:
            row = self.q(
                "INSERT INTO users (name, display, pw, created) VALUES (?, ?, ?, ?) RETURNING id",
                (key, name, hash_password(password), int(time.time())),
                "one",
            )
        except Exception as e:  # a race with someone picking the same name
            if "unique" in str(e).lower():
                raise AccountError("That username is taken.") from e
            raise
        return {"id": int(row[0]), "name": name}

    def check_login(self, name: str, password: str) -> dict:
        row = self.q("SELECT id, display, pw FROM users WHERE name = ?", ((name or "").strip().lower(),), "one")
        if not row or not verify_password(password or "", row[2]):
            raise AccountError("Wrong username or password.")
        return {"id": int(row[0]), "name": row[1]}

    def new_session(self, user_id: int) -> str:
        token = secrets.token_urlsafe(32)
        now = int(time.time())
        self.q("DELETE FROM sessions WHERE expires < ?", (now,))
        self.q(
            "INSERT INTO sessions (token, user_id, expires) VALUES (?, ?, ?)",
            (_token_hash(token), user_id, now + SESSION_DAYS * 86400),
        )
        return token

    def user_for_token(self, token: str | None) -> dict | None:
        if not token or len(token) > 100:
            return None
        row = self.q(
            "SELECT u.id, u.display FROM sessions s JOIN users u ON u.id = s.user_id "
            "WHERE s.token = ? AND s.expires > ?",
            (_token_hash(token), int(time.time())),
            "one",
        )
        return {"id": int(row[0]), "name": row[1]} if row else None

    def end_session(self, token: str | None) -> None:
        if token:
            self.q("DELETE FROM sessions WHERE token = ?", (_token_hash(token),))

    # ---- saved careers ----------------------------------------------------
    def load_docs(self, user_id: int) -> dict[str, str]:
        rows = self.q("SELECT name, body FROM docs WHERE user_id = ?", (user_id,), "all") or []
        return {name: body for name, body in rows}

    def save_docs(self, user_id: int, docs: dict) -> int:
        """Writes the player's changed save documents. Returns how many."""
        if not isinstance(docs, dict):
            return 0
        clean = {k: v for k, v in docs.items() if isinstance(k, str) and DOC_RE.match(k) and isinstance(v, str) and len(v) <= MAX_DOC}
        if not clean:
            return 0
        have = {r[0] for r in (self.q("SELECT name FROM docs WHERE user_id = ?", (user_id,), "all") or [])}
        now = int(time.time() * 1000)
        n = 0
        for name, body in clean.items():
            if name not in have and len(have) >= MAX_DOCS:
                continue
            self.q(
                "INSERT INTO docs (user_id, name, body, at) VALUES (?, ?, ?, ?) "
                "ON CONFLICT (user_id, name) DO UPDATE SET body = excluded.body, at = excluded.at",
                (user_id, name, body, now),
            )
            have.add(name)
            n += 1
        return n


def hash_password(password: str) -> str:
    salt = secrets.token_bytes(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode(), salt, PBKDF2_ROUNDS)
    return f"pbkdf2_sha256${PBKDF2_ROUNDS}${salt.hex()}${digest.hex()}"


def verify_password(password: str, stored: str) -> bool:
    try:
        algo, rounds, salt, digest = stored.split("$")
        if algo != "pbkdf2_sha256":
            return False
        test = hashlib.pbkdf2_hmac("sha256", password.encode(), bytes.fromhex(salt), int(rounds))
        return hmac.compare_digest(test.hex(), digest)
    except (ValueError, TypeError):
        return False


def _token_hash(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def _is_connection_error(e: Exception) -> bool:
    name = type(e).__name__
    return name in {"OperationalError", "InterfaceError"} and "unique" not in str(e).lower()


def on_streamlit_cloud() -> bool:
    return Path(__file__).resolve().as_posix().startswith("/mount/src/") or os.environ.get("HOSTNAME") == "streamlit"
