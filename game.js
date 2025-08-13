"use strict";
(function(){
  // Retro Arcade: Vampire Survivors-like minimal loop (vanilla JS)
  const DPR = Math.max(1, Math.min(3, window.devicePixelRatio || 1));
  const TAU = Math.PI * 2;

  // DOM bootstrap
  let canvas = document.getElementById("game");
  if (!canvas) {
    canvas = document.createElement("canvas");
    canvas.id = "game";
    canvas.style.display = "block";
    canvas.style.width = "100vw";
    canvas.style.height = "100vh";
    document.body.appendChild(canvas);
  }
  const ctx = canvas.getContext("2d", { alpha: false });

  // Overlay (Play/Game Over)
  let overlay = document.getElementById("overlay");
  if (!overlay) {
    overlay = document.createElement("div");
    overlay.id = "overlay";
    overlay.style.position = "fixed";
    overlay.style.inset = "0";
    overlay.style.display = "flex";
    overlay.style.alignItems = "center";
    overlay.style.justifyContent = "center";
    overlay.style.background = "rgba(0,0,0,0.5)";
    overlay.style.zIndex = "10";
    overlay.innerHTML = "<div id=\"overlay-content\" style=\"text-align:center;color:#fff;font-family:'Press Start 2P',monospace\"><h1 style=\"margin-bottom:1rem;\">Retro Arcade</h1><button id=\"play-btn\" style=\"padding:1rem 1.5rem;font-size:1rem;\">Play</button><div id=\"gameover\" style=\"display:none;margin-top:1rem;font-size:0.8rem;opacity:0.9\"></div></div>";
    document.body.appendChild(overlay);
  }
  let playBtn = document.getElementById("play-btn");
  if (!playBtn) {
    playBtn = document.createElement("button");
    playBtn.id = "play-btn";
    playBtn.textContent = "Play";
    overlay.appendChild(playBtn);
  }
  const gameOverBox = document.getElementById("gameover") || (() => { const d=document.createElement("div"); d.id="gameover"; d.style.display="none"; overlay.appendChild(d); return d; })();

  // Resize handling with DPR scaling
  function resizeCanvas(){
    const cssW = Math.max(1, Math.floor(window.innerWidth));
    const cssH = Math.max(1, Math.floor(window.innerHeight));
    canvas.width = Math.floor(cssW * DPR);
    canvas.height = Math.floor(cssH * DPR);
    canvas.style.width = cssW + "px";
    canvas.style.height = cssH + "px";
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  }
  window.addEventListener("resize", resizeCanvas);
  resizeCanvas();

  // Input
  const keys = new Set();
  const KEYMAP = {
    ArrowUp: "up", ArrowDown: "down", ArrowLeft: "left", ArrowRight: "right",
    w: "up", a: "left", s: "down", d: "right"
  };
  window.addEventListener("keydown", (e)=>{ const k = KEYMAP[e.key]; if(k){ keys.add(k); e.preventDefault(); }});
  window.addEventListener("keyup", (e)=>{ const k = KEYMAP[e.key]; if(k){ keys.delete(k); e.preventDefault(); }});

  // Random helpers
  const rand = (a,b)=> Math.random()*(b-a)+a;
  const clamp = (v,mi,ma)=> Math.max(mi, Math.min(ma, v));
  const dist2 = (ax,ay,bx,by)=>{ const dx=ax-bx, dy=ay-by; return dx*dx+dy*dy; };
  const angleTo = (ax,ay,bx,by)=> Math.atan2(by - ay, bx - ax);

  // Game state
  const State = { Menu: "menu", Running: "running", Over: "gameover" };
  let state = State.Menu;
  let lastTime = 0;
  let elapsed = 0; // time since start in seconds

  // Player
  const player = {
    x: 0, y: 0,
    r: 10,
    speed: 220,
    hp: 100,
    maxHp: 100,
    invuln: 0, // seconds remaining
    iframes: 0.8,
  };

  // Arrays for entities
  const enemies = [];
  const projectiles = [];

  // Spawning / difficulty
  let spawnTimer = 0;
  const spawn = {
    baseRate: 0.8, // per second
    ramp: 0.02,    // per second^2 increase
    maxRate: 3.0,
    enemyMinSpeed: 60,
    enemyMaxSpeed: 110
  };

  // Auto attack
  let fireTimer = 0;
  const fire = {
    interval: 0.5, // seconds
    speed: 380,
    r: 4,
    ttl: 1.4,
    turnRate: 6.0 // rad/s for mild homing
  };

  // Score / HUD
  let score = 0;

  // Reset game
  function resetGame(){
    player.x = canvas.width / (2*DPR);
    player.y = canvas.height / (2*DPR);
    player.hp = player.maxHp;
    player.invuln = 0;
    enemies.length = 0;
    projectiles.length = 0;
    score = 0;
    elapsed = 0;
    spawnTimer = 0;
    fireTimer = 0;
  }

  function currentSpawnRate(){
    const rate = spawn.baseRate + clamp(elapsed * spawn.ramp, 0, 999);
    return clamp(rate, spawn.baseRate, spawn.maxRate);
  }

  function spawnEnemy(){
    const W = canvas.width / DPR, H = canvas.height / DPR;
    const side = Math.floor(Math.random()*4); // 0 top,1 right,2 bottom,3 left
    let x=0, y=0;
    const pad = 10;
    if(side===0){ x = rand(-pad, W+pad); y = -pad; }
    else if(side===1){ x = W+pad; y = rand(-pad, H+pad); }
    else if(side===2){ x = rand(-pad, W+pad); y = H+pad; }
    else { x = -pad; y = rand(-pad, H+pad); }
    const speed = rand(spawn.enemyMinSpeed, spawn.enemyMaxSpeed) * (1 + Math.min(0.6, elapsed/120));
    const r = rand(9, 12);
    enemies.push({ x, y, r, speed, hp: 1 });
  }

  function emitProjectile(){
    // Target nearest enemy if present, else shoot in slowly rotating direction
    let target = null;
    let minD2 = Infinity;
    for (let i=0;i<enemies.length;i++){
      const e = enemies[i];
      const d2 = dist2(player.x, player.y, e.x, e.y);
      if (d2 < minD2) { minD2 = d2; target = e; }
    }
    let angle;
    if (target) {
      angle = angleTo(player.x, player.y, target.x, target.y);
    } else {
      angle = (elapsed * 1.4) % TAU; // idle spin
    }
    const cos = Math.cos(angle), sin = Math.sin(angle);
    const speed = fire.speed;
    projectiles.push({
      x: player.x + cos * (player.r + 2),
      y: player.y + sin * (player.r + 2),
      vx: cos * speed,
      vy: sin * speed,
      r: fire.r,
      ttl: fire.ttl,
      homing: !!target
    });
  }

  function updateProjectiles(dt){
    // Mild homing towards nearest enemy when homing=true
    for (let i=projectiles.length-1;i>=0;i--){
      const p = projectiles[i];
      p.ttl -= dt;
      if (p.ttl <= 0){ projectiles.splice(i,1); continue; }

      if (p.homing && enemies.length){
        // Steer towards nearest
        let target=null, minD2=Infinity;
        for (let j=0;j<enemies.length;j++){
          const e=enemies[j];
          const d2=dist2(p.x,p.y,e.x,e.y);
          if(d2<minD2){minD2=d2; target=e;}
        }
        if (target){
          const desired = angleTo(p.x,p.y,target.x,target.y);
          const cur = Math.atan2(p.vy, p.vx);
          let diff = desired - cur;
          while (diff > Math.PI) diff -= TAU;
          while (diff < -Math.PI) diff += TAU;
          const maxTurn = fire.turnRate * dt;
          const newAng = cur + clamp(diff, -maxTurn, maxTurn);
          const spd = Math.hypot(p.vx,p.vy);
          p.vx = Math.cos(newAng) * spd;
          p.vy = Math.sin(newAng) * spd;
        }
      }

      p.x += p.vx * dt;
      p.y += p.vy * dt;
    }
  }

  function updateEnemies(dt){
    const px = player.x, py = player.y;
    for (let i=enemies.length-1;i>=0;i--){
      const e = enemies[i];
      const ang = angleTo(e.x, e.y, px, py);
      const vx = Math.cos(ang) * e.speed;
      const vy = Math.sin(ang) * e.speed;
      e.x += vx * dt;
      e.y += vy * dt;

      // collision with player
      const rr = e.r + player.r;
      if (dist2(e.x,e.y,px,py) <= rr*rr){
        if (player.invuln <= 0){
          player.hp -= 10;
          player.invuln = player.iframes;
          // tiny knockback
          const nx = Math.cos(ang + Math.PI);
          const ny = Math.sin(ang + Math.PI);
          player.x += nx * 10;
          player.y += ny * 10;
        }
      }

      // If moved very far outside, cull
      const W = canvas.width / DPR, H = canvas.height / DPR;
      if (e.x < -200 || e.y < -200 || e.x > W+200 || e.y > H+200){
        enemies.splice(i,1);
      }
    }
  }

  function handleCollisions(){
    // projectile vs enemy
    for (let i=projectiles.length-1;i>=0;i--){
      const p = projectiles[i];
      let hit = -1;
      for (let j=0;j<enemies.length;j++){
        const e = enemies[j];
        const rr = p.r + e.r;
        if (dist2(p.x,p.y,e.x,e.y) <= rr*rr){ hit = j; break; }
      }
      if (hit >= 0){
        const e = enemies[hit];
        e.hp -= 1;
        // light knockback
        const ang = angleTo(p.x,p.y,e.x,e.y);
        e.x += Math.cos(ang) * 6;
        e.y += Math.sin(ang) * 6;
        projectiles.splice(i,1);
        if (e.hp <= 0){ enemies.splice(hit,1); score += 1; }
      }
    }
  }

  function updatePlayer(dt){
    let mx=0,my=0;
    if (keys.has("left")) mx -= 1;
    if (keys.has("right")) mx += 1;
    if (keys.has("up")) my -= 1;
    if (keys.has("down")) my += 1;
    if (mx || my){
      const len = Math.hypot(mx,my) || 1;
      mx/=len; my/=len;
      player.x += mx * player.speed * dt;
      player.y += my * player.speed * dt;
    }
    const W = canvas.width / DPR, H = canvas.height / DPR;
    player.x = clamp(player.x, player.r, W - player.r);
    player.y = clamp(player.y, player.r, H - player.r);
    if (player.invuln > 0) player.invuln -= dt;
  }

  function drawBackground(){
    // Subtle vignette/scanlines-ish effect
    const W = canvas.width / DPR, H = canvas.height / DPR;
    const g = ctx.createLinearGradient(0,0,0,H);
    g.addColorStop(0, "#0a0a12");
    g.addColorStop(1, "#05050a");
    ctx.fillStyle = g;
    ctx.fillRect(0,0,W,H);

    // Scanlines
    ctx.globalAlpha = 0.06;
    ctx.fillStyle = "#000";
    for (let y=0;y<H;y+=2){ ctx.fillRect(0,y,W,1); }
    ctx.globalAlpha = 1;
  }

  function drawHUD(){
    ctx.save();
    ctx.fillStyle = "#00ffbd";
    ctx.shadowColor = "#00ffbd";
    ctx.shadowBlur = 8;
    ctx.font = "14px 'Press Start 2P', monospace";
    ctx.textBaseline = "top";
    const hp = Math.max(0, Math.round(player.hp));
    const timeStr = Math.floor(elapsed).toString().padStart(2,"0");
    ctx.fillText(`Score: ${score}`, 12, 10);
    ctx.fillText(`HP: ${hp}`, 12, 28);
    ctx.fillText(`Time: ${timeStr}s`, 12, 46);
    ctx.restore();
  }

  function drawPlayer(){
    ctx.save();
    // blink when invulnerable
    if (player.invuln > 0 && Math.floor(elapsed*20)%2===0) { ctx.globalAlpha = 0.5; }
    ctx.fillStyle = "#6ee7ff";
    ctx.beginPath();
    ctx.arc(player.x, player.y, player.r, 0, TAU);
    ctx.fill();
    ctx.restore();
  }

  function drawEnemies(){
    ctx.save();
    ctx.fillStyle = "#ff417d";
    for (const e of enemies){
      ctx.beginPath();
      ctx.arc(e.x, e.y, e.r, 0, TAU);
      ctx.fill();
    }
    ctx.restore();
  }

  function drawProjectiles(){
    ctx.save();
    ctx.fillStyle = "#f4f169";
    for (const p of projectiles){
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, TAU);
      ctx.fill();
    }
    ctx.restore();
  }

  function setOverlayVisible(show){
    overlay.style.display = show ? "flex" : "none";
  }

  function setOverlayGameOver(show){
    if (show) {
      gameOverBox.style.display = "block";
      gameOverBox.innerHTML = `Game Over<br>Score: ${score}<br><button id=\"restart-btn\" style=\"margin-top:0.5rem;padding:0.6rem 1rem;\">Restart</button>`;
      const restartBtn = document.getElementById("restart-btn");
      restartBtn.addEventListener("click", ()=>start());
    } else {
      gameOverBox.style.display = "none";
      gameOverBox.innerHTML = "";
    }
  }

  function start(){
    resetGame();
    state = State.Running;
    setOverlayGameOver(false);
    setOverlayVisible(false);
  }

  function endGame(){
    state = State.Over;
    setOverlayVisible(true);
    setOverlayGameOver(true);
  }

  // Hook play button
  playBtn.addEventListener("click", ()=>{
    if (state !== State.Running) start();
  });

  // Main loop
  function frame(t){
    if (!lastTime) lastTime = t;
    let dt = (t - lastTime) / 1000;
    lastTime = t;
    // clamp to avoid huge jumps when tab was inactive
    dt = clamp(dt, 0, 0.05);

    if (state === State.Running){
      elapsed += dt;
      // spawning
      spawnTimer -= dt;
      const rate = currentSpawnRate();
      while (spawnTimer <= 0){
        spawnEnemy();
        spawnTimer += 1 / rate;
      }
      // player
      updatePlayer(dt);
      // auto fire
      fireTimer -= dt;
      if (fireTimer <= 0){ emitProjectile(); fireTimer += fire.interval; }
      // entities
      updateEnemies(dt);
      updateProjectiles(dt);
      handleCollisions();

      if (player.hp <= 0){ endGame(); }
    }

    // render
    drawBackground();
    if (state !== State.Menu){
      drawProjectiles();
      drawEnemies();
      drawPlayer();
      drawHUD();
    } else {
      // Subtle center marker on menu
      ctx.save();
      ctx.strokeStyle = "rgba(255,255,255,0.1)";
      ctx.beginPath();
      ctx.arc(canvas.width/(2*DPR), canvas.height/(2*DPR), 32, 0, TAU);
      ctx.stroke();
      ctx.restore();
    }

    requestAnimationFrame(frame);
  }

  requestAnimationFrame(frame);
})();
