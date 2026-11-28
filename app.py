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


def require_admin(authorization: Optional[str]):
    user, token = require_user(authorization)
    if not user.get("is_admin"):
        raise HTTPException(status_code=403, detail="Chỉ tài khoản Admin mới có quyền chỉnh cầu!")
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


@app.get("/admin")
async def admin_page():
    return FileResponse(STATIC_DIR / "admin.html")


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
        crash = 1.0 if r < 0.05 else max(1.05, round(0.96 / max(1e-6, 1.0 - r), 2))
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


class AdminPresetReq(BaseModel):
    game: str = Field(..., pattern="^(taixiu|sicbo|xocdia|baccarat|rongho|wheel|aviator|baucua)$")
    session_id: int
    mode: str = "custom"
    dice: Optional[list[int]] = None
    crash_at: Optional[float] = None
    faces: Optional[list[int]] = None


class AdminBatchReq(BaseModel):
    game: str = Field(..., pattern="^(taixiu|sicbo|xocdia|baccarat|rongho|wheel|aviator)$")
    start_session_id: int
    sequence: str = Field(..., min_length=1, max_length=200)


class AdminBalanceReq(BaseModel):
    user_id: int
    balance: int = Field(..., ge=0, le=100000000000)


def _build_admin_outcome(game: str, mode: str, dice=None, crash_at=None, faces=None) -> Dict[str, Any]:
    m = mode.strip().lower()
    if game in ("taixiu", "sicbo"):
        if dice and len(dice) == 3 and all(1 <= int(x) <= 6 for x in dice):
            d = [int(x) for x in dice]
        elif m in ("tai", "t"):
            d = random.choice([[4, 5, 6], [3, 5, 6], [4, 4, 6], [2, 5, 6], [3, 4, 5]])
        elif m in ("xiu", "x"):
            d = random.choice([[1, 2, 3], [1, 2, 4], [2, 3, 4], [1, 3, 5], [1, 1, 5]])
        elif m in ("bao", "b"):
            v = random.randint(1, 6)
            d = [v, v, v]
        else:
            d = [random.randint(1, 6) for _ in range(3)]
        s = sum(d)
        is_t = d[0] == d[1] == d[2]
        kind = "B" if is_t else ("T" if s >= 11 else "X")
        lbl = f"BÃO ({d[0]}-{d[1]}-{d[2]})" if is_t else (f"TÀI ({s})" if s >= 11 else f"XỈU ({s})")
        return {"outcome": {"dice": d}, "summary": f"{d[0]}-{d[1]}-{d[2]} ({lbl})", "badge": str(s), "kind": kind}

    if game == "xocdia":
        if m in ("chan", "c"):
            coins = random.choice([[1, 1, 0, 0], [1, 0, 1, 0], [1, 1, 1, 1], [0, 0, 0, 0]])
        elif m in ("le", "l"):
            coins = random.choice([[1, 1, 1, 0], [0, 0, 0, 1]])
        elif m == "red4":
            coins = [1, 1, 1, 1]
        elif m == "white4":
            coins = [0, 0, 0, 0]
        else:
            coins = [random.choice([0, 1]) for _ in range(4)]
        reds = sum(coins)
        even = reds % 2 == 0
        return {"outcome": {"coins": coins}, "summary": f"{reds} Đỏ {4-reds} Trắng", "badge": "C" if even else "L", "kind": "chan" if even else "le"}

    if game == "baccarat":
        if m in ("player", "p"):
            pC = [{"suit": "♠", "rank": "9", "red": False}, {"suit": "♥", "rank": "10", "red": True}]
            bC = [{"suit": "♦", "rank": "4", "red": True}, {"suit": "♣", "rank": "K", "red": False}]
            ps, bs, win = 9, 4, "player"
        elif m in ("banker", "b"):
            pC = [{"suit": "♠", "rank": "3", "red": False}, {"suit": "♥", "rank": "K", "red": True}]
            bC = [{"suit": "♦", "rank": "8", "red": True}, {"suit": "♣", "rank": "10", "red": False}]
            ps, bs, win = 3, 8, "banker"
        else:
            pC = [{"suit": "♠", "rank": "7", "red": False}, {"suit": "♥", "rank": "10", "red": True}]
            bC = [{"suit": "♦", "rank": "7", "red": True}, {"suit": "♣", "rank": "K", "red": False}]
            ps, bs, win = 7, 7, "tie"
        badge = "P" if win == "player" else ("B" if win == "banker" else "H")
        return {"outcome": {"pCards": pC, "bCards": bC, "pScore": ps, "bScore": bs, "winner": win}, "summary": f"{win.upper()} ({ps} vs {bs})", "badge": badge, "kind": win}

    if game == "rongho":
        if m in ("rong", "r"):
            cR, cH, win = {"suit": "♠", "rank": "K", "red": False}, {"suit": "♥", "rank": "5", "red": True}, "rong"
        elif m in ("ho", "h"):
            cR, cH, win = {"suit": "♠", "rank": "4", "red": False}, {"suit": "♥", "rank": "Q", "red": True}, "ho"
        else:
            cR, cH, win = {"suit": "♠", "rank": "8", "red": False}, {"suit": "♥", "rank": "8", "red": True}, "tie"
        badge = "R" if win == "rong" else ("H" if win == "ho" else "Hòa")
        return {"outcome": {"cR": cR, "cH": cH, "winSide": win}, "summary": f"{cR['rank']} vs {cH['rank']}", "badge": badge, "kind": win}

    if game == "wheel":
        if m in ("green", "0", "g"):
            slot, out = 0, "green"
        elif m in ("red", "d", "r"):
            slot, out = random.choice([1, 3, 5, 7, 9, 11, 13]), "red"
        else:
            slot, out = random.choice([2, 4, 6, 8, 10, 12, 14]), "black"
        badge = "0" if out == "green" else ("Đ" if out == "red" else "X")
        return {"outcome": {"slot": slot, "outcome": out}, "summary": f"Về ô {out}", "badge": badge, "kind": out}

    if game == "aviator":
        c_val = max(1.0, round(float(crash_at or 2.0), 2))
        return {"outcome": {"crashAt": c_val}, "summary": f"Nổ ở {c_val:.2f}x", "badge": f"{c_val:.1f}x", "kind": "win" if c_val >= 2 else "lose"}

    if game == "baucua":
        f = faces if (faces and len(faces) == 3) else [random.randint(0, 5) for _ in range(3)]
        names = ["Nai", "Bầu", "Gà", "Cá", "Cua", "Tôm"]
        icons = ["🦌", "🍐", "🐓", "🐟", "🦀", "🦐"]
        return {"outcome": {"faces": f}, "summary": "-".join(names[i] for i in f), "badge": "".join(icons[i] for i in f), "kind": "win"}

    return _generate_seeded_outcome(game, 1)


@app.post("/api/admin/preset")
async def admin_preset(req: AdminPresetReq, authorization: Optional[str] = Header(None)):
    require_admin(authorization)
    gen = _build_admin_outcome(req.game, req.mode, req.dice, req.crash_at, req.faces)
    with get_conn() as conn:
        conn.execute(
            "INSERT OR REPLACE INTO global_rounds (game, session_id, outcome_json, summary, badge, kind) VALUES (?, ?, ?, ?, ?, ?)",
            (req.game, req.session_id, json.dumps(gen["outcome"]), gen["summary"], gen["badge"], gen["kind"]),
        )
    return {"ok": True, "session_id": req.session_id, **gen}


@app.post("/api/admin/batch_preset")
async def admin_batch_preset(req: AdminBatchReq, authorization: Optional[str] = Header(None)):
    require_admin(authorization)
    tokens = [t.strip() for t in req.sequence.replace(" ", ",").split(",") if t.strip()]
    saved = []
    with get_conn() as conn:
        for idx, tok in enumerate(tokens[:30]):
            sid = req.start_session_id + idx
            if req.game == "aviator":
                try:
                    val = float(tok.lower().replace("x", ""))
                except ValueError:
                    val = 2.0
                gen = _build_admin_outcome("aviator", "custom", crash_at=val)
            else:
                gen = _build_admin_outcome(req.game, tok)
            conn.execute(
                "INSERT OR REPLACE INTO global_rounds (game, session_id, outcome_json, summary, badge, kind) VALUES (?, ?, ?, ?, ?, ?)",
                (req.game, sid, json.dumps(gen["outcome"]), gen["summary"], gen["badge"], gen["kind"]),
            )
            saved.append({"session_id": sid, "summary": gen["summary"], "badge": gen["badge"], "kind": gen["kind"]})
    return {"ok": True, "count": len(saved), "presets": saved}


@app.get("/api/admin/presets/{game}")
async def admin_list_presets(game: str, authorization: Optional[str] = Header(None)):
    require_admin(authorization)
    with get_conn() as conn:
        rows = conn.execute(
            "SELECT session_id, summary, badge, kind, created_at FROM global_rounds WHERE game = ? ORDER BY session_id DESC LIMIT 20",
            (game,),
        ).fetchall()
        return {"presets": [dict(r) for r in rows]}


@app.post("/api/admin/clear_history/{game}")
async def admin_clear_history(game: str, authorization: Optional[str] = Header(None)):
    require_admin(authorization)
    with get_conn() as conn:
        conn.execute("DELETE FROM game_history WHERE game = ?", (game,))
    return {"ok": True}


@app.get("/api/admin/users")
async def admin_users(authorization: Optional[str] = Header(None)):
    require_admin(authorization)
    with get_conn() as conn:
        rows = conn.execute(
            "SELECT id, username, display_name, balance, total_wagered, total_payout, total_rounds, is_admin FROM users ORDER BY id ASC LIMIT 50"
        ).fetchall()
        return {"users": [dict(r) for r in rows]}


@app.post("/api/admin/user_balance")
async def admin_set_balance(req: AdminBalanceReq, authorization: Optional[str] = Header(None)):
    require_admin(authorization)
    with get_conn() as conn:
        conn.execute("UPDATE users SET balance = ? WHERE id = ?", (req.balance, req.user_id))
    return {"ok": True}
