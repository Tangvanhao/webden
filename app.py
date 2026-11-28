import json
import random
import secrets
from pathlib import Path
from typing import Any, Dict, Optional

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
    game: str = Field(..., pattern="^(taixiu|baccarat|aviator|poker|baucua|wheel|xocdia|rongho|blackjack|mines|carrier|slots|sicbo)$")
    wager: int = Field(..., ge=0)
    payout: int = Field(..., ge=0)
    summary: str = Field(..., max_length=160)
    badge: str = Field(..., max_length=16)
    kind: str = Field(..., max_length=16)
    session_id: Optional[int] = None


class CommentReq(BaseModel):
    game: str = Field(..., pattern="^(taixiu|baccarat|aviator|poker|baucua|wheel|xocdia|rongho|blackjack|mines|carrier|slots|sicbo)$")
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

        s_key = f"{req.game}:{req.session_id}" if req.session_id is not None else None
        if s_key:
            conn.execute(
                "INSERT OR IGNORE INTO game_history (game, user_id, session_key, summary, badge, kind) VALUES (?, ?, ?, ?, ?, ?)",
                (req.game, user["id"] if user else None, s_key, req.summary, req.badge, req.kind),
            )
        else:
            conn.execute(
                "INSERT INTO game_history (game, user_id, summary, badge, kind) VALUES (?, ?, ?, ?, ?)",
                (req.game, user["id"] if user else None, req.summary, req.badge, req.kind),
            )
        return {"user": updated_user}


def _generate_seeded_outcome(game: str, session_id: int) -> Dict[str, Any]:
    rng = random.Random(f"luxury-hub:{game}:{session_id}")
    if game in ("taixiu", "sicbo"):
        dice = [rng.randint(1, 6) for _ in range(3)]
        s = sum(dice)
        is_triple = dice[0] == dice[1] == dice[2]
        kind = "B" if is_triple else ("T" if s >= 11 else "X")
        lbl = f"BÃO ({dice[0]}-{dice[1]}-{dice[2]})" if is_triple else (f"TÀI ({s})" if s >= 11 else f"XỈU ({s})")
        return {"outcome": {"dice": dice}, "summary": f"{dice[0]}-{dice[1]}-{dice[2]} ({lbl})", "badge": str(s), "kind": kind}
    if game == "xocdia":
        coins = [rng.choice([0, 1]) for _ in range(4)]
        reds = sum(coins)
        even = reds % 2 == 0
        return {"outcome": {"coins": coins}, "summary": f"{reds} Đỏ {4-reds} Trắng", "badge": "C" if even else "L", "kind": "chan" if even else "le"}
    if game == "baucua":
        faces = [rng.randint(0, 5) for _ in range(3)]
        names = ["Nai", "Bầu", "Gà", "Cá", "Cua", "Tôm"]
        icons = ["🦌", "🍐", "🐓", "🐟", "🦀", "🦐"]
        return {"outcome": {"faces": faces}, "summary": "-".join(names[i] for i in faces), "badge": "".join(icons[i] for i in faces), "kind": "win"}
    if game == "wheel":
        slot = rng.randint(0, 14)
        out = "green" if slot == 0 else ("red" if slot % 2 == 1 else "black")
        badge = "0" if out == "green" else ("Đ" if out == "red" else "X")
        return {"outcome": {"slot": slot, "outcome": out}, "summary": f"Về ô {out}", "badge": badge, "kind": out}
    if game == "aviator":
        r = rng.random()
        crash = 1.0 if r < 0.05 else max(1.05, min(25.0, round(0.96 / (1 - r), 2)))
        return {"outcome": {"crashAt": crash}, "summary": f"Nổ ở {crash:.2f}x", "badge": f"{crash:.1f}x", "kind": "win" if crash >= 2 else "lose"}
    if game in ("baccarat", "rongho"):
        suits = ["♠", "♥", "♦", "♣"]
        ranks = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"]
        deck = [{"suit": s, "rank": r, "red": s in ("♥", "♦")} for s in suits for r in ranks]
        rng.shuffle(deck)
        if game == "rongho":
            cR, cH = deck.pop(), deck.pop()
            val = lambda rk: 1 if rk == "A" else (11 if rk == "J" else (12 if rk == "Q" else (13 if rk == "K" else int(rk))))
            vR, vH = val(cR["rank"]), val(cH["rank"])
            win_side = "rong" if vR > vH else ("ho" if vH > vR else "tie")
            badge = "R" if win_side == "rong" else ("H" if win_side == "ho" else "Hòa")
            return {"outcome": {"cR": cR, "cH": cH, "winSide": win_side}, "summary": f"{cR['rank']} vs {cH['rank']}", "badge": badge, "kind": win_side}
        bval = lambda c: 1 if c["rank"] == "A" else (0 if c["rank"] in ("10", "J", "Q", "K") else int(c["rank"]))
        hscore = lambda cs: sum(bval(c) for c in cs) % 10
        pC, bC = [deck.pop(), deck.pop()], [deck.pop(), deck.pop()]
        ps, bs = hscore(pC), hscore(bC)
        if ps < 8 and bs < 8:
            p3 = None
            if ps <= 5:
                p3 = deck.pop(); pC.append(p3)
            if p3 is None:
                if bs <= 5: bC.append(deck.pop())
            else:
                tv = bval(p3)
                if bs <= 2 or (bs == 3 and tv != 8) or (bs == 4 and 2 <= tv <= 7) or (bs == 5 and 4 <= tv <= 7) or (bs == 6 and tv in (6, 7)):
                    bC.append(deck.pop())
        ps, bs = hscore(pC), hscore(bC)
        win_side = "player" if ps > bs else ("banker" if bs > ps else "tie")
        badge = "P" if win_side == "player" else ("B" if win_side == "banker" else "H")
        return {"outcome": {"pCards": pC, "bCards": bC, "pScore": ps, "bScore": bs, "winner": win_side}, "summary": f"{win_side.upper()} ({ps} vs {bs})", "badge": badge, "kind": win_side}
    return {"outcome": {}, "summary": "OK", "badge": "OK", "kind": "win"}


@app.get("/api/live/round/{game}/{session_id}")
async def get_live_round(game: str, session_id: int):
    with get_conn() as conn:
        row = conn.execute(
            "SELECT outcome_json, summary, badge, kind FROM global_rounds WHERE game = ? AND session_id = ?",
            (game, session_id),
        ).fetchone()
        if row:
            return {
                "session_id": session_id,
                "outcome": json.loads(row["outcome_json"]),
                "summary": row["summary"],
                "badge": row["badge"],
                "kind": row["kind"],
            }
        gen = _generate_seeded_outcome(game, session_id)
        conn.execute(
            "INSERT OR IGNORE INTO global_rounds (game, session_id, outcome_json, summary, badge, kind) VALUES (?, ?, ?, ?, ?, ?)",
            (game, session_id, json.dumps(gen["outcome"]), gen["summary"], gen["badge"], gen["kind"]),
        )
        return {"session_id": session_id, **gen}


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
