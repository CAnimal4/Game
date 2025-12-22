(() => {
  "use strict";

  // =========================
  // DOM
  // =========================
  const stage = document.getElementById("stage");
  const playerEl = document.getElementById("player");
  const playerNumEl = document.getElementById("playerNum");
  const fx = document.getElementById("fx");
  const toast = document.getElementById("toast");

  const hudCrowd = document.getElementById("hudCrowd");
  const hudGold = document.getElementById("hudGold");
  const hudSoldiers = document.getElementById("hudSoldiers");
  const hudDist = document.getElementById("hudDist");
  const hudBest = document.getElementById("hudBest");

  const overlayStart = document.getElementById("overlayStart");
  const overlayKingdom = document.getElementById("overlayKingdom");
  const overlayDefense = document.getElementById("overlayDefense");
  const overlayGameOver = document.getElementById("overlayGameOver");

  const btnPlay = document.getElementById("btnPlay");
  const btnPractice = document.getElementById("btnPractice");
  const btnPause = document.getElementById("btnPause");
  const btnRestart = document.getElementById("btnRestart");
  const btnKingdom = document.getElementById("btnKingdom");
  const btnDefense = document.getElementById("btnDefense");
  const btnCloseKingdom = document.getElementById("btnCloseKingdom");
  const btnResetProgress = document.getElementById("btnResetProgress");
  const btnOpenDefenseFromStart = document.getElementById("btnOpenDefenseFromStart");

  const summaryEl = document.getElementById("summary");
  const deathTipEl = document.getElementById("deathTip");
  const btnRunAgain = document.getElementById("btnRunAgain");
  const btnGoKingdom = document.getElementById("btnGoKingdom");
  const btnGoDefense = document.getElementById("btnGoDefense");

  const kGoldEl = document.getElementById("kGold");
  const kSoldiersEl = document.getElementById("kSoldiers");
  const kStartCrowdEl = document.getElementById("kStartCrowd");
  const kLuckEl = document.getElementById("kLuck");
  const upgradeGrid = document.getElementById("upgradeGrid");

  const dGoldEl = document.getElementById("dGold");
  const dSoldiersEl = document.getElementById("dSoldiers");
  const dWaveEl = document.getElementById("dWave");
  const dEnemyEl = document.getElementById("dEnemy");
  const dPowerEl = document.getElementById("dPower");
  const towerGrid = document.getElementById("towerGrid");
  const defReport = document.getElementById("defReport");

  const btnFightWave = document.getElementById("btnFightWave");
  const btnBuyTowerSlot = document.getElementById("btnBuyTowerSlot");
  const btnCloseDefense = document.getElementById("btnCloseDefense");

  // =========================
  // Utils
  // =========================
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const rnd = (a, b) => a + Math.random() * (b - a);
  const pick = (arr) => arr[(Math.random() * arr.length) | 0];

  function showToast(msg) {
    toast.textContent = msg;
    toast.classList.add("show");
    clearTimeout(showToast._t);
    showToast._t = setTimeout(() => toast.classList.remove("show"), 760);
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
  // BigInt formatting (trillions+)
  // =========================
  const SUFFIX = ["", "K", "M", "B", "T", "Qa", "Qi", "Sx", "Sp", "Oc", "No", "Dc"];

  function formatBig(n) {
    // n: BigInt
    const sign = n < 0n ? "-" : "";
    let x = n < 0n ? -n : n;
    if (x < 1000n) return sign + x.toString();
    const thousand = 1000n;
    let idx = 0;
    while (x >= 1000n && idx < SUFFIX.length - 1) {
      x /= thousand;
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
  const SAVE_KEY = "kcrowdshot_save_v2";
  const BEST_KEY = "kcrowdshot_best_v2";

  function loadSave() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return null;
      const o = JSON.parse(raw);
      if (!o || typeof o !== "object") return null;
      return o;
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
  // Progression (Run + Defense)
  // =========================
  const defaultProgress = {
    goldBank: 0,
    soldiersBank: "0",

    // Run upgrades
    startCrowdLvl: 0,
    luckLvl: 0,
    shieldLvl: 0,
    archerLvl: 0,
    stewardLvl: 0,
    mageLvl: 0,

    // Defense
    towerSlots: 1,
    towerLvls: [1],
    towerAssigned: ["0"],
    defenseWave: 1
  };

  const progress = Object.assign({}, defaultProgress, loadSave() || {});
  // normalize
  if (!Array.isArray(progress.towerLvls)) progress.towerLvls = [1];
  if (!Array.isArray(progress.towerAssigned)) progress.towerAssigned = ["0"];
  if (typeof progress.soldiersBank !== "string") progress.soldiersBank = String(progress.soldiersBank || "0");
  if (typeof progress.towerSlots !== "number") progress.towerSlots = 1;
  if (typeof progress.defenseWave !== "number") progress.defenseWave = 1;

  let bestDistance = loadBest();

  function soldiersBankBig() {
    return toBigIntSafe(progress.soldiersBank || "0");
  }
  function setSoldiersBankBig(n) {
    progress.soldiersBank = n.toString();
  }

  function startCrowdValueBig() {
    return 10n + BigInt(progress.startCrowdLvl * 3);
  }
  function luckPercent() {
    return progress.luckLvl * 4; // %
  }
  function shieldCharges() {
    return progress.shieldLvl;
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
  function defenseKingdomBonus() {
    const barracks = 1 + progress.startCrowdLvl * 0.03;
    const archer = 1 + progress.archerLvl * 0.05;
    return barracks * archer;
  }

  // =========================
  // Kingdom upgrades shop
  // =========================
  const upgrades = [
    {
      key: "startCrowdLvl",
      name: "Barracks",
      desc: "Start each run with +3 crowd per level. Also slightly boosts defense power.",
      price: (lvl) => 70 + lvl * 90
    },
    {
      key: "luckLvl",
      name: "Gate Scribes",
      desc: "Improves gate quality. Better + and ×, fewer nasty −.",
      price: (lvl) => 90 + lvl * 120
    },
    {
      key: "shieldLvl",
      name: "Royal Shields",
      desc: "Start with shield charges that block ambush hits automatically.",
      price: (lvl) => 110 + lvl * 140
    },
    {
      key: "archerLvl",
      name: "Hero: Archer Captain",
      desc: "Enemy crowd hits hurt less. Also boosts defense power.",
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
      desc: "Chance to purify a risk gate into gold/shield/soldier bonus.",
      price: (lvl) => 140 + lvl * 190
    }
  ];

  function renderKingdom() {
    kGoldEl.textContent = `${Math.floor(progress.goldBank)}`;
    kSoldiersEl.textContent = formatBig(soldiersBankBig());
    kStartCrowdEl.textContent = formatBig(startCrowdValueBig());
    kLuckEl.textContent = `${luckPercent()}%`;

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
        renderDefense();
        updateHUD();
        showToast(`Upgraded: ${u.name} → Lv ${lvl + 1}`);
      });
      upgradeGrid.appendChild(card);
    }
  }

  // =========================
  // Defense system (towers)
  // =========================
  function ensureTowers() {
    const slots = clamp(progress.towerSlots | 0, 1, 6);
    progress.towerSlots = slots;

    while (progress.towerLvls.length < slots) progress.towerLvls.push(1);
    while (progress.towerAssigned.length < slots) progress.towerAssigned.push("0");

    if (progress.towerLvls.length > slots) progress.towerLvls.length = slots;
    if (progress.towerAssigned.length > slots) progress.towerAssigned.length = slots;
  }

  function towerSlotCost() {
    const s = progress.towerSlots;
    return 180 + (s - 1) * 260;
  }

  function towerUpgradeCost(i) {
    const lvl = progress.towerLvls[i] || 1;
    return 120 + lvl * 150;
  }

  function towerMultiplier(i) {
    const lvl = progress.towerLvls[i] || 1;
    return 1 + (lvl - 1) * 0.22;
  }

  function assignedAt(i) {
    return toBigIntSafe(progress.towerAssigned[i] || "0");
  }
  function setAssignedAt(i, n) {
    progress.towerAssigned[i] = n.toString();
  }

  function totalAssigned() {
    let sum = 0n;
    for (let i = 0; i < progress.towerSlots; i++) sum += assignedAt(i);
    return sum;
  }

  function defensePowerBig() {
    // fixed-point multipliers for performance
    const bonus = defenseKingdomBonus();
    const bonusFP = BigInt(Math.floor(bonus * 1000));

    let powerFP = 0n;
    for (let i = 0; i < progress.towerSlots; i++) {
      const a = assignedAt(i);
      const mFP = BigInt(Math.floor(towerMultiplier(i) * 1000));
      powerFP += a * mFP;
    }
    powerFP = (powerFP * bonusFP) / 1000n;
    return powerFP / 1000n;
  }

  function nextEnemyWaveBig() {
    const w = BigInt(progress.defenseWave || 1);
    const bank = soldiersBankBig();
    const distFactor = BigInt(Math.max(0, Math.floor(bestDistance))) * 30n;

    const pctNum = 35n + w * 7n; // grows each wave
    const pct = pctNum > 90n ? 90n : pctNum;

    let enemy = (bank * pct) / 100n + distFactor + (w * w * 250n);
    if (enemy < 120n) enemy = 120n;

    const r = BigInt(Math.floor(rnd(92, 108)));
    enemy = (enemy * r) / 100n;

    return enemy;
  }

  function renderDefense() {
    ensureTowers();

    dGoldEl.textContent = `${Math.floor(progress.goldBank)}`;
    dSoldiersEl.textContent = formatBig(soldiersBankBig());
    dWaveEl.textContent = String(progress.defenseWave || 1);
    dEnemyEl.textContent = formatBig(nextEnemyWaveBig());
    dPowerEl.textContent = formatBig(defensePowerBig());

    towerGrid.innerHTML = "";
    for (let i = 0; i < progress.towerSlots; i++) {
      const lvl = progress.towerLvls[i] || 1;
      const assigned = assignedAt(i);
      const mult = towerMultiplier(i).toFixed(2);
      const upCost = towerUpgradeCost(i);

      const t = document.createElement("div");
      t.className = "tower";
      t.innerHTML = `
        <div class="tTop">
          <div>
            <div class="tName">Tower ${i + 1}</div>
            <div class="tMeta">Multiplier: ×${mult}</div>
          </div>
          <div class="tLvl">Lv ${lvl}</div>
        </div>

        <div class="tAssign">
          <div>
            <div style="color:rgba(255,255,255,.70);font-weight:900;font-size:11px;">Assigned</div>
            <div class="tAssigned" id="assigned-${i}">${formatBig(assigned)}</div>
          </div>
          <div class="tBtns">
            <button class="tBtn" data-act="minus" data-i="${i}">−</button>
            <button class="tBtn" data-act="plus" data-i="${i}">+</button>
          </div>
        </div>

        <div class="tAssign" style="justify-content:space-between;">
          <div>
            <div style="color:rgba(255,255,255,.70);font-weight:900;font-size:11px;">Upgrade</div>
            <div style="font-weight:950;color:rgba(255,211,106,.95);">Cost: ${upCost} gold</div>
          </div>
          <div class="tBtns">
            <button class="tBtn" data-act="upgrade" data-i="${i}">Upgrade</button>
          </div>
        </div>
      `;
      towerGrid.appendChild(t);
    }

    btnBuyTowerSlot.disabled = progress.goldBank < towerSlotCost() || progress.towerSlots >= 6;

    const freeSoldiers = soldiersBankBig() - totalAssigned();
    defReport.textContent =
      `Unassigned soldiers: ${formatBig(freeSoldiers < 0n ? 0n : freeSoldiers)}. ` +
      `Assign soldiers to towers to increase power, then fight wave ${progress.defenseWave}.`;
  }

  // Tower UI events
  towerGrid.addEventListener("click", (e) => {
    const btn = e.target.closest("button");
    if (!btn) return;

    const act = btn.dataset.act;
    const i = Number(btn.dataset.i);

    ensureTowers();

    const bank = soldiersBankBig();
    const assigned = assignedAt(i);
    const total = totalAssigned();
    const unassigned = bank - total;

    const stepSmall = 50n;
    const stepBig = 5000n;
    const step = (bank >= 500000n) ? stepBig : stepSmall;

    if (act === "plus") {
      if (unassigned <= 0n) {
        showToast("No unassigned soldiers.");
        return;
      }
      const add = unassigned < step ? unassigned : step;
      setAssignedAt(i, assigned + add);
      saveSave(progress);
      renderDefense();
      updateHUD();
      showToast(`Assigned +${formatBig(add)} to Tower ${i + 1}`);
      return;
    }

    if (act === "minus") {
      if (assigned <= 0n) return;
      const sub = assigned < step ? assigned : step;
      setAssignedAt(i, assigned - sub);
      saveSave(progress);
      renderDefense();
      updateHUD();
      showToast(`Removed −${formatBig(sub)} from Tower ${i + 1}`);
      return;
    }

    if (act === "upgrade") {
      const cost = towerUpgradeCost(i);
      if (progress.goldBank < cost) {
        showToast("Not enough gold.");
        return;
      }
      progress.goldBank -= cost;
      progress.towerLvls[i] = (progress.towerLvls[i] || 1) + 1;
      saveSave(progress);
      renderDefense();
      updateHUD();
      showToast(`Tower ${i + 1} upgraded!`);
      return;
    }
  });

  btnBuyTowerSlot.addEventListener("click", () => {
    ensureTowers();
    if (progress.towerSlots >= 6) {
      showToast("Max tower slots reached.");
      return;
    }
    const cost = towerSlotCost();
    if (progress.goldBank < cost) {
      showToast("Not enough gold.");
      return;
    }
    progress.goldBank -= cost;
    progress.towerSlots += 1;
    ensureTowers();
    saveSave(progress);
    renderDefense();
    updateHUD();
    showToast("Bought a new tower slot.");
  });

  btnFightWave.addEventListener("click", () => {
    ensureTowers();

    const enemy = nextEnemyWaveBig();
    const power = defensePowerBig();

    if (power <= 0n) {
      showToast("Assign soldiers to towers first.");
      defReport.textContent = "Your defense power is zero. Assign soldiers to towers, then fight.";
      return;
    }

    const bank = soldiersBankBig();
    const total = totalAssigned();

    const goldBase = 120 + Math.floor(progress.defenseWave * 55);
    const goldGain = Math.floor(goldBase * goldBonusMult());

    if (power >= enemy) {
      // Victory casualties
      const casualtyPct = BigInt(Math.floor(rnd(8, 18)));
      let casualties = (enemy * casualtyPct) / 100n;
      if (casualties > total) casualties = total;

      // proportional removal across towers
      let remainingCas = casualties;
      for (let i = 0; i < progress.towerSlots; i++) {
        if (remainingCas <= 0n) break;
        const a = assignedAt(i);
        if (a <= 0n) continue;

        const take = (a * casualties) / (total === 0n ? 1n : total);
        const actual = take > a ? a : take;
        setAssignedAt(i, a - actual);
        remainingCas -= actual;
      }
      // rounding remainder
      if (remainingCas > 0n) {
        for (let i = 0; i < progress.towerSlots && remainingCas > 0n; i++) {
          const a = assignedAt(i);
          if (a <= 0n) continue;
          const actual = a < remainingCas ? a : remainingCas;
          setAssignedAt(i, a - actual);
          remainingCas -= actual;
        }
      }

      progress.goldBank += goldGain;
      const soldierReward = (enemy / 40n) + BigInt(30 + Math.floor(rnd(0, 70)));
      setSoldiersBankBig(bank + soldierReward);

      progress.defenseWave += 1;

      saveSave(progress);
      renderDefense();
      updateHUD();

      defReport.innerHTML =
        `<b>Victory.</b> Enemy ${formatBig(enemy)} defeated. ` +
        `Casualties: ${formatBig(casualties)}. ` +
        `Rewards: +${goldGain} gold, +${formatBig(soldierReward)} soldiers.`;
      showToast("Victory!");
      return;
    } else {
      // Defeat: lose 10% of assigned and pay repairs
      const lose = total / 10n;
      const repair = Math.min(Math.floor(progress.goldBank), 90 + progress.defenseWave * 35);

      let remainingLose = lose;
      for (let i = 0; i < progress.towerSlots; i++) {
        if (remainingLose <= 0n) break;
        const a = assignedAt(i);
        if (a <= 0n) continue;

        const take = (a * lose) / (total === 0n ? 1n : total);
        const actual = take > a ? a : take;
        setAssignedAt(i, a - actual);
        remainingLose -= actual;
      }
      if (remainingLose > 0n) {
        for (let i = 0; i < progress.towerSlots && remainingLose > 0n; i++) {
          const a = assignedAt(i);
          if (a <= 0n) continue;
          const actual = a < remainingLose ? a : remainingLose;
          setAssignedAt(i, a - actual);
          remainingLose -= actual;
        }
      }

      progress.goldBank -= repair;
      saveSave(progress);
      renderDefense();
      updateHUD();

      defReport.innerHTML =
        `<b>Defeat.</b> Enemy ${formatBig(enemy)} overran the walls. ` +
        `You lost ${formatBig(lose)} soldiers and paid ${repair} gold in repairs. ` +
        `Increase tower levels and assign more soldiers.`;
      showToast("Defeat.");
      return;
    }
  });

  // =========================
  // Runner game state
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

    time: 0,
    nextSpawn: 0,
    entities: [],

    shakeT: 0,
    shakeMag: 0
  };

  function updateHUD() {
    hudCrowd.textContent = formatBig(game.crowd);
    hudGold.textContent = String(Math.floor(progress.goldBank));
    hudSoldiers.textContent = formatBig(soldiersBankBig());
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

  // =========================
  // Entities: rows and singles
  // =========================
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

  // =========================
  // Gate rolls
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
    if (kind === "mult") {
      const pool =
        t < 0.6 ? [2, 2, 3, 3, 4] :
        t < 1.2 ? [2, 3, 3, 4, 4, 5] :
                  [3, 4, 4, 5, 5, 6, 7];
      let m = pick(pool);
      if (Math.random() < luck * 0.55) m += 1;
      m = clamp(m, 2, 8);
      return { type: "mult", m };
    }
    const base = 6 + Math.floor(6 * t);
    const spread = 10 + Math.floor(12 * t);
    const n = Math.floor(base + rnd(0, spread));
    return { type: "risk", n };
  }

  function gateCardFromRoll(roll) {
    if (roll.type === "plus") return { cls: "plus", big: `+${roll.n}`, small: "Recruit", roll };
    if (roll.type === "mult") return { cls: "mult", big: `×${roll.m}`, small: "Rally", roll };
    return { cls: "risk", big: `−${roll.n}`, small: "Ambush", roll };
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
        return { cls: "gold", big: `+${g}`, small: "Treasury", roll: { type: "gold", g } };
      }
      if (choice === "shield") {
        return { cls: "shield", big: `+1`, small: "Shield", roll: { type: "shield", s: 1 } };
      }
      const s = 60 + Math.floor(rnd(0, 140));
      return { cls: "sold", big: `+${s}`, small: "Draft", roll: { type: "sold", s } };
    }
    return card;
  }

  // =========================
  // Runner spawning
  // =========================
  function spawn(t) {
    const luck = luckPercent() / 100;

    const enemyChance = clamp(0.18 + 0.12 * t, 0.18, 0.48);
    const coinChance  = clamp(0.15 + 0.07 * t, 0.15, 0.30);
    const soldChance  = clamp(0.10 + 0.05 * t, 0.10, 0.26);
    const shieldChance= clamp(0.05 + 0.02 * t + 0.03 * luck, 0.05, 0.16);
    const rowChance = 1 - clamp(enemyChance + coinChance + soldChance + shieldChance, 0.35, 0.78);

    const kind = weightedPick([
      { v: "row", w: rowChance },
      { v: "enemy", w: enemyChance },
      { v: "coin", w: coinChance },
      { v: "sold", w: soldChance },
      { v: "shield", w: shieldChance }
    ]);

    const y = -140;
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

      left = gateCardFromRoll(left.roll);
      right = gateCardFromRoll(right.roll);

      left = maybePurify(left);
      right = maybePurify(right);

      // Temptation: gold or soldiers gate
      if (Math.random() < (0.06 + 0.06 * luck)) {
        const side = Math.random() < 0.5 ? "left" : "right";
        if (Math.random() < 0.55) {
          const g = 40 + Math.floor(rnd(0, 90) * (1 + 0.4 * t));
          const goldGate = { cls: "gold", big: `+${g}`, small: "Loot", roll: { type: "gold", g } };
          if (side === "left") left = goldGate; else right = goldGate;
        } else {
          const s = 70 + Math.floor(rnd(0, 170) * (1 + 0.35 * t));
          const soldGate = { cls: "sold", big: `+${s}`, small: "Draft", roll: { type: "sold", s } };
          if (side === "left") left = soldGate; else right = soldGate;
        }
      }

      game.entities.push(makeRow(y, left, right));
      return;
    }

    if (kind === "coin") {
      const g = Math.floor((18 + rnd(0, 30)) * (1 + 0.35 * t));
      const card = { cls: "coin", big: `+${g}`, small: "Gold", g };
      game.entities.push(makeSingle(y, lane, card));
      return;
    }

    if (kind === "sold") {
      const s = Math.floor((30 + rnd(0, 60)) * (1 + 0.40 * t));
      const card = { cls: "sold", big: `+${s}`, small: "Soldiers", s };
      game.entities.push(makeSingle(y, lane, card));
      return;
    }

    if (kind === "shield") {
      const card = { cls: "shield", big: `+1`, small: "Shield", s: 1 };
      game.entities.push(makeSingle(y, lane, card));
      return;
    }

    // Enemy clash scaling: scales with you, spikes late-game
    const crowd = game.crowd;
    const tNum = BigInt(Math.floor(clamp(t, 0, 2.6) * 100)); // 0..260
    let threat = 12n + BigInt(Math.floor(10 * t)) * 6n;

    const basePct = 25n + (tNum * 3n) / 4n;  // grows with t
    const randPct = BigInt(Math.floor(rnd(80, 125)));
    let pct = (basePct * randPct) / 100n;
    pct = clamp(Number(pct), 18, 140); // clamp as number then back
    const pctBig = BigInt(pct);

    threat += (crowd * pctBig) / 100n;

    if (Math.random() < 0.10 + t * 0.10) {
      const spike = BigInt(Math.floor(rnd(120, 220)));
      threat = (threat * spike) / 100n;
    }

    if (crowd > 1000000n && threat < crowd / 12n) threat = crowd / 12n;

    const card = { cls: "enemy", big: `ENEMY ${formatBig(threat)}`, small: "Clash", threat };
    game.entities.push(makeSingle(y, lane, card));
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
      shake(120, 3);
      return;
    }

    if (r?.type === "sold") {
      const add = BigInt(r.s || 0);
      setSoldiersBankBig(soldiersBankBig() + add);
      game.soldiersRun += add;
      saveSave(progress);
      showToast(`Draft +${formatBig(add)} soldiers`);
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
      game.crowd += BigInt(r.n);
      showToast(`Recruit +${r.n}`);
      return;
    }

    if (r?.type === "mult") {
      const before = game.crowd;
      game.crowd = game.crowd * BigInt(r.m);
      showToast(`Rally ×${r.m}`);
      if (game.crowd - before >= 40n) shake(160, 4);
      return;
    }

    if (r?.type === "risk") {
      if (game.shields > 0) {
        game.shields -= 1;
        showToast(`Ambush blocked (shields ${game.shields})`);
        shake(130, 4);
        return;
      }
      game.crowd -= BigInt(r.n);
      showToast(`Ambush −${r.n}`);
      shake(220, 8);
      return;
    }
  }

  function applySingle(e) {
    const c = e.data;

    if (c.cls.includes("enemy")) {
      const mitigation = enemyMitigation();
      const threat = toBigIntSafe(c.threat);

      const mitFP = BigInt(Math.floor((1 - mitigation) * 1000));
      const effective = (threat * mitFP) / 1000n;

      if (game.crowd > effective) {
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

        showToast(`Won clash! −${formatBig(loss)} crowd, +${gainGold} gold, +${formatBig(soldierGain)} soldiers`);
        shake(180, 6);
        return;
      }

      game.crowd = 0n;
      showToast(`Defeated by enemy ${formatBig(effective)}`);
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
  // Runner loop
  // =========================
  let lastT = 0;

  function tick(t) {
    requestAnimationFrame(tick);
    if (!game.running || game.paused) return;

    if (!lastT) lastT = t;
    const dt = Math.min(0.033, (t - lastT) / 1000);
    lastT = t;

    game.time += dt;

    const prog = game.dist / 600;
    game.speed = game.baseSpeed + prog * 18 + (game.practice ? 0 : prog * 8);

    game.dist += game.speed * dt * 0.06;

    if (game.dist > bestDistance) {
      bestDistance = game.dist;
      saveBest(bestDistance);
    }

    if (game.shakeT > 0) {
      game.shakeT -= dt;
      const mag = game.shakeMag * (game.shakeT / 0.25);
      const ox = rnd(-mag, mag);
      const oy = rnd(-mag, mag);
      stage.style.transform = `translate(${ox}px, ${oy}px)`;
      if (game.shakeT <= 0) {
        stage.style.transform = "";
        game.shakeMag = 0;
      }
    }

    game.nextSpawn -= dt;
    if (game.nextSpawn <= 0) {
      const tNorm = clamp(game.dist / 450, 0, 2.6);
      spawn(tNorm);

      const base = game.practice ? 1.05 : 0.92;
      const tight = clamp(0.22 * (game.dist / 700), 0, 0.45);
      game.nextSpawn = base - tight + rnd(0, 0.18);
    }

    const playerY = stage.clientHeight - 210;
    const killY = stage.clientHeight + 180;

    for (const e of game.entities) {
      e.y += game.speed * dt;
      e.el.style.transform = `translateY(${e.y}px)`;

      if (!e.hit && e.y >= playerY && e.y <= playerY + 40) {
        if (e.kind === "row") {
          const card = game.lane === 0 ? e.data.leftCard : e.data.rightCard;
          e.hit = true;

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

        playerNumEl.textContent = formatBig(game.crowd < 0n ? 0n : game.crowd);
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

    // tiny gold drip
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
    playerEl.classList.remove("right");

    game.crowd = startCrowdValueBig();
    game.goldRun = 0;
    game.soldiersRun = 0n;
    game.shields = shieldCharges();

    game.dist = 0;
    game.baseSpeed = practice ? 260 : 330;
    game.speed = game.baseSpeed;

    game.time = 0;
    game.nextSpawn = 0.35;

    game.shakeT = 0;
    game.shakeMag = 0;

    updateHUD();
    playerNumEl.textContent = formatBig(game.crowd);
  }

  function endRun() {
    game.running = false;
    game.paused = false;

    stage.style.transform = "";
    lastT = 0;

    overlayGameOver.classList.remove("hidden");
    overlayStart.classList.add("hidden");
    overlayKingdom.classList.add("hidden");
    overlayDefense.classList.add("hidden");

    const dist = Math.floor(game.dist);
    const earnedGold = Math.floor(game.goldRun);
    const earnedSold = game.soldiersRun;

    summaryEl.innerHTML = `
      <div><b>Distance:</b> ${dist}m</div>
      <div><b>Gold earned (run):</b> ${earnedGold}</div>
      <div><b>Soldiers earned (run):</b> ${formatBig(earnedSold)}</div>
      <div><b>Best distance:</b> ${Math.floor(bestDistance)}m</div>
      <div><b>Next step:</b> Use <b>Defense</b> to buy/upgrade towers and place soldiers to beat waves.</div>
    `;

    const tips = [
      "If clashes feel brutal late-game, it means the scaling is working. Use Shields + Defense towers.",
      "Draft gates and enemy wins snowball your soldier bank. Towers turn that bank into real power.",
      "If you’re huge, multipliers are king. If you’re fragile, stabilize with +N before risking ×.",
      "Defense tip: upgrade tower levels first, then fill with soldiers for the biggest power jumps."
    ];
    deathTipEl.textContent = pick(tips);
  }

  // =========================
  // Input: swipe + keys
  // =========================
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

  // =========================
  // UI controls
  // =========================
  function startRun(practice = false) {
    resetRun(practice);

    overlayStart.classList.add("hidden");
    overlayGameOver.classList.add("hidden");
    overlayKingdom.classList.add("hidden");
    overlayDefense.classList.add("hidden");

    game.running = true;
    game.paused = false;

    showToast(practice ? "Practice run" : "Run started");
    updateHUD();
    playerNumEl.textContent = formatBig(game.crowd);

    lastT = 0;
  }

  function togglePause() {
    if (!game.running) return;
    game.paused = !game.paused;
    showToast(game.paused ? "Paused" : "Resumed");
  }

  function openKingdom() {
    if (game.running) game.paused = true;
    renderKingdom();
    overlayKingdom.classList.remove("hidden");
    overlayStart.classList.add("hidden");
    overlayGameOver.classList.add("hidden");
    overlayDefense.classList.add("hidden");
  }

  function closeKingdom() {
    overlayKingdom.classList.add("hidden");
    if (!game.running) overlayStart.classList.remove("hidden");
    else {
      game.paused = false;
      showToast("Back to run");
    }
  }

  function openDefense() {
    if (game.running) game.paused = true;
    renderDefense();
    overlayDefense.classList.remove("hidden");
    overlayStart.classList.add("hidden");
    overlayGameOver.classList.add("hidden");
    overlayKingdom.classList.add("hidden");
  }

  function closeDefense() {
    overlayDefense.classList.add("hidden");
    if (!game.running) overlayStart.classList.remove("hidden");
    else {
      game.paused = false;
      showToast("Back to run");
    }
  }

  function hardRestart() {
    resetRun(false);
    overlayStart.classList.remove("hidden");
    overlayGameOver.classList.add("hidden");
    overlayKingdom.classList.add("hidden");
    overlayDefense.classList.add("hidden");
    game.running = false;
    game.paused = false;
    showToast("Restarted");
  }

  btnPlay.addEventListener("click", () => startRun(false));
  btnPractice.addEventListener("click", () => startRun(true));
  btnPause.addEventListener("click", togglePause);
  btnRestart.addEventListener("click", hardRestart);

  btnKingdom.addEventListener("click", openKingdom);
  btnDefense.addEventListener("click", openDefense);
  btnCloseKingdom.addEventListener("click", closeKingdom);
  btnCloseDefense.addEventListener("click", closeDefense);

  btnOpenDefenseFromStart?.addEventListener("click", openDefense);

  btnRunAgain.addEventListener("click", () => startRun(false));
  btnGoKingdom.addEventListener("click", openKingdom);
  btnGoDefense.addEventListener("click", openDefense);

  btnResetProgress.addEventListener("click", () => {
    const keepBest = bestDistance; // keep best distance, but reset economy/progression
    Object.assign(progress, JSON.parse(JSON.stringify(defaultProgress)));
    bestDistance = keepBest;
    saveSave(progress);
    renderKingdom();
    renderDefense();
    updateHUD();
    showToast("Progress reset");
  });

  // =========================
  // Boot
  // =========================
  hudBest.textContent = `${Math.floor(bestDistance)}m`;
  renderKingdom();
  renderDefense();
  resetRun(false);

  overlayStart.classList.remove("hidden");
  overlayGameOver.classList.add("hidden");
  overlayKingdom.classList.add("hidden");
  overlayDefense.classList.add("hidden");

  updateHUD();
  requestAnimationFrame(tick);
})();
