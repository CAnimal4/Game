(() => {
  "use strict";

  // --- DOM ---
  const stage = document.getElementById("stage");
  const playerEl = document.getElementById("player");
  const playerNumEl = document.getElementById("playerNum");
  const fx = document.getElementById("fx");
  const toast = document.getElementById("toast");

  const hudCrowd = document.getElementById("hudCrowd");
  const hudGold = document.getElementById("hudGold");
  const hudDist = document.getElementById("hudDist");
  const hudBest = document.getElementById("hudBest");

  const overlayStart = document.getElementById("overlayStart");
  const overlayKingdom = document.getElementById("overlayKingdom");
  const overlayGameOver = document.getElementById("overlayGameOver");

  const btnPlay = document.getElementById("btnPlay");
  const btnPractice = document.getElementById("btnPractice");
  const btnPause = document.getElementById("btnPause");
  const btnRestart = document.getElementById("btnRestart");
  const btnKingdom = document.getElementById("btnKingdom");
  const btnCloseKingdom = document.getElementById("btnCloseKingdom");
  const btnResetProgress = document.getElementById("btnResetProgress");

  const summaryEl = document.getElementById("summary");
  const deathTipEl = document.getElementById("deathTip");
  const btnRunAgain = document.getElementById("btnRunAgain");
  const btnGoKingdom = document.getElementById("btnGoKingdom");

  const kGoldEl = document.getElementById("kGold");
  const kStartCrowdEl = document.getElementById("kStartCrowd");
  const kLuckEl = document.getElementById("kLuck");
  const kShieldEl = document.getElementById("kShield");
  const upgradeGrid = document.getElementById("upgradeGrid");

  // --- Utils ---
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const rnd = (a, b) => a + Math.random() * (b - a);
  const pick = (arr) => arr[(Math.random() * arr.length) | 0];

  function showToast(msg) {
    toast.textContent = msg;
    toast.classList.add("show");
    clearTimeout(showToast._t);
    showToast._t = setTimeout(() => toast.classList.remove("show"), 750);
  }

  function burst(x, y, count = 10, lifeMs = 520) {
    for (let i = 0; i < count; i++) {
      const p = document.createElement("div");
      p.className = "particle";
      const ang = rnd(0, Math.PI * 2);
      const sp = rnd(80, 260);
      const vx = Math.cos(ang) * sp;
      const vy = Math.sin(ang) * sp;
      const size = rnd(6, 12);
      p.style.width = `${size}px`;
      p.style.height = `${size}px`;
      p.style.left = `${x}px`;
      p.style.top = `${y}px`;
      fx.appendChild(p);

      const t0 = performance.now();
      const tick = (t) => {
        const dt = (t - t0);
        const k = dt / lifeMs;
        if (k >= 1) {
          p.remove();
          return;
        }
        const px = x + vx * (dt / 1000);
        const py = y + vy * (dt / 1000) + 120 * k * k; // gravity-ish
        p.style.left = `${px}px`;
        p.style.top = `${py}px`;
        p.style.opacity = `${1 - k}`;
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    }
  }

  function stageRect() {
    return stage.getBoundingClientRect();
  }

  // --- Save / Load (Kingshot-ish progression layer) ---
  const SAVE_KEY = "kcrowdshot_save_v1";
  const BEST_KEY = "kcrowdshot_best_v1";

  function loadSave() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return null;
      const o = JSON.parse(raw);
      if (!o || typeof o !== "object") return null;
      return o;
    } catch { return null; }
  }
  function saveSave(obj) {
    localStorage.setItem(SAVE_KEY, JSON.stringify(obj));
  }
  function loadBest() {
    const n = Number(localStorage.getItem(BEST_KEY) || "0");
    return Number.isFinite(n) ? n : 0;
  }
  function saveBest(n) {
    localStorage.setItem(BEST_KEY, String(n));
  }

  // --- Progression model ---
  // startCrowd: increases starting army
  // gateLuck: biases toward better gates (more + and higher multipliers, fewer -)
  // shieldCharges: start with shields that auto-block traps
  // heroes:
  //  - Archer: reduces enemy damage a bit
  //  - Steward: increases gold gain
  //  - Mage: sometimes "purifies" a risk gate into a bonus
  const defaultProgress = {
    goldBank: 0,
    startCrowdLvl: 0,
    luckLvl: 0,
    shieldLvl: 0,
    archerLvl: 0,
    stewardLvl: 0,
    mageLvl: 0
  };

  const progress = Object.assign({}, defaultProgress, loadSave() || {});
  let bestDistance = loadBest();

  function startCrowdValue() {
    return 10 + progress.startCrowdLvl * 3;
  }
  function luckPercent() {
    return progress.luckLvl * 4; // up to ~40% if you go hard
  }
  function shieldCharges() {
    return progress.shieldLvl; // 0..?
  }
  function enemyMitigation() {
    return clamp(progress.archerLvl * 0.06, 0, 0.35);
  }
  function goldBonusMult() {
    return 1 + progress.stewardLvl * 0.08;
  }
  function magePurifyChance() {
    return clamp(progress.mageLvl * 0.06, 0, 0.30);
  }

  // --- Upgrade shop definitions ---
  const upgrades = [
    {
      key: "startCrowdLvl",
      name: "Barracks",
      desc: "Start each run with +3 crowd per level.",
      price: (lvl) => 70 + lvl * 90
    },
    {
      key: "luckLvl",
      name: "Gate Scribes",
      desc: "Improves gate quality. Fewer nasty − gates, better + and × rolls.",
      price: (lvl) => 90 + lvl * 120
    },
    {
      key: "shieldLvl",
      name: "Royal Shields",
      desc: "Start with shield charges that block trap hits automatically.",
      price: (lvl) => 110 + lvl * 140
    },
    {
      key: "archerLvl",
      name: "Hero: Archer Captain",
      desc: "Enemy crowd hits hurt less (damage mitigation).",
      price: (lvl) => 130 + lvl * 170
    },
    {
      key: "stewardLvl",
      name: "Hero: Steward",
      desc: "Earn more gold from fights and distance.",
      price: (lvl) => 120 + lvl * 160
    },
    {
      key: "mageLvl",
      name: "Hero: Mage",
      desc: "Chance to purify a risk gate into a bonus reward.",
      price: (lvl) => 140 + lvl * 190
    }
  ];

  function renderKingdom() {
    kGoldEl.textContent = `${Math.floor(progress.goldBank)}`;
    kStartCrowdEl.textContent = `${startCrowdValue()}`;
    kLuckEl.textContent = `${luckPercent()}%`;
    kShieldEl.textContent = `${shieldCharges()}`;

    upgradeGrid.innerHTML = "";
    for (const u of upgrades) {
      const lvl = progress[u.key] || 0;
      const cost = u.price(lvl);

      const card = document.createElement("div");
      card.className = "upg";
      card.innerHTML = `
        <div class="upgTop">
          <div>
            <div class="upgName">${u.name}</div>
            <div class="upgDesc">${u.desc}</div>
          </div>
          <div class="upgLvl">Lv ${lvl}</div>
        </div>
        <div class="upgBtnRow">
          <div class="price">Cost: ${cost} gold</div>
          <button class="buyBtn">Buy</button>
        </div>
      `;
      const btn = card.querySelector(".buyBtn");
      btn.disabled = progress.goldBank < cost;
      btn.addEventListener("click", () => {
        if (progress.goldBank < cost) return;
        progress.goldBank -= cost;
        progress[u.key] = lvl + 1;
        saveSave(progress);
        renderKingdom();
        showToast(`Upgraded: ${u.name} → Lv ${lvl + 1}`);
      });
      upgradeGrid.appendChild(card);
    }
  }

  // --- Game state ---
  const game = {
    running: false,
    paused: false,
    practice: false,

    lane: 0, // 0 left, 1 right
    crowd: startCrowdValue(),
    goldRun: 0,
    shields: shieldCharges(),

    dist: 0,
    speed: 330,
    baseSpeed: 330,

    time: 0,
    nextSpawn: 0,
    rowId: 1,
    entities: [], // {kind, y, lane, el, data, hit}

    // camera shake
    shakeT: 0,
    shakeMag: 0
  };

  function resetRun(practice = false) {
    // clear entities
    for (const e of game.entities) e.el.remove();
    game.entities.length = 0;

    game.practice = practice;
    game.running = false;
    game.paused = false;

    game.lane = 0;
    playerEl.classList.remove("right");

    game.crowd = startCrowdValue();
    game.goldRun = 0;
    game.shields = shieldCharges();

    game.dist = 0;
    game.baseSpeed = practice ? 260 : 330;
    game.speed = game.baseSpeed;

    game.time = 0;
    game.nextSpawn = 0.35;

    game.shakeT = 0;
    game.shakeMag = 0;

    updateHUD();
    playerNumEl.textContent = String(game.crowd);
  }

  function updateHUD() {
    hudCrowd.textContent = String(Math.max(0, Math.floor(game.crowd)));
    hudGold.textContent = String(Math.floor(progress.goldBank));
    hudDist.textContent = `${Math.floor(game.dist)}m`;
    hudBest.textContent = `${Math.floor(bestDistance)}m`;
  }

  function setLane(l) {
    const nl = l ? 1 : 0;
    if (nl === game.lane) return;
    game.lane = nl;
    if (game.lane === 1) playerEl.classList.add("right");
    else playerEl.classList.remove("right");
  }

  function shake(ms = 180, mag = 6) {
    game.shakeT = Math.max(game.shakeT, ms / 1000);
    game.shakeMag = Math.max(game.shakeMag, mag);
  }

  // --- Spawning logic (crowd multiplier runner core) ---
  // Gate row: two choices (left + something, right + something). You collide with the lane you chose.
  // Single entities: enemy crowd (fight), trap (lose crowd unless shield), coin (gain gold), shield pickup (gain shields).
  function makeRow(y, leftCard, rightCard) {
    const row = document.createElement("div");
    row.className = "entityRow";
    const l = document.createElement("div");
    const r = document.createElement("div");
    l.className = `card ${leftCard.cls}`;
    r.className = `card ${rightCard.cls}`;
    l.innerHTML = `<div class="txt"><div class="big">${leftCard.big}</div><div class="small">${leftCard.small}</div></div>`;
    r.innerHTML = `<div class="txt"><div class="big">${rightCard.big}</div><div class="small">${rightCard.small}</div></div>`;
    row.appendChild(l);
    row.appendChild(r);
    stage.appendChild(row);

    return { kind: "row", y, el: row, data: { leftCard, rightCard }, hit: false };
  }

  function makeSingle(y, lane, card) {
    const row = document.createElement("div");
    row.className = "entityRow";
    const left = document.createElement("div");
    const right = document.createElement("div");
    left.className = "single";
    right.className = "single";
    // Only show the active lane; the other is an empty ghost to keep alignment.
    if (lane === 0) {
      left.className = `single ${card.cls}`;
      left.innerHTML = `<div class="txt"><div class="big">${card.big}</div><div class="small">${card.small}</div></div>`;
      right.style.opacity = "0";
    } else {
      right.className = `single ${card.cls}`;
      right.innerHTML = `<div class="txt"><div class="big">${card.big}</div><div class="small">${card.small}</div></div>`;
      left.style.opacity = "0";
    }
    row.appendChild(left);
    row.appendChild(right);
    stage.appendChild(row);

    return { kind: "single", y, lane, el: row, data: card, hit: false };
  }

  function weightedPick(items) {
    let sum = 0;
    for (const it of items) sum += it.w;
    let x = Math.random() * sum;
    for (const it of items) {
      x -= it.w;
      if (x <= 0) return it.v;
    }
    return items[items.length - 1].v;
  }

  function rollGate(t) {
    // t ~ 0..1..2.. (progress)
    // Gate quality improves with luck; risk chance rises with time but luck fights it.
    const luck = luckPercent() / 100;

    const baseRisk = clamp(0.10 + 0.12 * t, 0.10, 0.36);
    const risk = clamp(baseRisk * (1 - 0.85 * luck), 0.05, 0.40);

    const multBias = clamp(0.20 + 0.25 * t, 0.20, 0.55);
    const plusBias = clamp(0.70 - 0.20 * t, 0.35, 0.75);

    // Normalize among plus/mult/risk
    const wRisk = risk;
    const wMult = (1 - wRisk) * multBias;
    const wPlus = (1 - wRisk) * plusBias;
    const norm = wPlus + wMult + wRisk;

    const kind = weightedPick([
      { v: "plus", w: wPlus / norm },
      { v: "mult", w: wMult / norm },
      { v: "risk", w: wRisk / norm }
    ]);

    if (kind === "plus") {
      const base = 8 + Math.floor(6 * t);
      const spread = 10 + Math.floor(10 * t);
      const n = Math.floor(base + rnd(0, spread) * (1 + 0.6 * luck));
      return { type: "plus", n };
    }
    if (kind === "mult") {
      // Keep multipliers sane but exciting; luck nudges up.
      const pool = t < 0.6 ? [2,2,3,3,4] : t < 1.2 ? [2,3,3,4,4,5] : [3,4,4,5,5,6];
      let m = pick(pool);
      if (Math.random() < luck * 0.55) m += 1;
      m = clamp(m, 2, 8);
      return { type: "mult", m };
    }
    // risk
    const base = 6 + Math.floor(6 * t);
    const spread = 10 + Math.floor(10 * t);
    const n = Math.floor(base + rnd(0, spread));
    return { type: "risk", n };
  }

  function gateCardFromRoll(roll) {
    if (roll.type === "plus") {
      return { cls: "plus", big: `+${roll.n}`, small: "Recruit" , roll };
    }
    if (roll.type === "mult") {
      return { cls: "mult", big: `×${roll.m}`, small: "Rally" , roll };
    }
    return { cls: "risk", big: `−${roll.n}`, small: "Ambush" , roll };
  }

  function maybePurify(card) {
    if (card.roll?.type !== "risk") return card;
    if (Math.random() < magePurifyChance()) {
      // Turn risk into a gold/shield/bonus gate.
      const choice = weightedPick([
        { v: "gold", w: 0.55 },
        { v: "shield", w: 0.30 },
        { v: "bonus", w: 0.15 }
      ]);
      if (choice === "gold") {
        const g = 25 + Math.floor(rnd(0, 40));
        return { cls: "gold", big: `+${g}`, small: "Treasury", roll: { type: "gold", g } };
      }
      if (choice === "shield") {
        return { cls: "shield", big: `+1`, small: "Shield", roll: { type: "shield", s: 1 } };
      }
      const b = 12 + Math.floor(rnd(0, 22));
      return { cls: "gold", big: `+${b}`, small: "Bounty", roll: { type: "gold", g: b } };
    }
    return card;
  }

  function spawn(t) {
    // Mix gate rows + single events (enemy, trap, coin, shield).
    const luck = luckPercent() / 100;

    const enemyChance = clamp(0.18 + 0.10 * t, 0.18, 0.42);
    const coinChance = clamp(0.16 + 0.06 * t, 0.16, 0.30);
    const shieldChance = clamp(0.05 + 0.02 * t + 0.03 * luck, 0.05, 0.16);
    const rowChance = 1 - clamp(enemyChance + coinChance + shieldChance, 0.30, 0.72);

    const kind = weightedPick([
      { v: "row", w: rowChance },
      { v: "enemy", w: enemyChance },
      { v: "coin", w: coinChance },
      { v: "shield", w: shieldChance }
    ]);

    const y = -140;

    if (kind === "row") {
      let left = gateCardFromRoll(rollGate(t));
      let right = gateCardFromRoll(rollGate(t));

      // Luck can tilt the "offer" to feel like real runners (one is often clearly better).
      if (Math.random() < 0.35 + 0.25 * luck) {
        // Slightly buff one side
        const buffLeft = Math.random() < 0.5;
        const target = buffLeft ? left : right;
        if (target.roll.type === "plus") target.roll.n = Math.floor(target.roll.n * (1.18 + 0.25 * luck));
        if (target.roll.type === "mult") target.roll.m = clamp(target.roll.m + 1, 2, 8);
        if (target.roll.type === "risk") target.roll.n = Math.floor(target.roll.n * 0.75);
      }

      left = gateCardFromRoll(left.roll);
      right = gateCardFromRoll(right.roll);

      left = maybePurify(left);
      right = maybePurify(right);

      // Rare: a pure gold gate appears as a “temptation”
      if (Math.random() < (0.06 + 0.06 * luck)) {
        const side = Math.random() < 0.5 ? "left" : "right";
        const g = 30 + Math.floor(rnd(0, 60) * (1 + 0.4 * t));
        const goldGate = { cls: "gold", big: `+${g}`, small: "Loot", roll: { type: "gold", g } };
        if (side === "left") left = goldGate; else right = goldGate;
      }

      game.entities.push(makeRow(y, left, right));
      return;
    }

    const lane = Math.random() < 0.5 ? 0 : 1;

    if (kind === "enemy") {
      // Enemy scales with distance and current crowd (keeps it spicy).
      const base = 8 + Math.floor(10 * t);
      const swing = 14 + Math.floor(16 * t);
      const threat = Math.floor(base + rnd(0, swing));
      const card = { cls: "enemy", big: `ENEMY ${threat}`, small: "Clash", threat };
      game.entities.push(makeSingle(y, lane, card));
      return;
    }

    if (kind === "coin") {
      const g = Math.floor((18 + rnd(0, 30)) * (1 + 0.35 * t));
      const card = { cls: "coin", big: `+${g}`, small: "Gold", g };
      game.entities.push(makeSingle(y, lane, card));
      return;
    }

    // shield pickup
    const card = { cls: "shield", big: `+1`, small: "Shield", s: 1 };
    game.entities.push(makeSingle(y, lane, card));
  }

  // --- Resolution / effects ---
  function applyGate(card) {
    const r = card.roll;

    if (r?.type === "gold") {
      const gain = Math.floor(r.g * goldBonusMult());
      progress.goldBank += gain;
      game.goldRun += gain;
      saveSave(progress);
      showToast(`Loot +${gain} gold`);
      shake(120, 3);
      return;
    }

    if (r?.type === "shield") {
      game.shields += (r.s || 1);
      showToast(`Shield +1 (now ${game.shields})`);
      shake(120, 2);
      return;
    }

    if (r?.type === "plus") {
      game.crowd += r.n;
      showToast(`Recruit +${r.n}`);
      return;
    }

    if (r?.type === "mult") {
      const before = game.crowd;
      game.crowd = Math.floor(game.crowd * r.m);
      showToast(`Rally ×${r.m}`);
      if (game.crowd - before >= 40) shake(160, 4);
      return;
    }

    if (r?.type === "risk") {
      // If we have shields, auto-block the trap.
      if (game.shields > 0) {
        game.shields -= 1;
        showToast(`Trap blocked (shields ${game.shields})`);
        shake(130, 4);
        return;
      }
      game.crowd -= r.n;
      showToast(`Ambush −${r.n}`);
      shake(220, 8);
      return;
    }
  }

  function applySingle(e) {
    const c = e.data;

    if (c.cls.includes("enemy")) {
      const mitigation = enemyMitigation();
      const effectiveThreat = Math.floor(c.threat * (1 - mitigation));

      if (game.crowd > effectiveThreat) {
        // Win: lose some, gain some; net benefit if you’re stronger.
        const loss = Math.floor(effectiveThreat * (0.45 + rnd(0, 0.15)));
        game.crowd -= loss;

        const baseGold = 25 + Math.floor(rnd(0, 30)) + Math.floor(game.dist * 0.03);
        const gain = Math.floor(baseGold * goldBonusMult());

        progress.goldBank += gain;
        game.goldRun += gain;
        saveSave(progress);

        showToast(`Won clash! −${loss} crowd, +${gain} gold`);
        shake(160, 5);
        return;
      }

      // Lose = game over
      game.crowd = 0;
      showToast(`Defeated by enemy ${effectiveThreat}`);
      shake(360, 12);
      return;
    }

    if (c.cls.includes("coin")) {
      const gain = Math.floor(c.g * goldBonusMult());
      progress.goldBank += gain;
      game.goldRun += gain;
      saveSave(progress);
      showToast(`Gold +${gain}`);
      return;
    }

    if (c.cls.includes("shield")) {
      game.shields += (c.s || 1);
      showToast(`Shield +1 (now ${game.shields})`);
      return;
    }
  }

  // --- Game loop ---
  let lastT = 0;

  function tick(t) {
    requestAnimationFrame(tick);
    if (!game.running || game.paused) return;

    if (!lastT) lastT = t;
    const dt = Math.min(0.033, (t - lastT) / 1000);
    lastT = t;

    // speed ramps with distance (runner feel)
    game.time += dt;
    const prog = game.dist / 600; // progression factor
    game.speed = game.baseSpeed + prog * 18 + (game.practice ? 0 : prog * 7);

    game.dist += game.speed * dt * 0.06; // convert px-ish to meters-ish
    if (game.dist > bestDistance) {
      bestDistance = game.dist;
      saveBest(bestDistance);
    }

    // camera shake
    if (game.shakeT > 0) {
      game.shakeT -= dt;
      const r = stageRect();
      const mag = game.shakeMag * (game.shakeT / 0.25);
      const ox = rnd(-mag, mag);
      const oy = rnd(-mag, mag);
      stage.style.transform = `translate(${ox}px, ${oy}px)`;
      if (game.shakeT <= 0) {
        stage.style.transform = "";
        game.shakeMag = 0;
      }
    }

    // spawn
    game.nextSpawn -= dt;
    if (game.nextSpawn <= 0) {
      const tNorm = clamp(game.dist / 450, 0, 2.2);
      spawn(tNorm);

      // spawn cadence gets tighter as you go
      const base = game.practice ? 1.05 : 0.92;
      const tight = clamp(0.22 * (game.dist / 700), 0, 0.42);
      game.nextSpawn = base - tight + rnd(0, 0.18);
    }

    // move entities
    const playerY = stage.clientHeight - 210; // collision band
    const killY = stage.clientHeight + 180;

    for (const e of game.entities) {
      e.y += game.speed * dt;

      // position
      e.el.style.transform = `translateY(${e.y}px)`;

      // collision check
      if (!e.hit && e.y >= playerY && e.y <= playerY + 40) {
        // determine chosen lane and apply
        if (e.kind === "row") {
          const card = game.lane === 0 ? e.data.leftCard : e.data.rightCard;
          e.hit = true;

          // FX
          const r = stageRect();
          const x = r.width * (game.lane === 0 ? 0.27 : 0.73);
          const y = playerY + 20;
          burst(x, y, 12);

          applyGate(card);
        } else {
          if (e.lane === game.lane) {
            e.hit = true;

            const r = stageRect();
            const x = r.width * (game.lane === 0 ? 0.27 : 0.73);
            const y = playerY + 18;
            burst(x, y, 10);

            applySingle(e);
          }
        }

        // update player number
        game.crowd = Math.floor(game.crowd);
        playerNumEl.textContent = String(Math.max(0, game.crowd));
        updateHUD();

        // death check
        if (game.crowd <= 0) {
          endRun();
          return;
        }
      }
    }

    // cleanup
    for (let i = game.entities.length - 1; i >= 0; i--) {
      if (game.entities[i].y > killY) {
        game.entities[i].el.remove();
        game.entities.splice(i, 1);
      }
    }

    // passive gold drip from distance (tiny, but feels good)
    if (!game.practice) {
      const drip = dt * (0.22 + game.dist * 0.00012);
      progress.goldBank += drip * goldBonusMult();
      saveSave(progress);
    }

    updateHUD();
  }

  function endRun() {
    game.running = false;
    game.paused = false;

    // stop shaking transform (if any)
    stage.style.transform = "";
    lastT = 0;

    // overlays
    overlayGameOver.classList.remove("hidden");
    overlayStart.classList.add("hidden");
    overlayKingdom.classList.add("hidden");

    const dist = Math.floor(game.dist);
    const earned = Math.floor(game.goldRun);

    summaryEl.innerHTML = `
      <div><b>Distance:</b> ${dist}m</div>
      <div><b>Gold earned this run:</b> ${earned}</div>
      <div><b>Best distance:</b> ${Math.floor(bestDistance)}m</div>
      <div><b>Tip:</b> Build shields if traps are ending your runs; build Gate Luck if choices feel cursed.</div>
    `;

    const tips = [
      "If you see a big × gate and you’re already stacked, take it and become a math warlord.",
      "If you’re low crowd, take +N to stabilize before chasing multipliers.",
      "Shields are the anti-ambush insurance policy your future self will thank you for.",
      "Gate Luck makes the game feel less like gambling and more like strategy."
    ];
    deathTipEl.textContent = pick(tips);
  }

  // --- Input (swipe + keys) ---
  let touchActive = false;
  let touchX0 = 0;
  let touchY0 = 0;

  stage.addEventListener("touchstart", (e) => {
    if (!e.touches || e.touches.length === 0) return;
    touchActive = true;
    touchX0 = e.touches[0].clientX;
    touchY0 = e.touches[0].clientY;
  }, { passive: true });

  stage.addEventListener("touchmove", (e) => {
    if (!touchActive || !e.touches || e.touches.length === 0) return;
    const dx = e.touches[0].clientX - touchX0;
    const dy = e.touches[0].clientY - touchY0;
    if (Math.abs(dx) > 22 && Math.abs(dx) > Math.abs(dy)) {
      setLane(dx > 0 ? 1 : 0);
      touchActive = false;
    }
  }, { passive: true });

  stage.addEventListener("touchend", () => { touchActive = false; }, { passive: true });

  window.addEventListener("keydown", (e) => {
    const k = e.key.toLowerCase();
    if (k === "arrowleft" || k === "a") setLane(0);
    if (k === "arrowright" || k === "d") setLane(1);

    if (k === "p") togglePause();
    if (k === "r") hardRestart();
  });

  // --- UI controls ---
  function startRun(practice = false) {
    resetRun(practice);
    overlayStart.classList.add("hidden");
    overlayGameOver.classList.add("hidden");
    overlayKingdom.classList.add("hidden");

    game.running = true;
    game.paused = false;

    showToast(practice ? "Practice run" : "Run started");
    updateHUD();
    playerNumEl.textContent = String(game.crowd);

    lastT = 0;
  }

  function togglePause() {
    if (!game.running) return;
    game.paused = !game.paused;
    showToast(game.paused ? "Paused" : "Resumed");
  }

  function openKingdom() {
    // pause the run if running
    if (game.running) game.paused = true;
    renderKingdom();
    overlayKingdom.classList.remove("hidden");
    overlayStart.classList.add("hidden");
    overlayGameOver.classList.add("hidden");
  }

  function closeKingdom() {
    overlayKingdom.classList.add("hidden");
    if (!game.running) {
      overlayStart.classList.remove("hidden");
    } else {
      game.paused = false;
      showToast("Back to run");
    }
  }

  function hardRestart() {
    // keep progression, reset run
    resetRun(false);
    overlayStart.classList.remove("hidden");
    overlayGameOver.classList.add("hidden");
    overlayKingdom.classList.add("hidden");
    game.running = false;
    game.paused = false;
    showToast("Restarted");
  }

  btnPlay.addEventListener("click", () => startRun(false));
  btnPractice.addEventListener("click", () => startRun(true));
  btnPause.addEventListener("click", togglePause);
  btnRestart.addEventListener("click", hardRestart);

  btnKingdom.addEventListener("click", openKingdom);
  btnCloseKingdom.addEventListener("click", closeKingdom);

  btnRunAgain.addEventListener("click", () => startRun(false));
  btnGoKingdom.addEventListener("click", openKingdom);

  btnResetProgress.addEventListener("click", () => {
    Object.assign(progress, defaultProgress);
    saveSave(progress);
    bestDistance = 0;
    saveBest(0);
    renderKingdom();
    updateHUD();
    showToast("Progress reset");
  });

  // --- Boot ---
  hudBest.textContent = `${Math.floor(bestDistance)}m`;
  renderKingdom();
  resetRun(false);
  overlayStart.classList.remove("hidden");
  overlayGameOver.classList.add("hidden");
  overlayKingdom.classList.add("hidden");
  updateHUD();

  requestAnimationFrame(tick);
})();
