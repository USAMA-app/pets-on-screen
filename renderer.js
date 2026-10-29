// The overlay: one transparent scene spanning every screen, shared by all pets.
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { Pet, rand } from './pet.js';

const GROUND_MARGIN = 4;   // px above each screen's taskbar
const TILT = 0.12;         // rad the camera looks down, so shadows on the "floor" show
const query = new URLSearchParams(location.search);
const GALLERY = query.get('gallery');  // calibration view: a kind, or "all"
// Work areas of all screens, in this window's pixels. ponytail: assumes every screen uses the same scaling.
const DISPLAYS = JSON.parse(query.get('displays') || 'null') || [{ x: 0, y: 0, width: innerWidth, height: innerHeight }];

const W = innerWidth, H = innerHeight;
const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
renderer.setSize(W, H);
renderer.setClearColor(0x000000, 0);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.environment = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.8;

// Orthographic camera, 1 world unit per pixel, tilted down. No perspective, so pets look the same on every screen.
// World y=0 is the bottom of the window; each screen's floor sits at its own height (see grounds below).
const camera = new THREE.OrthographicCamera(-W / 2, W / 2, H / 2, -H / 2, 1, 8000);
camera.position.set(0, H / 2, 3000);
camera.rotation.x = -TILT;
camera.updateMatrixWorld();

scene.add(new THREE.HemisphereLight(0xfff4e8, 0x5a4a3c, 1.0));
const sun = new THREE.DirectionalLight(0xffffff, 2.2);
sun.position.set(W * 0.1, 900, 600);
sun.castShadow = true;
sun.shadow.mapSize.set(4096, 4096);
Object.assign(sun.shadow.camera, { left: -W * 0.6, right: W * 0.6, top: H * 0.8, bottom: -H * 0.8, near: 1, far: 4000 });
sun.shadow.radius = 6;
sun.shadow.bias = -0.0005;
scene.add(sun, sun.target);

// --- screen <-> world ---
const ray = new THREE.Raycaster();
const wall = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);  // the vertical plane pets live on
function toWorld(px, py) {
  ray.setFromCamera(new THREE.Vector2(px / W * 2 - 1, 1 - py / H * 2), camera);
  return ray.ray.intersectPlane(wall, new THREE.Vector3()) || new THREE.Vector3();
}
function toScreen(v) {
  const p = v.clone().project(camera);
  return { x: (p.x + 1) / 2 * W, y: (1 - p.y) / 2 * H };
}

// One floor per screen, on top of its taskbar, catching shadows.
const grounds = DISPLAYS.map(d => {
  const g = { x0: toWorld(d.x, 0).x, x1: toWorld(d.x + d.width, 0).x,
              y: toWorld(d.x, d.y + d.height - GROUND_MARGIN).y, top: toWorld(d.x, d.y).y };
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(g.x1 - g.x0, 2000), new THREE.ShadowMaterial({ opacity: 0.32 }));
  floor.rotation.x = -Math.PI / 2;
  floor.position.set((g.x0 + g.x1) / 2, g.y, 0);
  floor.receiveShadow = true;
  scene.add(floor);
  return g;
}).sort((a, b) => a.x0 - b.x0);
// ponytail: gaps between screens count as the nearest screen; fine for side-by-side layouts.
const groundOf = x => grounds.find(g => x < g.x1) || grounds[grounds.length - 1];

function fx(cls, text, pet, dx = 0) {
  if (world.quiet) return;  // quiet mode: no bubbles, hearts or zzz
  const el = document.createElement('div');
  el.className = 'fx ' + cls;
  el.textContent = text;
  el.style.left = (pet.rect.x0 + pet.rect.x1) / 2 + dx + 'px';
  el.style.top = pet.rect.y0 - 4 + 'px';
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 2100);
}

// --- things pets interact with: treats and balls ---
const items = [];
function spawn(kind, x, y) {
  const r = kind === 'ball' ? 10 : 7;
  const mat = new THREE.MeshStandardMaterial(kind === 'ball' ? { color: 0xd8312c, roughness: 0.35 } : { color: 0x9c5a2e, roughness: 0.55 });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(r, 24, 16), mat);
  mesh.castShadow = true;
  scene.add(mesh);
  const item = { kind, r, mesh, x, y, vx: 0, vy: 0, carrier: null, eaten: false };
  items.push(item);
  return item;
}
function removeItem(item) {
  scene.remove(item.mesh);
  items.splice(items.indexOf(item), 1);
}
function updateItems(dt) {
  for (const it of items) {
    if (it.carrier) {
      const p = it.carrier;
      it.x = p.x + p.dir * 0.45 * p.height;
      it.y = p.y + 0.3 * p.height;
    } else {
      it.vy -= 2000 * dt;
      it.x += it.vx * dt;
      it.y += it.vy * dt;
      const floorY = groundOf(it.x).y + it.r;
      if (it.y < floorY) {  // bounce and roll
        it.y = floorY;
        it.vy = Math.abs(it.vy) > 120 ? -it.vy * 0.5 : 0;
        it.vx *= Math.exp(-1.5 * dt);
      }
      if (it.x < world.edgeL + it.r || it.x > world.edgeR - it.r) {
        it.x = THREE.MathUtils.clamp(it.x, world.edgeL + it.r, world.edgeR - it.r);
        it.vx = -it.vx * 0.6;
      }
    }
    it.mesh.position.set(it.x, it.y, 0);
  }
}

const world = {
  scene, toScreen, fx, gallery: !!GALLERY && GALLERY !== 'play',
  edgeL: grounds[0].x0, edgeR: grounds[grounds.length - 1].x1,
  groundAt: x => groundOf(x).y, topAt: x => groundOf(x).top,
  cursor: new THREE.Vector3(), cursorStill: 0, cursorSpeed: 0, returnedAt: 0,
  get pets() { return pets; },
  claim(item, p) { item.claimedBy ??= p; },
  eat(item, p) { if (!item.eaten) { item.eaten = true; removeItem(item); p?.fed(); } },
  quiet: false,
  carry(ball, p) { ball.carrier = p; },
  drop(ball) { ball.carrier = null; ball.vx = ball.vy = 0; },
};

// --- pets ---
const catalog = await window.pets.catalog();
const byId = Object.fromEntries(catalog.map(e => [e.id, e]));
let pets = [];
let syncing = Promise.resolve();
function sync(list) {
  syncing = syncing.then(async () => {
    for (const p of pets) if (!list.some(d => d.id === p.data.id)) p.dispose();
    pets = pets.filter(p => list.some(d => d.id === p.data.id));
    for (const d of list) {
      const have = pets.find(p => p.data.id === d.id);
      if (have) { Object.assign(have.data, d); have.applySize(); continue; }
      const entry = byId[d.model];
      if (!entry) continue;
      try {
        pets.push(await Pet.create(world, { ...d }, { ...entry, file: 'models/' + entry.file }));
      } catch (e) { console.error('could not load', entry.file, e.stack); }
    }
  });
  return syncing;
}

if (GALLERY === 'play') {  // test playground: a mix of pets with their real characters, not saved
  const mix = ['01-somali-cat-animated-ver-1-2', '15-robin-bird'];  // 1 cat + 1 bird
  await sync(mix.map((m, i) => ({ id: 'p' + i, model: m, name: byId[m].name.split(' ')[0], size: 1 })));
} else if (GALLERY) {  // calibration view: a row of every pet of a kind, all facing right
  const list = catalog.filter(e => !e.exclude && (GALLERY === 'all' || e.kind === GALLERY));
  await sync(list.map((e, i) => ({ id: 'g' + i, model: e.id, name: e.name, size: 1 })));
  pets.forEach((p, i) => { p.x = world.edgeL + (i + 0.5) * (world.edgeR - world.edgeL) / pets.length; p.dir = 1; p.y = world.groundAt(p.x) + (p.flyer ? 250 : 0); });
} else {
  await sync(await window.pets.list());
  window.pets.onPets(sync);
  setInterval(() => window.pets.stats(pets.map(p => ({ id: p.data.id, hunger: +p.hunger.toFixed(3), affection: +p.affection.toFixed(3) }))), 30000);
}

// --- input ---
let over = false, press = null, drag = null, lastPt = null, lastMove = performance.now();
const hitTest = (x, y) => [...pets].reverse().find(p => !p.gone && !p.leaving && x > p.rect.x0 && x < p.rect.x1 && y > p.rect.y0 && y < p.rect.y1);

// --- "Pets away" button: drag it to any screen edge; click to send every pet off screen, click again to call them back ---
const awayBtn = document.getElementById('away');
let away = false, btnDrag = null;
const inBtn = (x, y) => { const r = awayBtn.getBoundingClientRect(); return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom; };
function placeBtn(x, y) {  // snap to the nearest edge of the screen under (x, y), inside its work area
  const d = DISPLAYS.find(d => x >= d.x && x < d.x + d.width && y >= d.y && y < d.y + d.height) || DISPLAYS[0];
  const S = 34, M = 6, cx = Math.min(Math.max(x, d.x + M), d.x + d.width - S - M), cy = Math.min(Math.max(y, d.y + M), d.y + d.height - S - M);
  const gaps = [[x - d.x, d.x + M, cy], [d.x + d.width - x, d.x + d.width - S - M, cy], [y - d.y, cx, d.y + M], [d.y + d.height - y, cx, d.y + d.height - S - M]];
  const [, left, top] = gaps.sort((a, b) => a[0] - b[0])[0];
  awayBtn.style.left = left + 'px';
  awayBtn.style.top = top + 'px';
  return { left, top };
}
function setAway(v) {
  away = v;
  awayBtn.classList.toggle('off', v);
  awayBtn.innerHTML = v ? '&#x1F3E0;' : '&#x1F43E;';  // house while they're out, paw when they're here
  for (const p of pets) v ? p.leave() : p.comeBack();
}
(() => {
  let pos = null;
  try { pos = JSON.parse(localStorage.getItem('awayBtn')); } catch {}
  const d = DISPLAYS[0];
  placeBtn(pos?.left ?? d.x + d.width - 40, pos?.top ?? d.y + d.height / 2);  // default: right edge of the first screen
})();
awayBtn.addEventListener('mousedown', e => { if (e.button === 0) { btnDrag = { x: e.clientX, y: e.clientY, moved: false }; e.stopPropagation(); } });
function setOver(v) { if (v !== over) { over = v; window.pets.hover(v); } }

// Polled from the main process, so it works even while clicks pass through the window.
window.pets.onCursor(pt => {
  const now = performance.now();
  if (lastPt) {
    const d = Math.hypot(pt.x - lastPt.x, pt.y - lastPt.y), dt = Math.max(now - lastPt.t, 1) / 1000;
    world.cursorSpeed = world.cursorSpeed * 0.6 + (d / dt) * 0.4;
    if (d > 1) {
      if (now - lastMove > 30000) world.returnedAt = now;  // came back after being away
      lastMove = now;
    }
    const pet = !press && hitTest(pt.x, pt.y);
    if (pet) pet.stroke(pt.x - lastPt.x);
  }
  lastPt = { ...pt, t: now };
  world.cursorStill = (now - lastMove) / 1000;
  world.cursor.copy(toWorld(pt.x, pt.y));
  if (!press && !btnDrag) setOver(!!hitTest(pt.x, pt.y) || inBtn(pt.x, pt.y));
});

addEventListener('mousedown', e => {
  const pet = e.button === 0 && hitTest(e.clientX, e.clientY);
  if (pet) press = { pet, x: e.clientX, y: e.clientY };
});
addEventListener('mousemove', e => {
  if (btnDrag) {
    if (Math.hypot(e.clientX - btnDrag.x, e.clientY - btnDrag.y) > 4) btnDrag.moved = true;
    if (btnDrag.moved) { awayBtn.style.left = e.clientX - 17 + 'px'; awayBtn.style.top = e.clientY - 17 + 'px'; }
    return;
  }
  if (!press) return;
  const c = toWorld(e.clientX, e.clientY);
  const now = performance.now();
  if (!drag && Math.hypot(e.clientX - press.x, e.clientY - press.y) > 6) {
    drag = { pet: press.pet, dx: c.x - press.pet.x, dy: c.y - press.pet.y, last: c, t: now, vx: 0, vy: 0 };
    drag.pet.grab();
  }
  if (drag) {  // smoothed hand velocity, used for the swing and for throwing
    const dt = Math.max(now - drag.t, 1) / 1000;
    drag.vx = drag.vx * 0.5 + (c.x - drag.last.x) / dt * 0.5;
    drag.vy = drag.vy * 0.5 + (c.y - drag.last.y) / dt * 0.5;
    drag.last = c;
    drag.t = now;
    drag.pet.holdAt(c.x, c.y, drag.dx, drag.dy, drag.vx);
  }
});
addEventListener('mouseup', e => {
  if (e.button !== 0) return;
  if (btnDrag) {
    if (btnDrag.moved) { try { localStorage.setItem('awayBtn', JSON.stringify(placeBtn(e.clientX, e.clientY))); } catch {} }
    else setAway(!away);
    btnDrag = null;
    return;
  }
  if (drag) {
    const still = performance.now() - drag.t > 80;  // hand had stopped: just let go, no throw
    drag.pet.release(still ? 0 : drag.vx, still ? 0 : drag.vy);
  }
  else if (press) press.pet.click();
  press = drag = null;
  setOver(!!hitTest(e.clientX, e.clientY) || inBtn(e.clientX, e.clientY));
});
addEventListener('contextmenu', e => {
  e.preventDefault();
  const pet = hitTest(e.clientX, e.clientY);
  if (pet && !GALLERY) window.pets.menu({ id: pet.data.id, name: pet.data.name, kind: pet.kind, size: pet.size, mood: pet.mood,
                                          fetch: !!pet.brain.fetch });
});

window.pets.onAction(({ id, action, value }) => {
  if (action === 'quiet') { world.quiet = value; return; }
  if (action === 'away') return setAway(!away);
  const p = pets.find(q => q.data.id === id);
  if (!p) return;
  if (action === 'pet') p.brain.click(p, 1);
  else if (action === 'feed') {
    const x = p.clampX(p.x + p.dir * 1.3 * p.height);
    p.brain.feed(p, spawn('treat', x, world.groundAt(x) + (p.flyer ? 300 : 400)));
  } else if (action === 'fetch') {
    for (const it of items.filter(i => i.kind === 'ball')) removeItem(it);
    const ball = spawn('ball', world.cursor.x, Math.max(world.cursor.y, world.groundAt(world.cursor.x) + 150));
    ball.vx = (world.cursor.x > p.x ? 1 : -1) * rand(500, 900);
    ball.vy = rand(300, 600);
    p.brain.fetch(p, ball);
  } else p.brain[action]?.(p);
});

// --- frame loop ---
const clock = new THREE.Clock();
renderer.setAnimationLoop(() => {
  const dt = Math.min(clock.getDelta(), 0.1);
  for (const p of pets) p.update(dt);
  updateItems(dt);
  renderer.render(scene, camera);
});
