// One pet: model, animations, movement and a queue of steps that its character (brains.js) fills.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';
import { brains } from './brains.js';

const FACE_CAMERA = 0.35;  // rad, walking pets turn a little towards the viewer so they read as 3D
const GRAVITY = 2600;      // px/s²
const FLY_SPEED = 260;     // px/s at size 1
const FALLBACK_SPEED = { walk: 80, sniffWalk: 60, sneak: 50, trot: 170, trotCarry: 170, run: 320, runCarry: 320 };
const SOUNDS = { cat: ['Meow!', 'Mrrp?', 'Meow~'], dog: ['Woof!', 'Arf!', 'Woof woof!'], bird: ['Tweet!', 'Chirp!', 'Tweet tweet!'] };
const GRAB_SOUNDS = { cat: ['Mrrow?!', '!?', 'Mew!'], dog: ['Yip!', 'Woof?!', '*wiggles*'], bird: ['Tweet?!', 'Eek!', 'Chirp?!'] };
const GAITS = ['walk', 'sniffWalk', 'sneak', 'trot', 'trotCarry', 'run', 'runCarry'];

const loader = new GLTFLoader();
const cache = new Map();
function load(file) {
  if (!cache.has(file)) {
    cache.set(file, loader.loadAsync(file).then(async g => {
      for (const c of g.animations) {
        if (!c.duration) c.duration = 1;  // single-frame poses: a 0 duration makes looping produce NaN poses
        stripRootMotion(c);
      }
      await fixSpecGloss(g);
      return g;
    }));
  }
  return cache.get(file);
}

// Some older models use KHR_materials_pbrSpecularGlossiness, which three.js no longer reads: keep their colour texture.
async function fixSpecGloss(g) {
  const json = g.parser.json.materials || [];
  if (!json.some(m => m.extensions?.KHR_materials_pbrSpecularGlossiness)) return;
  const meshes = [];
  g.scene.traverse(o => { if (o.isMesh) meshes.push(o); });
  for (const mesh of meshes) {
    for (const mat of [].concat(mesh.material)) {  // the materials actually on meshes (the loader may clone them)
      const i = g.parser.associations.get(mat)?.materials;
      const sg = json[i]?.extensions?.KHR_materials_pbrSpecularGlossiness;
      if (!sg?.diffuseTexture || mat.map) continue;
      const tex = await g.parser.getDependency('texture', sg.diffuseTexture.index);
      tex.colorSpace = THREE.SRGBColorSpace;
      Object.assign(mat, { map: tex, metalness: 0, roughness: 0.8, needsUpdate: true });
    }
  }
}

// Remove forward drift baked into a clip (root motion) so the app alone moves the pet; bobbing and jumps stay.
function stripRootMotion(clip) {
  for (const t of clip.tracks) {
    const n = t.times.length;
    if (!t.name.endsWith('.position') || n < 2) continue;
    const v = t.values, t0 = t.times[0], span = t.times[n - 1] - t0 || 1;
    for (const k of [0, 2]) {
      let lo = Infinity, hi = -Infinity;
      for (let i = 0; i < n; i++) { lo = Math.min(lo, v[i * 3 + k]); hi = Math.max(hi, v[i * 3 + k]); }
      const drift = v[(n - 1) * 3 + k] - v[k];
      if (hi - lo === 0 || Math.abs(drift) < 0.5 * (hi - lo)) continue;
      for (let i = 0; i < n; i++) v[i * 3 + k] -= drift * (t.times[i] - t0) / span;
    }
  }
}

// Flight loops often fly a whole circuit (out and back), which drift removal misses: hold the top-most
// animated node in place so the app does all the travelling. Mutates the shared clip once.
function pinRoot(clip, model) {
  if (clip.userData.pinned) return;
  clip.userData.pinned = true;
  const depth = name => { let o = model.getObjectByName(name), d = 0; while (o?.parent) { o = o.parent; d++; } return o ? d : Infinity; };
  const tracks = clip.tracks.filter(t => t.name.endsWith('.position'));
  if (!tracks.length) return;
  const top = tracks.reduce((a, b) => (depth(b.name.slice(0, -9)) < depth(a.name.slice(0, -9)) ? b : a));
  const v = top.values;
  for (let i = 3; i < v.length; i++) v[i] = v[i % 3];
}

function resolveClips(clips, map) {
  const byName = name => clips.find(c => c.name === name) || clips.find(c => c.name.toLowerCase().includes(name.toLowerCase()));
  const A = {};
  for (const [action, names] of Object.entries(map)) {
    const list = [].concat(names).map(byName).filter(Boolean);
    if (list.length) A[action] = list;
  }
  return A;
}

export const rand = (a, b) => a + Math.random() * (b - a);
export const pick = list => list[Math.floor(Math.random() * list.length)];

export class Pet {
  static async create(world, data, entry) {
    return new Pet(world, data, entry, await load(entry.file));
  }

  constructor(world, data, entry, gltf) {
    Object.assign(this, { world, data, entry, kind: entry.kind });
    this.brain = world.gallery ? brains.gallery : brains[entry.kind];
    this.flyer = entry.kind === 'bird';
    this.sounds = entry.sounds || SOUNDS[entry.kind];

    const model = cloneSkinned(gltf.scene);
    const hide = [];
    model.traverse(o => {
      if (!o.isMesh) return;
      if (entry.hide?.includes(o.name)) hide.push(o);  // helper meshes some models ship with (ground planes, cubes)
      o.castShadow = true;
      o.frustumCulled = false;
    });
    hide.forEach(o => o.removeFromParent());
    this.A = resolveClips(gltf.animations, entry.anims || { idle: 'idle', walk: 'walk', run: 'run', fly: 'fly', sit: 'sit', eat: 'eat', jump: 'jump' });
    if (!this.A.idle) this.A.idle = gltf.animations.slice(0, 1);
    if (this.flyer) for (const k of ['fly', 'hover', 'takeoff', 'land', 'idle']) (this.A[k] || []).forEach(c => pinRoot(c, model));

    // Measure in the first walk (or fly/idle) frame from skinned vertices: bind poses and single-frame pose clips can be far off.
    const pose = new THREE.AnimationMixer(model);
    const measureClip = (this.A.walk || this.A.fly || this.A.idle)[0];
    if (measureClip) { pose.clipAction(measureClip).play(); pose.setTime(0); }
    model.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(model, true);
    pose.stopAllAction();
    pose.uncacheRoot(model);
    const c = box.getCenter(new THREE.Vector3());
    model.position.set(-c.x, -box.min.y, -c.z);  // feet on the ground, centred
    const inner = new THREE.Group();
    inner.rotation.y = entry.yaw || 0;
    inner.add(model);
    this.root = new THREE.Group();
    this.root.add(inner);
    world.scene.add(this.root);
    this.baseScale = (entry.height || 140) / (box.max.y - box.min.y);
    this.localBox = box.clone().translate(model.position).applyMatrix4(inner.matrix.compose(inner.position, inner.quaternion, inner.scale));

    this.mixer = new THREE.AnimationMixer(model);
    this.applySize();
    this.speeds = {};
    for (const g of GAITS) if (this.A[g]) this.speeds[g] = this.strideSpeed(this.A[g][0]) ?? FALLBACK_SPEED[g];

    this.x = rand(world.edgeL + 200, world.edgeR - 200);
    this.y = world.groundAt(this.x) + (this.flyer && entry.hover ? 200 : 0);
    this.vy = 0;
    this.dir = Math.random() < 0.5 ? 1 : -1;
    this.queue = [];
    this.step = null;
    this.current = null;
    this.rect = { x0: 0, y0: 0, x1: 0, y1: 0 };
    this.clicks = [];
    this.rub = 0;
    this.zzzT = 0;
    this.vx = 0;
    this.tilt = this.tiltVel = this.squash = this.handVx = 0;
    this.root.rotation.order = 'ZYX';
  }

  get size() { return this.data.size || 1; }
  applySize() { this.root.scale.setScalar(this.baseScale * this.size); }
  get height() { return (this.entry.height || 140) * this.size; }
  has(action) { return !!this.A[action]; }
  get ground() { return this.world.groundAt(this.x); }
  get airborne() { return this.y > this.ground + 0.5; }
  get onGround() { return !this.airborne; }

  // Ground speed that matches a gait, so paws don't slide: a bone near the ground sweeps one stride per cycle.
  strideSpeed(clip) {
    const bones = [];
    this.root.traverse(o => { if (o.isBone) bones.push(o); });
    if (!bones.length || !clip.duration) return null;
    const m = new THREE.AnimationMixer(this.mixer.getRoot()), v = new THREE.Vector3();
    m.clipAction(clip).play();
    const lo = bones.map(() => new THREE.Vector3(Infinity, Infinity, Infinity));
    const hi = bones.map(() => new THREE.Vector3(-Infinity, -Infinity, -Infinity));
    for (let i = 0; i <= 40; i++) {
      m.setTime(clip.duration * i / 40);
      this.root.updateMatrixWorld(true);
      bones.forEach((b, k) => { b.getWorldPosition(v); lo[k].min(v); hi[k].max(v); });
    }
    m.stopAllAction();
    m.uncacheRoot(this.mixer.getRoot());
    const ground = Math.min(...lo.map(l => l.y)) + 0.15 * this.height;
    const sweep = k => (lo[k].y < ground ? Math.max(hi[k].x - lo[k].x, hi[k].z - lo[k].z) : 0);
    const best = Math.max(...bones.map((_, k) => sweep(k)));
    return best ? best / this.size / clip.duration : null;  // px/s at size 1
  }

  play(action, { once = false, speed = 1, fade = 0.3 } = {}) {
    const clip = pick(this.A[action] || this.A.idle);
    const a = this.mixer.clipAction(clip);
    a.timeScale = speed;
    if (a === this.current && !once) return clip.duration;
    a.reset().setLoop(once ? THREE.LoopOnce : THREE.LoopRepeat, Infinity);
    a.clampWhenFinished = once;
    a.fadeIn(fade).play();
    if (this.current && this.current !== a) this.current.fadeOut(fade);
    this.current = a;
    return clip.duration / (speed || 1);
  }

  // --- step queue ---
  // A step: { a: action, alt, once, t: seconds, to: x | {x,y} | fn, fly, push: px/s forward, front, face: 'cursor',
  //           until: fn, fn: callback, say, hearts, zzz }
  do(steps) { this.queue = steps.slice(); this.step = null; }
  andThen(steps) { this.queue.push(...steps); }

  startStep(s) {
    if (s.fn) s.fn(this);
    if (s.say) this.say(s.say);
    if (s.hearts) this.hearts(s.hearts);
    if (s.face) this.faceTo(s.face);
    s.left = s.t ?? Infinity;
    if (!s.a) { s.done = s.t === undefined; return; }
    const a = [s.a, ...[].concat(s.alt || [])].find(x => this.has(x)) || null;
    const moving = s.to !== undefined;
    if (!a && (s.once || (moving && !s.fly))) { s.done = true; return; }  // can't do it: skip rather than slide
    s.action = a || 'idle';
    const dur = this.play(s.action, { once: s.once, speed: s.speed });
    if (s.once) s.left = Math.min(s.left, Math.max(dur - 0.15, 0.05));
  }

  nextStep() {
    for (let guard = 0; guard < 20; guard++) {
      if (!this.queue.length) this.brain.next(this);
      const s = this.queue.shift();
      if (!s) return null;
      this.startStep(s);
      if (!s.done) return s;
    }
    return null;
  }

  runStep(dt) {
    if (!this.step || this.step.done) this.step = this.nextStep();
    const s = this.step;
    if (!s) return;
    s.left -= dt;
    if (s.to !== undefined && this.moveToward(s, dt) && !s.follow) s.done = true;  // follow: keep tracking until t/until
    if (s.push) this.x += this.dir * s.push * this.size * dt;
    if (s.face && !s.to) this.faceTo(s.face);
    if (s.zzz && (this.zzzT -= dt) < 0) { this.zzzT = 1.3; this.world.fx('zzz', 'z', this, 25 * this.dir); }
    if (s.until?.(this) || s.left <= 0) s.done = true;
  }

  moveToward(s, dt) {
    const raw = typeof s.to === 'function' ? s.to(this) : s.to;
    if (raw == null) return true;
    if (s.fly) {
      const tx = this.clampX(raw.x), ty = Math.max(this.world.groundAt(tx), raw.y);
      const dx = tx - this.x, dy = ty - this.y, d = Math.hypot(dx, dy);
      const stepLen = (s.speed2 || FLY_SPEED) * this.size * dt;
      if (Math.abs(dx) > 2) this.dir = Math.sign(dx);
      if (d <= stepLen) { this.x = tx; this.y = ty; return true; }
      this.x += dx / d * stepLen;
      this.y += dy / d * stepLen;
      return false;
    }
    // A plain number target (a wander) may lie past the outer edge: the pet walks off and comes back in on the
    // far side. Targets that follow something (cursor, another pet, food) stay on screen.
    const wander = typeof raw === 'number';
    const tx = wander ? raw : this.clampX(typeof raw === 'object' ? raw.x : raw);
    const dx = tx - this.x;
    const stepLen = (this.speeds[s.action] ?? FALLBACK_SPEED[s.action] ?? 80) * (s.speedMul || 1) * this.size * dt;
    if (Math.abs(dx) <= Math.max(stepLen, s.near || 0)) { if (!s.near) this.x = tx; return true; }
    this.dir = Math.sign(dx);
    this.x += this.dir * stepLen;
    if (wander) {
      const shift = this.wrap();
      if (shift && typeof s.to === 'number') s.to += shift;
    }
    return false;
  }

  // Fully off one outer edge -> reappear just off the other one, as if the screens were a loop. Returns the shift.
  wrap() {
    const b = this.localBox, half = 0.5 * Math.max(b.max.x - b.min.x, b.max.z - b.min.z) * this.baseScale * this.size + 10;
    const { edgeL, edgeR } = this.world, span = edgeR - edgeL + 2 * half;
    if (this.x > edgeR + half) { this.x -= span; return -span; }
    if (this.x < edgeL - half) { this.x += span; return span; }
    return 0;
  }
  clampX(x) {
    const half = 0.6 * this.height;
    return THREE.MathUtils.clamp(x, this.world.edgeL + half, this.world.edgeR - half);
  }
  randomX(min = 150, max = 700) {  // may be off screen: see wrap()
    return this.x + (Math.random() < 0.5 ? -1 : 1) * rand(min, max);
  }
  skyPoint() {
    const x = this.clampX(rand(this.world.edgeL, this.world.edgeR)), g = this.world.groundAt(x);
    return { x, y: rand(g + 150, Math.max(g + 160, this.world.topAt(x) - 120)) };
  }
  faceCursor() { this.faceTo('cursor'); }
  faceTo(f) {  // 'cursor' or another pet
    const dx = (f === 'cursor' ? this.world.cursor.x : f.x) - this.x;
    if (Math.abs(dx) > 20) this.dir = Math.sign(dx);
  }
  react(event, from) { if (!this.held && !this.world.gallery) this.brain.react?.(this, event, from); }
  cursorDist() { return Math.hypot(this.world.cursor.x - this.x, this.world.cursor.y - this.y); }
  get sleeping() { return !!this.step?.zzz; }

  say(text) { this.world.fx('bubble', text, this); }
  hearts(n) { for (let i = 0; i < n; i++) setTimeout(() => this.world.fx('heart', '♥', this, rand(-25, 25)), i * 180); }
  sound() { return pick(this.sounds); }

  // --- interaction entry points, called by renderer.js ---
  click() {
    const now = performance.now();
    this.clicks = this.clicks.filter(t => now - t < 3000).concat(now);
    this.brain.click(this, this.clicks.length);
  }
  stroke(dx) {
    this.rub += Math.abs(dx);
    if (this.rub > 500) { this.rub = 0; this.brain.stroke(this); }
  }
  // --- being carried: hangs from the grab point and swings like a pendulum; released with the hand's momentum ---
  grab() {
    this.held = true;
    this.queue = [];
    this.step = null;
    this.tiltVel += (Math.random() - 0.5) * 2;  // a startled wriggle
    this.say(pick(this.entry.grabSounds || GRAB_SOUNDS[this.kind]));
  }
  holdAt(cx, cy, ox, oy, vx) {  // cursor position, grab offset from the feet, hand speed (px/s)
    this.hold = { cx, cy, ox, oy };
    this.handVx = vx;
  }
  release(vx = 0, vy = 0) {
    this.held = false;
    this.hold = null;
    this.vx = this.flyer ? 0 : THREE.MathUtils.clamp(vx, -1400, 1400);
    this.vy = this.flyer ? 0 : THREE.MathUtils.clamp(vy, -600, 1400);
    this.brain.release(this);
  }

  update(dt) {
    // Walking onto a neighbouring screen whose floor is a little higher or lower: just step.
    if (!this.flyer && !this.held && this.vy === 0 && Math.abs(this.y - this.ground) < 30) this.y = this.ground;
    let tiltTarget = 0;
    if (this.held) {
      this.play(this.flyer && this.has('fly') ? 'fly' : this.has('held') ? 'held' : 'idle', { fade: 0.2 });
      this.handVx *= Math.exp(-6 * dt);  // the hand stopped moving -> the swing settles
      tiltTarget = THREE.MathUtils.clamp(-this.handVx * 0.0007, -0.7, 0.7);
      if (this.hold) {  // feet = grab point minus the grab offset, rotated by the swing
        const { cx, cy, ox, oy } = this.hold, c = Math.cos(this.tilt), s = Math.sin(this.tilt);
        this.x = cx - (ox * c - oy * s);
        this.y = Math.max(this.ground, cy - (ox * s + oy * c));
      }
    } else if (!this.flyer && (this.airborne || this.vy > 0)) {  // falling or tossed
      this.play(this.has('fall') ? 'fall' : this.has('held') ? 'held' : 'idle', { fade: 0.15 });
      this.vy -= GRAVITY * dt;
      this.x += this.vx * dt;
      const cx = this.clampX(this.x);
      if (cx !== this.x) { this.x = cx; this.vx *= -0.4; }  // bump off the outer screen edges
      tiltTarget = THREE.MathUtils.clamp(-this.vx * 0.0003, -0.3, 0.3);
      const g = this.ground;
      this.y = Math.max(g, this.y + this.vy * dt);
      if (this.y === g) {
        const impact = -this.vy;
        this.vy = this.vx = 0;
        this.squash = Math.min(0.2, impact / 6000);  // weight: a brief squash on landing
        this.brain.landed?.(this, impact);
      }
    } else {
      this.brain.tick?.(this, dt);
      this.runStep(dt);
    }
    this.rub *= 0.98;
    this.mixer.update(dt);

    // swing spring (overshoots a little, then settles) and landing squash
    this.tiltVel += ((tiltTarget - this.tilt) * 60 - this.tiltVel * 7) * dt;
    this.tilt += this.tiltVel * dt;
    this.squash *= Math.exp(-9 * dt);
    const s = this.baseScale * this.size;
    this.root.scale.set(s * (1 + this.squash * 0.5), s * (1 - this.squash), s * (1 + this.squash * 0.5));

    const bob = this.flyer && this.airborne && this.step?.action === 'hover' ? Math.sin(performance.now() / 400) * 6 : 0;
    this.root.position.set(this.x, this.y + bob, 0);
    this.root.rotation.z = this.tilt;  // order ZYX: the swing tilts in the screen plane, after facing
    const front = this.step?.front;
    const target = front ? 0 : this.dir > 0 ? Math.PI / 2 - FACE_CAMERA : -Math.PI / 2 + FACE_CAMERA;
    this.root.rotation.y += (target - this.root.rotation.y) * Math.min(1, dt * 6);
    this.root.updateMatrixWorld();

    const b = this.localBox.clone().applyMatrix4(this.root.matrixWorld);
    const xs = [], ys = [];
    for (const x of [b.min.x, b.max.x]) for (const y of [b.min.y, b.max.y]) for (const z of [b.min.z, b.max.z]) {
      const p = this.world.toScreen(new THREE.Vector3(x, y, z));
      xs.push(p.x); ys.push(p.y);
    }
    this.rect = { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) };
  }

  dispose() {
    this.world.scene.remove(this.root);
    this.mixer.stopAllAction();
  }
}
