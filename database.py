import hashlib
import secrets
import sqlite3
from contextlib import contextmanager
from pathlib import Path
from typing import Any, Dict, List, Optional

DB_PATH = Path(__file__).resolve().parent / "gamehub.db"


def hash_password(password: str, salt: Optional[str] = None) -> str:
    salt = salt or secrets.token_hex(8)
    digest = hashlib.sha256(f"{salt}:{password}".encode("utf-8")).hexdigest()
    return f"{salt}${digest}"


def verify_password(password: str, stored: str) -> bool:
    if "$" not in stored:
        return False
    salt, _ = stored.split("$", 1)
    return hash_password(password, salt) == stored


@contextmanager
def get_conn():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    try:
        yield conn
        conn.commit()
    finally:
        conn.close()


def init_db() -> None:
    with get_conn() as conn:
        conn.executescript(
            """
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username TEXT UNIQUE NOT NULL,
                display_name TEXT NOT NULL,
                password_hash TEXT NOT NULL,
                balance INTEGER NOT NULL DEFAULT 100000,
                total_wagered INTEGER NOT NULL DEFAULT 0,
                total_payout INTEGER NOT NULL DEFAULT 0,
                total_rounds INTEGER NOT NULL DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS sessions (
                token TEXT PRIMARY KEY,
                user_id INTEGER NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id)
            );

            CREATE TABLE IF NOT EXISTS transactions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                tx_type TEXT NOT NULL,
                amount INTEGER NOT NULL,
                method TEXT NOT NULL,
                note TEXT DEFAULT '',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id)
            );

            CREATE TABLE IF NOT EXISTS game_history (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                game TEXT NOT NULL,
                user_id INTEGER,
                summary TEXT NOT NULL,
                badge TEXT NOT NULL,
                kind TEXT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS comments (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                game TEXT NOT NULL,
                author TEXT NOT NULL,
                text TEXT NOT NULL,
                is_system INTEGER NOT NULL DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
            """
        )

        # Seed default demo account if not exists
        cur = conn.execute("SELECT id FROM users WHERE username = ?", ("demo",))
        if cur.fetchone() is None:
            conn.execute(
                "INSERT INTO users (username, display_name, password_hash, balance) VALUES (?, ?, ?, ?)",
                ("demo", "Cao Thủ Demo", hash_password("123456"), 200000),
            )

        # Seed welcome comment if empty
        cur_c = conn.execute("SELECT COUNT(*) AS cnt FROM comments")
        if cur_c.fetchone()["cnt"] == 0:
            for g in ("taixiu", "baccarat", "aviator", "poker", "baucua", "wheel"):
                conn.execute(
                    "INSERT INTO comments (game, author, text, is_system) VALUES (?, ?, ?, 1)",
                    (g, "Hệ thống", "Chào mừng bạn đến với khu soi cầu & bình luận trực tuyến (Xu ảo)!"),
                )


def user_to_dict(row: sqlite3.Row) -> Dict[str, Any]:
    return {
        "id": row["id"],
        "username": row["username"],
        "display_name": row["display_name"],
        "balance": row["balance"],
        "total_wagered": row["total_wagered"],
        "total_payout": row["total_payout"],
        "total_rounds": row["total_rounds"],
    }


def get_user_by_token(token: Optional[str]) -> Optional[Dict[str, Any]]:
    if not token:
        return None
    with get_conn() as conn:
        row = conn.execute(
            """
            SELECT u.* FROM users u
            JOIN sessions s ON s.user_id = u.id
            WHERE s.token = ?
            """,
            (token,),
        ).fetchone()
        return user_to_dict(row) if row else None
