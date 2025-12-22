(() => {
  "use strict";

  // =========================
  // Helpers
  // =========================
  const $ = (id) => document.getElementById(id);
  const on = (el, ev, fn, opts) => el && el.addEventListener(ev, fn, opts);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const rnd = (a, b) => a + Math.random() * (b - a);
  const pick = (arr) => arr[(Math.random() * arr.length) | 0];

  const must = (id) => {
    const el = $(id);
    if (!el) console.warn(`[KC] Missing element #${id}`);
    return el;
  };

  const onClickId = (id, fn) => {
    const el = $(id);
    if (!el) console.warn(`[KC] Missing button #${id} (click not bound)`);
    else el.addEventListener("click", fn);
    return el;
  };

  // =========================
  // DOM
  // =========================
  const stage = must("stage");
  const fx = must("fx");
  const toast = must("toast");

  const playerEl = must("player");
  const playerNumEl = must("playerNum");

  const hudCrowd = must("hudCrowd");
  const hudGold = must("hudGold");
  const hudSoldiers = must("hudSoldiers");
  const hudDist = must("hudDist");
  const hudBest = must("hudBest");

  const overlayStart = must("overlayStart");
  const overlayKingdom = must("overlayKingdom");
  const overlayDefense = must("overlayDefense");
  const overlayGameOver = must("overlayGameOver");

  // Defense battlefield nodes
  const battlefield = $("battlefield");
  const bfTowers = $("bfTowers");
  const bfUnits = $("bfUnits");
  const bfShots = $("bfShots");

  // =========================
  // Scroll lock / gestures
  // =========================
  // Prevent page scroll / rubber-banding. Allow internal panelScroll elements to scroll if needed.
  document.addEventListener(
    "touchmove",
    (e) => {
      const t = e.target;
      if (t && t.closest && t.closest(".panelScroll")) return; // allow internal overlay scrolling
      e.preventDefault();
    },
    { passive: false }
  );

  // =========================
  // FX / UI
  // =========================
  function showToast(msg) {
    if (!toast) return;
    toast.textContent = msg;
    toast.classList.add("show");
    clearTimeout(showToast._t);
    showToast._t = setTimeout(() => toast.classList.remove("show"), 780);
  }

  function burst(x, y, count = 10, lifeMs = 520) {
    if (!fx) return;
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
        const dt = t - t0;
        const k = dt / lifeMs;
        if (k >= 1) {
          p.remove();
          return;
        }
        const px = x + vx * (dt / 1000);
        const py = y + vy * (dt / 1000) + 120 * k * k;
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

  // =========================
  // BigInt formatting
  // =========================
  const SUFFIX = ["", "K", "M", "B", "T", "Qa", "Qi", "Sx", "Sp", "Oc", "No", "Dc"];
  function formatBig(n) {
    const sign = n < 0n ? "-" : "";
    let x = n < 0n ? -n : n;
    if (x < 1000n) return sign + x.toString();
    let idx = 0;
    while (x >= 1000n && idx < SUFFIX.length - 1) {
      x /= 1000n;
      idx++;
    }
    return `${sign}${x.toString()}${SUFFIX[idx]}`;
  }

  function toBigIntSafe(v) {
    if (typeof v === "bigint") return v;
    if (typeof v === "number") return BigInt(Math.floor(v));
    if (typeof v === "string") return BigInt(v);
    return 0n;
  }

  // =========================
  // Save / Load
  // =========================
  const SAVE_KEY = "kcrowdshot_save_v3";
  const BEST_KEY = "kcrowdshot_best_v3";

  function loadSave() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return null;
      const o = JSON.parse(raw);
      return o && typeof o === "object" ? o : null;
    } catch {
      return null;
    }
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

  // =========================
  // Progression
  // =========================
  const defaultProgress = {
    goldBank: 0,
    soldiersBank: "0",

    startCrowdLvl: 0,
    luckLvl: 0,
    shieldLvl: 0,
    archerLvl: 0,
    stewardLvl: 0,
    mageLvl: 0,

    towerSlots: 1,
    towerLvls: [1],
    towerAssigned: ["0"],
    defenseWave: 1
  };

  const progress = Object.assign({}, defaultProgress, loadSave() || {});
  if (!Array.isArray(progress.towerLvls)) progress.towerLvls = [1];
  if (!Array.isArray(progress.towerAssigned)) progress.towerAssigned = ["0"];
  if (typeof progress.soldiersBank !== "string") progress.soldiersBank = String(progress.soldiersBank || "0");
  if (typeof progress.towerSlots !== "number" || progress.towerSlots < 1) progress.towerSlots = 1;
  if (typeof progress.defenseWave !== "number" || progress.defenseWave < 1) progress.defenseWave = 1;

  let bestDistance = loadBest();

  const soldiersBankBig = () => toBigIntSafe(progress.soldiersBank || "0");
  const setSoldiersBankBig = (n) => (progress.soldiersBank = n.toString());

  const startCrowdValueBig = () => 10n + BigInt((progress.startCrowdLvl | 0) * 3);
  const luckPercent = () => (progress.luckLvl | 0) * 4;
  const shieldCharges = () => (progress.shieldLvl | 0);
  const enemyMitigation = () => clamp((progress.archerLvl | 0) * 0.06, 0, 0.35);
  const goldBonusMult = () => 1 + (progress.stewardLvl | 0) * 0.08;
  const magePurifyChance = () => clamp((progress.mageLvl | 0) * 0.06, 0, 0.30);

  // =========================
  // Runner state
  // =========================
  const game = {
    running: false,
    paused: false,
    practice: false,
    lane: 0, // 0=left, 1=right
    crowd: 10n,
    goldRun: 0,
    soldiersRun: 0n,
    shields: 0,
    dist: 0,
    speed: 330,
    baseSpeed: 330,
    nextSpawn: 0,
    entities: []
  };

  function updateHUD() {
    hudCrowd && (hudCrowd.textContent = formatBig(game.crowd));
    hudGold && (hudGold.textContent = String(Math.floor(progress.goldBank)));
    hudSoldiers && (hudSoldiers.textContent = formatBig(soldiersBankBig()));
    hudDist && (hudDist.textContent = `${Math.floor(game.dist)}m`);
    hudBest && (hudBest.textContent = `${Math.floor(bestDistance)}m`);
  }

  function setLane(l) {
    const nl = l ? 1 : 0;
    if (nl === game.lane) return;
    game.lane = nl;
    if (playerEl) {
      if (game.lane === 1) playerEl.classList.add("right");
      else playerEl.classList.remove("right");
    }
  }

  // =========================
  // Entities (visual card icons)
  // =========================
  const ICON = {
    plus: "➕",
    mult: "✖",
    risk: "⚠",
    gold: "💰",
    coin: "🪙",
    sold: "🛡",
    shield: "🔰",
    enemy: "⚔"
  };

  function makeRow(y, leftCard, rightCard) {
    const row = document.createElement("div");
    row.className = "entityRow";

    const l = document.createElement("div");
    const r = document.createElement("div");

    l.className = `card ${leftCard.cls}`;
    r.className = `card ${rightCard.cls}`;

    l.innerHTML = `
      <div class="icon" aria-hidden="true">${leftCard.icon || ""}</div>
      <div class="txt">
        <div class="big">${leftCard.big}</div>
        <div class="small">${leftCard.small}</div>
      </div>
    `;

    r.innerHTML = `
      <div class="icon" aria-hidden="true">${rightCard.icon || ""}</div>
      <div class="txt">
        <div class="big">${rightCard.big}</div>
        <div class="small">${rightCard.small}</div>
      </div>
    `;

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

    const html = `
      <div class="icon" aria-hidden="true">${card.icon || ""}</div>
      <div class="txt">
        <div class="big">${card.big}</div>
        <div class="small">${card.small}</div>
      </div>
    `;

    if (lane === 0) {
      left.className = `single ${card.cls}`;
      left.innerHTML = html;
      right.style.opacity = "0";
    } else {
      right.className = `single ${card.cls}`;
      right.innerHTML = html;
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

  // =========================
  // Gates / loot / risk
  // =========================
  function rollGate(t) {
    const luck = luckPercent() / 100;

    const baseRisk = clamp(0.10 + 0.12 * t, 0.10, 0.36);
    const risk = clamp(baseRisk * (1 - 0.85 * luck), 0.05, 0.40);

    const multBias = clamp(0.20 + 0.25 * t, 0.20, 0.60);
    const plusBias = clamp(0.70 - 0.20 * t, 0.35, 0.75);

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
      const spread = 10 + Math.floor(12 * t);
      const n = Math.floor(base + rnd(0, spread) * (1 + 0.6 * luck));
      return { type: "plus", n };
    }

    // Cap offered multipliers when already huge (keeps pace)
    if (kind === "mult") {
      const pool =
        t < 0.6 ? [2, 2, 3, 3, 4] :
        t < 1.2 ? [2, 3, 3, 4, 4, 5] :
                  [3, 4, 4, 5, 5, 6, 7];

      const digits = (game.crowd < 0n ? 0n : game.crowd).toString().length;
      const cap = clamp(8 - Math.floor(Math.max(0, digits - 6) / 2), 2, 8);

      let m = pick(pool);
      if (Math.random() < luck * 0.55) m += 1;
      m = clamp(m, 2, cap);
      return { type: "mult", m };
    }

    const base = 6 + Math.floor(6 * t);
    const spread = 10 + Math.floor(12 * t);
    const n = Math.floor(base + rnd(0, spread));
    return { type: "risk", n };
  }

  function gateCardFromRoll(roll) {
    if (roll.type === "plus") return { cls: "plus", big: `+${roll.n}`, small: "Recruit", icon: ICON.plus, roll };
    if (roll.type === "mult") return { cls: "mult", big: `×${roll.m}`, small: "Rally", icon: ICON.mult, roll };
    return { cls: "risk", big: `−${roll.n}`, small: "Ambush", icon: ICON.risk, roll };
  }

  function maybePurify(card) {
    if (card.roll?.type !== "risk") return card;
    if (Math.random() < magePurifyChance()) {
      const choice = weightedPick([
        { v: "gold", w: 0.55 },
        { v: "shield", w: 0.25 },
        { v: "sold", w: 0.20 }
      ]);
      if (choice === "gold") {
        const g = 35 + Math.floor(rnd(0, 80));
        return { cls: "gold", big: `+${g}`, small: "Treasury", icon: ICON.gold, roll: { type: "gold", g } };
      }
      if (choice === "shield") {
        return { cls: "shield", big: `+1`, small: "Shield", icon: ICON.shield, roll: { type: "shield", s: 1 } };
      }
      const s = 60 + Math.floor(rnd(0, 140));
      return { cls: "sold", big: `+${s}`, small: "Draft", icon: ICON.sold, roll: { type: "sold", s } };
    }
    return card;
  }

  // =========================
  // Spawning
  // =========================
  function spawn(t) {
    const luck = luckPercent() / 100;

    const enemyChance = clamp(0.18 + 0.12 * t, 0.18, 0.48);
    const coinChance = clamp(0.15 + 0.07 * t, 0.15, 0.30);
    const soldChance = clamp(0.10 + 0.05 * t, 0.10, 0.26);
    const shieldChance = clamp(0.05 + 0.02 * t + 0.03 * luck, 0.05, 0.16);
    const rowChance = 1 - clamp(enemyChance + coinChance + soldChance + shieldChance, 0.35, 0.78);

    const kind = weightedPick([
      { v: "row", w: rowChance },
      { v: "enemy", w: enemyChance },
      { v: "coin", w: coinChance },
      { v: "sold", w: soldChance },
      { v: "shield", w: shieldChance }
    ]);

    const y = -150;
    const lane = Math.random() < 0.5 ? 0 : 1;

    if (kind === "row") {
      let left = gateCardFromRoll(rollGate(t));
      let right = gateCardFromRoll(rollGate(t));

      // Slight bias based on luck: better offers, fewer ambushes
      if (Math.random() < 0.35 + 0.25 * luck) {
        const buffLeft = Math.random() < 0.5;
        const target = buffLeft ? left : right;
        if (target.roll.type === "plus") target.roll.n = Math.floor(target.roll.n * (1.18 + 0.25 * luck));
        if (target.roll.type === "mult") target.roll.m = clamp(target.roll.m + 1, 2, 8);
        if (target.roll.type === "risk") target.roll.n = Math.floor(target.roll.n * 0.75);
      }

      left = maybePurify(gateCardFromRoll(left.roll));
      right = maybePurify(gateCardFromRoll(right.roll));

      // Rare special gate: loot/draft
      if (Math.random() < (0.06 + 0.06 * luck)) {
        const side = Math.random() < 0.5 ? "left" : "right";
        if (Math.random() < 0.55) {
          const g = 40 + Math.floor(rnd(0, 90) * (1 + 0.4 * t));
          const goldGate = { cls: "gold", big: `+${g}`, small: "Loot", icon: ICON.gold, roll: { type: "gold", g } };
          if (side === "left") left = goldGate; else right = goldGate;
        } else {
          const s = 70 + Math.floor(rnd(0, 170) * (1 + 0.35 * t));
          const soldGate = { cls: "sold", big: `+${s}`, small: "Draft", icon: ICON.sold, roll: { type: "sold", s } };
          if (side === "left") left = soldGate; else right = soldGate;
        }
      }

      game.entities.push(makeRow(y, left, right));
      return;
    }

    if (kind === "coin") {
      const g = Math.floor((18 + rnd(0, 30)) * (1 + 0.35 * t));
      game.entities.push(makeSingle(y, lane, { cls: "coin", big: `+${g}`, small: "Gold", icon: ICON.coin, g }));
      return;
    }
    if (kind === "sold") {
      const s = Math.floor((30 + rnd(0, 60)) * (1 + 0.40 * t));
      game.entities.push(makeSingle(y, lane, { cls: "sold", big: `+${s}`, small: "Soldiers", icon: ICON.sold, s }));
      return;
    }
    if (kind === "shield") {
      game.entities.push(makeSingle(y, lane, { cls: "shield", big: `+1`, small: "Shield", icon: ICON.shield, s: 1 }));
      return;
    }

    // Enemy scaling (keeps pace with your crowd + progress; mitigated by archers)
    const crowd = game.crowd;
    const tNum = BigInt(Math.floor(clamp(t, 0, 2.6) * 100));
    let threat = 12n + BigInt(Math.floor(10 * t)) * 6n;

    const basePct = 25n + (tNum * 3n) / 4n;
    const randPct = BigInt(Math.floor(rnd(80, 125)));
    let pct = (basePct * randPct) / 100n;
    pct = clamp(Number(pct), 18, 140);
    threat += (crowd * BigInt(pct)) / 100n;

    if (Math.random() < 0.10 + t * 0.10) {
      const spike = BigInt(Math.floor(rnd(120, 220)));
      threat = (threat * spike) / 100n;
    }
    if (crowd > 1000000n && threat < crowd / 12n) threat = crowd / 12n;

    game.entities.push(
      makeSingle(y, lane, {
        cls: "enemy",
        big: `ENEMY ${formatBig(threat)}`,
        small: "Clash",
        icon: ICON.enemy,
        threat
      })
    );
  }

  // =========================
  // Apply effects
  // =========================
  function applyGate(card) {
    const r = card.roll;

    if (r?.type === "gold") {
      const gain = Math.floor(r.g * goldBonusMult());
      progress.goldBank += gain;
      game.goldRun += gain;
      saveSave(progress);
      showToast(`Loot +${gain} gold`);
      return;
    }

    if (r?.type === "sold") {
      const add = BigInt(r.s || 0);
      setSoldiersBankBig(soldiersBankBig() + add);
      game.soldiersRun += add;
      saveSave(progress);
      showToast(`Draft +${formatBig(add)} soldiers`);
      return;
    }

    if (r?.type === "shield") {
      game.shields += (r.s || 1);
      showToast(`Shield +1 (now ${game.shields})`);
      return;
    }

    if (r?.type === "plus") {
      game.crowd += BigInt(r.n);
      showToast(`Recruit +${r.n}`);
      return;
    }

    // Soft-cap multiplier effect when crowd is huge (keeps pace)
    if (r?.type === "mult") {
      const before = game.crowd;
      const digits = (game.crowd < 0n ? 0n : game.crowd).toString().length;
      const soften = clamp(1 - Math.max(0, digits - 6) * 0.035, 0.35, 1);
      const eff = clamp(1 + Math.floor((r.m - 1) * soften), 2, 8);
      game.crowd = game.crowd * BigInt(eff);
      showToast(`Rally ×${eff}`);
      if (game.crowd - before >= 40n) {
        const rect = stageRect();
        burst(rect.width * (game.lane === 0 ? 0.27 : 0.73), rect.height * 0.55, 12);
      }
      return;
    }

    if (r?.type === "risk") {
      if (game.shields > 0) {
        game.shields -= 1;
        showToast(`Ambush blocked (shields ${game.shields})`);
        return;
      }
      game.crowd -= BigInt(r.n);
      showToast(`Ambush −${r.n}`);
      return;
    }
  }

  function applySingle(ent) {
    const c = ent.data;

    if (c.cls.includes("enemy")) {
      const mitigation = enemyMitigation();
      const threat = toBigIntSafe(c.threat);
      const mitFP = BigInt(Math.floor((1 - mitigation) * 1000));
      const effective = (threat * mitFP) / 1000n;

      if (game.crowd > effective) {
        // win: lose some crowd, gain loot
        const lossPct = BigInt(Math.floor(rnd(20, 45)));
        const loss = (effective * lossPct) / 100n;
        game.crowd -= loss;

        const baseGold = 40 + Math.floor(rnd(0, 50)) + Math.floor(game.dist * 0.05);
        const gainGold = Math.floor(baseGold * goldBonusMult());
        progress.goldBank += gainGold;
        game.goldRun += gainGold;

        const soldierGain = (effective / 80n) + BigInt(25 + Math.floor(rnd(0, 90)));
        setSoldiersBankBig(soldiersBankBig() + soldierGain);
        game.soldiersRun += soldierGain;

        saveSave(progress);
        showToast(`Won clash! +${gainGold} gold, +${formatBig(soldierGain)} soldiers`);
        return;
      }

      game.crowd = 0n;
      showToast(`Defeated by enemy ${formatBig(effective)}`);
      return;
    }

    if (c.cls.includes("coin")) {
      const gain = Math.floor((c.g || 0) * goldBonusMult());
      progress.goldBank += gain;
      game.goldRun += gain;
      saveSave(progress);
      showToast(`Gold +${gain}`);
      return;
    }

    if (c.cls.includes("sold")) {
      const add = BigInt(c.s || 0);
      setSoldiersBankBig(soldiersBankBig() + add);
      game.soldiersRun += add;
      saveSave(progress);
      showToast(`Soldiers +${formatBig(add)}`);
      return;
    }

    if (c.cls.includes("shield")) {
      game.shields += (c.s || 1);
      showToast(`Shield +1 (now ${game.shields})`);
      return;
    }
  }

  // =========================
  // Game loop
  // =========================
  let lastT = 0;

  function tick(t) {
    requestAnimationFrame(tick);

    if (!game.running || game.paused) return;
    if (!lastT) lastT = t;

    const dt = Math.min(0.033, (t - lastT) / 1000);
    lastT = t;

    // Progress + speed
    const prog = game.dist / 650;
    game.speed = game.baseSpeed + prog * 18 + (game.practice ? 0 : prog * 8);
    game.dist += game.speed * dt * 0.06;

    if (game.dist > bestDistance) {
      bestDistance = game.dist;
      saveBest(bestDistance);
    }

    // ===== Spawn cadence: gradually faster, bounded =====
    game.nextSpawn -= dt;
    if (game.nextSpawn <= 0) {
      const tNorm = clamp(game.dist / 480, 0, 2.6);
      spawn(tNorm);

      // Interval shrinks with distance, but never becomes ridiculous.
      const accel = clamp(game.dist / 900, 0, 1.6);
      const maxI = game.practice ? 1.06 : 0.94;
      const minI = game.practice ? 0.72 : 0.48;
      const interval = maxI - accel * 0.30 + rnd(0, 0.14);
      game.nextSpawn = clamp(interval, minI, maxI);
    }

    // Collision / movement
    const playerY = stage.clientHeight - 220;
    const killY = stage.clientHeight + 220;

    for (const e of game.entities) {
      e.y += game.speed * dt;
      e.el.style.transform = `translateY(${e.y}px)`;

      if (!e.hit && e.y >= playerY && e.y <= playerY + 40) {
        if (e.kind === "row") {
          e.hit = true;
          const card = game.lane === 0 ? e.data.leftCard : e.data.rightCard;
          const r = stageRect();
          burst(r.width * (game.lane === 0 ? 0.27 : 0.73), playerY + 20, 12);
          applyGate(card);
        } else {
          if (e.lane === game.lane) {
            e.hit = true;
            const r = stageRect();
            burst(r.width * (game.lane === 0 ? 0.27 : 0.73), playerY + 18, 10);
            applySingle(e);
          }
        }

        playerNumEl && (playerNumEl.textContent = formatBig(game.crowd < 0n ? 0n : game.crowd));
        updateHUD();

        if (game.crowd <= 0n) {
          endRun();
          return;
        }
      }
    }

    // Cleanup
    for (let i = game.entities.length - 1; i >= 0; i--) {
      if (game.entities[i].y > killY) {
        game.entities[i].el.remove();
        game.entities.splice(i, 1);
      }
    }

    // Gentle passive gold drip (non-practice)
    if (!game.practice) {
      const drip = dt * (0.22 + game.dist * 0.00012);
      progress.goldBank += drip * goldBonusMult();
      saveSave(progress);
    }

    updateHUD();
  }

  function cleanupEntities() {
    for (const e of game.entities) e.el.remove();
    game.entities.length = 0;
  }

  function resetRun(practice = false) {
    cleanupEntities();
    game.practice = practice;
    game.running = false;
    game.paused = false;
    game.lane = 0;
    playerEl && playerEl.classList.remove("right");

    game.crowd = startCrowdValueBig();
    game.goldRun = 0;
    game.soldiersRun = 0n;
    game.shields = shieldCharges();

    game.dist = 0;
    game.baseSpeed = practice ? 270 : 330;
    game.speed = game.baseSpeed;

    game.nextSpawn = 0.08;
    lastT = 0;

    updateHUD();
    playerNumEl && (playerNumEl.textContent = formatBig(game.crowd));
  }

  function endRun() {
    game.running = false;
    game.paused = false;
    lastT = 0;

    overlayGameOver && overlayGameOver.classList.remove("hidden");
    overlayStart && overlayStart.classList.add("hidden");
    overlayKingdom && overlayKingdom.classList.add("hidden");
    overlayDefense && overlayDefense.classList.add("hidden");

    const dist = Math.floor(game.dist);
    const earnedGold = Math.floor(game.goldRun);
    const earnedSold = game.soldiersRun;

    const summaryEl = $("summary");
    if (summaryEl) {
      summaryEl.innerHTML = `
        <div><b>Distance:</b> ${dist}m</div>
        <div><b>Gold earned (run):</b> ${earnedGold}</div>
        <div><b>Soldiers earned (run):</b> ${formatBig(earnedSold)}</div>
        <div><b>Best distance:</b> ${Math.floor(bestDistance)}m</div>
      `;
    }

    const tips = [
      "If you’re low, favor +Recruit and Loot before chasing multipliers.",
      "Upgrade Start Crowd and Shields early for consistency.",
      "Defense is easier if you build a second tower slot first."
    ];
    const tipEl = $("deathTip");
    if (tipEl) tipEl.textContent = pick(tips);
  }

  // =========================
  // Controls (swipe + keys)
  // =========================
  let touchActive = false, touchX0 = 0, touchY0 = 0;

  on(stage, "touchstart", (e) => {
    if (!e.touches?.length) return;
    // If tapping inside overlay panels, don't treat as swipe start.
    const target = e.target;
    if (target && target.closest && target.closest(".panel")) return;

    touchActive = true;
    touchX0 = e.touches[0].clientX;
    touchY0 = e.touches[0].clientY;
  }, { passive: true });

  on(stage, "touchmove", (e) => {
    if (!touchActive || !e.touches?.length) return;
    const dx = e.touches[0].clientX - touchX0;
    const dy = e.touches[0].clientY - touchY0;
    if (Math.abs(dx) > 22 && Math.abs(dx) > Math.abs(dy)) {
      setLane(dx > 0 ? 1 : 0);
      touchActive = false;
    }
  }, { passive: true });

  on(stage, "touchend", () => { touchActive = false; }, { passive: true });

  on(window, "keydown", (e) => {
    const k = e.key.toLowerCase();
    if (k === "arrowleft" || k === "a") setLane(0);
    if (k === "arrowright" || k === "d") setLane(1);
    if (k === "p") togglePause();
  });

  // =========================
  // Start/Stop
  // =========================
  function startRun(practice = false) {
    resetRun(practice);

    overlayStart && overlayStart.classList.add("hidden");
    overlayGameOver && overlayGameOver.classList.add("hidden");
    overlayKingdom && overlayKingdom.classList.add("hidden");
    overlayDefense && overlayDefense.classList.add("hidden");

    game.running = true;
    game.paused = false;

    showToast(practice ? "Practice run" : "Run started");
    updateHUD();
  }

  function hardRestart() {
    resetRun(false);
    overlayStart && overlayStart.classList.remove("hidden");
    overlayGameOver && overlayGameOver.classList.add("hidden");
    overlayKingdom && overlayKingdom.classList.add("hidden");
    overlayDefense && overlayDefense.classList.add("hidden");
    game.running = false;
    game.paused = false;
    showToast("Restarted");
  }

  // =========================
  // ===== Kingdom + Defense Meta =====
  // =========================
  const upgradeGrid = $("upgradeGrid");
  const towerGrid = $("towerGrid");
  const defReport = $("defReport");

  const kGoldEl = $("kGold");
  const kSoldEl = $("kSoldiers");
  const kStartEl = $("kStartCrowd");
  const kLuckEl = $("kLuck");

  const dGoldEl = $("dGold");
  const dSoldEl = $("dSoldiers");
  const dWaveEl = $("dWave");
  const dEnemyEl = $("dEnemy");
  const dPowerEl = $("dPower");

  function hideMetaOverlays() {
    overlayKingdom && overlayKingdom.classList.add("hidden");
    overlayDefense && overlayDefense.classList.add("hidden");
    overlayGameOver && overlayGameOver.classList.add("hidden");
  }

  function togglePause() {
    if (!game.running) return;
    game.paused = !game.paused;
    const btn = $("btnPause");
    if (btn) btn.textContent = game.paused ? "Resume" : "Pause";
    showToast(game.paused ? "Paused" : "Resumed");
  }

  // ===== Kingdom Upgrades =====
  const UPG = [
    {
      key: "startCrowdLvl",
      title: "Start Crowd",
      desc: (lvl) => `Start with +${lvl * 3} crowd (base 10).`,
      cost: (lvl) => Math.floor(60 * Math.pow(1.55, lvl)),
      icon: "👥"
    },
    {
      key: "luckLvl",
      title: "Gate Luck",
      desc: (lvl) => `+${lvl * 4}% chance for better gates & fewer ambushes.`,
      cost: (lvl) => Math.floor(85 * Math.pow(1.6, lvl)),
      icon: "🍀"
    },
    {
      key: "shieldLvl",
      title: "Shields",
      desc: (lvl) => `Start runs with ${lvl} shield(s) that block ambushes.`,
      cost: (lvl) => Math.floor(110 * Math.pow(1.65, lvl)),
      icon: "🔰"
    },
    {
      key: "archerLvl",
      title: "Archers",
      desc: (lvl) => `Reduce enemy threat by ${Math.floor(clamp(lvl * 0.06, 0, 0.35) * 100)}%.`,
      cost: (lvl) => Math.floor(120 * Math.pow(1.62, lvl)),
      icon: "🏹"
    },
    {
      key: "stewardLvl",
      title: "Steward",
      desc: (lvl) => `Gold gains ×${(1 + lvl * 0.08).toFixed(2)}.`,
      cost: (lvl) => Math.floor(140 * Math.pow(1.62, lvl)),
      icon: "💰"
    },
    {
      key: "mageLvl",
      title: "Mage",
      desc: (lvl) => `${Math.floor(clamp(lvl * 0.06, 0, 0.30) * 100)}% chance ambush becomes loot/shield/draft.`,
      cost: (lvl) => Math.floor(160 * Math.pow(1.66, lvl)),
      icon: "✨"
    }
  ];

  function renderKingdom() {
    kGoldEl && (kGoldEl.textContent = String(Math.floor(progress.goldBank)));
    kSoldEl && (kSoldEl.textContent = formatBig(soldiersBankBig()));
    kStartEl && (kStartEl.textContent = formatBig(startCrowdValueBig()));
    kLuckEl && (kLuckEl.textContent = `${luckPercent()}%`);

    if (!upgradeGrid) return;

    upgradeGrid.innerHTML = UPG.map((u) => {
      const lvl = progress[u.key] | 0;
      const cost = u.cost(lvl);
      const afford = progress.goldBank >= cost;
      return `
        <div class="upgradeCard">
          <div class="uTop">
            <div class="uTitle">${u.icon} ${u.title}</div>
            <div class="uLvl">Lv ${lvl}</div>
          </div>
          <div class="uDesc">${u.desc(lvl)}</div>
          <div class="uBottom">
            <div class="uCost">Cost: <b>${cost}</b> gold</div>
            <button class="btn small ${afford ? "primary" : ""}" data-upg="${u.key}">
              ${afford ? "Buy" : "Need Gold"}
            </button>
          </div>
        </div>
      `;
    }).join("");
  }

  function openKingdom() {
    if (game.running) game.paused = true;
    hideMetaOverlays();
    overlayStart && overlayStart.classList.add("hidden");
    overlayKingdom && overlayKingdom.classList.remove("hidden");
    renderKingdom();
  }

  function closeKingdom() {
    overlayKingdom && overlayKingdom.classList.add("hidden");
    if (game.running) game.paused = false;
  }

  function buyUpgrade(key) {
    const u = UPG.find(x => x.key === key);
    if (!u) return;
    const lvl = progress[key] | 0;
    const cost = u.cost(lvl);
    if (progress.goldBank < cost) {
      showToast("Not enough gold");
      return;
    }
    progress.goldBank -= cost;
    progress[key] = lvl + 1;
    saveSave(progress);
    updateHUD();
    renderKingdom();
    showToast(`${u.title} upgraded`);
  }

  // ===== Defense (Towers + Waves) =====
  function ensureTowers() {
    if (!Array.isArray(progress.towerLvls)) progress.towerLvls = [1];
    if (!Array.isArray(progress.towerAssigned)) progress.towerAssigned = ["0"];
    if (typeof progress.towerSlots !== "number" || progress.towerSlots < 1) progress.towerSlots = 1;

    while (progress.towerLvls.length < progress.towerSlots) progress.towerLvls.push(1);
    while (progress.towerAssigned.length < progress.towerSlots) progress.towerAssigned.push("0");
  }

  function assignedTotal() {
    ensureTowers();
    let sum = 0n;
    for (let i = 0; i < progress.towerSlots; i++) sum += toBigIntSafe(progress.towerAssigned[i] || "0");
    return sum;
  }

  function towerPower(i) {
    const lvl = (progress.towerLvls[i] | 0) || 1;
    const a = toBigIntSafe(progress.towerAssigned[i] || "0");
    const mult = 1 + lvl * 0.35; // tower scaling
    const bonus = 1 + (progress.archerLvl | 0) * 0.04; // archers help defense too
    const fp = BigInt(Math.floor(mult * bonus * 1000));
    return (a * fp) / 1000n;
  }

  function defensePower() {
    ensureTowers();
    let p = 0n;
    for (let i = 0; i < progress.towerSlots; i++) p += towerPower(i);
    return p;
  }

  function nextEnemyArmy() {
    const wave = progress.defenseWave | 0;
    const totalArmy = soldiersBankBig() + assignedTotal();
    const pct = BigInt(clamp(28 + wave * 7, 30, 160)); // 30%..160% of your total
    const base = (totalArmy * pct) / 100n;
    const flat = BigInt(250 * wave);
    return base + flat;
  }

  // ---- Defense battlefield visuals (original art, “Kingshot-like” feel) ----
  function clearBattlefield() {
    bfTowers && (bfTowers.innerHTML = "");
    bfUnits && (bfUnits.innerHTML = "");
    bfShots && (bfShots.innerHTML = "");
  }

  function renderTowerSprites() {
    if (!bfTowers || !battlefield) return;
    bfTowers.innerHTML = "";
    const rect = battlefield.getBoundingClientRect();

    // Spread towers left-to-right; visually align above the keep
    const n = progress.towerSlots | 0;
    const left = rect.width * 0.18;
    const right = rect.width * 0.82;

    for (let i = 0; i < n; i++) {
      const x = left + (n === 1 ? 0.5 : i / (n - 1)) * (right - left);
      const t = document.createElement("div");
      t.className = "towerSprite";
      t.style.left = `${x}px`;
      t.style.transform = "translateX(-50%)";
      t.title = `Tower ${i + 1}`;
      bfTowers.appendChild(t);
    }
  }

  function spawnEnemySprites(enemyBig, wave) {
    if (!bfUnits || !battlefield) return [];
    const rect = battlefield.getBoundingClientRect();
    const enemies = [];

    // Visual count is capped; we show a few units with tags.
    const digits = enemyBig.toString().length;
    const visCount = clamp(4 + Math.floor(digits / 2), 4, 14);
    const boss = digits >= 7 || wave % 5 === 0;

    for (let i = 0; i < visCount; i++) {
      const unit = document.createElement("div");
      unit.className = "enemyUnit" + (boss && i === 0 ? " boss" : "");
      const laneY = [55, 100, 145][i % 3];
      const x = rnd(rect.width * 0.15, rect.width * 0.85);
      unit.style.left = `${x}px`;
      unit.style.top = `${laneY}px`;

      if (i === 0) {
        const tag = document.createElement("div");
        tag.className = "tag";
        tag.textContent = boss ? `BOSS • ${formatBig(enemyBig)}` : `Wave ${wave}`;
        unit.appendChild(tag);
      }

      bfUnits.appendChild(unit);
      enemies.push(unit);
    }
    return enemies;
  }

  function fireShots(durationMs = 1400) {
    if (!bfShots || !battlefield || !bfTowers) return;
    const rect = battlefield.getBoundingClientRect();
    const towers = Array.from(bfTowers.children);

    const endAt = performance.now() + durationMs;

    const loop = () => {
      if (performance.now() > endAt) return;
      if (towers.length === 0) return;

      // random tower fires
      const t = towers[(Math.random() * towers.length) | 0];
      const tx = t.getBoundingClientRect().left + t.getBoundingClientRect().width / 2 - rect.left;
      const ty = rect.height - 48;

      const shot = document.createElement("div");
      shot.className = "shot";
      shot.style.left = `${tx}px`;
      shot.style.top = `${ty}px`;
      bfShots.appendChild(shot);

      // animate towards mid-field
      const targetX = rnd(rect.width * 0.25, rect.width * 0.75);
      const targetY = rnd(40, 120);
      shot.animate(
        [
          { transform: "translate(-50%,-50%) scale(1)", opacity: 0.9 },
          { transform: `translate(${targetX - tx - 4}px, ${targetY - ty - 4}px) scale(.9)`, opacity: 0.0 }
        ],
        { duration: 420, easing: "cubic-bezier(.2,.9,.1,1)" }
      ).onfinish = () => shot.remove();

      setTimeout(loop, 60);
    };
    loop();
  }

  async function playDefenseBattle(win, enemyBig, powerBig) {
    if (!battlefield) return;

    clearBattlefield();
    renderTowerSprites();
    const enemies = spawnEnemySprites(enemyBig, progress.defenseWave | 0);

    // Enemies surge toward the keep
    const rect = battlefield.getBoundingClientRect();
    const endY = rect.height - 34;

    enemies.forEach((u, idx) => {
      const start = u.getBoundingClientRect();
      const x = start.left + start.width / 2 - rect.left;
      const y = start.top + start.height / 2 - rect.top;

      u.animate(
        [
          { transform: "translate(-50%,-50%) scale(1)", filter: "brightness(1)" },
          { transform: `translate(${(x - x) * 0}px, ${endY - y}px) scale(1.02)`, filter: "brightness(1.05)" }
        ],
        { duration: 1450 + idx * 40, easing: "cubic-bezier(.25,.85,.12,1)" }
      );
    });

    fireShots(1200);

    // Result impact pulse
    await new Promise((res) => setTimeout(res, 1500));
    const msg = win
      ? `Victory • Power ${formatBig(powerBig)} vs ${formatBig(enemyBig)}`
      : `Defeat • Power ${formatBig(powerBig)} vs ${formatBig(enemyBig)}`;
    showToast(msg);

    // Final burst
    const r = stageRect();
    burst(r.width * 0.5, r.height * 0.62, win ? 16 : 10, 620);
  }

  function renderDefense() {
    ensureTowers();

    dGoldEl && (dGoldEl.textContent = String(Math.floor(progress.goldBank)));
    dSoldEl && (dSoldEl.textContent = formatBig(soldiersBankBig()));
    dWaveEl && (dWaveEl.textContent = String(progress.defenseWave | 0));

    const enemy = nextEnemyArmy();
    dEnemyEl && (dEnemyEl.textContent = formatBig(enemy));

    const pwr = defensePower();
    dPowerEl && (dPowerEl.textContent = formatBig(pwr));

    renderTowerSprites();

    if (!towerGrid) return;

    towerGrid.innerHTML = Array.from({ length: progress.towerSlots }, (_, i) => {
      const lvl = (progress.towerLvls[i] | 0) || 1;
      const asg = toBigIntSafe(progress.towerAssigned[i] || "0");
      const upCost = Math.floor(90 * Math.pow(1.7, lvl - 1));
      const canUp = progress.goldBank >= upCost;

      return `
        <div class="towerCard">
          <div class="tTop">
            <div class="tTitle">Tower ${i + 1}</div>
            <div class="tLvl">Lv ${lvl}</div>
          </div>
          <div class="tBody">
            <div><span class="muted">Assigned:</span> <b>${formatBig(asg)}</b></div>
            <div><span class="muted">Power:</span> <b>${formatBig(towerPower(i))}</b></div>
          </div>
          <div class="tActions">
            <button class="btn small" data-tact="minus" data-i="${i}">-10%</button>
            <button class="btn small primary" data-tact="plus" data-i="${i}">+10%</button>
            <button class="btn small ${canUp ? "primary" : ""}" data-tact="up" data-i="${i}">
              Upgrade (${upCost})
            </button>
          </div>
        </div>
      `;
    }).join("");

    defReport && (defReport.textContent = "Assign soldiers to towers, then fight.");
  }

  function openDefense() {
    if (game.running) game.paused = true;
    hideMetaOverlays();
    overlayStart && overlayStart.classList.add("hidden");
    overlayDefense && overlayDefense.classList.remove("hidden");
    renderDefense();
  }

  function closeDefense() {
    overlayDefense && overlayDefense.classList.add("hidden");
    if (game.running) game.paused = false;
  }

  function adjustAssigned(i, dir) {
    ensureTowers();
    const bank = soldiersBankBig();
    if (bank <= 0n && dir === "plus") return;

    const cur = toBigIntSafe(progress.towerAssigned[i] || "0");
    const delta = (bank * 10n) / 100n; // 10% of current bank
    const step = delta > 0n ? delta : 1n;

    if (dir === "plus") {
      setSoldiersBankBig(bank - step);
      progress.towerAssigned[i] = (cur + step).toString();
    } else {
      const giveBack = cur / 10n > 0n ? cur / 10n : (cur > 0n ? 1n : 0n);
      if (giveBack <= 0n) return;
      progress.towerAssigned[i] = (cur - giveBack).toString();
      setSoldiersBankBig(bank + giveBack);
    }

    saveSave(progress);
    updateHUD();
    renderDefense();
  }

  function upgradeTower(i) {
    ensureTowers();
    const lvl = (progress.towerLvls[i] | 0) || 1;
    const cost = Math.floor(90 * Math.pow(1.7, lvl - 1));
    if (progress.goldBank < cost) {
      showToast("Not enough gold");
      return;
    }
    progress.goldBank -= cost;
    progress.towerLvls[i] = lvl + 1;
    saveSave(progress);
    updateHUD();
    renderDefense();
    showToast(`Tower ${i + 1} upgraded`);
  }

  function buyTowerSlot() {
    ensureTowers();
    const n = progress.towerSlots | 0;
    const cost = Math.floor(220 * Math.pow(1.75, n - 1));
    if (progress.goldBank < cost) {
      showToast("Not enough gold");
      return;
    }
    progress.goldBank -= cost;
    progress.towerSlots = n + 1;
    progress.towerLvls.push(1);
    progress.towerAssigned.push("0");
    saveSave(progress);
    updateHUD();
    renderDefense();
    showToast("New tower slot built");
  }

  async function fightWave() {
    ensureTowers();
    const btn = $("btnFightWave");
    btn && (btn.disabled = true);

    const wave = progress.defenseWave | 0;
    const enemy = nextEnemyArmy();
    const pwr = defensePower();

    const win = pwr >= enemy;

    await playDefenseBattle(win, enemy, pwr);

    if (win) {
      const goldGain = Math.floor((120 + wave * 40) * goldBonusMult());
      progress.goldBank += goldGain;

      const soldGain = enemy / 35n + BigInt(40 + wave * 10);
      setSoldiersBankBig(soldiersBankBig() + soldGain);

      progress.defenseWave = wave + 1;
      saveSave(progress);

      defReport && (defReport.textContent = `Victory. +${goldGain} gold, +${formatBig(soldGain)} soldiers. Next: Wave ${progress.defenseWave}.`);
      showToast("Wave cleared");
      updateHUD();
      renderDefense();
      btn && (btn.disabled = false);
      return;
    }

    // Loss: casualties (hits bank first, then trims assignments)
    let bank = soldiersBankBig();
    const casualties = enemy / 20n + BigInt(30 * wave);
    bank = bank > casualties ? bank - casualties : 0n;
    setSoldiersBankBig(bank);

    for (let i = 0; i < progress.towerSlots; i++) {
      const cur = toBigIntSafe(progress.towerAssigned[i] || "0");
      const trim = cur / 12n; // ~8%
      progress.towerAssigned[i] = (cur - trim).toString();
    }

    saveSave(progress);
    defReport && (defReport.textContent = `Defeat. Lost ${formatBig(casualties)} soldiers. Reassign and upgrade, then try again.`);
    showToast("Defense failed");
    updateHUD();
    renderDefense();
    btn && (btn.disabled = false);
  }

  function resetProgress() {
    for (const k of Object.keys(defaultProgress)) progress[k] = JSON.parse(JSON.stringify(defaultProgress[k]));
    saveSave(progress);
    bestDistance = 0;
    saveBest(0);
    showToast("Progress reset");
    updateHUD();
    renderKingdom();
    renderDefense();
  }

  // =========================
  // Overlay bindings
  // =========================
  onClickId("btnPlay", () => startRun(false));
  onClickId("btnPractice", () => startRun(true));
  onClickId("btnRestart", hardRestart);
  onClickId("btnRunAgain", () => startRun(false));

  // Tap overlay background to start (but do not steal button clicks)
  on(overlayStart, "pointerdown", (e) => {
    const target = e.target;
    if (target && target.closest && target.closest("button")) return;
    // ignore taps on panel content
    if (target && target.closest && target.closest(".panel")) return;
    startRun(false);
  });

  onClickId("btnPause", togglePause);

  onClickId("btnKingdom", openKingdom);
  onClickId("btnDefense", openDefense);

  onClickId("btnGoKingdom", openKingdom);
  onClickId("btnGoDefense", openDefense);

  onClickId("btnOpenDefenseFromStart", openDefense);

  onClickId("btnCloseKingdom", closeKingdom);
  onClickId("btnCloseDefense", closeDefense);

  onClickId("btnBuyTowerSlot", buyTowerSlot);
  onClickId("btnFightWave", fightWave);

  onClickId("btnResetProgress", resetProgress);

  // Event delegation for dynamic buttons
  on(upgradeGrid, "click", (e) => {
    const b = e.target && e.target.closest ? e.target.closest("[data-upg]") : null;
    if (!b) return;
    buyUpgrade(b.getAttribute("data-upg"));
  });

  on(towerGrid, "click", (e) => {
    const b = e.target && e.target.closest ? e.target.closest("[data-tact]") : null;
    if (!b) return;
    const act = b.getAttribute("data-tact");
    const i = Number(b.getAttribute("data-i") || "0");
    if (!Number.isFinite(i)) return;
    if (act === "plus") return adjustAssigned(i, "plus");
    if (act === "minus") return adjustAssigned(i, "minus");
    if (act === "up") return upgradeTower(i);
  });

  // =========================
  // Boot
  // =========================
  resetRun(false);

  overlayStart && overlayStart.classList.remove("hidden");
  overlayGameOver && overlayGameOver.classList.add("hidden");
  overlayKingdom && overlayKingdom.classList.add("hidden");
  overlayDefense && overlayDefense.classList.add("hidden");

  updateHUD();
  requestAnimationFrame(tick);
})();
