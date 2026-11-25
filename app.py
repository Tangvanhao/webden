import secrets
from pathlib import Path
from typing import Optional

from fastapi import FastAPI, Header, HTTPException
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from database import (
    get_conn,
    get_user_by_token,
    hash_password,
    init_db,
    user_to_dict,
    verify_password,
)

BASE_DIR = Path(__file__).resolve().parent
STATIC_DIR = BASE_DIR / "static"
STATIC_DIR.mkdir(exist_ok=True)

app = FastAPI(title="Luxury Game Hub (Xu Ảo)", version="2.0.0")
init_db()

app.mount("/static", StaticFiles(directory=str(STATIC_DIR)), name="static")


def extract_token(authorization: Optional[str]) -> Optional[str]:
    if not authorization:
        return None
    if authorization.lower().startswith("bearer "):
        return authorization.split(" ", 1)[1].strip()
    return authorization.strip()


def require_user(authorization: Optional[str]):
    token = extract_token(authorization)
    user = get_user_by_token(token)
    if not user:
        raise HTTPException(status_code=401, detail="Vui lòng đăng nhập để thực hiện thao tác này.")
    return user, token


class RegisterReq(BaseModel):
    username: str = Field(..., min_length=3, max_length=24)
    password: str = Field(..., min_length=4, max_length=64)
    display_name: Optional[str] = Field(None, max_length=32)


class LoginReq(BaseModel):
    username: str
    password: str


class TransactionReq(BaseModel):
    tx_type: str = Field(..., pattern="^(nap|rut)$")
    amount: int = Field(..., ge=1000, le=10000000000)
    method: str = Field("Ví ảo Demo", max_length=40)
    note: str = Field("", max_length=120)


class RecordGameReq(BaseModel):
    game: str = Field(..., pattern="^(taixiu|baccarat|aviator|poker|baucua|wheel|xocdia|rongho|blackjack|mines|carrier|slots)$")
    wager: int = Field(..., ge=0)
    payout: int = Field(..., ge=0)
    summary: str = Field(..., max_length=160)
    badge: str = Field(..., max_length=16)
    kind: str = Field(..., max_length=16)


class CommentReq(BaseModel):
    game: str = Field(..., pattern="^(taixiu|baccarat|aviator|poker|baucua|wheel|xocdia|rongho|blackjack|mines|carrier|slots)$")
    text: str = Field(..., min_length=1, max_length=240)
    is_system: bool = False


@app.get("/")
async def index():
    return FileResponse(STATIC_DIR / "index.html")


@app.get("/api/health")
async def health():
    return {"status": "ok"}


@app.post("/api/auth/register")
async def register(req: RegisterReq):
    uname = req.username.strip().lower()
    dname = (req.display_name or req.username).strip()
    with get_conn() as conn:
        existing = conn.execute("SELECT id FROM users WHERE username = ?", (uname,)).fetchone()
        if existing:
            raise HTTPException(status_code=400, detail="Tên đăng nhập đã tồn tại.")
        cur = conn.execute(
            "INSERT INTO users (username, display_name, password_hash, balance) VALUES (?, ?, ?, ?)",
            (uname, dname, hash_password(req.password), 100000),
        )
        user_id = cur.lastrowid
        token = secrets.token_urlsafe(24)
        conn.execute("INSERT INTO sessions (token, user_id) VALUES (?, ?)", (token, user_id))
        row = conn.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone()
        return {"token": token, "user": user_to_dict(row)}


@app.post("/api/auth/login")
async def login(req: LoginReq):
    uname = req.username.strip().lower()
    with get_conn() as conn:
        row = conn.execute("SELECT * FROM users WHERE username = ?", (uname,)).fetchone()
        if not row or not verify_password(req.password, row["password_hash"]):
            raise HTTPException(status_code=401, detail="Sai tên đăng nhập hoặc mật khẩu.")
        token = secrets.token_urlsafe(24)
        conn.execute("INSERT INTO sessions (token, user_id) VALUES (?, ?)", (token, row["id"]))
        return {"token": token, "user": user_to_dict(row)}


@app.post("/api/auth/logout")
async def logout(authorization: Optional[str] = Header(None)):
    token = extract_token(authorization)
    if token:
        with get_conn() as conn:
            conn.execute("DELETE FROM sessions WHERE token = ?", (token,))
    return {"ok": True}


@app.get("/api/auth/me")
async def me(authorization: Optional[str] = Header(None)):
    user, _ = require_user(authorization)
    return {"user": user}


@app.post("/api/wallet/transaction")
async def wallet_transaction(req: TransactionReq, authorization: Optional[str] = Header(None)):
    user, _ = require_user(authorization)
    with get_conn() as conn:
        row = conn.execute("SELECT balance FROM users WHERE id = ?", (user["id"],)).fetchone()
        bal = row["balance"]
        if req.tx_type == "rut" and bal < req.amount:
            raise HTTPException(status_code=400, detail="Số dư xu không đủ để rút.")
        new_bal = bal + req.amount if req.tx_type == "nap" else bal - req.amount
        conn.execute("UPDATE users SET balance = ? WHERE id = ?", (new_bal, user["id"]))
        conn.execute(
            "INSERT INTO transactions (user_id, tx_type, amount, method, note) VALUES (?, ?, ?, ?, ?)",
            (user["id"], req.tx_type, req.amount, req.method, req.note),
        )
        updated = conn.execute("SELECT * FROM users WHERE id = ?", (user["id"],)).fetchone()
        return {"user": user_to_dict(updated)}


@app.get("/api/wallet/transactions")
async def list_transactions(authorization: Optional[str] = Header(None)):
    user, _ = require_user(authorization)
    with get_conn() as conn:
        rows = conn.execute(
            "SELECT id, tx_type, amount, method, note, created_at FROM transactions WHERE user_id = ? ORDER BY id DESC LIMIT 20",
            (user["id"],),
        ).fetchall()
        return {"transactions": [dict(r) for r in rows]}


@app.post("/api/game/record")
async def record_game(req: RecordGameReq, authorization: Optional[str] = Header(None)):
    user = get_user_by_token(extract_token(authorization))
    with get_conn() as conn:
        updated_user = None
        if user:
            row = conn.execute("SELECT balance, total_wagered, total_payout, total_rounds FROM users WHERE id = ?", (user["id"],)).fetchone()
            new_bal = max(0, row["balance"] - req.wager + req.payout)
            conn.execute(
                """
                UPDATE users
                SET balance = ?, total_wagered = total_wagered + ?, total_payout = total_payout + ?, total_rounds = total_rounds + 1
                WHERE id = ?
                """,
                (new_bal, req.wager, req.payout, user["id"]),
            )
            u_row = conn.execute("SELECT * FROM users WHERE id = ?", (user["id"],)).fetchone()
            updated_user = user_to_dict(u_row)

        conn.execute(
            "INSERT INTO game_history (game, user_id, summary, badge, kind) VALUES (?, ?, ?, ?, ?)",
            (req.game, user["id"] if user else None, req.summary, req.badge, req.kind),
        )
        return {"user": updated_user}


@app.get("/api/game/history/{game}")
async def get_game_history(game: str):
    with get_conn() as conn:
        rows = conn.execute(
            "SELECT id, game, summary, badge, kind, created_at FROM game_history WHERE game = ? ORDER BY id DESC LIMIT 25",
            (game,),
        ).fetchall()
        items = [dict(r) for r in reversed(rows)]
        return {"history": items}


@app.get("/api/comments/{game}")
async def get_comments(game: str):
    with get_conn() as conn:
        rows = conn.execute(
            "SELECT id, game, author, text, is_system, created_at FROM comments WHERE game = ? ORDER BY id DESC LIMIT 40",
            (game,),
        ).fetchall()
        items = [dict(r) for r in reversed(rows)]
        return {"comments": items}


@app.post("/api/comments")
async def post_comment(req: CommentReq, authorization: Optional[str] = Header(None)):
    user = get_user_by_token(extract_token(authorization))
    author = "Hệ thống" if req.is_system else (user["display_name"] if user else "Khách")
    with get_conn() as conn:
        conn.execute(
            "INSERT INTO comments (game, author, text, is_system) VALUES (?, ?, ?, ?)",
            (req.game, author, req.text.strip(), 1 if req.is_system else 0),
        )
        rows = conn.execute(
            "SELECT id, game, author, text, is_system, created_at FROM comments WHERE game = ? ORDER BY id DESC LIMIT 40",
            (req.game,),
        ).fetchall()
        return {"comments": [dict(r) for r in reversed(rows)]}


@app.post("/api/stats/reset")
async def reset_stats(authorization: Optional[str] = Header(None)):
    user, _ = require_user(authorization)
    with get_conn() as conn:
        conn.execute(
            "UPDATE users SET total_wagered = 0, total_payout = 0, total_rounds = 0 WHERE id = ?",
            (user["id"],),
        )
        u_row = conn.execute("SELECT * FROM users WHERE id = ?", (user["id"],)).fetchone()
        return {"user": user_to_dict(u_row)}


@app.get("/api/leaderboard")
async def leaderboard():
    with get_conn() as conn:
        rows = conn.execute(
            "SELECT display_name, balance, total_rounds FROM users ORDER BY balance DESC LIMIT 10"
        ).fetchall()
        return {"leaders": [dict(r) for r in rows]}
