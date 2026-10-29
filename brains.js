// Characters: each animal type decides what to do next and how it reacts. Steps are run by pet.js.
import { rand, pick } from './pet.js';

function choose(options) {
  let r = Math.random() * options.reduce((s, [w]) => s + w, 0);
  for (const [w, f] of options) if ((r -= w) <= 0) return f();
}
const sideOf = (p, x) => (p.x < x ? -1 : 1);  // which side of x the pet is on, kept fixed while it approaches

// --- Pets noticing each other ---
// Each pet rests 15-35 s between interactions so they don't pester each other non-stop.
const ready = p => performance.now() > (p.socialAt || 0);
const rest = (...ps) => { for (const p of ps) p.socialAt = performance.now() + rand(15, 35) * 1000; };
// Nearest other pet of a kind (any kind if null) within maxDist px horizontally.
const nearest = (p, kind, maxDist, ok = () => true) => p.world.pets
  .filter(q => q !== p && !q.held && (!kind || q.kind === kind) && Math.abs(q.x - p.x) < maxDist && ok(q))
  .sort((a, b) => Math.abs(a.x - p.x) - Math.abs(b.x - p.x))[0];
const gap = (p, q) => 0.45 * (p.height + q.height);  // comfortable distance between two pets
const awayFrom = (p, q, dist) => p.clampX(p.x + sideOf(p, q.x) * dist);

const sitSeq = (t, fidget) => [
  { a: 'sitDown', once: true },
  { a: 'sit', alt: 'idle', t },
  ...(fidget ? [{ a: 'sitFidget', once: true }, { a: 'sit', alt: 'idle', t: rand(2, 5) }] : []),
  { a: 'standUp', once: true },
];
const napSeq = t => [
  { a: 'lieDown', once: true },
  { a: 'lie', alt: ['sleep', 'sit'], t: rand(3, 6) },
  { a: 'lieFidget', once: true },
  { a: 'sleep', alt: ['lie', 'sit', 'idle'], t, zzz: true },
  { a: 'getUp', once: true },
];
const eatTreat = (p, treat, gait = 'trot') => [
  { a: gait, alt: ['trot', 'walk'], to: () => treat.x, near: 0.4 * p.height, until: () => treat.eaten },
  { a: 'eat', alt: ['sniff', 'groom', 'idle'], t: 3.5, until: () => treat.eaten, fn: q => q.world.claim(treat, q) },
  { fn: q => q.world.eat(treat, q), say: 'Yum!', hearts: 4 },
];
const comeTo = (p, gait) => {
  const side = sideOf(p, p.world.cursor.x);
  return [
    { a: gait, alt: ['trot', 'run', 'walk'], to: q => q.world.cursor.x + side * 0.7 * q.height, near: 15 },
    { a: 'sitDown', once: true },
    { a: 'sit', alt: 'idle', t: rand(3, 6), front: true },
    { a: 'standUp', once: true },
  ];
};

// --- Cat: independent, naps a lot, grooms, hunts your cursor, purrs, hisses when poked too much ---
const cat = {
  next(p) {
    const w = p.world;
    if (ready(p) && Math.random() < 0.4) {
      const prey = nearest(p, 'bird', 900, q => q.onGround && !q.entry.hover);
      if (prey) {  // stalk the bird; it notices at the last moment and flies off
        rest(p);
        const side = sideOf(p, prey.x);
        return p.do([
          { a: 'crouch', alt: 'look', t: 0.8, face: prey },
          { a: 'sneak', alt: 'walk', to: () => prey.x + side * 0.8 * p.height, near: 10, until: () => prey.airborne },
          { a: 'crouch', alt: 'idle', t: rand(0.3, 1), face: prey, until: () => prey.airborne },
          { a: 'pounce', alt: 'jump', once: true, push: 250 },
          { a: 'look', alt: 'idle', t: 2, face: prey, say: '...' },
        ]);
      }
      const friend = nearest(p, 'cat', 900, q => q.onGround && ready(q) && !q.sleeping);
      if (friend) {
        rest(p, friend);
        const side = sideOf(p, friend.x);
        if (Math.random() < 0.3) {  // not in the mood for company
          return p.do([{ a: 'walk', to: () => friend.x + side * 2 * gap(p, friend), near: 10 },
                       { a: 'hiss', alt: 'swat', once: true, face: friend, say: 'Hss!', fn: () => friend.react('hissed', p) },
                       { a: 'idle', t: 1.5, face: friend }]);
        }
        return p.do([{ a: 'walk', to: () => friend.x + side * gap(p, friend), near: 10 },
                     { face: friend, say: 'Mrrp', fn: () => friend.react('greet', p), hearts: 1 },
                     ...sitSeq(rand(6, 12))]);
      }
    }
    if (w.cursor.y - w.groundAt(w.cursor.x) < 250 && Math.abs(w.cursor.x - p.x) < 600 && w.cursorStill < 3 && Math.random() < 0.3) {
      const side = sideOf(p, w.cursor.x);
      return p.do([  // stalk and pounce on the cursor
        { a: 'crouch', alt: 'look', t: 0.8, face: 'cursor' },
        { a: 'sneak', alt: 'walk', to: q => q.world.cursor.x + side * 0.9 * q.height, near: 10 },
        { a: 'crouch', alt: 'idle', t: rand(0.5, 1.5), face: 'cursor' },
        { a: 'pounce', alt: 'jump', once: true, push: 250 },
        { a: 'attack', once: true, push: 100 },
        { a: 'idle', t: 1.5 },
      ]);
    }
    choose([
      [25, () => p.do([{ a: 'walk', to: p.randomX() }])],
      [7, () => p.do([{ a: 'trot', alt: 'run', to: p.randomX(400, 900) }])],
      [15, () => p.do(sitSeq(rand(5, 14)))],
      [10, () => p.do([{ a: 'groom', alt: ['sit', 'idle'], t: rand(4, 8) }])],
      [16, () => p.do(napSeq(rand(12, 30)))],
      [10, () => p.do([{ a: 'look', alt: 'idle', t: rand(3, 6), front: true }])],
      [5, () => p.do([{ a: 'stretch', once: true }, { a: 'yawn', once: true }, { a: 'idle', t: 1 }])],
      [8, () => p.do([{ a: 'idle', t: rand(2, 5) }])],
    ]);
  },
  click(p, n) {
    const w = p.world;
    if (p.sleeping) return p.do([{ say: '!' }, { a: 'getUp', once: true }, { a: 'look', alt: 'idle', t: 2, front: true }]);
    if (n >= 5) {
      p.clicks = [];
      return p.do([
        { a: 'hiss', alt: 'swat', once: true, say: 'Hsss!', face: 'cursor' },
        { a: 'swat', once: true, face: 'cursor' },
        { a: 'trot', alt: 'walk', to: p.clampX(p.x - Math.sign(w.cursor.x - p.x) * 500) },
      ]);
    }
    if (Math.random() < 0.25) return p.do([{ a: 'look', alt: 'idle', t: 1.5, front: true, say: '...' }, { a: 'walk', to: p.randomX() }]);
    p.do([{ a: 'greet', alt: ['sit', 'idle'], t: 2.5, front: true, say: p.sound(), hearts: 3 }]);
  },
  stroke(p) { p.do([{ a: 'sit', alt: 'idle', t: 3, front: true, say: 'Purrr...', hearts: 2 }]); },
  release() {},
  landed(p, impact) {  // always on its feet: absorb the landing, shake it off, then act like it meant to do that
    if (impact < 450) return p.do([{ a: 'idle', t: 0.6 }]);
    p.do([{ a: 'land', alt: 'crouch', once: p.has('land'), t: p.has('land') ? undefined : 0.4 },
          { a: 'shake', once: true },
          { a: 'look', alt: 'idle', t: 1.2, front: true, say: impact > 1500 ? 'Mrrow!' : undefined },
          { a: 'groom', alt: 'idle', t: rand(2, 4) }]);
  },
  feed(p, treat) { p.do([...eatTreat(p, treat, 'walk'), { a: 'groom', alt: 'idle', t: 4 }]); },
  come(p) {
    if (Math.random() < 0.4) return p.do([{ a: 'look', alt: 'idle', t: 2, front: true, say: '...' }]);  // cats come when they want
    p.do(comeTo(p, 'walk'));
  },
  nap(p) { p.do(napSeq(rand(20, 40))); },
  react(p, ev, from) {
    if (ev === 'chased') {
      const escape = awayFrom(p, from, rand(600, 1000));
      // Big cats, cornered cats and some brave ones stand their ground; the rest bolt and act like nothing happened.
      if (p.height > from.height * 1.1 || Math.abs(escape - p.x) < 250 || Math.random() < 0.3) {
        return p.do([{ say: p.sleeping ? '!' : 'Hsss!', a: 'hiss', alt: 'swat', once: true, face: from },
                     { a: 'swat', once: true, face: from, fn: () => from.react('scared', p) },
                     { a: 'look', alt: 'idle', t: 2, face: from }]);
      }
      return p.do([{ say: '!', a: 'run', alt: ['trot', 'walk'], to: escape },
                   { a: 'look', alt: 'idle', t: 1.5, face: from },
                   { a: 'groom', alt: ['sit', 'idle'], t: rand(3, 6) }]);
    }
    if (ev === 'greet') return p.do([{ a: 'look', alt: 'idle', t: 1, face: from, say: 'Mrrp?', hearts: 1 }, ...sitSeq(rand(6, 12))]);
    if (ev === 'hissed') return p.do([{ a: 'look', alt: 'idle', t: 1, face: from, say: '!' }, { a: 'walk', to: awayFrom(p, from, rand(400, 700)) }]);
  },
};

// --- Dog: loyal and energetic, follows you, greets you, does tricks, fetches ---
const dog = {
  next(p) {
    const w = p.world;
    if (w.cursorStill > 40 && Math.random() < 0.5) return p.do(napSeq(rand(20, 40)));  // you're away: nap
    if (ready(p) && Math.random() < 0.5) {
      const target = nearest(p, 'cat', 800, q => q.onGround) || nearest(p, 'bird', 700, q => q.onGround && !q.entry.hover);
      if (target && (target.kind === 'bird' || Math.random() < 0.6)) {  // chase!
        rest(p, target);
        if (target.kind === 'cat') target.react('chased', p);  // birds notice by themselves
        return p.do([{ a: 'bark', once: true, face: target, say: 'Woof! Woof!' },
                     { a: 'run', alt: ['trot', 'walk'], to: () => target.x, near: gap(p, target), t: 6, until: () => target.held || target.airborne },
                     { a: 'bark', once: true, face: target, say: 'Woof!' },
                     { a: 'look', alt: 'idle', t: 1.5, face: target }]);
      }
      const pal = nearest(p, 'dog', 900, q => q.onGround && ready(q) && !q.sleeping);
      if (pal) {  // sniff hello, then zoomies together
        rest(p, pal);
        const side = sideOf(p, pal.x);
        return p.do([{ a: 'trot', alt: 'walk', to: () => pal.x + side * gap(p, pal), near: 10 },
                     { fn: () => pal.react('greet', p) },
                     { a: 'sniff', alt: 'look', t: 2.5, face: pal },
                     { a: 'bark', once: true, say: 'Woof!', hearts: 2 },
                     { a: 'run', alt: ['trot', 'walk'], to: p.randomX(500, 900) }]);
      }
    }
    const far = Math.abs(w.cursor.x - p.x) > 400 && w.cursorStill < 10;
    choose([
      [far ? 30 : 4, () => p.do(comeTo(p, 'trot'))],
      [18, () => p.do([{ a: 'walk', to: p.randomX() }])],
      [10, () => p.do([{ a: 'sniffWalk', alt: 'walk', to: p.randomX(150, 400) }, { a: 'sniff', alt: 'look', t: rand(2, 4) }])],
      [6, () => p.do([{ a: 'trot', alt: 'run', to: p.randomX(400, 900) }])],
      [14, () => p.do(sitSeq(rand(5, 12), true))],
      [10, () => p.do(napSeq(rand(8, 18)))],
      [4, () => p.do([{ a: 'dig', once: true }])],
      [4, () => p.do([{ a: 'shake', once: true }])],
      [4, () => p.do([{ a: 'bark', once: true, say: 'Woof!', face: 'cursor' }])],
      [8, () => p.do([{ a: 'look', alt: 'idle', t: rand(3, 6) }])],
    ]);
  },
  tick(p) {  // runs over to greet you when you come back
    const w = p.world;
    if (w.returnedAt > (p.greetedAt || 0)) {
      p.greetedAt = w.returnedAt;
      const [go] = comeTo(p, 'run');
      p.do([{ say: '!' }, go, { a: 'jump', once: true }, { a: 'bark', alt: 'idle', once: true, say: 'Woof! Woof!', hearts: 4, front: true }]);
    }
  },
  click(p) {
    if (p.sleeping) return p.do([{ say: '!' }, { a: 'getUp', once: true }, { a: 'bark', once: true, say: 'Woof!' }]);
    const tricks = ['paw', 'rollover', 'playdead', 'jump', 'sit', 'bark', 'shake'].filter(t => p.has(t));
    const t = tricks[(p.trickN = (p.trickN ?? -1) + 1) % tricks.length];
    if (!t) return p.do([{ a: 'idle', t: 2, front: true, say: p.sound(), hearts: 3 }]);
    const once = t !== 'sit';
    p.do([{ a: t, once, t: once ? undefined : 2.5, front: true, say: t === 'bark' ? 'Woof!' : p.sound(), hearts: 3 }, { a: 'idle', t: 0.6, front: true }]);
  },
  stroke(p) {
    const petted = p.has('petted');
    p.do([{ a: 'petted', alt: ['sit', 'idle'], once: petted, t: petted ? undefined : 2.5, front: true, say: '*wags tail*', hearts: 3 }]);
  },
  release() {},
  landed(p, impact) {
    if (impact < 450) return p.do([{ a: 'idle', t: 0.5 }]);
    p.do([{ a: 'land', alt: 'crouch', once: p.has('land'), t: p.has('land') ? undefined : 0.35, say: impact > 1500 ? 'Oof!' : undefined },
          { a: 'shake', once: true },
          { a: 'look', alt: 'idle', t: 0.8, face: 'cursor' },
          ...(impact > 1500 ? [] : [{ a: 'bark', alt: 'idle', once: true, say: 'Woof!', face: 'cursor' }])]);  // again!
  },
  feed(p, treat) { p.do([...eatTreat(p, treat, 'run'), { a: 'sit', alt: 'idle', t: 2, front: true }]); },
  come(p) { p.do(comeTo(p, 'run')); },
  nap(p) { p.do(napSeq(rand(20, 40))); },
  react(p, ev, from) {
    if (ev === 'scared') {  // the cat fought back
      return p.do([{ say: 'Yelp!', a: 'run', alt: ['trot', 'walk'], to: awayFrom(p, from, rand(500, 800)) },
                   { a: 'look', alt: 'idle', t: 2, face: from }]);
    }
    if (ev === 'greet') {  // sniff back, then chase after the friend's zoomies
      return p.do([{ a: 'look', alt: 'idle', t: 0.6, face: from, say: 'Woof?' },
                   { a: 'sniff', alt: 'look', t: 2.5, face: from },
                   { a: 'idle', t: 0.8, face: from, hearts: 2 },
                   { a: 'run', alt: ['trot', 'walk'], to: () => from.x - from.dir * gap(p, from), near: 10, t: 6 }]);
    }
  },
  fetch(p, ball) {
    const side = sideOf(p, p.world.cursor.x);
    p.do([
      { say: '!' },
      { a: 'run', alt: ['trot', 'walk'], to: () => ball.x, near: 0.35 * p.height, until: () => ball.carrier && ball.carrier !== p },
      { a: 'pickup', alt: 'sniff', once: true, until: () => ball.carrier && ball.carrier !== p },
      { fn: q => q.world.carry(ball, q) },
      { a: 'trotCarry', alt: ['trot', 'walk'], to: q => q.world.cursor.x + side * 0.8 * q.height, near: 20 },
      { a: 'drop', once: true },
      { fn: q => q.world.drop(ball), say: 'Woof!', hearts: 3 },
      { a: 'sit', alt: 'idle', t: 3, front: true },
    ]);
  },
};

// --- Bird: flies around, lands on the taskbar or your cursor, hops, pecks, chirps, startles easily ---
const takeoff = p => [
  { a: 'takeoff', alt: 'fly', fly: true, to: { x: p.x + p.dir * 80, y: p.ground + 140 } },
  { a: 'fly', fly: true, to: p.skyPoint() },
];
const land = (p, pt) => [
  { a: 'fly', fly: true, to: q => { const t = typeof pt === 'function' ? pt(q) : pt; return { x: t.x, y: Math.max(t.y, q.world.groundAt(t.x)) + 60 }; } },
  { a: 'land', alt: 'fly', fly: true, to: pt, speed2: 90 },
];
const cursorPt = q => ({ x: q.world.cursor.x, y: q.world.cursor.y });
const bird = {
  next(p) {
    const w = p.world, hover = p.entry.hover;
    if (p.airborne || hover) {
      if (ready(p) && !hover && Math.random() < 0.35) {
        const host = nearest(p, null, 2500, q => q.kind !== 'bird' && q.sleeping);
        if (host) {  // perch on a sleeping pet's back until it wakes up
          rest(p);
          const back = () => ({ x: host.x, y: host.y + 0.55 * host.height });
          return p.do([...land(p, back), { a: 'idle', t: 40, to: back, fly: true, follow: true, say: p.sound(), until: () => !host.sleeping || host.held },
                       { a: 'fly', fly: true, to: p.skyPoint() }]);
        }
        const leader = nearest(p, 'bird', 2500, q => q.airborne && !q.entry.hover);
        if (leader) {  // fly along with another bird for a while
          rest(p);
          return p.do([{ a: 'fly', fly: true, follow: true, t: rand(4, 8), to: () => ({ x: leader.x - leader.dir * 70, y: leader.y + 25 }), until: () => !leader.airborne }]);
        }
      }
      if (!hover && Math.random() < 0.45) return p.do([...land(p, { x: p.randomX(100, 700), y: 0 }), { a: 'idle', t: rand(1, 3) }]);
      if (w.cursorStill > 2 && w.cursorStill < 30 && Math.random() < 0.3) return bird.come(p);
      return p.do([{ a: 'fly', fly: true, to: hover ? { ...p.skyPoint(), y: rand(80, 400) } : p.skyPoint() },
                   { a: 'hover', alt: hover ? 'idle' : 'fly', t: rand(1, 4) }]);
    }
    const friend = ready(p) && nearest(p, 'bird', 500, q => q.onGround && ready(q));
    if (friend && Math.random() < 0.5) {  // chirp at each other
      rest(p, friend);
      return p.do([{ a: 'call', alt: 'look', once: true, t: 1.5, face: friend, say: p.sound(), fn: () => friend.react('chirp', p) },
                   { a: 'look', alt: 'idle', t: 2, face: friend }]);
    }
    choose([
      [20, () => p.do([{ a: 'walk', alt: 'jump', to: p.randomX(40, 160) }])],
      [20, () => p.do([{ a: 'eat', alt: 'look', t: rand(2, 4) }])],
      [12, () => p.do([{ a: 'call', alt: 'look', once: true, say: p.sound() }])],
      [18, () => p.do([{ a: 'idle', t: rand(2, 5) }, { a: 'look', alt: 'idle', t: rand(1, 3) }])],
      [25, () => p.do(takeoff(p))],
    ]);
  },
  tick(p) {  // a fast mouse, or a cat or dog coming at it, startles it
    const w = p.world, now = performance.now();
    if (now < (p.calmAt || 0)) return;
    const low = p.y - p.ground < 120;
    const predator = low && nearest(p, null, 0.9 * p.height + 150,
                                    q => q.kind !== 'bird' && q.onGround && q.step?.to !== undefined && !q.held);
    if ((w.cursorSpeed > 1800 && p.cursorDist() < 250) || predator) {
      p.calmAt = now + 4000;
      p.do([{ a: 'scared', alt: 'fly', t: 0.3, say: 'Eek!' }, ...(p.onGround ? takeoff(p) : [{ a: 'fly', fly: true, to: p.skyPoint() }])]);
    }
  },
  react(p, ev, from) {
    if (ev === 'chirp' && p.onGround) p.do([{ a: 'look', alt: 'idle', t: 0.8, face: from }, { a: 'call', alt: 'look', once: true, t: 1.5, face: from, say: p.sound() }]);
  },
  click(p) {
    p.do([{ a: 'clicked', alt: ['call', 'idle'], once: p.has('clicked') || p.has('call'), t: 1.5, say: p.sound(), hearts: 2 }]);
    if (Math.random() < 0.4 && !p.entry.hover) p.andThen(p.onGround ? takeoff(p) : [{ a: 'fly', fly: true, to: p.skyPoint() }]);
  },
  stroke(p) { p.do([{ a: 'idle', t: 2.5, front: true, say: 'Chirp~', hearts: 3 }]); },
  release(p) { p.do([{ a: 'fly', fly: true, to: p.skyPoint() }]); },
  feed(p, treat) {
    const pt = () => ({ x: treat.x, y: 0 });
    p.do([...(p.airborne ? land(p, pt) : [{ a: 'walk', alt: 'jump', to: () => treat.x, near: 0.5 * p.height }]),
          { a: 'eat', alt: 'look', t: 3, until: () => treat.eaten, fn: q => q.world.claim(treat, q) },
          { fn: q => q.world.eat(treat, q), say: 'Yum!', hearts: 3 }]);
  },
  come(p) {  // land on the cursor and stay until it moves
    p.do([
      ...(p.onGround ? [{ a: 'takeoff', alt: 'fly', fly: true, to: { x: p.x, y: p.ground + 100 } }] : []),
      ...land(p, cursorPt),
      { a: 'idle', t: 30, front: true, say: p.sound(), until: q => q.world.cursorStill < 0.2 },
      { a: 'fly', fly: true, to: p.skyPoint() },
    ]);
  },
  nap(p) { p.do([...(p.airborne && !p.entry.hover ? land(p, { x: p.x, y: 0 }) : []), { a: 'idle', t: rand(20, 40), zzz: true, speed: 0.4 }]); },
};

// --- Calibration view (--gallery): every pet walks or flies in place, facing right ---
const gallery = {
  next(p) { p.do([{ a: p.flyer ? 'fly' : 'walk', alt: 'idle', t: 1e9 }]); },
  click() {}, stroke() {}, release() {},
};

export const brains = { cat, dog, bird, gallery };
