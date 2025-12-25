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
  const bfOverlay = $("bfOverlay");

  // =========================
  // Scroll lock / gestures
  // =========================
  document.addEventListener(
    "touchmove",
    (e) => {
      const t = e.target;
      if (t && t.closest && t.closest(".panelScroll")) return;
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
  // BigInt formatting (NOW: supports 1.2k, 1.9k, etc.)
  // =========================
  // thousands uses lower-case "k" as requested; others remain standard.
  const SUFFIX = ["", "k", "M", "B", "T", "Qa", "Qi", "Sx", "Sp", "Oc", "No", "Dc"];

  // Show one decimal place when the leading unit is < 10 (e.g., 1.2k, 9.8M).
  // For larger leading units (>=10), show integer (e.g., 12k).
  function formatBig(n) {
    const sign = n < 0n ? "-" : "";
    let x = n < 0n ? -n : n;

    if (x < 1000n) return sign + x.toString();

    // Determine scale group
    let idx = 0;
    let scale = 1n;
    while (x >= 1000n && idx < SUFFIX.length - 1) {
      x /= 1000n;
      scale *= 1000n;
      idx++;
    }

    // We used x as the truncated leading value. Recompute with original magnitude.
    // (We need tenths in the current scale.)
    // Example: n=1234 => idx=1 scale=1000 => whole=1 rem=234 => tenths=2 => "1.2k"
    const abs = n < 0n ? -n : n;
    const whole = abs / scale;
    const rem = abs % scale;

    if (whole < 10n) {
      const tenthBase = scale / 10n; // for k: 100
      const tenths = tenthBase > 0n ? (rem / tenthBase) : 0n;
      // clamp to 9 tenths to avoid “10.0” carry; if it happens, just bump whole
      if (tenths >= 10n) return `${sign}${(whole + 1n).toString()}${SUFFIX[idx]}`;
      return `${sign}${whole.toString()}.${tenths.toString()}${SUFFIX[idx]}`;
    }

    return `${sign}${whole.toString()}${SUFFIX[idx]}`;
  }

  function toBigIntSafe(v) {
    if (typeof v === "bigint") return v;
    if (typeof v === "number") return BigInt(Math.floor(v));
    if (typeof v === "string") return BigInt(v);
    return 0n;
  }


  // BigInt math helpers (fixed-point multipliers)
  function mulBigIntFP(n, fp, denom = 1000n) {
    // n * fp / denom
    return (n * fp) / denom;
  }

  function addStats({ gold = 0, soldiers = 0n, clashWin = false, clashLose = false, run = false, bestCrowd = null, bestWave = null } = {}) {
    const s = progress.stats;
    if (!s) return;

    if (run) s.runs = (s.runs | 0) + 1;
    if (clashWin) s.clashWins = (s.clashWins | 0) + 1;
    if (clashLose) s.clashLosses = (s.clashLosses | 0) + 1;

    if (gold) s.goldEarned = (s.goldEarned | 0) + Math.floor(gold);

    if (soldiers && soldiers > 0n) {
      const cur = toBigIntSafe(s.soldiersEarned || "0");
      s.soldiersEarned = (cur + soldiers).toString();
    }

    if (bestCrowd !== null) {
      const cur = toBigIntSafe(s.bestCrowd || "0");
      if (bestCrowd > cur) s.bestCrowd = bestCrowd.toString();
    }

    if (bestWave !== null) {
      s.bestWave = Math.max(s.bestWave | 0, bestWave | 0);
    }

    saveSave(progress);
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

    // Cumulative stats (stored offline)
    stats: {
      runs: 0,
      clashWins: 0,
      clashLosses: 0,
      goldEarned: 0,
      soldiersEarned: "0",
      bestCrowd: "0",
      bestWave: 1
    },

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

  // Stats normalization
  if (!progress.stats || typeof progress.stats !== "object") progress.stats = JSON.parse(JSON.stringify(defaultProgress.stats));
  if (typeof progress.stats.runs !== "number") progress.stats.runs = 0;
  if (typeof progress.stats.clashWins !== "number") progress.stats.clashWins = 0;
  if (typeof progress.stats.clashLosses !== "number") progress.stats.clashLosses = 0;
  if (typeof progress.stats.goldEarned !== "number") progress.stats.goldEarned = 0;
  if (typeof progress.stats.soldiersEarned !== "string") progress.stats.soldiersEarned = String(progress.stats.soldiersEarned || "0");
  if (typeof progress.stats.bestCrowd !== "string") progress.stats.bestCrowd = String(progress.stats.bestCrowd || "0");
  if (typeof progress.stats.bestWave !== "number" || progress.stats.bestWave < 1) progress.stats.bestWave = 1;

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
    lane: 0,
    crowd: 10n,
    goldRun: 0,
    soldiersRun: 0n,
    shields: 0,
    dist: 0,
    speed: 330,
    baseSpeed: 330,
    nextSpawn: 0,
    entities: [],
    runMaxCrowd: 10n,
    clashStreak: 0
  };

  function updateHUD() {
    // BIG number in upper corner now uses the improved formatting
    hudCrowd && (hudCrowd.textContent = formatBig(game.crowd < 0n ? 0n : game.crowd));
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

    const baseRisk = clamp(0.08 + 0.10 * t, 0.08, 0.30);
    const risk = clamp(baseRisk * (1 - 0.85 * luck), 0.05, 0.40);

    const multBias = clamp(0.20 + 0.25 * t, 0.20, 0.60);
    const plusBias = clamp(0.74 - 0.18 * t, 0.42, 0.78);

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
      const base = 10 + Math.floor(7 * t);
      const spread = 12 + Math.floor(16 * t);
      const n = Math.floor(base + rnd(0, spread) * (1 + 0.6 * luck));
      return { type: "plus", n };
    }

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

    const base = 6 + Math.floor(5 * t);
    const spread = 10 + Math.floor(11 * t);
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

    const enemyChance = clamp(0.14 + 0.09 * t, 0.14, 0.36);
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

      if (Math.random() < 0.35 + 0.25 * luck) {
        const buffLeft = Math.random() < 0.5;
        const target = buffLeft ? left : right;
        if (target.roll.type === "plus") target.roll.n = Math.floor(target.roll.n * (1.18 + 0.25 * luck));
        if (target.roll.type === "mult") target.roll.m = clamp(target.roll.m + 1, 2, 8);
        if (target.roll.type === "risk") target.roll.n = Math.floor(target.roll.n * 0.75);
      }

      left = maybePurify(gateCardFromRoll(left.roll));
      right = maybePurify(gateCardFromRoll(right.roll));

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

    // Enemy scaling (keeps pace with your crowd + progression; tuned to be challenging-but-beatable)
    const crowd = game.crowd < 1n ? 1n : game.crowd;

    // As you win more clashes in a row, enemies ramp slightly to stay interesting.
    const streak = game.clashStreak | 0;

    // Base ratio stays mostly < 1 so you can win without needing a perfect Rally every time.
    const baseFP = BigInt(Math.floor((0.66 + 0.10 * t + Math.min(streak, 6) * 0.03) * 1000));
    const randFP = BigInt(Math.floor(rnd(-90, 140))); // -0.09 .. +0.14
    let ratioFP = baseFP + randFP;

    // Archers soften enemy power a bit (visual + gameplay tuning).
    const mit = enemyMitigation(); // 0..0.35
    ratioFP = ratioFP - BigInt(Math.floor(mit * 120)); // up to -0.042

    // Clamp to a sane band; occasional larger enemies still appear but are dodgeable.
    ratioFP = BigInt(clamp(Number(ratioFP), 480, 1180)); // 0.48 .. 1.18

    // Rare spike (late-game variety), but keep it fair.
    if (Math.random() < clamp(0.06 + t * 0.04, 0.06, 0.16)) {
      const spikeFP = BigInt(Math.floor(rnd(1040, 1180))); // +4% .. +18%
      ratioFP = mulBigIntFP(ratioFP, spikeFP, 1000n);
      ratioFP = BigInt(clamp(Number(ratioFP), 520, 1320)); // cap at 1.32
    }

    // Flat component so early enemies aren't trivial; scales gently.
    const flat = 10n + BigInt(6 + Math.floor(10 * t)) + BigInt(Math.min(70, streak * 4));

    let threat = mulBigIntFP(crowd, ratioFP, 1000n) + flat;

    // Prevent absurd undershoots in very large crowds.
    if (crowd > 1000000n && threat < crowd / 18n) threat = crowd / 18n;

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
      if (!game.practice) addStats({ gold: gain });
      saveSave(progress);
      showToast(`Loot +${gain} gold`);
      return;
    }

    if (r?.type === "sold") {
      const add = BigInt(r.s || 0);
      setSoldiersBankBig(soldiersBankBig() + add);
      game.soldiersRun += add;
      if (!game.practice) addStats({ soldiers: add });
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

      if (game.crowd >= effective) {
        const lossPct = BigInt(Math.floor(rnd(12, 26) + clamp(game.dist / 420, 0, 6)));
        const loss = (effective * lossPct) / 100n;
        game.crowd -= loss;

        const baseGold = 40 + Math.floor(rnd(0, 50)) + Math.floor(game.dist * 0.05);
        const gainGold = Math.floor(baseGold * goldBonusMult());
        progress.goldBank += gainGold;
        game.goldRun += gainGold;

        const soldierGain = (effective / 80n) + BigInt(25 + Math.floor(rnd(0, 90)));
        setSoldiersBankBig(soldiersBankBig() + soldierGain);
        game.soldiersRun += soldierGain;

        game.clashStreak = (game.clashStreak | 0) + 1;
        if (!game.practice) addStats({ gold: gainGold, soldiers: soldierGain, clashWin: true });

        saveSave(progress);
        showToast(`Won clash! +${gainGold} gold, +${formatBig(soldierGain)} soldiers`);
        return;
      }

      game.crowd = 0n;
      game.clashStreak = 0;
      if (!game.practice) addStats({ clashLose: true });
      showToast(`Defeated by enemy ${formatBig(effective)}`);
      return;
    }

    if (c.cls.includes("coin")) {
      const gain = Math.floor((c.g || 0) * goldBonusMult());
      progress.goldBank += gain;
      game.goldRun += gain;
      if (!game.practice) addStats({ gold: gain });
      saveSave(progress);
      showToast(`Gold +${gain}`);
      return;
    }

    if (c.cls.includes("sold")) {
      const add = BigInt(c.s || 0);
      setSoldiersBankBig(soldiersBankBig() + add);
      game.soldiersRun += add;
      if (!game.practice) addStats({ soldiers: add });
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

    const prog = game.dist / 650;
    game.speed = game.baseSpeed + prog * 18 + (game.practice ? 0 : prog * 8);
    game.dist += game.speed * dt * 0.06;

    if (game.dist > bestDistance) {
      bestDistance = game.dist;
      saveBest(bestDistance);
    }

    game.nextSpawn -= dt;
    if (game.nextSpawn <= 0) {
      const tNorm = clamp(game.dist / 480, 0, 2.6);
      spawn(tNorm);

      const accel = clamp(game.dist / 900, 0, 1.6);
      const maxI = game.practice ? 1.06 : 0.94;
      const minI = game.practice ? 0.72 : 0.48;
      const interval = maxI - accel * 0.30 + rnd(0, 0.14);
      game.nextSpawn = clamp(interval, minI, maxI);
    }

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
        if (game.crowd > game.runMaxCrowd) game.runMaxCrowd = game.crowd;
        updateHUD();

        if (game.crowd <= 0n) {
          endRun();
          return;
        }
      }
    }

    for (let i = game.entities.length - 1; i >= 0; i--) {
      if (game.entities[i].y > killY) {
        game.entities[i].el.remove();
        game.entities.splice(i, 1);
      }
    }

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
    game.runMaxCrowd = game.crowd;
    game.clashStreak = 0;
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

    // Offline run stats
    if (!game.practice) {
      addStats({ run: true, bestCrowd: game.runMaxCrowd });
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
    { key: "startCrowdLvl", title: "Start Crowd", desc: (lvl) => `Start with +${lvl * 3} crowd (base 10).`, cost: (lvl) => Math.floor(60 * Math.pow(1.55, lvl)), icon: "👥" },
    { key: "luckLvl", title: "Gate Luck", desc: (lvl) => `+${lvl * 4}% chance for better gates & fewer ambushes.`, cost: (lvl) => Math.floor(85 * Math.pow(1.6, lvl)), icon: "🍀" },
    { key: "shieldLvl", title: "Shields", desc: (lvl) => `Start runs with ${lvl} shield(s) that block ambushes.`, cost: (lvl) => Math.floor(110 * Math.pow(1.65, lvl)), icon: "🔰" },
    { key: "archerLvl", title: "Archers", desc: (lvl) => `Reduce enemy threat by ${Math.floor(clamp(lvl * 0.06, 0, 0.35) * 100)}%.`, cost: (lvl) => Math.floor(120 * Math.pow(1.62, lvl)), icon: "🏹" },
    { key: "stewardLvl", title: "Steward", desc: (lvl) => `Gold gains ×${(1 + lvl * 0.08).toFixed(2)}.`, cost: (lvl) => Math.floor(140 * Math.pow(1.62, lvl)), icon: "💰" },
    { key: "mageLvl", title: "Mage", desc: (lvl) => `${Math.floor(clamp(lvl * 0.06, 0, 0.30) * 100)}% chance ambush becomes loot/shield/draft.`, cost: (lvl) => Math.floor(160 * Math.pow(1.66, lvl)), icon: "✨" }
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
    const mult = 1 + lvl * 0.35;
    const bonus = 1 + (progress.archerLvl | 0) * 0.04;
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
    const pct = BigInt(clamp(28 + wave * 7, 30, 160));
    const base = (totalArmy * pct) / 100n;
    const flat = BigInt(250 * wave);
    return base + flat;
  }

  // ---- Defense battlefield visuals/gameplay (improved targeting + HP + impacts) ----
  function clearBattlefield() {
    bfTowers && (bfTowers.innerHTML = "");
    bfUnits && (bfUnits.innerHTML = "");
    bfShots && (bfShots.innerHTML = "");
    bfOverlay && (bfOverlay.innerHTML = "");
  }

  function addTint(kind) {
    if (!bfOverlay) return;
    bfOverlay.innerHTML = "";
    const t = document.createElement("div");
    t.className = `bfTint ${kind}`;
    bfOverlay.appendChild(t);
  }

  function renderTowerSprites() {
    if (!bfTowers || !battlefield) return;
    bfTowers.innerHTML = "";
    const rect = battlefield.getBoundingClientRect();

    const n = progress.towerSlots | 0;
    const left = rect.width * 0.16;
    const right = rect.width * 0.84;

    for (let i = 0; i < n; i++) {
      const x = left + (n === 1 ? 0.5 : i / (n - 1)) * (right - left);
      const t = document.createElement("div");
      t.className = "towerSprite";
      t.style.left = `${x}px`;
      t.style.transform = "translateX(-50%)";
      t.title = `Tower ${i + 1}`;
      t.innerHTML = `
        <div class="tBase"></div>
        <div class="tWall"></div>
        <div class="tCrown"></div>
        <div class="tArcher"></div>
        <div class="tFlag"></div>
      `;
      bfTowers.appendChild(t);
    }
  }

  function spawnEnemySprites(enemyBig, wave) {
    if (!bfUnits || !battlefield) return [];
    const rect = battlefield.getBoundingClientRect();
    const enemies = [];

    const digits = enemyBig.toString().length;
    const visCount = clamp(6 + Math.floor(digits / 2), 6, 20);
    const boss = digits >= 7 || wave % 5 === 0;

    const pickType = () => weightedPick([
      { v: "raider", w: 0.46 },
      { v: "brute", w: 0.28 },
      { v: "archer", w: 0.18 },
      { v: "shaman", w: 0.08 }
    ]);

    for (let i = 0; i < visCount; i++) {
      const unit = document.createElement("div");
      const type = boss && i === 0 ? "boss" : pickType();
      unit.className = `enemyUnit ${type}` + (boss && i === 0 ? " boss" : "");

      const laneY = [56, 108, 160][i % 3] + rnd(-6, 6);
      const x = rnd(rect.width * 0.18, rect.width * 0.82);
      unit.style.left = `${x}px`;
      unit.style.top = `${laneY}px`;

      // Sprite body (top-down "character" silhouette)
      const u = document.createElement("div");
      u.className = "u";
      u.innerHTML = `
        <span class="shadow"></span>
        <span class="feet"></span>
        <span class="body"></span>
        <span class="head"></span>
        <span class="weapon"></span>
        <span class="shield"></span>
      `;
      unit.appendChild(u);

      // Tag on the lead unit
      if (i === 0) {
        const tag = document.createElement("div");
        tag.className = "tag";
        tag.textContent = boss ? `BOSS • ${formatBig(enemyBig)}` : `Wave ${wave} • ${formatBig(enemyBig)}`;
        unit.appendChild(tag);
      }

      // HP bar (visual only; driven in JS)
      const hp = document.createElement("div");
      hp.className = "hp";
      const fill = document.createElement("i");
      hp.appendChild(fill);
      unit.appendChild(hp);

      // Attach state
      unit.__hpFill = fill;
      unit.__hp = 1;      // 0..1
      unit.__alive = true;

      bfUnits.appendChild(unit);
      enemies.push(unit);
    }
    return enemies;
  }

  function ring(x, y) {
    if (!bfOverlay) return;
    const r = document.createElement("div");
    r.className = "ring";
    r.style.left = `${x}px`;
    r.style.top = `${y}px`;
    bfOverlay.appendChild(r);
    r.animate(
      [
        { transform: "translate(-50%,-50%) scale(.7)", opacity: .8 },
        { transform: "translate(-50%,-50%) scale(3.0)", opacity: 0 }
      ],
      { duration: 380, easing: "cubic-bezier(.2,.9,.1,1)" }
    ).onfinish = () => r.remove();
  }

  function dmgText(x, y, text) {
    if (!bfOverlay) return;
    const d = document.createElement("div");
    d.className = "dmg";
    d.textContent = text;
    d.style.left = `${x}px`;
    d.style.top = `${y}px`;
    bfOverlay.appendChild(d);
    d.animate(
      [
        { transform: "translate(-50%,-50%) translateY(0px)", opacity: .95 },
        { transform: "translate(-50%,-50%) translateY(-26px)", opacity: 0 }
      ],
      { duration: 520, easing: "cubic-bezier(.2,.9,.1,1)" }
    ).onfinish = () => d.remove();
  }

  function fireShot(fromX, fromY, toX, toY) {
    if (!bfShots) return;
    const dx = toX - fromX;
    const dy = toY - fromY;
    const ang = Math.atan2(dy, dx) * 180 / Math.PI;

    const s = document.createElement("div");
    s.className = "shot arrow";
    s.style.left = `${fromX}px`;
    s.style.top = `${fromY}px`;
    s.style.setProperty("--ang", `${ang.toFixed(1)}deg`);
    bfShots.appendChild(s);

    s.animate(
      [
        { transform: "translate(-50%,-50%) rotate(var(--ang)) translateX(0px)", opacity: 0.95 },
        { transform: `translate(-50%,-50%) rotate(var(--ang)) translate(${dx}px, ${dy}px)`, opacity: 0.08 }
      ],
      { duration: 260, easing: "cubic-bezier(.2,.9,.1,1)" }
    ).onfinish = () => s.remove();
  }

  async function playDefenseBattle(win, enemyBig, powerBig) {
    if (!battlefield || !bfUnits || !bfTowers) return;

    clearBattlefield();
    renderTowerSprites();
    addTint(win ? "win" : "lose");

    const wave = progress.defenseWave | 0;
    const enemies = spawnEnemySprites(enemyBig, wave);

    const rect = battlefield.getBoundingClientRect();
    const towers = Array.from(bfTowers.children);

    // Enemy advance: win => slowed and staggered; lose => they surge harder
    const endY = rect.height - 34;
    enemies.forEach((u, idx) => {
      const start = u.getBoundingClientRect();
      const y = start.top + start.height / 2 - rect.top;
      const surge = win ? rnd(0.55, 0.75) : rnd(0.95, 1.18);
      u.animate(
        [
          { transform: "translate(-50%,-50%) scale(1)", filter: "brightness(1)" },
          { transform: `translate(-50%,-50%) translateY(${(endY - y) * surge}px) scale(${win ? 1.02 : 1.06})`, filter: win ? "brightness(1.05)" : "brightness(1.12)" }
        ],
        { duration: 1400 + idx * 25, easing: "cubic-bezier(.25,.85,.12,1)", fill: "forwards" }
      );
    });

    // Combat simulation (visual): turn enemyBig/powerBig into a short burst DPS race
    const totalHP = 1.0; // normalized
    let hp = totalHP;

    // If power is close, make it feel close: the visual pace reflects ratio.
    const ratio = Number(powerBig > 0n ? (enemyBig * 1000n) / powerBig : 2000n); // >1000 => weaker
    const difficulty = clamp(ratio / 1000, 0.4, 2.2); // 0.4 easy, 2.2 hard

    const durationMs = clamp(1200 + difficulty * 500, 1200, 2300);
    const startT = performance.now();
    const endT = startT + durationMs;

    const baseDps = win ? (1.0 / durationMs) * 1.15 : (1.0 / durationMs) * 0.85;

    // Target selection helper
    const alive = () => enemies.filter(e => e.__alive);

    while (performance.now() < endT) {
      const now = performance.now();
      const k = (now - startT) / durationMs;

      const targets = alive();
      if (targets.length === 0) break;

      // Pick a target (front-most visually: lowest top-to-end distance; approximate by y)
      const target = pick(targets);
      const tRect = target.getBoundingClientRect();
      const tx = tRect.left + tRect.width / 2 - rect.left;
      const ty = tRect.top + tRect.height / 2 - rect.top;

      // Tower fires
      if (towers.length) {
        const tower = pick(towers);
        const tr = tower.getBoundingClientRect();
        const fx0 = tr.left + tr.width / 2 - rect.left;
        const fy0 = rect.height - 52;
        fireShot(fx0, fy0, tx, ty);
      }

      // Apply damage (normalized)
      const dmg = baseDps * (60 + rnd(0, 40)) / 100 * (win ? 1 : 0.9);
      hp = Math.max(0, hp - dmg * 70); // scale to feel “chunky”

      // Spread damage across units by lowering their bars
      const per = clamp(dmg * 6.5, 0.01, 0.08);
      target.__hp = Math.max(0, target.__hp - per);
      if (target.__hpFill) target.__hpFill.style.width = `${Math.floor(target.__hp * 100)}%`;

      ring(tx, ty);
      if (Math.random() < 0.65) dmgText(tx, ty - 10, `-${(Math.floor(8 + rnd(0, 18)))}%`);

      // If a unit "dies", pop it
      if (target.__hp <= 0.02 && target.__alive) {
        target.__alive = false;
        target.animate(
          [
            { transform: "translate(-50%,-50%) scale(1)", opacity: 1 },
            { transform: "translate(-50%,-50%) scale(1.6)", opacity: 0 }
          ],
          { duration: 260, easing: "cubic-bezier(.2,.9,.1,1)" }
        ).onfinish = () => target.remove();
      }

      // Win mode: accelerate deletes near the end for a satisfying finish
      if (win && k > 0.78 && Math.random() < 0.30) {
        const extra = pick(alive());
        if (extra) {
          extra.__hp = Math.max(0, extra.__hp - 0.18);
          if (extra.__hpFill) extra.__hpFill.style.width = `${Math.floor(extra.__hp * 100)}%`;
          const er = extra.getBoundingClientRect();
          ring(er.left + er.width / 2 - rect.left, er.top + er.height / 2 - rect.top);
        }
      }

      await new Promise(r => setTimeout(r, 70));
    }

    // End state: if win, clear remaining; if lose, shake + darken
    if (win) {
      alive().forEach((u) => {
        u.__alive = false;
        u.animate(
          [
            { transform: "translate(-50%,-50%) scale(1)", opacity: 1 },
            { transform: "translate(-50%,-50%) scale(1.4)", opacity: 0 }
          ],
          { duration: 240, easing: "cubic-bezier(.2,.9,.1,1)" }
        ).onfinish = () => u.remove();
      });
    } else {
      // Keep shake
      battlefield.animate(
        [
          { transform: "translateX(0px)" },
          { transform: "translateX(-6px)" },
          { transform: "translateX(6px)" },
          { transform: "translateX(-4px)" },
          { transform: "translateX(4px)" },
          { transform: "translateX(0px)" }
        ],
        { duration: 420, easing: "linear" }
      );
    }

    await new Promise((res) => setTimeout(res, 280));

    const msg = win
      ? `Victory • ${formatBig(powerBig)} vs ${formatBig(enemyBig)}`
      : `Defeat • ${formatBig(powerBig)} vs ${formatBig(enemyBig)}`;
    showToast(msg);

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
    const delta = (bank * 10n) / 100n;
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
      if (!game.practice) addStats({ gold: goldGain, soldiers: soldGain, bestWave: progress.defenseWave });
      saveSave(progress);

      defReport && (defReport.textContent = `Victory. +${goldGain} gold, +${formatBig(soldGain)} soldiers. Next: Wave ${progress.defenseWave}.`);
      showToast("Wave cleared");
      updateHUD();
      renderDefense();
      btn && (btn.disabled = false);
      return;
    }

    let bank = soldiersBankBig();
    const casualties = enemy / 20n + BigInt(30 * wave);
    bank = bank > casualties ? bank - casualties : 0n;
    setSoldiersBankBig(bank);

    for (let i = 0; i < progress.towerSlots; i++) {
      const cur = toBigIntSafe(progress.towerAssigned[i] || "0");
      const trim = cur / 12n;
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

  on(overlayStart, "pointerdown", (e) => {
    const target = e.target;
    if (target && target.closest && target.closest("button")) return;
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
