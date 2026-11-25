(function () {
  const Hub = window.GameHub;
  if (!Hub) return;

  const SUITS = ["♠", "♥", "♦", "♣"];
  const RANKS = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];

  function createDeck() {
    const deck = [];
    for (const s of SUITS) {
      for (const r of RANKS) {
        deck.push({ suit: s, rank: r, red: s === "♥" || s === "♦" });
      }
    }
    for (let i = deck.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [deck[i], deck[j]] = [deck[j], deck[i]];
    }
    return deck;
  }

  function cardHtml(c, extraClass = "") {
    return `<div class="playing-card ${c.red ? "red" : ""} ${extraClass}">
      <div class="card-corner">${c.rank}${c.suit}</div>
      <div class="card-center">${c.suit}</div>
      <div class="card-corner bottom">${c.rank}${c.suit}</div>
    </div>`;
  }

  /* =========================================================
     1. BACCARAT
     ========================================================= */
  function initBaccarat() {
    const root = document.getElementById("view-baccarat");
    let betSide = "player";
    let betAmt = 5000;
    let busy = false;

    root.innerHTML = `
      <section class="stage">
        <div class="status-banner" id="bac-status">Chọn cửa Player / Banker / Hòa và nhấn Chia Bài</div>
        <div class="bac-table">
          <div class="bac-hand">
            <div class="bac-label">PLAYER (<span id="bac-p-score">0</span> điểm)</div>
            <div class="card-row" id="bac-p-cards"></div>
          </div>
          <div class="bac-hand">
            <div class="bac-label">BANKER (<span id="bac-b-score">0</span> điểm)</div>
            <div class="card-row" id="bac-b-cards"></div>
          </div>
        </div>
        <div class="result-readout" id="bac-result"></div>
      </section>

      <section class="sub-board">
        <div class="sub-card active" data-bac="player"><div class="sub-title" style="color:var(--xiu)">PLAYER</div><div class="sub-odd">Thưởng 1:1</div></div>
        <div class="sub-card" data-bac="tie"><div class="sub-title" style="color:var(--green)">HÒA (TIE)</div><div class="sub-odd">Thưởng 1:8</div></div>
        <div class="sub-card" data-bac="banker"><div class="sub-title" style="color:var(--tai)">BANKER</div><div class="sub-odd">Thưởng 1:0.95</div></div>
      </section>

      <section class="controls">
        <div class="chips" id="bac-chips">
          <button class="chip" data-bval="1000">1K</button>
          <button class="chip selected" data-bval="5000">5K</button>
          <button class="chip" data-bval="10000">10K</button>
          <button class="chip" data-bval="50000">50K</button>
          <button class="chip" data-bval="allin" style="border-color:rgba(239,68,68,0.55);color:#fca5a5;">ALL IN</button>
        </div>
        <div class="actions">
          <button class="btn btn-gold" id="bac-deal-btn">Chia Bài</button>
        </div>
      </section>
    `;

    root.querySelectorAll("[data-bac]").forEach((el) => {
      el.onclick = () => {
        if (busy) return;
        root.querySelectorAll("[data-bac]").forEach((x) => x.classList.remove("active"));
        el.classList.add("active");
        betSide = el.dataset.bac;
        Hub.playBeep(700, 0.04);
      };
    });

    root.querySelectorAll("[data-bval]").forEach((btn) => {
      btn.onclick = () => {
        root.querySelectorAll("[data-bval]").forEach((b) => b.classList.remove("selected"));
        btn.classList.add("selected");
        betAmt = btn.dataset.bval === "allin" ? "allin" : Number(btn.dataset.bval);
        Hub.playBeep(660, 0.04);
      };
    });

    function bacVal(c) {
      if (c.rank === "A") return 1;
      if (["10", "J", "Q", "K"].includes(c.rank)) return 0;
      return Number(c.rank);
    }
    function handScore(cards) {
      return cards.reduce((s, c) => s + bacVal(c), 0) % 10;
    }

    document.getElementById("bac-deal-btn").onclick = () => {
      if (busy) return;
      const wager = betAmt === "allin" ? Hub.getBalance() : betAmt;
      if (wager <= 0 || !Hub.spend(wager)) {
        document.getElementById("bac-status").textContent = "Không đủ xu để đặt cược!";
        return;
      }
      busy = true;
      const deck = createDeck();
      const pCards = [deck.pop(), deck.pop()];
      const bCards = [deck.pop(), deck.pop()];

      let pScore = handScore(pCards);
      let bScore = handScore(bCards);

      // Standard Baccarat 3rd card rule
      if (pScore < 8 && bScore < 8) {
        let pThird = null;
        if (pScore <= 5) {
          pThird = deck.pop();
          pCards.push(pThird);
        }
        if (pThird === null) {
          if (bScore <= 5) bCards.push(deck.pop());
        } else {
          const tv = bacVal(pThird);
          if (
            bScore <= 2 ||
            (bScore === 3 && tv !== 8) ||
            (bScore === 4 && tv >= 2 && tv <= 7) ||
            (bScore === 5 && tv >= 4 && tv <= 7) ||
            (bScore === 6 && (tv === 6 || tv === 7))
          ) {
            bCards.push(deck.pop());
          }
        }
      }

      pScore = handScore(pCards);
      bScore = handScore(bCards);

      document.getElementById("bac-p-cards").innerHTML = pCards.map((c) => cardHtml(c)).join("");
      document.getElementById("bac-b-cards").innerHTML = bCards.map((c) => cardHtml(c)).join("");
      document.getElementById("bac-p-score").textContent = pScore;
      document.getElementById("bac-b-score").textContent = bScore;

      const winner = pScore > bScore ? "player" : bScore > pScore ? "banker" : "tie";
      let payout = 0;
      if (winner === betSide) {
        if (winner === "player") payout = wager * 2;
        else if (winner === "banker") payout = Math.floor(wager * 1.95);
        else payout = wager * 9;
      } else if (winner === "tie" && betSide !== "tie") {
        payout = wager; // Push on tie
      }

      Hub.win(payout);
      Hub.recordRound(wager, payout);
      const net = payout - wager;
      const winLabel = winner === "player" ? "PLAYER THẮNG" : winner === "banker" ? "BANKER THẮNG" : "HÒA (TIE)";
      document.getElementById("bac-result").innerHTML = `${winLabel} (${pScore} vs ${bScore}) · ${
        net >= 0 ? `<span style="color:var(--green)">+${Hub.fmt(net)} xu</span>` : `<span style="color:var(--tai)">${Hub.fmt(net)} xu</span>`
      }`;
      document.getElementById("bac-status").textContent = net > 0 ? "Chúc mừng bạn thắng Baccarat!" : net === 0 ? "Hòa tiền!" : "Chúc bạn may mắn ván sau!";
      Hub.playBeep(net > 0 ? 920 : 280, 0.12);
      busy = false;
    };
  }

  /* =========================================================
     2. LÁI MÁY BAY (AVIATOR / CRASH)
     ========================================================= */
  function initAviator() {
    const root = document.getElementById("view-aviator");
    let state = "idle"; // "idle" | "flying" | "crashed"
    let betAmt = 5000;
    let activeWager = 0;
    let cashedOut = false;
    let mult = 1.0;
    let crashAt = 2.0;
    let startTs = 0;
    let rafId = null;
    let crashHistory = [];

    root.innerHTML = `
      <section class="stage">
        <div class="status-banner" id="av-status">Đặt cược và nhấn Cất Cánh — Rút tiền trước khi máy bay nổ!</div>
        <div class="av-canvas-wrap">
          <canvas id="av-canvas" width="840" height="240"></canvas>
          <div class="av-mult" id="av-mult">1.00x</div>
        </div>
        <div class="av-history" id="av-history"></div>
      </section>

      <section class="controls">
        <div class="chips" id="av-chips">
          <button class="chip" data-aval="1000">1K</button>
          <button class="chip selected" data-aval="5000">5K</button>
          <button class="chip" data-aval="10000">10K</button>
          <button class="chip" data-aval="50000">50K</button>
          <button class="chip" data-aval="allin" style="border-color:rgba(239,68,68,0.55);color:#fca5a5;">ALL IN</button>
        </div>
        <div class="actions">
          <button class="btn btn-gold" id="av-action-btn">Cất Cánh</button>
        </div>
      </section>
    `;

    const canvas = document.getElementById("av-canvas");
    const ctx = canvas.getContext("2d");
    const multEl = document.getElementById("av-mult");
    const statusEl = document.getElementById("av-status");
    const actionBtn = document.getElementById("av-action-btn");
    const histEl = document.getElementById("av-history");

    root.querySelectorAll("[data-aval]").forEach((btn) => {
      btn.onclick = () => {
        if (state === "flying") return;
        root.querySelectorAll("[data-aval]").forEach((b) => b.classList.remove("selected"));
        btn.classList.add("selected");
        betAmt = btn.dataset.aval === "allin" ? "allin" : Number(btn.dataset.aval);
        Hub.playBeep(660, 0.04);
      };
    });

    function drawFlight(progress, crashed) {
      const w = canvas.width, h = canvas.height;
      ctx.clearRect(0, 0, w, h);

      // Subtle grid
      ctx.strokeStyle = "rgba(156,163,175,0.1)";
      ctx.lineWidth = 1;
      for (let x = 80; x < w; x += 80) {
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke();
      }
      for (let y = 48; y < h; y += 48) {
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
      }

      const endX = Math.min(w - 50, 40 + progress * (w - 110));
      const endY = Math.max(36, h - 30 - Math.pow(progress, 1.35) * (h - 75));

      ctx.beginPath();
      ctx.moveTo(30, h - 24);
      ctx.quadraticCurveTo(endX * 0.55, h - 24, endX, endY);
      ctx.strokeStyle = crashed ? "#ef4444" : "#f5b942";
      ctx.lineWidth = 3.5;
      ctx.stroke();

      // Area fill
      ctx.lineTo(endX, h - 24);
      ctx.closePath();
      ctx.fillStyle = crashed ? "rgba(239,68,68,0.12)" : "rgba(245,185,66,0.12)";
      ctx.fill();

      // Plane icon
      ctx.font = "26px sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(crashed ? "💥" : "✈️", endX, endY - 4);
    }

    function genCrashPoint() {
      const r = Math.random();
      if (r < 0.05) return 1.0;
      return Math.max(1.05, Math.min(25, Math.floor((0.96 / (1 - r)) * 100) / 100));
    }

    function renderCrashHist() {
      histEl.innerHTML = crashHistory.slice(-12).map((v) => {
        const cls = v >= 2 ? "hi" : "lo";
        return `<span class="av-badge ${cls}">${v.toFixed(2)}x</span>`;
      }).join("");
    }

    actionBtn.onclick = () => {
      if (state === "idle" || state === "crashed") {
        const wager = betAmt === "allin" ? Hub.getBalance() : betAmt;
        if (wager <= 0 || !Hub.spend(wager)) {
          statusEl.textContent = "Không đủ xu để cất cánh!";
          return;
        }
        activeWager = wager;
        cashedOut = false;
        mult = 1.0;
        crashAt = genCrashPoint();
        state = "flying";
        startTs = performance.now();
        multEl.style.color = "var(--gold)";
        actionBtn.textContent = "Rút Tiền (Cash Out)";
        statusEl.textContent = "Máy bay đang bay! Nhấn Rút Tiền trước khi nổ!";
        Hub.playBeep(520, 0.08);
        tick();
      } else if (state === "flying" && !cashedOut) {
        cashedOut = true;
        const payout = Math.floor(activeWager * mult);
        Hub.win(payout);
        Hub.recordRound(activeWager, payout);
        statusEl.innerHTML = `Đã rút thành công ở <strong style="color:var(--green)">${mult.toFixed(2)}x</strong> (+${Hub.fmt(payout - activeWager)} xu)!`;
        actionBtn.disabled = true;
        Hub.playBeep(960, 0.14);
      }
    };

    function tick() {
      if (state !== "flying") return;
      const elapsed = (performance.now() - startTs) / 1000;
      mult = Math.exp(0.16 * elapsed);
      if (mult >= crashAt) {
        mult = crashAt;
        state = "crashed";
        multEl.textContent = `${crashAt.toFixed(2)}x`;
        multEl.style.color = "var(--tai)";
        drawFlight(Math.min(1, elapsed / 12), true);
        if (!cashedOut) {
          Hub.recordRound(activeWager, 0);
          statusEl.textContent = `Máy bay đã nổ ở ${crashAt.toFixed(2)}x! Chúc may mắn lần sau.`;
          Hub.playBeep(210, 0.16);
        }
        crashHistory.push(crashAt);
        renderCrashHist();
        actionBtn.disabled = false;
        actionBtn.textContent = "Cất Cánh";
        return;
      }
      multEl.textContent = `${mult.toFixed(2)}x`;
      if (!cashedOut) {
        actionBtn.textContent = `Rút (${Hub.fmt(Math.floor(activeWager * mult))} xu)`;
      }
      drawFlight(Math.min(1, elapsed / 12), false);
      rafId = requestAnimationFrame(tick);
    }

    drawFlight(0.05, false);
  }

  /* =========================================================
     3. POKER (VIDEO POKER - JACKS OR BETTER)
     ========================================================= */
  function initPoker() {
    const root = document.getElementById("view-poker");
    let phase = "idle"; // "idle" | "holding"
    let betAmt = 5000;
    let activeWager = 0;
    let deck = [];
    let hand = [];
    let held = [false, false, false, false, false];

    root.innerHTML = `
      <section class="stage">
        <div class="status-banner" id="pk-status">Chọn mức cược và nhấn Chia 5 Lá (Jacks or Better)</div>
        <div class="card-row pk-row" id="pk-cards"></div>
        <div class="result-readout" id="pk-result"></div>
      </section>

      <section class="history-panel" style="font-size:12px;color:var(--muted);display:flex;flex-wrap:wrap;gap:12px;justify-content:center;">
        <span>Thùng Phá Sảnh Chúa: <strong style="color:var(--gold)">x250</strong></span>
        <span>Thùng Phá Sảnh: <strong style="color:var(--gold)">x50</strong></span>
        <span>Tứ Quý: <strong style="color:var(--gold)">x25</strong></span>
        <span>Cù Lũ: <strong style="color:var(--gold)">x9</strong></span>
        <span>Thùng: <strong style="color:var(--gold)">x6</strong></span>
        <span>Sảnh: <strong style="color:var(--gold)">x4</strong></span>
        <span>Sám Cô: <strong style="color:var(--gold)">x3</strong></span>
        <span>2 Đôi: <strong style="color:var(--gold)">x2</strong></span>
        <span>Đôi J+: <strong style="color:var(--gold)">x1</strong></span>
      </section>

      <section class="controls">
        <div class="chips" id="pk-chips">
          <button class="chip" data-pval="1000">1K</button>
          <button class="chip selected" data-pval="5000">5K</button>
          <button class="chip" data-pval="10000">10K</button>
          <button class="chip" data-pval="50000">50K</button>
          <button class="chip" data-pval="allin" style="border-color:rgba(239,68,68,0.55);color:#fca5a5;">ALL IN</button>
        </div>
        <div class="actions">
          <button class="btn btn-gold" id="pk-btn">Chia Bài</button>
        </div>
      </section>
    `;

    const cardsEl = document.getElementById("pk-cards");
    const statusEl = document.getElementById("pk-status");
    const resultEl = document.getElementById("pk-result");
    const btnEl = document.getElementById("pk-btn");

    root.querySelectorAll("[data-pval]").forEach((btn) => {
      btn.onclick = () => {
        if (phase === "holding") return;
        root.querySelectorAll("[data-pval]").forEach((b) => b.classList.remove("selected"));
        btn.classList.add("selected");
        betAmt = btn.dataset.pval === "allin" ? "allin" : Number(btn.dataset.pval);
        Hub.playBeep(660, 0.04);
      };
    });

    function renderHand() {
      cardsEl.innerHTML = hand.map((c, idx) => `
        <div class="pk-slot ${held[idx] ? "held" : ""}" data-idx="${idx}">
          <div class="pk-hold-tag">${held[idx] ? "GIỮ" : "ĐỔI"}</div>
          ${cardHtml(c)}
        </div>
      `).join("");
      if (phase === "holding") {
        cardsEl.querySelectorAll(".pk-slot").forEach((slot) => {
          slot.onclick = () => {
            const i = Number(slot.dataset.idx);
            held[i] = !held[i];
            Hub.playBeep(740, 0.03);
            renderHand();
          };
        });
      }
    }

    function rankNum(r) {
      if (r === "A") return 14;
      if (r === "K") return 13;
      if (r === "Q") return 12;
      if (r === "J") return 11;
      return Number(r);
    }

    function evalPoker(cards) {
      const nums = cards.map((c) => rankNum(c.rank)).sort((a, b) => a - b);
      const suits = new Set(cards.map((c) => c.suit));
      const isFlush = suits.size === 1;
      const isWheel = JSON.stringify(nums) === JSON.stringify([2, 3, 4, 5, 14]);
      const isStraight = isWheel || nums.every((v, i) => i === 0 || v === nums[i - 1] + 1);

      const counts = {};
      nums.forEach((n) => (counts[n] = (counts[n] || 0) + 1));
      const freqs = Object.values(counts).sort((a, b) => b - a);

      if (isFlush && JSON.stringify(nums) === JSON.stringify([10, 11, 12, 13, 14])) return { name: "Thùng Phá Sảnh Chúa (Royal Flush)", mult: 250 };
      if (isFlush && isStraight) return { name: "Thùng Phá Sảnh (Straight Flush)", mult: 50 };
      if (freqs[0] === 4) return { name: "Tứ Quý (Four of a Kind)", mult: 25 };
      if (freqs[0] === 3 && freqs[1] === 2) return { name: "Cù Lũ (Full House)", mult: 9 };
      if (isFlush) return { name: "Thùng (Flush)", mult: 6 };
      if (isStraight) return { name: "Sảnh (Straight)", mult: 4 };
      if (freqs[0] === 3) return { name: "Sám Cô (Three of a Kind)", mult: 3 };
      if (freqs[0] === 2 && freqs[1] === 2) return { name: "Hai Đôi (Two Pair)", mult: 2 };
      if (freqs[0] === 2) {
        const pairRank = Number(Object.keys(counts).find((k) => counts[k] === 2));
        if (pairRank >= 11) return { name: "Đôi J trở lên (Jacks or Better)", mult: 1 };
      }
      return { name: "Không có tay bài thưởng", mult: 0 };
    }

    btnEl.onclick = () => {
      if (phase === "idle") {
        const wager = betAmt === "allin" ? Hub.getBalance() : betAmt;
        if (wager <= 0 || !Hub.spend(wager)) {
          statusEl.textContent = "Không đủ xu để chia bài!";
          return;
        }
        activeWager = wager;
        deck = createDeck();
        hand = [deck.pop(), deck.pop(), deck.pop(), deck.pop(), deck.pop()];
        held = [false, false, false, false, false];
        phase = "holding";
        resultEl.textContent = "";
        btnEl.textContent = "Đổi Bài & Xét Thưởng";
        statusEl.textContent = "Nhấn vào các lá muốn GIỮ lại, rồi bấm Đổi Bài!";
        Hub.playBeep(600, 0.06);
        renderHand();
      } else {
        for (let i = 0; i < 5; i++) {
          if (!held[i]) hand[i] = deck.pop();
        }
        phase = "idle";
        btnEl.textContent = "Chia Bài";
        renderHand();
        const res = evalPoker(hand);
        const payout = res.mult > 0 ? activeWager * (res.mult + 1) : 0;
        Hub.win(payout);
        Hub.recordRound(activeWager, payout);
        const net = payout - activeWager;
        resultEl.innerHTML = `<strong>${res.name}</strong> · ${
          net >= 0 ? `<span style="color:var(--green)">+${Hub.fmt(net)} xu</span>` : `<span style="color:var(--tai)">${Hub.fmt(net)} xu</span>`
        }`;
        statusEl.textContent = res.mult > 0 ? "Chúc mừng! Bạn có tay bài thắng!" : "Chưa có tay bài thưởng, thử lại nhé!";
        Hub.playBeep(res.mult > 0 ? 940 : 260, 0.12);
      }
    };
  }

  /* =========================================================
     4. BẦU CUA TÔM CÁ
     ========================================================= */
  function initBauCua() {
    const root = document.getElementById("view-baucua");
    const FACES = [
      { id: "nai", name: "Nai", icon: "🦌" },
      { id: "bau", name: "Bầu", icon: "🍐" },
      { id: "ga", name: "Gà", icon: "🐓" },
      { id: "ca", name: "Cá", icon: "🐟" },
      { id: "cua", name: "Cua", icon: "🦀" },
      { id: "tom", name: "Tôm", icon: "🦐" },
    ];
    let chip = 5000;
    let bcBets = { nai: 0, bau: 0, ga: 0, ca: 0, cua: 0, tom: 0 };

    root.innerHTML = `
      <section class="stage">
        <div class="status-banner" id="bc-status">Chọn linh vật để đặt cược rồi nhấn Lắc Bầu Cua</div>
        <div class="bc-dice-row" id="bc-dice">
          <div class="bc-die">🦌</div><div class="bc-die">🦀</div><div class="bc-die">🦐</div>
        </div>
        <div class="result-readout" id="bc-result"></div>
      </section>
      <section class="bc-grid" id="bc-grid">
        ${FACES.map((f) => `
          <div class="sub-card" data-bc="${f.id}">
            <div style="font-size:28px">${f.icon}</div>
            <div class="sub-title">${f.name}</div>
            <div class="sub-amt" id="bc-amt-${f.id}">Cược: 0</div>
          </div>
        `).join("")}
      </section>
      <section class="controls">
        <div class="chips">
          <button class="chip" data-bcval="1000">1K</button>
          <button class="chip selected" data-bcval="5000">5K</button>
          <button class="chip" data-bcval="10000">10K</button>
          <button class="chip" data-bcval="50000">50K</button>
        </div>
        <div class="actions">
          <button class="btn" id="bc-clear">Xóa cược</button>
          <button class="btn btn-gold" id="bc-roll">Lắc Bầu Cua</button>
        </div>
      </section>
    `;

    function syncBC() {
      FACES.forEach((f) => {
        document.getElementById(`bc-amt-${f.id}`).textContent = `Cược: ${Hub.fmt(bcBets[f.id])}`;
        root.querySelector(`[data-bc="${f.id}"]`).classList.toggle("active", bcBets[f.id] > 0);
      });
    }

    root.querySelectorAll("[data-bcval]").forEach((btn) => {
      btn.onclick = () => {
        root.querySelectorAll("[data-bcval]").forEach((b) => b.classList.remove("selected"));
        btn.classList.add("selected");
        chip = Number(btn.dataset.bcval);
      };
    });

    root.querySelectorAll("[data-bc]").forEach((card) => {
      card.onclick = () => {
        if (!Hub.spend(chip)) {
          document.getElementById("bc-status").textContent = "Không đủ xu!";
          return;
        }
        bcBets[card.dataset.bc] += chip;
        Hub.playBeep(740, 0.04);
        syncBC();
      };
    });

    document.getElementById("bc-clear").onclick = () => {
      const ref = Object.values(bcBets).reduce((a, b) => a + b, 0);
      Hub.win(ref);
      bcBets = { nai: 0, bau: 0, ga: 0, ca: 0, cua: 0, tom: 0 };
      syncBC();
    };

    document.getElementById("bc-roll").onclick = () => {
      const total = Object.values(bcBets).reduce((a, b) => a + b, 0);
      if (total === 0) {
        document.getElementById("bc-status").textContent = "Hãy đặt ít nhất 1 linh vật!";
        return;
      }
      const res = [0, 1, 2].map(() => FACES[Math.floor(Math.random() * 6)]);
      document.getElementById("bc-dice").innerHTML = res.map((f) => `<div class="bc-die">${f.icon}</div>`).join("");

      let payout = 0;
      const counts = {};
      res.forEach((f) => (counts[f.id] = (counts[f.id] || 0) + 1));
      for (const [id, hits] of Object.entries(counts)) {
        if (bcBets[id] > 0) payout += bcBets[id] * (hits + 1);
      }
      Hub.win(payout);
      Hub.recordRound(total, payout);
      const net = payout - total;
      document.getElementById("bc-result").innerHTML = `Kết quả: ${res.map((f) => f.name).join(" · ")} · ${
        net >= 0 ? `<span style="color:var(--green)">+${Hub.fmt(net)} xu</span>` : `<span style="color:var(--tai)">${Hub.fmt(net)} xu</span>`
      }`;
      Hub.playBeep(net > 0 ? 900 : 260, 0.12);
      bcBets = { nai: 0, bau: 0, ga: 0, ca: 0, cua: 0, tom: 0 };
      syncBC();
    };
  }

  /* =========================================================
     5. VÒNG QUAY MAY MẮN (MINI ROULETTE / WHEEL)
     ========================================================= */
  function initWheel() {
    const root = document.getElementById("view-wheel");
    let pick = "red";
    let betAmt = 5000;
    let spinning = false;
    let angle = 0;

    root.innerHTML = `
      <section class="stage">
        <div class="status-banner" id="wh-status">Chọn màu Đỏ (1:1), Đen (1:1) hoặc Xanh 0 (1:14) rồi Quay!</div>
        <div class="wh-wrap">
          <div class="wh-pointer">▼</div>
          <div class="wh-disc" id="wh-disc"></div>
        </div>
        <div class="result-readout" id="wh-result"></div>
      </section>
      <section class="sub-board">
        <div class="sub-card active" data-wh="red"><div class="sub-title" style="color:var(--tai)">ĐỎ</div><div class="sub-odd">Thưởng 1:1</div></div>
        <div class="sub-card" data-wh="green"><div class="sub-title" style="color:var(--green)">XANH (0)</div><div class="sub-odd">Thưởng 1:14</div></div>
        <div class="sub-card" data-wh="black"><div class="sub-title" style="color:var(--text)">ĐEN</div><div class="sub-odd">Thưởng 1:1</div></div>
      </section>
      <section class="controls">
        <div class="chips">
          <button class="chip" data-wval="1000">1K</button>
          <button class="chip selected" data-wval="5000">5K</button>
          <button class="chip" data-wval="10000">10K</button>
          <button class="chip" data-wval="50000">50K</button>
          <button class="chip" data-wval="allin" style="border-color:rgba(239,68,68,0.55);color:#fca5a5;">ALL IN</button>
        </div>
        <div class="actions">
          <button class="btn btn-gold" id="wh-spin">Quay Ngay</button>
        </div>
      </section>
    `;

    root.querySelectorAll("[data-wh]").forEach((el) => {
      el.onclick = () => {
        if (spinning) return;
        root.querySelectorAll("[data-wh]").forEach((x) => x.classList.remove("active"));
        el.classList.add("active");
        pick = el.dataset.wh;
      };
    });
    root.querySelectorAll("[data-wval]").forEach((btn) => {
      btn.onclick = () => {
        root.querySelectorAll("[data-wval]").forEach((b) => b.classList.remove("selected"));
        btn.classList.add("selected");
        betAmt = btn.dataset.wval === "allin" ? "allin" : Number(btn.dataset.wval);
      };
    });

    document.getElementById("wh-spin").onclick = () => {
      if (spinning) return;
      const wager = betAmt === "allin" ? Hub.getBalance() : betAmt;
      if (wager <= 0 || !Hub.spend(wager)) {
        document.getElementById("wh-status").textContent = "Không đủ xu để quay!";
        return;
      }
      spinning = true;
      const disc = document.getElementById("wh-disc");
      // 15 segments: 0 = green, odd = red, even = black
      const slot = Math.floor(Math.random() * 15);
      const outcome = slot === 0 ? "green" : slot % 2 === 1 ? "red" : "black";
      const segAngle = 360 / 15;
      angle += 1080 + (360 - (slot * segAngle + segAngle / 2));
      disc.style.transform = `rotate(${angle}deg)`;
      Hub.playBeep(480, 0.1);

      setTimeout(() => {
        spinning = false;
        let payout = 0;
        if (outcome === pick) {
          payout = outcome === "green" ? wager * 15 : wager * 2;
        }
        Hub.win(payout);
        Hub.recordRound(wager, payout);
        const net = payout - wager;
        const label = outcome === "green" ? "XANH (0)" : outcome === "red" ? "ĐỎ" : "ĐEN";
        document.getElementById("wh-result").innerHTML = `Về ô: <strong>${label}</strong> · ${
          net >= 0 ? `<span style="color:var(--green)">+${Hub.fmt(net)} xu</span>` : `<span style="color:var(--tai)">${Hub.fmt(net)} xu</span>`
        }`;
        Hub.playBeep(net > 0 ? 920 : 250, 0.14);
      }, 1850);
    };
  }

  initBaccarat();
  initAviator();
  initPoker();
  initBauCua();
  initWheel();
})();
