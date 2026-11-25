(function () {
  const Hub = window.GameHub;
  if (!Hub) return;

  const SUITS = ["♠", "♥", "♦", "♣"];
  const RANKS = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];

  function createDeck() {
    const deck = [];
    for (const s of SUITS) for (const r of RANKS) deck.push({ suit: s, rank: r, red: s === "♥" || s === "♦" });
    for (let i = deck.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [deck[i], deck[j]] = [deck[j], deck[i]];
    }
    return deck;
  }

  function cardHtml(c, peek = false) {
    const inner = `<div class="playing-card ${c.red ? "red" : ""}">
      <div class="card-corner">${c.rank}${c.suit}</div>
      <div class="card-center">${c.suit}</div>
      <div class="card-corner bottom">${c.rank}${c.suit}</div>
    </div>`;
    if (!peek) return inner;
    return `<div class="peek-wrap">${inner}<div class="peek-cover">KÉO NẶN</div></div>`;
  }

  function chipButtonsHtml(attr) {
    return `
      <button class="chip" ${attr}="1000">1K</button>
      <button class="chip selected" ${attr}="5000">5K</button>
      <button class="chip" ${attr}="10000">10K</button>
      <button class="chip" ${attr}="50000">50K</button>
      <button class="chip" ${attr}="100000">100K</button>
      <button class="chip" ${attr}="500000">500K</button>
      <button class="chip" ${attr}="1000000">1M</button>
      <button class="chip" ${attr}="5000000">5M</button>
      <button class="chip" ${attr}="10000000">10M</button>
      <button class="chip" ${attr}="allin" style="border-color:rgba(239,68,68,0.55);color:#fca5a5;">ALL IN</button>
    `;
  }

  /* 1. BACCARAT */
  function initBaccarat() {
    const root = document.getElementById("view-baccarat");
    let betSide = "player", betAmt = 5000, busy = false;
    root.innerHTML = `
      <section class="stage">
        <div class="status-banner" id="bac-status">Chọn cửa Player / Banker / Hòa và nhấn Chia Bài</div>
        <div class="bac-table">
          <div class="bac-hand"><div class="bac-label">PLAYER (<span id="bac-p-score">0</span> điểm)</div><div class="card-row" id="bac-p-cards"></div></div>
          <div class="bac-hand"><div class="bac-label">BANKER (<span id="bac-b-score">0</span> điểm)</div><div class="card-row" id="bac-b-cards"></div></div>
        </div>
        <div class="result-readout" id="bac-result"></div>
      </section>
      <section class="sub-board">
        <div class="sub-card active" data-bac="player"><div class="sub-title" style="color:var(--xiu)">PLAYER</div><div class="sub-odd">Thưởng 1:1</div></div>
        <div class="sub-card" data-bac="tie"><div class="sub-title" style="color:var(--green)">HÒA (TIE)</div><div class="sub-odd">Thưởng 1:8</div></div>
        <div class="sub-card" data-bac="banker"><div class="sub-title" style="color:var(--tai)">BANKER</div><div class="sub-odd">Thưởng 1:0.95</div></div>
      </section>
      <section class="controls">
        <div class="chips">${chipButtonsHtml("data-bval")}</div>
        <div class="actions"><button class="btn" id="bac-reveal-btn" style="display:none;">Mở Hết Bài</button><button class="btn btn-gold" id="bac-deal-btn">Chia Bài</button></div>
      </section>`;

    root.querySelectorAll("[data-bac]").forEach((el) => {
      el.onclick = () => { if (busy) return; root.querySelectorAll("[data-bac]").forEach((x) => x.classList.remove("active")); el.classList.add("active"); betSide = el.dataset.bac; };
    });
    root.querySelectorAll("[data-bval]").forEach((btn) => {
      btn.onclick = () => { root.querySelectorAll("[data-bval]").forEach((b) => b.classList.remove("selected")); btn.classList.add("selected"); betAmt = btn.dataset.bval === "allin" ? "allin" : Number(btn.dataset.bval); };
    });
    const bacVal = (c) => (c.rank === "A" ? 1 : ["10", "J", "Q", "K"].includes(c.rank) ? 0 : Number(c.rank));
    const handScore = (cards) => cards.reduce((s, c) => s + bacVal(c), 0) % 10;

    document.getElementById("bac-deal-btn").onclick = () => {
      if (busy) return;
      const wager = betAmt === "allin" ? Hub.getBalance() : betAmt;
      if (wager <= 0 || !Hub.spend(wager)) { document.getElementById("bac-status").textContent = "Không đủ xu!"; return; }
      busy = true;
      const deck = createDeck();
      const pCards = [deck.pop(), deck.pop()], bCards = [deck.pop(), deck.pop()];
      let pScore = handScore(pCards), bScore = handScore(bCards);
      if (pScore < 8 && bScore < 8) {
        let pThird = null;
        if (pScore <= 5) { pThird = deck.pop(); pCards.push(pThird); }
        if (!pThird) { if (bScore <= 5) bCards.push(deck.pop()); }
        else {
          const tv = bacVal(pThird);
          if (bScore <= 2 || (bScore === 3 && tv !== 8) || (bScore === 4 && tv >= 2 && tv <= 7) || (bScore === 5 && tv >= 4 && tv <= 7) || (bScore === 6 && (tv === 6 || tv === 7))) bCards.push(deck.pop());
        }
      }
      pScore = handScore(pCards); bScore = handScore(bCards);
      document.getElementById("bac-p-cards").innerHTML = pCards.map((c) => cardHtml(c, true)).join("");
      document.getElementById("bac-b-cards").innerHTML = bCards.map((c) => cardHtml(c, true)).join("");
      document.getElementById("bac-p-score").textContent = "?";
      document.getElementById("bac-b-score").textContent = "?";
      document.getElementById("bac-result").textContent = "";
      document.getElementById("bac-status").textContent = "Kéo từng lá để nặn bài hoặc nhấn 'Mở Hết Bài'!";
      const revBtn = document.getElementById("bac-reveal-btn");
      revBtn.style.display = "inline-block";

      let settled = false;
      const settleBac = () => {
        if (settled) return;
        settled = true;
        revBtn.style.display = "none";
        document.getElementById("bac-p-score").textContent = pScore;
        document.getElementById("bac-b-score").textContent = bScore;
        const winner = pScore > bScore ? "player" : bScore > pScore ? "banker" : "tie";
        let payout = 0;
        if (winner === betSide) payout = winner === "player" ? wager * 2 : winner === "banker" ? Math.floor(wager * 1.95) : wager * 9;
        else if (winner === "tie" && betSide !== "tie") payout = wager;

        Hub.win(payout);
        const net = payout - wager;
        const badge = winner === "player" ? "P" : winner === "banker" ? "B" : "H";
        Hub.recordRound("baccarat", wager, payout, `${winner.toUpperCase()} (${pScore} vs ${bScore})`, badge, winner);
        if (net >= 50000) Hub.sendComment(`Baccarat về ${winner.toUpperCase()} (${pScore}-${bScore}), thắng +${Hub.fmt(net)} xu!`, true, "baccarat");
        document.getElementById("bac-result").innerHTML = `${winner.toUpperCase()} (${pScore} vs ${bScore}) · ${net >= 0 ? `<span style="color:var(--green)">+${Hub.fmt(net)} xu</span>` : `<span style="color:var(--tai)">${Hub.fmt(net)} xu</span>`}`;
        document.getElementById("bac-status").textContent = net > 0 ? "Chúc mừng bạn thắng!" : "Sẵn sàng ván mới!";
        Hub.playBeep(net > 0 ? 920 : 280, 0.12);
        busy = false;
      };
      revBtn.onclick = () => {
        root.querySelectorAll(".peek-cover").forEach((c) => c.classList.add("revealed"));
        settleBac();
      };
      Hub.attachPeek(root, settleBac);
    };
  }

  /* 2. LÁI MÁY BAY */
  function initAviator() {
    const root = document.getElementById("view-aviator");
    let state = "idle", betAmt = 5000, activeWager = 0, cashedOut = false, mult = 1.0, crashAt = 2.0, startTs = 0;
    root.innerHTML = `
      <section class="stage">
        <div class="status-banner" id="av-status">Đặt cược và nhấn Cất Cánh — Rút tiền trước khi máy bay nổ!</div>
        <div class="av-canvas-wrap"><canvas id="av-canvas" width="840" height="220"></canvas><div class="av-mult" id="av-mult">1.00x</div></div>
      </section>
      <section class="controls">
        <div class="chips">${chipButtonsHtml("data-aval")}</div>
        <div class="actions"><button class="btn btn-gold" id="av-action-btn">Cất Cánh</button></div>
      </section>`;

    const canvas = document.getElementById("av-canvas"), ctx = canvas.getContext("2d");
    const multEl = document.getElementById("av-mult"), statusEl = document.getElementById("av-status"), actionBtn = document.getElementById("av-action-btn");
    root.querySelectorAll("[data-aval]").forEach((btn) => {
      btn.onclick = () => { if (state === "flying") return; root.querySelectorAll("[data-aval]").forEach((b) => b.classList.remove("selected")); btn.classList.add("selected"); betAmt = btn.dataset.aval === "allin" ? "allin" : Number(btn.dataset.aval); };
    });

    function drawFlight(progress, crashed) {
      const w = canvas.width, h = canvas.height;
      ctx.clearRect(0, 0, w, h);
      const endX = Math.min(w - 50, 40 + progress * (w - 110)), endY = Math.max(36, h - 30 - Math.pow(progress, 1.35) * (h - 75));
      ctx.beginPath(); ctx.moveTo(30, h - 24); ctx.quadraticCurveTo(endX * 0.55, h - 24, endX, endY);
      ctx.strokeStyle = crashed ? "#ef4444" : "#f5b942"; ctx.lineWidth = 3.5; ctx.stroke();
      ctx.lineTo(endX, h - 24); ctx.closePath();
      ctx.fillStyle = crashed ? "rgba(239,68,68,0.12)" : "rgba(245,185,66,0.12)"; ctx.fill();
      ctx.font = "26px sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillText(crashed ? "💥" : "✈️", endX, endY - 4);
    }

    actionBtn.onclick = () => {
      if (state !== "flying") {
        const wager = betAmt === "allin" ? Hub.getBalance() : betAmt;
        if (wager <= 0 || !Hub.spend(wager)) { statusEl.textContent = "Không đủ xu!"; return; }
        activeWager = wager; cashedOut = false; mult = 1.0;
        const r = Math.random();
        crashAt = r < 0.05 ? 1.0 : Math.max(1.05, Math.min(25, Math.floor((0.96 / (1 - r)) * 100) / 100));
        state = "flying"; startTs = performance.now(); multEl.style.color = "var(--gold)";
        actionBtn.textContent = "Rút Tiền"; statusEl.textContent = "Máy bay đang bay!";
        tick();
      } else if (!cashedOut) {
        cashedOut = true;
        const payout = Math.floor(activeWager * mult);
        Hub.win(payout);
        Hub.recordRound("aviator", activeWager, payout, `Rút ở ${mult.toFixed(2)}x`, `${mult.toFixed(1)}x`, "win");
        statusEl.innerHTML = `Rút thành công ở <strong style="color:var(--green)">${mult.toFixed(2)}x</strong> (+${Hub.fmt(payout - activeWager)} xu)!`;
        actionBtn.disabled = true; Hub.playBeep(960, 0.14);
      }
    };

    function tick() {
      if (state !== "flying") return;
      const elapsed = (performance.now() - startTs) / 1000;
      mult = Math.exp(0.16 * elapsed);
      if (mult >= crashAt) {
        mult = crashAt; state = "crashed"; multEl.textContent = `${crashAt.toFixed(2)}x`; multEl.style.color = "var(--tai)";
        drawFlight(Math.min(1, elapsed / 12), true);
        if (!cashedOut) {
          Hub.recordRound("aviator", activeWager, 0, `Nổ ở ${crashAt.toFixed(2)}x`, `${crashAt.toFixed(1)}x`, "lose");
          statusEl.textContent = `Máy bay nổ ở ${crashAt.toFixed(2)}x!`; Hub.playBeep(210, 0.16);
        }
        actionBtn.disabled = false; actionBtn.textContent = "Cất Cánh"; return;
      }
      multEl.textContent = `${mult.toFixed(2)}x`;
      if (!cashedOut) actionBtn.textContent = `Rút (${Hub.fmt(Math.floor(activeWager * mult))} xu)`;
      drawFlight(Math.min(1, elapsed / 12), false);
      requestAnimationFrame(tick);
    }
    drawFlight(0.05, false);
  }

  /* 3. POKER */
  function initPoker() {
    const root = document.getElementById("view-poker");
    let phase = "idle", betAmt = 5000, activeWager = 0, deck = [], hand = [], held = [false, false, false, false, false];
    root.innerHTML = `
      <section class="stage">
        <div class="status-banner" id="pk-status">Chọn mức cược và nhấn Chia 5 Lá (Jacks or Better)</div>
        <div class="card-row" id="pk-cards"></div>
        <div class="result-readout" id="pk-result"></div>
      </section>
      <section class="controls">
        <div class="chips">${chipButtonsHtml("data-pval")}</div>
        <div class="actions"><button class="btn btn-gold" id="pk-btn">Chia Bài</button></div>
      </section>`;

    const cardsEl = document.getElementById("pk-cards"), statusEl = document.getElementById("pk-status"), resultEl = document.getElementById("pk-result"), btnEl = document.getElementById("pk-btn");
    root.querySelectorAll("[data-pval]").forEach((btn) => {
      btn.onclick = () => { if (phase === "holding") return; root.querySelectorAll("[data-pval]").forEach((b) => b.classList.remove("selected")); btn.classList.add("selected"); betAmt = btn.dataset.pval === "allin" ? "allin" : Number(btn.dataset.pval); };
    });

    function renderHand() {
      cardsEl.innerHTML = hand.map((c, idx) => `<div class="pk-slot ${held[idx] ? "held" : ""}" data-idx="${idx}"><div class="pk-hold-tag">${held[idx] ? "GIỮ" : "ĐỔI"}</div>${cardHtml(c)}</div>`).join("");
      if (phase === "holding") cardsEl.querySelectorAll(".pk-slot").forEach((s) => (s.onclick = () => { const i = Number(s.dataset.idx); held[i] = !held[i]; renderHand(); }));
    }

    function evalPoker(cards) {
      const rankNum = (r) => (r === "A" ? 14 : r === "K" ? 13 : r === "Q" ? 12 : r === "J" ? 11 : Number(r));
      const nums = cards.map((c) => rankNum(c.rank)).sort((a, b) => a - b);
      const isFlush = new Set(cards.map((c) => c.suit)).size === 1;
      const isStraight = JSON.stringify(nums) === "[2,3,4,5,14]" || nums.every((v, i) => i === 0 || v === nums[i - 1] + 1);
      const counts = {}; nums.forEach((n) => (counts[n] = (counts[n] || 0) + 1));
      const freqs = Object.values(counts).sort((a, b) => b - a);
      if (isFlush && JSON.stringify(nums) === "[10,11,12,13,14]") return { name: "Royal Flush", badge: "RF", mult: 250 };
      if (isFlush && isStraight) return { name: "Straight Flush", badge: "SF", mult: 50 };
      if (freqs[0] === 4) return { name: "Tứ Quý", badge: "4K", mult: 25 };
      if (freqs[0] === 3 && freqs[1] === 2) return { name: "Cù Lũ", badge: "FH", mult: 9 };
      if (isFlush) return { name: "Thùng", badge: "FL", mult: 6 };
      if (isStraight) return { name: "Sảnh", badge: "ST", mult: 4 };
      if (freqs[0] === 3) return { name: "Sám Cô", badge: "3K", mult: 3 };
      if (freqs[0] === 2 && freqs[1] === 2) return { name: "Hai Đôi", badge: "2P", mult: 2 };
      if (freqs[0] === 2 && Number(Object.keys(counts).find((k) => counts[k] === 2)) >= 11) return { name: "Đôi J+", badge: "J+", mult: 1 };
      return { name: "Không thưởng", badge: "0", mult: 0 };
    }

    btnEl.onclick = () => {
      if (phase === "idle") {
        const wager = betAmt === "allin" ? Hub.getBalance() : betAmt;
        if (wager <= 0 || !Hub.spend(wager)) { statusEl.textContent = "Không đủ xu!"; return; }
        activeWager = wager; deck = createDeck(); hand = [0,1,2,3,4].map(() => deck.pop()); held = [false,false,false,false,false];
        phase = "holding"; resultEl.textContent = ""; btnEl.textContent = "Đổi Bài & Xét Thưởng"; statusEl.textContent = "Nhấn vào các lá muốn GIỮ lại rồi bấm Đổi Bài!"; renderHand();
      } else {
        for (let i = 0; i < 5; i++) if (!held[i]) hand[i] = deck.pop();
        phase = "idle"; btnEl.textContent = "Chia Bài"; renderHand();
        const res = evalPoker(hand); const payout = res.mult > 0 ? activeWager * (res.mult + 1) : 0;
        Hub.win(payout);
        Hub.recordRound("poker", activeWager, payout, res.name, res.badge, res.mult > 0 ? "win" : "lose");
        const net = payout - activeWager;
        resultEl.innerHTML = `<strong>${res.name}</strong> · ${net >= 0 ? `<span style="color:var(--green)">+${Hub.fmt(net)} xu</span>` : `<span style="color:var(--tai)">${Hub.fmt(net)} xu</span>`}`;
        Hub.playBeep(res.mult > 0 ? 940 : 260, 0.12);
      }
    };
  }

  /* 4. BẦU CUA (XOAY XÚC XẮC + NẶN BÁT) */
  function initBauCua() {
    const root = document.getElementById("view-baucua");
    const FACES = [{id:"nai",name:"Nai",icon:"🦌"},{id:"bau",name:"Bầu",icon:"🍐"},{id:"ga",name:"Gà",icon:"🐓"},{id:"ca",name:"Cá",icon:"🐟"},{id:"cua",name:"Cua",icon:"🦀"},{id:"tom",name:"Tôm",icon:"🦐"}];
    let chip = 5000, phase = "betting", pendingRes = [], bcBets = {nai:0,bau:0,ga:0,ca:0,cua:0,tom:0};
    root.innerHTML = `
      <section class="stage">
        <div class="status-banner" id="bc-status">Chọn linh vật đặt cược rồi nhấn Lắc Bầu Cua</div>
        <div class="bowl-area" id="bc-bowl">
          <div class="bc-dice-row" id="bc-dice"><div class="bc-die">🦌</div><div class="bc-die">🦀</div><div class="bc-die">🦐</div></div>
          <div class="bowl-lid open" id="bc-lid"><span>KÉO ĐỂ NẶN BÁT</span></div>
        </div>
        <div class="result-readout" id="bc-result"></div>
      </section>
      <section class="bc-grid">${FACES.map((f) => `<div class="sub-card" data-bc="${f.id}"><div style="font-size:28px">${f.icon}</div><div class="sub-title">${f.name}</div><div class="sub-amt" id="bc-amt-${f.id}">Cược: 0</div></div>`).join("")}</section>
      <section class="controls">
        <div class="chips">${chipButtonsHtml("data-bcval")}</div>
        <div class="actions"><button class="btn" id="bc-clear">Xóa cược</button><button class="btn btn-gold" id="bc-roll">Lắc Bầu Cua</button></div>
      </section>`;

    const lid = document.getElementById("bc-lid"), bowl = document.getElementById("bc-bowl"), rollBtn = document.getElementById("bc-roll");
    const syncBC = () => FACES.forEach((f) => { document.getElementById(`bc-amt-${f.id}`).textContent = `Cược: ${Hub.fmt(bcBets[f.id])}`; root.querySelector(`[data-bc="${f.id}"]`).classList.toggle("active", bcBets[f.id] > 0); });
    root.querySelectorAll("[data-bcval]").forEach((btn) => (btn.onclick = () => { root.querySelectorAll("[data-bcval]").forEach((b) => b.classList.remove("selected")); btn.classList.add("selected"); chip = btn.dataset.bcval === "allin" ? "allin" : Number(btn.dataset.bcval); }));
    root.querySelectorAll("[data-bc]").forEach((c) => (c.onclick = () => {
      if (phase !== "betting") return;
      const amt = chip === "allin" ? Hub.getBalance() : chip;
      if (amt <= 0 || !Hub.spend(amt)) return;
      bcBets[c.dataset.bc] += amt; Hub.playBeep(740, 0.04); syncBC();
    }));
    document.getElementById("bc-clear").onclick = () => { if (phase !== "betting") return; Hub.win(Object.values(bcBets).reduce((a, b) => a + b, 0)); bcBets = {nai:0,bau:0,ga:0,ca:0,cua:0,tom:0}; syncBC(); };

    function openBC() {
      if (phase !== "covered") return;
      lid.classList.remove("dragging"); lid.style.transform = ""; lid.classList.add("open");
      phase = "betting"; rollBtn.textContent = "Lắc Bầu Cua";
      const total = Object.values(bcBets).reduce((a, b) => a + b, 0);
      let payout = 0; const counts = {}; pendingRes.forEach((f) => (counts[f.id] = (counts[f.id] || 0) + 1));
      for (const [id, hits] of Object.entries(counts)) if (bcBets[id] > 0) payout += bcBets[id] * (hits + 1);
      Hub.win(payout);
      const net = payout - total;
      Hub.recordRound("baucua", total, payout, pendingRes.map((f) => f.name).join("-"), pendingRes.map((f) => f.icon).join(""), net >= 0 ? "win" : "lose");
      document.getElementById("bc-result").innerHTML = `${pendingRes.map((f) => f.name).join(" · ")} · ${net >= 0 ? `<span style="color:var(--green)">+${Hub.fmt(net)} xu</span>` : `<span style="color:var(--tai)">${Hub.fmt(net)} xu</span>`}`;
      document.getElementById("bc-status").textContent = net > 0 ? "Chúc mừng bạn thắng Bầu Cua!" : "Sẵn sàng ván mới!";
      Hub.playBeep(net > 0 ? 920 : 260, 0.12);
      bcBets = {nai:0,bau:0,ga:0,ca:0,cua:0,tom:0}; syncBC();
    }

    rollBtn.onclick = () => {
      if (phase === "covered") { openBC(); return; }
      if (phase !== "betting") return;
      const total = Object.values(bcBets).reduce((a, b) => a + b, 0);
      if (total === 0) return;
      phase = "shaking"; rollBtn.disabled = true; lid.classList.remove("open"); bowl.classList.add("shaking");
      document.querySelectorAll("#bc-dice .bc-die").forEach((d) => d.classList.add("spinning"));
      document.getElementById("bc-status").textContent = "Đang lắc Bầu Cua...";
      pendingRes = [0,1,2].map(() => FACES[Math.floor(Math.random() * 6)]);
      setTimeout(() => {
        bowl.classList.remove("shaking");
        document.getElementById("bc-dice").innerHTML = pendingRes.map((f) => `<div class="bc-die">${f.icon}</div>`).join("");
        phase = "covered"; lid.style.transform = ""; rollBtn.disabled = false; rollBtn.textContent = "Mở Bát";
        document.getElementById("bc-status").textContent = "Kéo nắp bát để nặn hoặc nhấn Mở Bát!";
      }, 900);
    };

    let drag = null;
    lid.addEventListener("pointerdown", (e) => { if (phase !== "covered") return; drag = { x: e.clientX, y: e.clientY }; lid.classList.add("dragging"); lid.setPointerCapture(e.pointerId); });
    lid.addEventListener("pointermove", (e) => { if (!drag || phase !== "covered") return; const dx = e.clientX - drag.x, dy = e.clientY - drag.y; lid.style.transform = `translate(${dx}px,${dy}px)`; if (Math.hypot(dx, dy) >= 110) { drag = null; openBC(); } });
    const stop = () => { if (!drag) return; drag = null; lid.classList.remove("dragging"); if (phase === "covered") lid.style.transform = ""; };
    lid.addEventListener("pointerup", stop); lid.addEventListener("pointercancel", stop);
  }

  /* 5. VÒNG QUAY */
  function initWheel() {
    const root = document.getElementById("view-wheel");
    let pick = "red", betAmt = 5000, spinning = false, angle = 0;
    root.innerHTML = `
      <section class="stage">
        <div class="status-banner" id="wh-status">Chọn Đỏ (1:1), Đen (1:1) hoặc Xanh 0 (1:14) rồi Quay!</div>
        <div class="wh-wrap"><div class="wh-pointer">▼</div><div class="wh-disc" id="wh-disc"></div></div>
        <div class="result-readout" id="wh-result"></div>
      </section>
      <section class="sub-board">
        <div class="sub-card active" data-wh="red"><div class="sub-title" style="color:var(--tai)">ĐỎ</div><div class="sub-odd">Thưởng 1:1</div></div>
        <div class="sub-card" data-wh="green"><div class="sub-title" style="color:var(--green)">XANH (0)</div><div class="sub-odd">Thưởng 1:14</div></div>
        <div class="sub-card" data-wh="black"><div class="sub-title">ĐEN</div><div class="sub-odd">Thưởng 1:1</div></div>
      </section>
      <section class="controls">
        <div class="chips">${chipButtonsHtml("data-wval")}</div>
        <div class="actions"><button class="btn btn-gold" id="wh-spin">Quay Ngay</button></div>
      </section>`;

    root.querySelectorAll("[data-wh]").forEach((el) => (el.onclick = () => { if (spinning) return; root.querySelectorAll("[data-wh]").forEach((x) => x.classList.remove("active")); el.classList.add("active"); pick = el.dataset.wh; }));
    root.querySelectorAll("[data-wval]").forEach((btn) => (btn.onclick = () => { root.querySelectorAll("[data-wval]").forEach((b) => b.classList.remove("selected")); btn.classList.add("selected"); betAmt = btn.dataset.wval === "allin" ? "allin" : Number(btn.dataset.wval); }));
    document.getElementById("wh-spin").onclick = () => {
      if (spinning) return;
      const wager = betAmt === "allin" ? Hub.getBalance() : betAmt;
      if (wager <= 0 || !Hub.spend(wager)) { document.getElementById("wh-status").textContent = "Không đủ xu!"; return; }
      spinning = true;
      const slot = Math.floor(Math.random() * 15), outcome = slot === 0 ? "green" : slot % 2 === 1 ? "red" : "black";
      const segAngle = 360 / 15;
      angle += 1080 + (360 - (slot * segAngle + segAngle / 2));
      document.getElementById("wh-disc").style.transform = `rotate(${angle}deg)`;
      setTimeout(() => {
        spinning = false;
        const payout = outcome === pick ? (outcome === "green" ? wager * 15 : wager * 2) : 0;
        Hub.win(payout);
        const net = payout - wager;
        const badge = outcome === "green" ? "0" : outcome === "red" ? "Đ" : "X";
        Hub.recordRound("wheel", wager, payout, `Về ô ${outcome}`, badge, outcome);
        document.getElementById("wh-result").innerHTML = `Về ô: <strong>${outcome.toUpperCase()}</strong> · ${net >= 0 ? `<span style="color:var(--green)">+${Hub.fmt(net)} xu</span>` : `<span style="color:var(--tai)">${Hub.fmt(net)} xu</span>`}`;
        Hub.playBeep(net > 0 ? 920 : 250, 0.14);
      }, 1850);
    };
  }

  /* 6. XÓC ĐĨA (4 ĐỒNG XU + NẶN BÁT) */
  function initXocDia() {
    const root = document.getElementById("view-xocdia");
    let chip = 5000, phase = "betting", pendingCoins = [0, 0, 1, 1];
    let xdBets = { chan: 0, le: 0, red4: 0, white4: 0, red3: 0, white3: 0 };

    root.innerHTML = `
      <section class="stage">
        <div class="status-banner" id="xd-status">Đặt cửa Chẵn/Lẻ hoặc Tứ tử rồi nhấn Xóc Đĩa</div>
        <div class="bowl-area" id="xd-bowl">
          <div class="xd-coins" id="xd-coins">
            <div class="xd-coin red"></div><div class="xd-coin white"></div>
            <div class="xd-coin red"></div><div class="xd-coin white"></div>
          </div>
          <div class="bowl-lid open" id="xd-lid"><span>KÉO ĐỂ NẶN BÁT</span></div>
        </div>
        <div class="result-readout" id="xd-result"></div>
      </section>
      <section class="board">
        <div class="bet-card tai" data-xd="chan"><div class="bet-name">CHẴN</div><div class="bet-rule">4 Đỏ / 4 Trắng / 2-2 (1:1)</div><div class="bet-amount" id="xd-amt-chan">Cược: 0</div></div>
        <div class="bet-card xiu" data-xd="le"><div class="bet-name">LẺ</div><div class="bet-rule">3 Đỏ 1 Trắng / 3 Trắng 1 Đỏ (1:1)</div><div class="bet-amount" id="xd-amt-le">Cược: 0</div></div>
      </section>
      <section class="sub-board" style="grid-template-columns:repeat(4,1fr);">
        <div class="sub-card" data-xd="red4"><div class="sub-title" style="color:var(--tai)">4 ĐỎ</div><div class="sub-odd">1:12</div><div class="sub-amt" id="xd-amt-red4">0</div></div>
        <div class="sub-card" data-xd="white4"><div class="sub-title">4 TRẮNG</div><div class="sub-odd">1:12</div><div class="sub-amt" id="xd-amt-white4">0</div></div>
        <div class="sub-card" data-xd="red3"><div class="sub-title" style="color:var(--tai)">3 ĐỎ 1 TRẮNG</div><div class="sub-odd">1:2.6</div><div class="sub-amt" id="xd-amt-red3">0</div></div>
        <div class="sub-card" data-xd="white3"><div class="sub-title">3 TRẮNG 1 ĐỎ</div><div class="sub-odd">1:2.6</div><div class="sub-amt" id="xd-amt-white3">0</div></div>
      </section>
      <section class="controls">
        <div class="chips">${chipButtonsHtml("data-xval")}</div>
        <div class="actions"><button class="btn" id="xd-clear">Xóa cược</button><button class="btn btn-gold" id="xd-roll">Xóc Đĩa</button></div>
      </section>`;

    const lid = document.getElementById("xd-lid"), bowl = document.getElementById("xd-bowl"), rollBtn = document.getElementById("xd-roll");
    const syncXD = () => Object.keys(xdBets).forEach((k) => {
      document.getElementById(`xd-amt-${k}`).textContent = (k === "chan" || k === "le" ? "Cược: " : "") + Hub.fmt(xdBets[k]);
      root.querySelector(`[data-xd="${k}"]`).classList.toggle("active", xdBets[k] > 0);
    });
    root.querySelectorAll("[data-xval]").forEach((b) => (b.onclick = () => {
      root.querySelectorAll("[data-xval]").forEach((x) => x.classList.remove("selected"));
      b.classList.add("selected");
      chip = b.dataset.xval === "allin" ? "allin" : Number(b.dataset.xval);
    }));
    root.querySelectorAll("[data-xd]").forEach((c) => (c.onclick = () => {
      if (phase !== "betting") return;
      const k = c.dataset.xd;
      if ((k === "chan" && xdBets.le > 0) || (k === "le" && xdBets.chan > 0)) {
        document.getElementById("xd-status").textContent = "Chỉ được chọn Chẵn hoặc Lẻ!"; return;
      }
      const amt = chip === "allin" ? Hub.getBalance() : chip;
      if (amt <= 0 || !Hub.spend(amt)) return;
      xdBets[k] += amt; Hub.playBeep(740, 0.04); syncXD();
    }));
    document.getElementById("xd-clear").onclick = () => {
      if (phase !== "betting") return;
      Hub.win(Object.values(xdBets).reduce((a, b) => a + b, 0));
      xdBets = { chan: 0, le: 0, red4: 0, white4: 0, red3: 0, white3: 0 }; syncXD();
    };

    function openXD() {
      if (phase !== "covered") return;
      lid.classList.remove("dragging"); lid.style.transform = ""; lid.classList.add("open");
      phase = "betting"; rollBtn.textContent = "Xóc Đĩa";
      const reds = pendingCoins.filter((x) => x === 1).length;
      const isEven = reds % 2 === 0;
      let payout = 0;
      if (isEven) payout += xdBets.chan * 2; else payout += xdBets.le * 2;
      if (reds === 4) payout += xdBets.red4 * 13;
      if (reds === 0) payout += xdBets.white4 * 13;
      if (reds === 3) payout += Math.floor(xdBets.red3 * 3.6);
      if (reds === 1) payout += Math.floor(xdBets.white3 * 3.6);
      const total = Object.values(xdBets).reduce((a, b) => a + b, 0);
      Hub.win(payout);
      const net = payout - total;
      const label = `${reds} Đỏ ${4 - reds} Trắng (${isEven ? "Chẵn" : "Lẻ"})`;
      Hub.recordRound("xocdia", total, payout, label, isEven ? "C" : "L", isEven ? "chan" : "le");
      document.getElementById("xd-result").innerHTML = `${label} · ${net >= 0 ? `<span style="color:var(--green)">+${Hub.fmt(net)} xu</span>` : `<span style="color:var(--tai)">${Hub.fmt(net)} xu</span>`}`;
      Hub.playBeep(net > 0 ? 920 : 260, 0.12);
      xdBets = { chan: 0, le: 0, red4: 0, white4: 0, red3: 0, white3: 0 }; syncXD();
    }

    rollBtn.onclick = () => {
      if (phase === "covered") { openXD(); return; }
      if (phase !== "betting") return;
      const total = Object.values(xdBets).reduce((a, b) => a + b, 0);
      if (total === 0) { document.getElementById("xd-status").textContent = "Hãy đặt ít nhất 1 cửa!"; return; }
      phase = "shaking"; rollBtn.disabled = true; lid.classList.remove("open"); bowl.classList.add("shaking");
      pendingCoins = [0, 1, 2, 3].map(() => (Math.random() < 0.5 ? 0 : 1));
      setTimeout(() => {
        bowl.classList.remove("shaking");
        document.getElementById("xd-coins").innerHTML = pendingCoins.map((c) => `<div class="xd-coin ${c ? "red" : "white"}"></div>`).join("");
        phase = "covered"; lid.style.transform = ""; rollBtn.disabled = false; rollBtn.textContent = "Mở Bát";
        document.getElementById("xd-status").textContent = "Kéo nắp bát để nặn hoặc nhấn Mở Bát!";
      }, 850);
    };

    let drag = null;
    lid.addEventListener("pointerdown", (e) => { if (phase !== "covered") return; drag = { x: e.clientX, y: e.clientY }; lid.classList.add("dragging"); lid.setPointerCapture(e.pointerId); });
    lid.addEventListener("pointermove", (e) => { if (!drag || phase !== "covered") return; const dx = e.clientX - drag.x, dy = e.clientY - drag.y; lid.style.transform = `translate(${dx}px,${dy}px)`; if (Math.hypot(dx, dy) >= 110) { drag = null; openXD(); } });
    const stopDrag = () => { if (!drag) return; drag = null; lid.classList.remove("dragging"); if (phase === "covered") lid.style.transform = ""; };
    lid.addEventListener("pointerup", stopDrag); lid.addEventListener("pointercancel", stopDrag);
  }

  /* 7. RỒNG HỔ */
  function initRongHo() {
    const root = document.getElementById("view-rongho");
    let pick = "rong", betAmt = 5000;
    root.innerHTML = `
      <section class="stage">
        <div class="status-banner" id="rh-status">Chọn Rồng (1:1), Hổ (1:1) hoặc Hòa (1:8) và Chia Bài</div>
        <div class="bac-table">
          <div class="bac-hand"><div class="bac-label" style="color:var(--tai)">🐉 RỒNG</div><div class="card-row" id="rh-r"></div></div>
          <div class="bac-hand"><div class="bac-label" style="color:var(--xiu)">🐯 HỔ</div><div class="card-row" id="rh-h"></div></div>
        </div>
        <div class="result-readout" id="rh-result"></div>
      </section>
      <section class="sub-board">
        <div class="sub-card active" data-rh="rong"><div class="sub-title" style="color:var(--tai)">RỒNG</div><div class="sub-odd">1:1</div></div>
        <div class="sub-card" data-rh="tie"><div class="sub-title" style="color:var(--green)">HÒA</div><div class="sub-odd">1:8</div></div>
        <div class="sub-card" data-rh="ho"><div class="sub-title" style="color:var(--xiu)">HỔ</div><div class="sub-odd">1:1</div></div>
      </section>
      <section class="controls">
        <div class="chips">${chipButtonsHtml("data-rhv")}</div>
        <div class="actions"><button class="btn" id="rh-reveal" style="display:none;">Mở Bài</button><button class="btn btn-gold" id="rh-deal">Chia Bài</button></div>
      </section>`;

    root.querySelectorAll("[data-rh]").forEach((el) => (el.onclick = () => { root.querySelectorAll("[data-rh]").forEach((x) => x.classList.remove("active")); el.classList.add("active"); pick = el.dataset.rh; }));
    root.querySelectorAll("[data-rhv]").forEach((b) => (b.onclick = () => { root.querySelectorAll("[data-rhv]").forEach((x) => x.classList.remove("selected")); b.classList.add("selected"); betAmt = b.dataset.rhv === "allin" ? "allin" : Number(b.dataset.rhv); }));
    const val = (r) => (r === "A" ? 1 : r === "J" ? 11 : r === "Q" ? 12 : r === "K" ? 13 : Number(r));

    document.getElementById("rh-deal").onclick = () => {
      const wager = betAmt === "allin" ? Hub.getBalance() : betAmt;
      if (wager <= 0 || !Hub.spend(wager)) { document.getElementById("rh-status").textContent = "Không đủ xu!"; return; }
      const deck = createDeck(), cR = deck.pop(), cH = deck.pop();
      document.getElementById("rh-r").innerHTML = cardHtml(cR, true);
      document.getElementById("rh-h").innerHTML = cardHtml(cH, true);
      document.getElementById("rh-result").textContent = "";
      document.getElementById("rh-status").textContent = "Kéo lá Rồng & Hổ để nặn bài hoặc nhấn 'Mở Bài'!";
      const revBtn = document.getElementById("rh-reveal");
      revBtn.style.display = "inline-block";
      let done = false;
      const settleRH = () => {
        if (done) return; done = true; revBtn.style.display = "none";
        const vR = val(cR.rank), vH = val(cH.rank);
        const winSide = vR > vH ? "rong" : vH > vR ? "ho" : "tie";
        let payout = 0;
        if (winSide === pick) payout = winSide === "tie" ? wager * 9 : wager * 2;
        else if (winSide === "tie") payout = Math.floor(wager * 0.5);
        Hub.win(payout);
        const net = payout - wager;
        Hub.recordRound("rongho", wager, payout, `${cR.rank} vs ${cH.rank}`, winSide === "rong" ? "R" : winSide === "ho" ? "H" : "Hòa", winSide);
        document.getElementById("rh-result").innerHTML = `${winSide.toUpperCase()} (${cR.rank} vs ${cH.rank}) · ${net >= 0 ? `<span style="color:var(--green)">+${Hub.fmt(net)} xu</span>` : `<span style="color:var(--tai)">${Hub.fmt(net)} xu</span>`}`;
        Hub.playBeep(net > 0 ? 920 : 260, 0.12);
      };
      revBtn.onclick = () => { root.querySelectorAll(".peek-cover").forEach((c) => c.classList.add("revealed")); settleRH(); };
      Hub.attachPeek(root, settleRH);
    };
  }

  /* 8. XÌ DÁCH (BLACKJACK) */
  function initBlackjack() {
    const root = document.getElementById("view-blackjack");
    let phase = "idle", betAmt = 5000, wager = 0, deck = [], pHand = [], dHand = [];
    root.innerHTML = `
      <section class="stage">
        <div class="status-banner" id="bj-status">Đặt cược và nhấn Chia Bài (Mục tiêu 21 điểm)</div>
        <div class="bac-table">
          <div class="bac-hand"><div class="bac-label">NHÀ CÁI (<span id="bj-d-score">0</span>)</div><div class="card-row" id="bj-d-cards"></div></div>
          <div class="bac-hand"><div class="bac-label">BẠN (<span id="bj-p-score">0</span>)</div><div class="card-row" id="bj-p-cards"></div></div>
        </div>
        <div class="result-readout" id="bj-result"></div>
      </section>
      <section class="controls">
        <div class="chips">${chipButtonsHtml("data-bjv")}</div>
        <div class="actions">
          <button class="btn" id="bj-hit" disabled>Rút Bài</button>
          <button class="btn" id="bj-stand" disabled>Dằn (Dừng)</button>
          <button class="btn btn-gold" id="bj-deal">Chia Bài</button>
        </div>
      </section>`;

    const score = (cards) => {
      let s = 0, aces = 0;
      for (const c of cards) {
        if (c.rank === "A") { aces++; s += 11; }
        else if (["K", "Q", "J", "10"].includes(c.rank)) s += 10;
        else s += Number(c.rank);
      }
      while (s > 21 && aces > 0) { s -= 10; aces--; }
      return s;
    };
    const renderBJ = (reveal = false) => {
      document.getElementById("bj-p-cards").innerHTML = pHand.map(cardHtml).join("");
      document.getElementById("bj-p-score").textContent = score(pHand);
      document.getElementById("bj-d-cards").innerHTML = reveal ? dHand.map(cardHtml).join("") : cardHtml(dHand[0]) + `<div class="playing-card" style="background:#1e293b;color:#f5b942;align-items:center;justify-content:center;font-size:22px;">?</div>`;
      document.getElementById("bj-d-score").textContent = reveal ? score(dHand) : "?";
    };
    root.querySelectorAll("[data-bjv]").forEach((b) => (b.onclick = () => { if (phase !== "idle") return; root.querySelectorAll("[data-bjv]").forEach((x) => x.classList.remove("selected")); b.classList.add("selected"); betAmt = b.dataset.bjv === "allin" ? "allin" : Number(b.dataset.bjv); }));

    function finishBJ() {
      phase = "idle";
      document.getElementById("bj-hit").disabled = true;
      document.getElementById("bj-stand").disabled = true;
      document.getElementById("bj-deal").disabled = false;
      while (score(dHand) < 17) dHand.push(deck.pop());
      document.getElementById("bj-p-cards").innerHTML = pHand.map((c) => cardHtml(c, false)).join("");
      document.getElementById("bj-d-cards").innerHTML = dHand.map((c, idx) => cardHtml(c, idx > 0)).join("");
      document.getElementById("bj-d-score").textContent = "?";
      document.getElementById("bj-status").textContent = "Kéo lá úp của Nhà Cái để nặn bài!";
      Hub.attachPeek(document.getElementById("bj-d-cards"), () => {
        renderBJ(true);
        const ps = score(pHand), ds = score(dHand);
        let payout = 0, msg = "Thua";
        if (ps <= 21) {
          if (ps === 21 && pHand.length === 2 && !(ds === 21 && dHand.length === 2)) { payout = Math.floor(wager * 2.5); msg = "XÌ DÁCH!"; }
          else if (ds > 21 || ps > ds) { payout = wager * 2; msg = "Thắng!"; }
          else if (ps === ds) { payout = wager; msg = "Hòa!"; }
        } else msg = "Quắc (>21)!";
        Hub.win(payout);
        const net = payout - wager;
        Hub.recordRound("blackjack", wager, payout, `${msg} (${ps} vs ${ds})`, String(ps), net > 0 ? "win" : net === 0 ? "tie" : "lose");
        document.getElementById("bj-result").innerHTML = `<strong>${msg}</strong> (${ps} vs ${ds}) · ${net >= 0 ? `<span style="color:var(--green)">+${Hub.fmt(net)} xu</span>` : `<span style="color:var(--tai)">${Hub.fmt(net)} xu</span>`}`;
        document.getElementById("bj-status").textContent = net > 0 ? "Chúc mừng bạn thắng!" : "Sẵn sàng ván mới!";
        Hub.playBeep(net > 0 ? 920 : 250, 0.12);
      });
    }

    document.getElementById("bj-deal").onclick = () => {
      const w = betAmt === "allin" ? Hub.getBalance() : betAmt;
      if (w <= 0 || !Hub.spend(w)) { document.getElementById("bj-status").textContent = "Không đủ xu!"; return; }
      wager = w; deck = createDeck(); pHand = [deck.pop(), deck.pop()]; dHand = [deck.pop(), deck.pop()];
      phase = "playing"; document.getElementById("bj-result").textContent = "";
      document.getElementById("bj-hit").disabled = false; document.getElementById("bj-stand").disabled = false; document.getElementById("bj-deal").disabled = true;
      renderBJ(false);
      if (score(pHand) === 21) finishBJ();
    };
    document.getElementById("bj-hit").onclick = () => { if (phase !== "playing") return; pHand.push(deck.pop()); renderBJ(false); if (score(pHand) >= 21) finishBJ(); };
    document.getElementById("bj-stand").onclick = () => { if (phase === "playing") finishBJ(); };
  }

  /* 9. ĐÀO MÌN (MINES 5x5) */
  function initMines() {
    const root = document.getElementById("view-mines");
    let active = false, betAmt = 5000, wager = 0, bombCount = 5, bombs = new Set(), opened = new Set();
    root.innerHTML = `
      <section class="stage">
        <div class="status-banner" id="mn-status">Chọn số bom và nhấn Bắt Đầu — Mở kim cương, tránh bom!</div>
        <div class="mines-grid" id="mn-grid"></div>
        <div class="result-readout" id="mn-result"></div>
      </section>
      <section class="controls">
        <div class="chips">
          <button class="chip" data-mnv="1000">1K</button><button class="chip selected" data-mnv="5000">5K</button>
          <button class="chip" data-mnv="10000">10K</button><button class="chip" data-mnv="50000">50K</button>
          <button class="chip" data-mnv="100000">100K</button><button class="chip" data-mnv="500000">500K</button>
          <button class="chip" data-mnv="1000000">1M</button><button class="chip" data-mnv="5000000">5M</button>
          <select id="mn-bombs" class="btn" style="padding:6px 10px;"><option value="3">3 Bom</option><option value="5" selected>5 Bom</option><option value="10">10 Bom</option></select>
        </div>
        <div class="actions"><button class="btn btn-gold" id="mn-btn">Bắt Đầu</button></div>
      </section>`;

    const grid = document.getElementById("mn-grid"), btn = document.getElementById("mn-btn");
    const calcMult = () => {
      let m = 1.0;
      for (let i = 0; i < opened.size; i++) m *= (25 - i) / (25 - bombCount - i);
      return Math.max(1, Math.floor(m * 96) / 100);
    };
    function renderGrid(reveal = false) {
      grid.innerHTML = "";
      for (let i = 0; i < 25; i++) {
        const t = document.createElement("div");
        const isBomb = bombs.has(i), isOpen = opened.has(i);
        t.className = "mine-tile" + (isOpen ? " safe" : reveal && isBomb ? " boom" : "");
        t.textContent = isOpen ? "💎" : reveal && isBomb ? "💣" : "";
        t.onclick = () => {
          if (!active || isOpen) return;
          if (isBomb) {
            active = false; renderGrid(true);
            Hub.recordRound("mines", wager, 0, `Dính bom (${opened.size}💎)`, "💣", "lose");
            document.getElementById("mn-result").innerHTML = `<span style="color:var(--tai)">💥 Dính bom! Mất ${Hub.fmt(wager)} xu</span>`;
            btn.textContent = "Bắt Đầu"; Hub.playBeep(200, 0.16);
          } else {
            opened.add(i); renderGrid(false);
            const mult = calcMult();
            btn.textContent = `Rút (${Hub.fmt(Math.floor(wager * mult))} xu · ${mult}x)`;
            Hub.playBeep(780, 0.05);
          }
        };
        grid.appendChild(t);
      }
    }
    root.querySelectorAll("[data-mnv]").forEach((b) => (b.onclick = () => { if (active) return; root.querySelectorAll("[data-mnv]").forEach((x) => x.classList.remove("selected")); b.classList.add("selected"); betAmt = Number(b.dataset.mnv); }));

    btn.onclick = () => {
      if (!active) {
        if (!Hub.spend(betAmt)) { document.getElementById("mn-status").textContent = "Không đủ xu!"; return; }
        wager = betAmt; bombCount = Number(document.getElementById("mn-bombs").value);
        bombs = new Set(); opened = new Set();
        while (bombs.size < bombCount) bombs.add(Math.floor(Math.random() * 25));
        active = true; document.getElementById("mn-result").textContent = "";
        btn.textContent = "Rút Tiền (1.00x)"; renderGrid(false);
      } else {
        if (opened.size === 0) return;
        const mult = calcMult(), payout = Math.floor(wager * mult);
        active = false; renderGrid(true); Hub.win(payout);
        Hub.recordRound("mines", wager, payout, `Đào ${opened.size}💎 (${mult}x)`, `${mult}x`, "win");
        document.getElementById("mn-result").innerHTML = `<span style="color:var(--green)">💎 Chốt lời +${Hub.fmt(payout - wager)} xu (${mult}x)!</span>`;
        btn.textContent = "Bắt Đầu"; Hub.playBeep(950, 0.14);
      }
    };
    renderGrid(false);
  }

  /* 10. HẠ CÁNH TÀU SÂN BAY (ĂN SỐ X & NÉ BOM) */
  function initCarrier() {
    const root = document.getElementById("view-carrier");
    let betAmt = 5000, active = false, wager = 0, mult = 1.0, rafId = null;
    let plane = { x: 50, y: 90, vx: 2.2, vy: 0 };
    let keys = { up: false, down: false, left: false, right: false };
    let items = [];
    let ship = { x: 660, y: 205, w: 150, h: 26 };

    root.innerHTML = `
      <section class="stage">
        <div class="status-banner" id="cr-status">Dùng nút điều khiển (hoặc phím mũi tên/WASD) ăn số X, né 💣 và hạ cánh lên thuyền!</div>
        <div class="av-canvas-wrap">
          <canvas id="cr-canvas" width="840" height="270"></canvas>
          <div class="av-mult" id="cr-mult" style="font-size:26px;">1.00x</div>
        </div>
        <div style="display:flex;gap:10px;flex-wrap:wrap;justify-content:center;align-items:center;">
          <button type="button" class="btn" id="cr-left" style="min-width:86px;touch-action:none;">⬅️ Chậm</button>
          <button type="button" class="btn btn-gold" id="cr-up" style="min-width:96px;touch-action:none;">⬆️ Bay Lên</button>
          <button type="button" class="btn btn-gold" id="cr-down" style="min-width:96px;touch-action:none;">⬇️ Hạ Xuống</button>
          <button type="button" class="btn" id="cr-right" style="min-width:86px;touch-action:none;">➡️ Nhanh</button>
        </div>
        <div class="result-readout" id="cr-result"></div>
      </section>
      <section class="controls">
        <div class="chips">${chipButtonsHtml("data-crv")}</div>
        <div class="actions"><button class="btn btn-gold" id="cr-start">Cất Cánh</button></div>
      </section>`;

    const canvas = document.getElementById("cr-canvas"), ctx = canvas.getContext("2d");
    const multEl = document.getElementById("cr-mult"), statusEl = document.getElementById("cr-status"), resEl = document.getElementById("cr-result"), startBtn = document.getElementById("cr-start");

    root.querySelectorAll("[data-crv]").forEach((b) => (b.onclick = () => {
      if (active) return;
      root.querySelectorAll("[data-crv]").forEach((x) => x.classList.remove("selected"));
      b.classList.add("selected");
      betAmt = b.dataset.crv === "allin" ? "allin" : Number(b.dataset.crv);
    }));

    function bindHold(id, dir) {
      const el = document.getElementById(id);
      const on = (e) => { e.preventDefault(); keys[dir] = true; };
      const off = () => { keys[dir] = false; };
      el.addEventListener("pointerdown", on);
      el.addEventListener("pointerup", off);
      el.addEventListener("pointerleave", off);
      el.addEventListener("pointercancel", off);
    }
    bindHold("cr-up", "up"); bindHold("cr-down", "down"); bindHold("cr-left", "left"); bindHold("cr-right", "right");

    window.addEventListener("keydown", (e) => {
      if (!active) return;
      if (["ArrowUp", "w", "W"].includes(e.key)) { keys.up = true; e.preventDefault(); }
      if (["ArrowDown", "s", "S"].includes(e.key)) { keys.down = true; e.preventDefault(); }
      if (["ArrowLeft", "a", "A"].includes(e.key)) { keys.left = true; e.preventDefault(); }
      if (["ArrowRight", "d", "D"].includes(e.key)) { keys.right = true; e.preventDefault(); }
    });
    window.addEventListener("keyup", (e) => {
      if (["ArrowUp", "w", "W"].includes(e.key)) keys.up = false;
      if (["ArrowDown", "s", "S"].includes(e.key)) keys.down = false;
      if (["ArrowLeft", "a", "A"].includes(e.key)) keys.left = false;
      if (["ArrowRight", "d", "D"].includes(e.key)) keys.right = false;
    });

    function spawnLevel() {
      items = [];
      const bonuses = [
        { val: 0.5, label: "+0.5x" },
        { val: 1.0, label: "+1.0x" },
        { val: 1.5, label: "+1.5x" },
        { val: 2.0, label: "+2.0x" },
      ];
      for (let i = 0; i < 6; i++) {
        const b = bonuses[Math.floor(Math.random() * bonuses.length)];
        items.push({ type: "x", x: 160 + i * 85 + Math.random() * 30, y: 40 + Math.random() * 145, r: 16, val: b.val, label: b.label, taken: false });
      }
      for (let i = 0; i < 5; i++) {
        items.push({ type: "bomb", x: 180 + i * 95 + Math.random() * 35, y: 38 + Math.random() * 155, r: 15, taken: false });
      }
    }

    function drawScene(crashMsg = null) {
      const w = canvas.width, h = canvas.height;
      ctx.clearRect(0, 0, w, h);

      // Sky & Ocean
      const sky = ctx.createLinearGradient(0, 0, 0, h - 42);
      sky.addColorStop(0, "#0b1528");
      sky.addColorStop(1, "#162a47");
      ctx.fillStyle = sky;
      ctx.fillRect(0, 0, w, h - 42);

      ctx.fillStyle = "#0e3a5c";
      ctx.fillRect(0, h - 42, w, 42);

      // Aircraft carrier ship
      ctx.fillStyle = "#334155";
      ctx.beginPath();
      ctx.moveTo(ship.x, ship.y + ship.h);
      ctx.lineTo(ship.x + 14, ship.y);
      ctx.lineTo(ship.x + ship.w - 10, ship.y);
      ctx.lineTo(ship.x + ship.w, ship.y + ship.h);
      ctx.closePath();
      ctx.fill();
      // Landing deck strip
      ctx.fillStyle = "#f5b942";
      ctx.fillRect(ship.x + 18, ship.y - 3, ship.w - 34, 4);
      ctx.fillStyle = "#94a3b8";
      ctx.fillRect(ship.x + ship.w - 42, ship.y - 22, 24, 22); // bridge tower
      ctx.fillStyle = "#fde68a";
      ctx.font = "bold 11px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("ĐÁP TÀU", ship.x + ship.w / 2, ship.y + 16);

      // Items (x multipliers & bombs)
      for (const it of items) {
        if (it.taken) continue;
        if (it.type === "x") {
          ctx.beginPath(); ctx.arc(it.x, it.y, it.r, 0, Math.PI * 2);
          ctx.fillStyle = "rgba(16, 185, 129, 0.25)"; ctx.fill();
          ctx.strokeStyle = "#10b981"; ctx.lineWidth = 2; ctx.stroke();
          ctx.fillStyle = "#6ee7b7"; ctx.font = "bold 11px sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
          ctx.fillText(it.label, it.x, it.y);
        } else {
          ctx.font = "22px sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
          ctx.fillText("💣", it.x, it.y);
        }
      }

      // Plane
      ctx.font = "28px sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(crashMsg ? "💥" : "🛩️", plane.x, plane.y);
    }

    function endRound(win, msg) {
      active = false;
      cancelAnimationFrame(rafId);
      startBtn.disabled = false;
      const payout = win ? Math.floor(wager * mult) : 0;
      Hub.win(payout);
      const net = payout - wager;
      Hub.recordRound("carrier", wager, payout, `${msg} (${mult.toFixed(2)}x)`, `${mult.toFixed(1)}x`, win ? "win" : "lose");
      resEl.innerHTML = `<strong>${msg}</strong> · ${net >= 0 ? `<span style="color:var(--green)">+${Hub.fmt(net)} xu</span>` : `<span style="color:var(--tai)">${Hub.fmt(net)} xu</span>`}`;
      statusEl.textContent = win ? `Hạ cánh thành công với ${mult.toFixed(2)}x!` : msg;
      Hub.playBeep(win ? 950 : 210, 0.14);
    }

    function loop() {
      if (!active) return;
      if (keys.up) plane.vy -= 0.28;
      if (keys.down) plane.vy += 0.28;
      if (keys.left) plane.vx = Math.max(1.2, plane.vx - 0.12);
      if (keys.right) plane.vx = Math.min(4.8, plane.vx + 0.12);

      plane.vy += 0.09; // gentle gravity
      plane.vy *= 0.94;
      plane.x += plane.vx;
      plane.y = Math.max(20, plane.y + plane.vy);

      // Collect items / hit bombs
      for (const it of items) {
        if (it.taken) continue;
        if (Math.hypot(plane.x - it.x, plane.y - it.y) < it.r + 14) {
          it.taken = true;
          if (it.type === "x") {
            mult = Math.round((mult + it.val) * 100) / 100;
            multEl.textContent = `${mult.toFixed(2)}x`;
            Hub.playBeep(820, 0.05);
          } else {
            drawScene("💥");
            endRound(false, "💥 Đâm trúng bom!");
            return;
          }
        }
      }

      // Check landing on carrier deck
      if (plane.x >= ship.x + 8 && plane.x <= ship.x + ship.w - 8 && plane.y >= ship.y - 16 && plane.y <= ship.y + 16) {
        drawScene();
        endRound(true, `🛬 Hạ cánh chuẩn xác (${mult.toFixed(2)}x)`);
        return;
      }

      // Check ocean crash or overshoot
      if (plane.y >= canvas.height - 42 || plane.x > canvas.width - 12) {
        drawScene("💥");
        endRound(false, "🌊 Rơi xuống biển / Trượt tàu!");
        return;
      }

      drawScene();
      rafId = requestAnimationFrame(loop);
    }

    startBtn.onclick = () => {
      if (active) return;
      const w = betAmt === "allin" ? Hub.getBalance() : betAmt;
      if (w <= 0 || !Hub.spend(w)) { statusEl.textContent = "Không đủ xu!"; return; }
      wager = w; mult = 1.0; multEl.textContent = "1.00x"; resEl.textContent = "";
      plane = { x: 48, y: 95, vx: 2.2, vy: 0 };
      keys = { up: false, down: false, left: false, right: false };
      spawnLevel();
      active = true;
      startBtn.disabled = true;
      statusEl.textContent = "Đang bay! Ăn số X, né 💣 và đáp xuống tàu sân bay!";
      Hub.playBeep(520, 0.08);
      loop();
    };

    spawnLevel();
    drawScene();
  }

  initBaccarat(); initAviator(); initPoker(); initBauCua(); initWheel();
  initXocDia(); initRongHo(); initBlackjack(); initMines(); initCarrier();
})();
