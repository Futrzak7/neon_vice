(() => {
  "use strict";
  const canvas = document.querySelector("#game"), ctx = canvas.getContext("2d");
  const ui = {
    cash: document.querySelector("#cash"), wanted: document.querySelector("#wanted"),
    health: document.querySelector("#health-bar"), title: document.querySelector("#mission-title"),
    text: document.querySelector("#mission-text"), toast: document.querySelector("#toast"),
    garage: document.querySelector("#garage"), garageCash: document.querySelector("#garage-cash")
  };
  const keys = new Set(), world = { w: 3000, h: 2100, grid: 300 };
  let camera = { x: 0, y: 0 }, last = 0, toastTimer = 0, deliveryCount = 0, garageOpen = false, cityExpanded = false, policeWave = 0, policeTimer = 0;
  const player = { x: 450, y: 900, angle: 0, health: 80, inCar: true, wanted: 0, cash: 2450 };
  const car = { x: 450, y: 900, angle: 0, speed: 0, color: "#f14e70", engine: 1, handling: 1, armor: 1, brakes: 1, wallCooldown: 0 };
  const randomDelivery = () => {
    let point;
    do {
      point = { x: 90 + Math.random() * 2820, y: 90 + Math.random() * 1920, label: "PACZKA" };
    } while (blocks.some(b => point.x > b.x - 30 && point.x < b.x + b.w + 30 && point.y > b.y - 30 && point.y < b.y + b.h + 30));
    return point;
  };
  const blocks = [], people = [], cops = [], obstacles = [], sparks = [], hitTexts = [];
  const buildings = ["#2d3650", "#354160", "#4a3b59", "#243c52", "#553e55"];
  for (let y = 0; y < world.h; y += world.grid) for (let x = 0; x < world.w; x += world.grid) {
    if ((x / world.grid + y / world.grid) % 5 === 0) continue;
    const variant = (x / world.grid * 3 + y / world.grid * 5) % 5;
    const sizes = variant === 0
      ? { w: 238, h: 238 }
      : variant === 1
        ? { w: 238, h: 154 }
        : variant === 2
          ? { w: 154, h: 238 }
          : variant === 3
            ? { w: 178, h: 218 }
            : { w: 218, h: 178 };
    blocks.push({
      x: x + (world.grid - sizes.w) / 2,
      y: y + (world.grid - sizes.h) / 2,
      w: sizes.w,
      h: sizes.h,
      color: buildings[(x / world.grid + y / world.grid) % buildings.length | 0]
    });
  }
  const checkpoints = [randomDelivery()];
  for (let i = 0; i < 70; i++) people.push({ x: 90 + Math.random() * 2820, y: 90 + Math.random() * 1920, dir: Math.random() * 7, hue: Math.random() > .5 ? "#ffb677" : "#67d8d0", active: true });
  for (let i = 0; i < 52; i++) obstacles.push({ x: 70 + Math.random() * 2860, y: 70 + Math.random() * 1960, type: i % 3, hit: 0 });
  const neon = [{ x: 150, y: 450, text: "MOTEL" }, { x: 1350, y: 300, text: "PALM CLUB" }, { x: 2260, y: 1840, text: "ARCADE" }];
  const roadSidePosition = () => {
    const onVerticalRoad = Math.random() > .5;
    const roadLine = Math.max(1, Math.min(9, Math.round(1 + Math.random() * 8))) * world.grid;
    return onVerticalRoad
      ? { x: roadLine + (Math.random() > .5 ? -58 : 58), y: 90 + Math.random() * 1920 }
      : { x: 90 + Math.random() * 2820, y: roadLine + (Math.random() > .5 ? -58 : 58) };
  };
  obstacles.forEach(o => Object.assign(o, roadSidePosition()));
  const resize = () => { const dpr = Math.min(devicePixelRatio || 1, 2); canvas.width = innerWidth * dpr; canvas.height = innerHeight * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0); };
  addEventListener("resize", resize); resize();
  addEventListener("keydown", e => { const key = e.key.toLowerCase(); if (key === "u") { toggleGarage(); return; } if (garageOpen) return; keys.add(key); if (key === "r") reset(); });
  addEventListener("keyup", e => keys.delete(e.key.toLowerCase()));
  document.querySelector("#garage-close").addEventListener("click", toggleGarage);
  document.querySelectorAll("[data-upgrade]").forEach(button => button.addEventListener("click", () => upgrade(button.dataset.upgrade)));
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  function say(message) { ui.toast.textContent = message; ui.toast.classList.remove("hidden"); toastTimer = 3.5; }
  function toggleGarage() {
    garageOpen = !garageOpen; ui.garage.classList.toggle("hidden", !garageOpen); keys.clear(); updateGarage();
  }
  function updateGarage() {
    ui.garageCash.textContent = `$ ${player.cash.toLocaleString("pl-PL")}`;
    [["engine", "#engine-upgrade", 900], ["armor", "#armor-upgrade", 800], ["handling", "#handling-upgrade", 1100], ["brakes", "#brakes-upgrade", 750]].forEach(([type, selector, basePrice]) => {
      const level = car[type], button = document.querySelector(selector).closest("button");
      document.querySelector(selector).textContent = level >= 4 ? "MAX" : `$ ${(basePrice * level).toLocaleString("pl-PL")}`;
      button.disabled = level >= 4 || player.cash < basePrice * level;
    });
    const cityButton = document.querySelector("#city-upgrade").closest("button");
    document.querySelector("#city-upgrade").textContent = cityExpanded ? "AKTYWNE" : "$ 10 000";
    cityButton.disabled = cityExpanded || player.cash < 10000;
  }
  function moveObstaclesToRoadSides() {
    obstacles.forEach(o => Object.assign(o, roadSidePosition()));
  }
  function spawnPolice() {
    let point;
    do {
      point = { x: 100 + Math.random() * 2800, y: 100 + Math.random() * 1900 };
    } while (dist(point, car) < 650 || blocks.some(b => point.x > b.x - 35 && point.x < b.x + b.w + 35 && point.y > b.y - 35 && point.y < b.y + b.h + 35));
    return { ...point, angle: 0, speed: 105 + policeWave * 12 };
  }
  function upgrade(type) {
    if (!player.inCar) return say("Musisz siedzieć w aucie, aby ulepszyć samochód.");
    if (type === "city") {
      if (cityExpanded) return say("Drogi są już poszerzone.");
      if (player.cash < 10000) return say("Potrzebujesz $ 10 000 na przebudowę miasta.");
      player.cash -= 10000; cityExpanded = true;
      blocks.forEach(block => {
        const centerX = block.x + block.w / 2, centerY = block.y + block.h / 2;
        block.w = world.grid - 132; block.h = world.grid - 132;
        block.x = centerX - block.w / 2; block.y = centerY - block.h / 2;
      });
      moveObstaclesToRoadSides();
      updateGarage(); say("Miasto przebudowane! Budynki są mniejsze, a drogi szersze.");
      return;
    }
    const prices = { engine: 900, armor: 800, handling: 1100, brakes: 750 }, labels = { engine: "speed", armor: "wytrzymałość", handling: "prowadzenie", brakes: "hamulce" };
    const price = prices[type] * car[type];
    if (car[type] >= 4) return say("Ten samochód ma już maksymalny poziom ulepszeń.");
    if (player.cash < price) return say(`Brakuje pieniędzy. Potrzebujesz $ ${price}.`);
    player.cash -= price; car[type]++; updateGarage(); say(`Ulepszono: ${labels[type]} poziom ${car[type]}.`);
  }
  function reset() {
    Object.assign(player, { x: 450, y: 900, health: 80, wanted: 0, inCar: true, cash: 2450 }); Object.assign(car, { x: 450, y: 900, speed: 0, engine: 1, handling: 1, armor: 1, brakes: 1, wallCooldown: 0 });
    deliveryCount = 0; policeWave = 0; policeTimer = 0; checkpoints[0] = randomDelivery(); cops.length = 0; obstacles.forEach(o => o.hit = 0); people.forEach(p => p.active = true); say("Misja zrestartowana — dostarcz 50 losowych paczek");
  }
  function hitPerson(p) {
    p.active = false; player.cash += 150; player.wanted = Math.min(3, player.wanted + 1);
    hitTexts.push({ x: p.x, y: p.y, text: "+$150", life: 1.2 }); say("Zręcznościowy bonus +$150 — uważaj na policję!");
    setTimeout(() => { p.x = 80 + Math.random() * 2840; p.y = 80 + Math.random() * 1940; p.active = true; }, 2600);
  }
  function update(dt) {
    if (garageOpen) { updateGarage(); return; }
    const controlled = player.inCar ? car : player;
    policeTimer = Math.max(0, policeTimer - dt);
    car.wallCooldown = Math.max(0, car.wallCooldown - dt);
    const steer = (keys.has("d") ? 1 : 0) - (keys.has("a") ? 1 : 0), throttle = (keys.has("w") ? 1 : 0) - (keys.has("s") ? 1 : 0);
    if (player.inCar) {
      car.speed += throttle * (190 + car.engine * 18) * dt; car.speed *= Math.pow(.88, dt * 10);
      car.speed = clamp(car.speed, -170, 330 + car.engine * 22);
      if (keys.has(" ")) car.speed *= Math.pow(.9 - car.brakes * .025, dt * 6);
      car.angle += steer * dt * (1.35 + Math.abs(car.speed) / 125) * (1 + car.handling * .1);
      const oldX = car.x, oldY = car.y;
      car.x += Math.cos(car.angle) * car.speed * dt; car.y += Math.sin(car.angle) * car.speed * dt;
      car.x = clamp(car.x, 35, world.w - 35); car.y = clamp(car.y, 35, world.h - 35);
      const building = blocks.find(b => car.x + 24 > b.x && car.x - 24 < b.x + b.w && car.y + 14 > b.y && car.y - 14 < b.y + b.h);
      if (building) {
        const margin = 27;
        const distances = [
          { side: "left", value: Math.abs(oldX - (building.x - margin)) },
          { side: "right", value: Math.abs(oldX - (building.x + building.w + margin)) },
          { side: "top", value: Math.abs(oldY - (building.y - margin)) },
          { side: "bottom", value: Math.abs(oldY - (building.y + building.h + margin)) }
        ].sort((a, b) => a.value - b.value);
        car.x = oldX; car.y = oldY;
        if (distances[0].side === "left") car.x = building.x - margin;
        if (distances[0].side === "right") car.x = building.x + building.w + margin;
        if (distances[0].side === "top") car.y = building.y - margin;
        if (distances[0].side === "bottom") car.y = building.y + building.h + margin;
        car.speed *= -.2;
        if (car.wallCooldown <= 0) {
          car.wallCooldown = .7;
          player.health -= Math.max(5, Math.abs(car.speed) / 12) / car.armor;
        }
      }
      player.x = car.x; player.y = car.y; player.angle = car.angle;
      if (Math.abs(car.speed) > 180 && Math.random() < dt * 7) sparks.push({ x: car.x - Math.cos(car.angle) * 25, y: car.y - Math.sin(car.angle) * 25, life: .35 });
      people.forEach(p => { if (p.active && Math.abs(car.speed) > 100 && dist(car, p) < 27) hitPerson(p); });
      obstacles.forEach(o => { if (!o.hit && dist(car, o) < (o.type === 2 ? 34 : 27) && Math.abs(car.speed) > 25) { o.hit = 1.2; car.speed *= -.28; player.health -= (o.type === 2 ? 20 : 12) / car.armor; say(o.type === 2 ? "Bum! Uderzenie w furgonetkę." : "Przeszkoda! Auto straciło zdrowie."); } if (o.hit) o.hit -= dt; });
    } else {
      const len = Math.hypot(steer, throttle) || 1; player.x = clamp(player.x + steer / len * 170 * dt, 15, world.w - 15); player.y = clamp(player.y - throttle / len * 170 * dt, 15, world.h - 15);
      if (keys.has("e") && dist(player, car) < 62) player.inCar = true;
    }
    if (keys.has("e") && player.inCar && Math.abs(car.speed) < 40) { player.inCar = false; player.x += 38; say("Na piechotę — podejdź do auta i wciśnij E"); keys.delete("e"); }
    people.forEach(p => { if (!p.active) return; p.x += Math.cos(p.dir) * 12 * dt; p.y += Math.sin(p.dir) * 12 * dt; if (p.x < 20 || p.x > world.w - 20) p.dir = Math.PI - p.dir; if (p.y < 20 || p.y > world.h - 20) p.dir = -p.dir; });
    const checkpoint = checkpoints[0];
    if (deliveryCount < 50 && dist(car, checkpoint) < 145) {
      deliveryCount++;
      player.health = clamp(player.health + 40, 0, 80);
      player.cash += deliveryCount % 10 === 0 ? 1800 : 900;
      checkpoints[0] = randomDelivery();
      if (deliveryCount < 50 && deliveryCount % 10 === 0) {
        policeWave = deliveryCount / 10;
        policeTimer = 4;
        player.wanted = 5;
        for (let i = 0; i < Math.min(5, 1 + policeWave); i++) cops.push(spawnPolice());
        say(`Paczka ${deliveryCount}/50! 5 gwiazdek — nadciąga fala policji.`);
      } else if (deliveryCount >= 50) say("50 paczek dostarczone! Gra ukończona — gratulacje.");
      else say(`Paczka ${deliveryCount}/50 dostarczona! Następny punkt jest losowy.`);
    }
    for (let i = cops.length - 1; i >= 0; i--) {
      const c = cops[i];
      c.angle = Math.atan2(car.y - c.y, car.x - c.x);
      c.x += Math.cos(c.angle) * c.speed * dt;
      c.y += Math.sin(c.angle) * c.speed * dt;
      if (dist(c, car) < 45) {
        player.health -= 19 / car.armor;
        cops.splice(i, 1);
        if (player.wanted === 5) cops.push(spawnPolice());
        say("Radiowóz uderzył — kolejny nadjeżdża z innej części miasta.");
      }
    }
    if (cops.length && policeTimer <= 0 && !cops.some(c => dist(c, car) < 370)) { player.wanted = 0; cops.length = 0; }
    sparks.forEach(s => s.life -= dt); while (sparks.length && sparks[0].life <= 0) sparks.shift();
    hitTexts.forEach(t => { t.y -= 25 * dt; t.life -= dt; }); while (hitTexts.length && hitTexts[0].life <= 0) hitTexts.shift();
    player.health = clamp(player.health, 0, 100); if (player.health <= 0) { say("Auto jest zniszczone. Wciśnij R, aby spróbować ponownie."); car.speed = 0; }
    camera.x += (controlled.x - innerWidth / 2 - camera.x) * Math.min(1, dt * 5); camera.y += (controlled.y - innerHeight / 2 - camera.y) * Math.min(1, dt * 5); camera.x = clamp(camera.x, 0, world.w - innerWidth); camera.y = clamp(camera.y, 0, world.h - innerHeight);
    ui.cash.textContent = `$ ${player.cash.toLocaleString("pl-PL")}`; ui.health.style.width = `${player.health}%`; ui.wanted.textContent = player.wanted ? "★".repeat(player.wanted) : "—"; if (garageOpen) updateGarage();
    ui.title.textContent = deliveryCount >= 50 ? "Gra ukończona" : `Kurier Neon Vice: ${deliveryCount}/50`; ui.text.textContent = deliveryCount >= 50 ? "Dostarczono wszystkie paczki. Miasto jest Twoje." : player.wanted ? `5 gwiazdek — przetrwaj pościg po paczce ${deliveryCount}.` : "Dostarcz paczkę do losowego punktu. Co 10 paczek czeka Cię trudniejszy pościg.";
    if ((toastTimer -= dt) <= 0) ui.toast.classList.add("hidden");
  }
  function draw() {
    const w = innerWidth, h = innerHeight; ctx.clearRect(0, 0, w, h); ctx.save(); ctx.translate(-camera.x, -camera.y); ctx.fillStyle = "#121a2a"; ctx.fillRect(0, 0, world.w, world.h);
    ctx.strokeStyle = "#26334b"; ctx.lineWidth = 2; for (let x = 0; x <= world.w; x += world.grid) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, world.h); ctx.stroke(); } for (let y = 0; y <= world.h; y += world.grid) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(world.w, y); ctx.stroke(); }
    blocks.forEach(b => { ctx.fillStyle = "#070c16aa"; ctx.fillRect(b.x + 7, b.y + 10, b.w, b.h); ctx.fillStyle = b.color; ctx.fillRect(b.x, b.y, b.w, b.h); ctx.fillStyle = "#ffffff12"; for (let yy = b.y + 18; yy < b.y + b.h - 12; yy += 25) for (let xx = b.x + 17; xx < b.x + b.w - 12; xx += 24) ctx.fillRect(xx, yy, 6, 8); });
    neon.forEach(n => { ctx.save(); ctx.shadowBlur = 18; ctx.shadowColor = "#ff5a83"; ctx.fillStyle = "#ff718f"; ctx.font = "800 21px 'Barlow Condensed'"; ctx.fillText(n.text, n.x, n.y); ctx.restore(); });
    if (deliveryCount < 50) { const target = checkpoints[0]; ctx.save(); ctx.translate(target.x, target.y); ctx.strokeStyle = "#f9c546"; ctx.shadowBlur = 18; ctx.shadowColor = "#f9c546"; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(0, 0, 48 + Math.sin(performance.now() / 200) * 5, 0, Math.PI * 2); ctx.stroke(); ctx.fillStyle = "#f9c546"; ctx.font = "700 13px 'Space Grotesk'"; ctx.fillText(target.label, -32, -62); ctx.restore(); }
    obstacles.forEach(o => { ctx.save(); ctx.translate(o.x, o.y); ctx.rotate(o.hit ? .4 : 0); ctx.fillStyle = o.type === 2 ? "#3b91bf" : o.type === 1 ? "#e85e55" : "#f3bb51"; ctx.shadowBlur = 8; ctx.shadowColor = ctx.fillStyle; ctx.fillRect(-18, -12, 36, 24); ctx.fillStyle = "#fff8"; ctx.fillRect(-12, -3, 24, 4); ctx.restore(); });
    people.forEach(p => { if (!p.active) return; ctx.fillStyle = p.hue; ctx.beginPath(); ctx.arc(p.x, p.y, 7, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = "#101522"; ctx.fillRect(p.x - 4, p.y + 5, 8, 9); });
    cops.forEach(c => drawCar(c.x, c.y, c.angle, "#e9f2ff", true)); if (player.inCar) drawCar(car.x, car.y, car.angle, car.color, false); else { ctx.fillStyle = "#f5bd82"; ctx.beginPath(); ctx.arc(player.x, player.y, 10, 0, Math.PI * 2); ctx.fill(); }
    sparks.forEach(s => { ctx.fillStyle = `rgba(249,197,70,${s.life * 3})`; ctx.fillRect(s.x, s.y, 4, 4); }); hitTexts.forEach(t => { ctx.fillStyle = `rgba(249,197,70,${t.life})`; ctx.font = "800 18px 'Space Grotesk'"; ctx.fillText(t.text, t.x, t.y); }); ctx.restore(); drawMinimap(); drawVignette(w, h);
  }
  function drawCar(x, y, angle, color, police) { ctx.save(); ctx.translate(x, y); ctx.rotate(angle); ctx.shadowBlur = 18; ctx.shadowColor = color; ctx.fillStyle = "#070b12"; ctx.roundRect(-30, -15, 60, 30, 8); ctx.fill(); ctx.fillStyle = color; ctx.roundRect(-26, -11, 52, 22, 6); ctx.fill(); ctx.fillStyle = "#17263b"; ctx.fillRect(-9, -9, 17, 18); ctx.fillStyle = "#f7f3df"; ctx.fillRect(23, -8, 4, 6); ctx.fillRect(23, 2, 4, 6); ctx.fillStyle = "#ff4b74"; ctx.fillRect(-27, -8, 4, 6); ctx.fillRect(-27, 2, 4, 6); if (police) { ctx.fillStyle = "#ff4e67"; ctx.fillRect(-5, -16, 5, 4); ctx.fillStyle = "#55c8ff"; ctx.fillRect(1, -16, 5, 4); } ctx.restore(); }
  function drawMinimap() { const size = 150, x = innerWidth - size - 28, y = innerHeight - size - 28; ctx.save(); ctx.globalAlpha = .92; ctx.fillStyle = "#0b111dcc"; ctx.strokeStyle = "#ffffff33"; ctx.lineWidth = 2; ctx.beginPath(); ctx.roundRect(x, y, size, size, 12); ctx.fill(); ctx.stroke(); ctx.beginPath(); ctx.rect(x + 8, y + 8, size - 16, size - 16); ctx.clip(); ctx.fillStyle = "#26334b"; blocks.forEach(b => ctx.fillRect(x + b.x / world.w * (size - 16) + 8, y + b.y / world.h * (size - 16) + 8, b.w / world.w * (size - 16), b.h / world.h * (size - 16))); ctx.fillStyle = "#f9c546"; if (deliveryCount < 50) { const t = checkpoints[0]; ctx.fillRect(x + t.x / world.w * size, y + t.y / world.h * size, 4, 4); } ctx.fillStyle = "#ff5a83"; ctx.beginPath(); ctx.arc(x + car.x / world.w * size, y + car.y / world.h * size, 4, 0, 7); ctx.fill(); cops.forEach(c => { ctx.fillStyle = "#eaf3ff"; ctx.fillRect(x + c.x / world.w * size, y + c.y / world.h * size, 3, 3); }); ctx.restore(); }
  function drawVignette(w, h) { const g = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * .2, w / 2, h / 2, Math.max(w, h) * .75); g.addColorStop(0, "transparent"); g.addColorStop(1, "#03050b99"); ctx.fillStyle = g; ctx.fillRect(0, 0, w, h); }
  function frame(t) { const dt = Math.min(.035, (t - last) / 1000 || .016); last = t; update(dt); draw(); requestAnimationFrame(frame); }
  say("Wciśnij U, aby otworzyć garaż i ulepszać auto."); requestAnimationFrame(frame);
})();
