/* TOP-DOWN ZOMBIE SHOOTER
   Single-file, commented, suitable for learning and extension.
   Save as index.html and open in a browser.

   Key concepts covered:
   - main loop (requestAnimationFrame) with delta time
   - vector math for movement/aiming
   - entity arrays (bullets, zombies)
   - collision detection (circle vs circle)
   - simple spawn/difficulty scaling
*/

// ----- Canvas setup -----
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
function resizeCanvas() {
  const rect = canvas.getBoundingClientRect();
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.floor(rect.width * dpr);
  canvas.height = Math.floor(rect.height * dpr || 640 * dpr);
  ctx.setTransform(dpr,0,0,dpr,0,0);
}
// give the canvas an initial CSS height so it has area in VSCode preview
canvas.style.height = '640px';
resizeCanvas();
window.addEventListener('resize', resizeCanvas);

// ----- UI elements -----
const scoreEl = document.getElementById('score');
const hpEl = document.getElementById('hp');
const zcountEl = document.getElementById('zcount');
const startBtn = document.getElementById('startBtn');

// ----- Game state -----
let running = false;
let lastTime = 0;
let score = 0;
let player;
let bullets = [];
let zombies = [];
let keys = { w:false, a:false, s:false, d:false, up:false, down:false, left:false, right:false };
let mouse = { x:0, y:0, down:false };
let spawnTimer = 0;
let spawnInterval = 1500; // milliseconds
let difficultyTimer = 0;

// ----- Config (tweakable) -----
const CONFIG = {
  playerRadius: 16,
  playerSpeed: 240,          // px / sec
  fireRate: 200,             // ms between shots
  bulletSpeed: 800,          // px / sec
  bulletRadius: 4,
  zombieRadius: 18,
  zombieSpeedBase: 50,       // px / sec (base)
  zombieSpeedPerLevel: 8,    // added per difficultyLevel
  maxZombies: 40,
  damageOnTouch: 20,
  startingHP: 100
};

// ----- Utility helpers -----
function clamp(v,a,b){ return Math.max(a, Math.min(b, v)); }
function dist2(ax,ay,bx,by){ const dx=ax-bx, dy=ay-by; return dx*dx + dy*dy; }
function length(x,y){ return Math.sqrt(x*x + y*y); }
function normalize(x,y){
  const len = length(x,y);
  if(len === 0) return {x:0,y:0};
  return { x: x/len, y: y/len };
}
function randRange(a,b){ return a + Math.random()*(b-a); }

// ----- Entities -----
function makePlayer(x,y){
  return {
    x, y,
    vx:0, vy:0,
    radius: CONFIG.playerRadius,
    hp: CONFIG.startingHP,
    lastShot: 0
  };
}
function makeBullet(x,y, vx, vy){
  return { x, y, vx, vy, r: CONFIG.bulletRadius, life: 1800 }; // life in ms
}
function makeZombie(x,y, speed){
  return { x, y, r: CONFIG.zombieRadius, speed, hp: 30 + Math.floor(Math.random()*20) };
}

// ----- Input handling -----
window.addEventListener('keydown', e=>{
  if(e.key==='w' || e.key==='W' || e.key==='ArrowUp') keys.w=true;
  if(e.key==='a' || e.key==='A' || e.key==='ArrowLeft') keys.a=true;
  if(e.key==='s' || e.key==='S' || e.key==='ArrowDown') keys.s=true;
  if(e.key==='d' || e.key==='D' || e.key==='ArrowRight') keys.d=true;
  // restart with R
  if(e.key==='r' || e.key==='R'){ if(!running) startGame(); }
});
window.addEventListener('keyup', e=>{
  if(e.key==='w' || e.key==='W' || e.key==='ArrowUp') keys.w=false;
  if(e.key==='a' || e.key==='A' || e.key==='ArrowLeft') keys.a=false;
  if(e.key==='s' || e.key==='S' || e.key==='ArrowDown') keys.s=false;
  if(e.key==='d' || e.key==='D' || e.key==='ArrowRight') keys.d=false;
});
canvas.addEventListener('mousemove', e=>{
  const rect = canvas.getBoundingClientRect();
  mouse.x = (e.clientX - rect.left);
  mouse.y = (e.clientY - rect.top);
});
canvas.addEventListener('mousedown', e=> { mouse.down = true; });
window.addEventListener('mouseup', e=> { mouse.down = false; });

// Touch support (basic)
canvas.addEventListener('touchstart', (ev)=>{
  ev.preventDefault();
  const t = ev.touches[0];
  const rect = canvas.getBoundingClientRect();
  mouse.x = (t.clientX - rect.left);
  mouse.y = (t.clientY - rect.top);
  mouse.down = true;
}, {passive:false});
canvas.addEventListener('touchmove', (ev)=>{
  ev.preventDefault();
  const t = ev.touches[0];
  const rect = canvas.getBoundingClientRect();
  mouse.x = (t.clientX - rect.left);
  mouse.y = (t.clientY - rect.top);
}, {passive:false});
canvas.addEventListener('touchend', (ev)=>{
  ev.preventDefault();
  mouse.down = false;
}, {passive:false});

// ----- Game lifecycle -----
function resetGameState(){
  score = 0;
  bullets = [];
  zombies = [];
  player = makePlayer(canvas.width/2/ (window.devicePixelRatio||1), canvas.height/2/ (window.devicePixelRatio||1));
  player.hp = CONFIG.startingHP;
  spawnTimer = 0;
  spawnInterval = 1500;
  difficultyTimer = 0;
  updateUI();
}

function startGame(){
  resetGameState();
  running = true;
  lastTime = performance.now();
  requestAnimationFrame(gameLoop);
}
startBtn.addEventListener('click', ()=> startGame());

// ----- Spawning zombies -----
// Spawns zombies around the edges at random positions
function spawnZombie(difficultyLevel = 0){
  const w = canvas.width / (window.devicePixelRatio||1);
  const h = canvas.height / (window.devicePixelRatio||1);
  // pick a side: 0=top,1=right,2=bottom,3=left
  const side = Math.floor(Math.random()*4);
  let x, y;
  const margin = 20;
  if(side===0){ x = randRange(margin, w-margin); y = -40; }
  else if(side===1){ x = w + 40; y = randRange(margin, h-margin); }
  else if(side===2){ x = randRange(margin, w-margin); y = h + 40; }
  else { x = -40; y = randRange(margin, h-margin); }
  const speed = CONFIG.zombieSpeedBase + difficultyLevel * CONFIG.zombieSpeedPerLevel + Math.random()*10;
  zombies.push(makeZombie(x,y,speed));
}

// ----- Shooting -----
function tryShoot(now){
  if(!mouse.down) return;
  const msSince = now - player.lastShot;
  if(msSince < CONFIG.fireRate) return;
  // direction from player to mouse
  const dx = mouse.x - player.x;
  const dy = mouse.y - player.y;
  const n = normalize(dx,dy);
  const vx = n.x * CONFIG.bulletSpeed;
  const vy = n.y * CONFIG.bulletSpeed;
  bullets.push(makeBullet(player.x + n.x*(player.radius+8), player.y + n.y*(player.radius+8), vx, vy));
  player.lastShot = now;
  // small recoil knockback (visual/feel)
  player.x -= n.x * 4;
  player.y -= n.y * 4;
}

// ----- Update loop -----
function update(dt, now){
  // dt in seconds
  const w = canvas.width / (window.devicePixelRatio||1);
  const h = canvas.height / (window.devicePixelRatio||1);

  // Player movement (WASD)
  let mx = 0, my = 0;
  if(keys.w) my -= 1;
  if(keys.s) my += 1;
  if(keys.a) mx -= 1;
  if(keys.d) mx += 1;
  if(mx !== 0 || my !== 0){
    const n = normalize(mx, my);
    player.x += n.x * CONFIG.playerSpeed * dt;
    player.y += n.y * CONFIG.playerSpeed * dt;
  }
  // Bound player inside screen
  player.x = clamp(player.x, player.radius+6, w - player.radius - 6);
  player.y = clamp(player.y, player.radius+6, h - player.radius - 6);

  // Shooting
  tryShoot(now);

  // Update bullets
  for(let i = bullets.length-1; i>=0; i--){
    const b = bullets[i];
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    b.life -= dt*1000;
    // remove if outside bounds or expired
    if(b.life <= 0 || b.x < -50 || b.x > w+50 || b.y < -50 || b.y > h+50){
      bullets.splice(i,1);
    }
  }

  // Update zombies: simple direct chase (vector towards player)
  for(let i = zombies.length-1; i>=0; i--){
    const z = zombies[i];
    const dx = player.x - z.x;
    const dy = player.y - z.y;
    const n = normalize(dx, dy);
    // move
    z.x += n.x * z.speed * dt;
    z.y += n.y * z.speed * dt;

    // if close to player, damage and remove zombie
    const d2 = dist2(z.x, z.y, player.x, player.y);
    const hitDist = (z.r + player.radius);
    if(d2 < hitDist*hitDist){
      // On touch: reduce HP, small knockback on zombie and player helps feel impact
      player.hp -= CONFIG.damageOnTouch;
      // push zombie away a little
      z.x -= n.x * 15;
      z.y -= n.y * 15;
      // remove zombie (could instead reduce hp for multi-hit zombies)
      zombies.splice(i,1);
      if(player.hp <= 0){
        running = false;
      }
      continue;
    }

    // bullet collisions with zombie
    for(let j = bullets.length-1; j>=0; j--){
      const b = bullets[j];
      const d2bz = dist2(b.x, b.y, z.x, z.y);
      if(d2bz < (b.r + z.r)*(b.r + z.r)){
        // hit
        zombies.splice(i,1);
        bullets.splice(j,1);
        score += 10;
        break; // this zombie is dead, continue outer loop
      }
    }
  }

  // Spawning logic & difficulty ramp
  spawnTimer += dt*1000;
  difficultyTimer += dt*1000;
  const difficultyLevel = Math.floor(difficultyTimer / 15000); // every 15s difficulty++ (affects speed)
  const desiredMaxZombies = clamp(5 + difficultyLevel*2 + Math.floor(score/100), 6, CONFIG.maxZombies);

  if(spawnTimer > spawnInterval && zombies.length < desiredMaxZombies){
    spawnTimer = 0;
    spawnInterval = clamp(1000 - difficultyLevel*50, 380, 2000); // gradual faster spawn
    spawnZombie(difficultyLevel);
  }

  // update UI
  updateUI();
}

// ----- Render -----
function render(){
  const w = canvas.width / (window.devicePixelRatio||1);
  const h = canvas.height / (window.devicePixelRatio||1);
  // clear
  ctx.fillStyle = '#0f1317';
  ctx.fillRect(0,0,w,h);

  // draw grid / floor (subtle)
  ctx.save();
  ctx.globalAlpha = 0.06;
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 1;
  const grid = 40;
  for(let x = 0; x < w; x += grid){
    ctx.beginPath(); ctx.moveTo(x,0); ctx.lineTo(x,h); ctx.stroke();
  }
  for(let y = 0; y < h; y += grid){
    ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(w,y); ctx.stroke();
  }
  ctx.restore();

  // draw bullets
  for(const b of bullets){
    ctx.beginPath();
    ctx.fillStyle = '#fff6cc';
    ctx.arc(b.x, b.y, b.r, 0, Math.PI*2);
    ctx.fill();
  }

  // draw zombies
  for(const z of zombies){
    // body
    ctx.beginPath();
    ctx.fillStyle = '#6b8e23'; // olive-ish for visual difference
    ctx.arc(z.x, z.y, z.r, 0, Math.PI*2);
    ctx.fill();
    // eyes
    ctx.fillStyle = '#111';
    ctx.fillRect(z.x - 6, z.y - 4, 4, 4);
    ctx.fillRect(z.x + 2, z.y - 4, 4, 4);
  }

  // draw player (rotated to face mouse)
  const dx = mouse.x - player.x;
  const dy = mouse.y - player.y;
  const ang = Math.atan2(dy, dx);
  ctx.save();
  ctx.translate(player.x, player.y);
  ctx.rotate(ang);
  // player body
  ctx.beginPath();
  ctx.fillStyle = '#2ea3f2';
  ctx.arc(0,0,player.radius,0,Math.PI*2);
  ctx.fill();
  // gun (rectangle protruding forward)
  ctx.fillStyle = '#222';
  ctx.fillRect(0, -5, player.radius + 10, 10);
  ctx.restore();

  // HUD: score and HP
  ctx.save();
  ctx.fillStyle = 'rgba(255,255,255,0.06)';
  ctx.fillRect(12,12,220,60);
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 14px system-ui, Arial';
  ctx.fillText('Score: ' + score, 20, 34);
  ctx.fillText('HP: ' + player.hp, 20, 56);

  // crosshair
  ctx.beginPath();
  ctx.strokeStyle = 'rgba(255,255,255,0.6)';
  ctx.lineWidth = 1;
  ctx.moveTo(mouse.x - 10, mouse.y);
  ctx.lineTo(mouse.x + 10, mouse.y);
  ctx.moveTo(mouse.x, mouse.y - 10);
  ctx.lineTo(mouse.x, mouse.y + 10);
  ctx.stroke();
  ctx.restore();

  // game over overlay
  if(!running){
    ctx.save();
    ctx.fillStyle = 'rgba(2,2,2,0.6)';
    ctx.fillRect(0,0,w,h);
    ctx.fillStyle = '#e85a4f';
    ctx.font = 'bold 44px system-ui, Arial';
    ctx.textAlign = 'center';
    ctx.fillText('GAME OVER', w/2, h/2 - 10);
    ctx.font = '16px system-ui, Arial';
    ctx.fillStyle = '#fff';
    ctx.fillText('Score: ' + score + ' • Press Start to play again', w/2, h/2 + 20);
    ctx.restore();
  }
}

// ----- UI updater -----
function updateUI(){
  scoreEl.textContent = score;
  hpEl.textContent = player.hp;
  zcountEl.textContent = zombies.length;
}

// ----- Main loop -----
function gameLoop(now){
  const dt = Math.min((now - lastTime) / 1000, 0.05); // cap dt to avoid big jumps
  lastTime = now;
  if(running){
    update(dt, now);
  }
  render();
  requestAnimationFrame(gameLoop);
}

// Kick the loop so canvas displays initial frame
requestAnimationFrame((t)=>{ lastTime = t; render(); });

// Expose for debug via console
window.__simpleShooter = {
  start: startGame,
  state: () => ({ running, score, bullets: bullets.length, zombies: zombies.length, hp: player ? player.hp : 0 })
};
