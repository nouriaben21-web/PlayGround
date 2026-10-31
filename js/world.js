// Sunset City — procedural city world
// Original code and art. No game assets are copied from any commercial title.

export const CELL = 560;
export const ROAD_HALF = 58;
export const GRID = 8;
export const WORLD = CELL * GRID;
export const SIDEWALK = 22;
export const LANE = 26;

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function shade(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  const r = clamp(((n >> 16) & 255) + amt, 0, 255);
  const g = clamp(((n >> 8) & 255) + amt, 0, 255);
  const b = clamp((n & 255) + amt, 0, 255);
  return `rgb(${r},${g},${b})`;
}

export function roundRect(ctx, x, y, w, h, r) {
  const rr = Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

const BUILDING_COLORS = [
  '#b07a5e', '#8d9db0', '#c4a484', '#9a7f70', '#7f9a86',
  '#b98a6a', '#a8a29a', '#8b7d9a', '#c99a6a', '#7e8c99',
  '#b96a5a', '#a9a08c', '#c2a189', '#8d8a80', '#a58872',
];

export class City {
  constructor(seed = 20131) {
    this.rng = mulberry32(seed);
    this.blocks = [];
    this.buildings = [];
    this.trees = [];
    this.streetTrees = [];
    this.lamps = [];
    this.manholes = [];
    this.spots = [];
    this.buckets = new Map();
    this.generate();
  }

  bucketKey(i, j) { return i + ',' + j; }

  generate() {
    const rng = this.rng;
    for (let j = 0; j < GRID; j++) {
      for (let i = 0; i < GRID; i++) {
        const x0 = i * CELL + ROAD_HALF;
        const y0 = j * CELL + ROAD_HALF;
        const w = CELL - ROAD_HALF * 2;
        const roll = rng();
        const type = roll < 0.1 ? 'park' : roll < 0.2 ? 'lot' : 'city';
        const inner = { x: x0 + SIDEWALK, y: y0 + SIDEWALK, w: w - SIDEWALK * 2, h: w - SIDEWALK * 2 };
        const block = { i, j, x: x0, y: y0, w, h: w, type, inner };
        this.blocks.push(block);

        if (type === 'park') this.addPark(block);
        else if (type === 'lot') this.addLot(block);
        else this.addBuildings(block);
        if (type !== 'park') this.addStreetProps(block);
      }
    }

    // Manhole covers scattered on the roads.
    for (let k = 0; k < 22; k++) {
      const vertical = rng() < 0.5;
      const road = Math.floor(rng() * (GRID + 1));
      const along = 90 + rng() * (WORLD - 180);
      this.manholes.push({
        x: vertical ? road * CELL + (rng() < 0.5 ? -LANE : LANE) : along,
        y: vertical ? along : road * CELL + (rng() < 0.5 ? -LANE : LANE),
        r: 4 + rng() * 2,
      });
    }
  }

  addStreetProps(block) {
    const rng = this.rng;
    this.lamps.push(
      { x: block.x + 12, y: block.y + 12 },
      { x: block.x + block.w - 12, y: block.y + block.h - 12 },
    );
    if (rng() < 0.8) {
      const side = Math.floor(rng() * 4);
      const t = 70 + rng() * (block.w - 140);
      let x;
      let y;
      if (side === 0) { x = block.x + t; y = block.y + 11; }
      else if (side === 1) { x = block.x + block.w - 11; y = block.y + t; }
      else if (side === 2) { x = block.x + t; y = block.y + block.h - 11; }
      else { x = block.x + 11; y = block.y + t; }
      this.streetTrees.push({ x, y, r: 7 + rng() * 5, tone: rng() });
    }
  }

  addPark(block) {
    const rng = this.rng;
    const { inner } = block;
    block.pond = rng() < 0.4
      ? { x: inner.x + 70 + rng() * (inner.w - 140), y: inner.y + 80 + rng() * (inner.h - 160), r: 28 + rng() * 18 }
      : null;
    const count = 7 + Math.floor(rng() * 6);
    for (let k = 0; k < count; k++) {
      const t = {
        x: inner.x + 24 + rng() * (inner.w - 48),
        y: inner.y + 24 + rng() * (inner.h - 48),
        r: 13 + rng() * 11,
        tone: rng(),
      };
      const cx = inner.x + inner.w / 2;
      const cy = inner.y + inner.h / 2;
      if (Math.abs(t.x - cx) < 34 || Math.abs(t.y - cy) < 34) continue;
      if (block.pond && Math.hypot(t.x - block.pond.x, t.y - block.pond.y) < block.pond.r + t.r + 8) continue;
      this.trees.push(t);
    }
  }

  addLot(block) {
    const rng = this.rng;
    const { inner } = block;
    const rows = 2;
    const cols = 4;
    const cw = inner.w / cols;
    const ch = inner.h / rows;
    block.stalls = [];
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const cx = inner.x + cw * (c + 0.5);
        const cy = inner.y + ch * (r + 0.5);
        const angle = r === 0 ? Math.PI / 2 : -Math.PI / 2;
        block.stalls.push({ x: cx, y: cy, angle });
        if (rng() < 0.55) this.spots.push({ x: cx, y: cy, angle });
      }
    }
  }

  addBuildings(block) {
    const rng = this.rng;
    const { inner } = block;
    const zone = { x: inner.x + 6, y: inner.y + 6, w: inner.w - 12, h: inner.h - 12 };
    const layouts = [
      [[0, 0, 1, 1]],
      [[0, 0, 1, 0.5], [0, 0.5, 1, 0.5]],
      [[0, 0, 0.5, 1], [0.5, 0, 0.5, 1]],
      [[0, 0, 0.5, 0.5], [0.5, 0, 0.5, 0.5], [0, 0.5, 0.5, 0.5], [0.5, 0.5, 0.5, 0.5]],
      [[0, 0, 1 / 3, 0.5], [1 / 3, 0, 1 / 3, 0.5], [2 / 3, 0, 1 / 3, 0.5],
        [0, 0.5, 3 / 4, 0.5], [0.75, 0.5, 0.25, 0.5]],
      [[0, 0, 0.5, 0.34], [0.5, 0, 0.5, 0.34], [0, 0.34, 0.5, 0.33],
        [0.5, 0.34, 0.5, 0.33], [0, 0.67, 0.5, 0.33], [0.5, 0.67, 0.5, 0.33]],
    ];
    const layout = layouts[Math.floor(rng() * layouts.length)];
    const gap = 14 + rng() * 10;

    for (const [lx, ly, lw, lh] of layout) {
      let x = zone.x + lx * zone.w;
      let y = zone.y + ly * zone.h;
      let w = lw * zone.w;
      let h = lh * zone.h;
      const padX = gap * (lx === 0 ? 0 : 0.5);
      const padY = gap * (ly === 0 ? 0 : 0.5);
      x += padX; y += padY;
      w -= padX + (lx + lw >= 0.999 ? 0 : gap * 0.5);
      h -= padY + (ly + lh >= 0.999 ? 0 : gap * 0.5);
      if (w < 54 || h < 54) continue;
      const shrink = 2 + rng() * 5;
      x += shrink; y += shrink; w -= shrink * 2; h -= shrink * 2;
      const stories = 1 + Math.floor(rng() * 5);
      const color = BUILDING_COLORS[Math.floor(rng() * BUILDING_COLORS.length)];
      const b = {
        x, y, w, h, stories, color,
        roof: shade(color, -34),
        edge: shade(color, 36),
        south: shade(color, -58),
        east: shade(color, -40),
        props: [],
        sign: null,
        lit: rng() < 0.55,
        helipad: rng() < 0.06 && w > 130 && h > 130,
        stain: rng(),
      };
      const propCount = 2 + Math.floor(rng() * 4);
      for (let p = 0; p < propCount; p++) {
        if (w < 90 || h < 90) break;
        const kindRoll = rng();
        b.props.push({
          x: x + 12 + rng() * (w - 56),
          y: y + 12 + rng() * (h - 56),
          w: 8 + rng() * 14,
          h: 6 + rng() * 11,
          kind: kindRoll < 0.22 ? 'tank' : kindRoll < 0.32 ? 'glass' : 'ac',
        });
      }
      if (rng() < 0.12 && w > 90) {
        b.sign = {
          color: rng() < 0.5 ? '#ff4d9d' : rng() < 0.5 ? '#34d6ff' : '#ffc857',
          x: x + 12,
          y: y + 6,
          w: 34 + rng() * 30,
        };
      }
      this.buildings.push(b);
      const key = this.bucketKey(block.i, block.j);
      if (!this.buckets.has(key)) this.buckets.set(key, []);
      this.buckets.get(key).push(b);
    }
  }

  buildingsNear(x, y) {
    const bi = Math.floor(x / CELL);
    const bj = Math.floor(y / CELL);
    let out = null;
    for (let j = bj - 1; j <= bj + 1; j++) {
      for (let i = bi - 1; i <= bi + 1; i++) {
        const arr = this.buckets.get(this.bucketKey(i, j));
        if (arr) out = out ? out.concat(arr) : arr;
      }
    }
    return out || [];
  }

  // Push a circle out of every building it overlaps. Returns corrected position.
  resolveCircle(x, y, r) {
    let hit = false;
    const list = this.buildingsNear(x, y);
    for (let k = 0; k < list.length; k++) {
      const b = list[k];
      const nx = clamp(x, b.x, b.x + b.w);
      const ny = clamp(y, b.y, b.y + b.h);
      let dx = x - nx;
      let dy = y - ny;
      const d2 = dx * dx + dy * dy;
      if (d2 >= r * r) continue;
      hit = true;
      if (d2 > 0.0001) {
        const d = Math.sqrt(d2);
        x = nx + (dx / d) * r;
        y = ny + (dy / d) * r;
      } else {
        const left = x - b.x;
        const right = b.x + b.w - x;
        const top = y - b.y;
        const bottom = b.y + b.h - y;
        const m = Math.min(left, right, top, bottom);
        if (m === left) x = b.x - r;
        else if (m === right) x = b.x + b.w + r;
        else if (m === top) y = b.y - r;
        else y = b.y + b.h + r;
      }
    }
    x = clamp(x, 16, WORLD - 16);
    y = clamp(y, 16, WORLD - 16);
    return { x, y, hit };
  }

  pointBlocked(x, y, r = 10) {
    const list = this.buildingsNear(x, y);
    for (let k = 0; k < list.length; k++) {
      const b = list[k];
      if (x > b.x - r && x < b.x + b.w + r && y > b.y - r && y < b.y + b.h + r) return true;
    }
    return false;
  }

  // A random point on a road (used for traffic, cops, deliveries).
  randomRoadPoint(rng = Math.random) {
    const vertical = rng() < 0.5;
    const road = Math.floor(rng() * (GRID + 1));
    const along = 80 + rng() * (WORLD - 160);
    const lane = (rng() < 0.5 ? -1 : 1) * LANE;
    const c = road * CELL;
    return vertical
      ? { x: c + lane, y: along, road, vertical }
      : { x: along, y: c + lane, road, vertical };
  }

  nearestSpot(x, y) {
    let best = null;
    let bd = Infinity;
    for (const s of this.spots) {
      const d = (s.x - x) ** 2 + (s.y - y) ** 2;
      if (d < bd) { bd = d; best = s; }
    }
    return best;
  }

  drawGround(ctx, view) {
    ctx.fillStyle = '#34363d';
    ctx.fillRect(view.x, view.y, view.w, view.h);

    const i0 = Math.max(0, Math.floor(view.x / CELL) - 1);
    const i1 = Math.min(GRID - 1, Math.floor((view.x + view.w) / CELL) + 1);
    const j0 = Math.max(0, Math.floor(view.y / CELL) - 1);
    const j1 = Math.min(GRID - 1, Math.floor((view.y + view.h) / CELL) + 1);

    for (const block of this.blocks) {
      if (block.i < i0 || block.i > i1 || block.j < j0 || block.j > j1) continue;
      this.drawBlock(ctx, block, view);
    }

    this.drawMarkings(ctx, view);
    this.drawStreetProps(ctx, view);
  }

  drawStreetProps(ctx, view) {
    for (const t of this.streetTrees) {
      if (t.x < view.x - 30 || t.x > view.x + view.w + 30) continue;
      if (t.y < view.y - 30 || t.y > view.y + view.h + 30) continue;
      this.drawTree(ctx, t, 0.85);
    }
    for (const l of this.lamps) {
      if (l.x < view.x - 50 || l.x > view.x + view.w + 50) continue;
      if (l.y < view.y - 50 || l.y > view.y + view.h + 50) continue;
      ctx.fillStyle = 'rgba(255,176,90,0.055)';
      ctx.beginPath();
      ctx.arc(l.x, l.y, 42, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,190,110,0.09)';
      ctx.beginPath();
      ctx.arc(l.x, l.y, 22, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(0,0,0,0.28)';
      ctx.beginPath();
      ctx.ellipse(l.x + 2, l.y + 3, 4.5, 3.5, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#2c2e35';
      ctx.beginPath();
      ctx.arc(l.x, l.y, 3.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#ffd7a0';
      ctx.beginPath();
      ctx.arc(l.x, l.y, 1.6, 0, Math.PI * 2);
      ctx.fill();
    }
    for (const m of this.manholes) {
      if (m.x < view.x - 20 || m.x > view.x + view.w + 20) continue;
      if (m.y < view.y - 20 || m.y > view.y + view.h + 20) continue;
      ctx.fillStyle = '#26282e';
      ctx.beginPath();
      ctx.arc(m.x, m.y, m.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(160,160,165,0.22)';
      ctx.lineWidth = 1;
      ctx.stroke();
    }
  }

  drawTree(ctx, t, scale = 1) {
    const r = t.r * scale;
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath();
    ctx.ellipse(t.x + 7, t.y + 8, r * 1.05, r * 0.9, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#3d6440';
    ctx.beginPath();
    ctx.arc(t.x, t.y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = t.tone > 0.5 ? '#568a55' : '#4e7d4f';
    ctx.beginPath();
    ctx.arc(t.x - r * 0.22, t.y - r * 0.22, r * 0.82, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(160,210,140,0.35)';
    ctx.beginPath();
    ctx.arc(t.x - r * 0.35, t.y - r * 0.35, r * 0.32, 0, Math.PI * 2);
    ctx.fill();
  }

  drawBlock(ctx, block, view) {
    const { x, y, w, h, inner } = block;
    // Sidewalk slab
    ctx.fillStyle = '#847e73';
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = '#736e64';
    ctx.fillRect(x + 3, y + 3, w - 6, h - 6);
    // Curb line
    ctx.strokeStyle = 'rgba(20,20,24,0.35)';
    ctx.lineWidth = 2;
    ctx.strokeRect(x + 1, y + 1, w - 2, h - 2);

    // Pavement joints along the footpath
    ctx.strokeStyle = 'rgba(20,20,24,0.10)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let t = x + 18; t < x + w - 4; t += 28) {
      ctx.moveTo(t, y + 4);
      ctx.lineTo(t, y + SIDEWALK - 2);
      ctx.moveTo(t, y + h - SIDEWALK + 2);
      ctx.lineTo(t, y + h - 4);
    }
    for (let t = y + 18; t < y + h - 4; t += 28) {
      ctx.moveTo(x + 4, t);
      ctx.lineTo(x + SIDEWALK - 2, t);
      ctx.moveTo(x + w - SIDEWALK + 2, t);
      ctx.lineTo(x + w - 4, t);
    }
    ctx.stroke();

    if (block.type === 'park') {
      this.drawPark(ctx, block);
    } else if (block.type === 'lot') {
      ctx.fillStyle = '#3b3e46';
      ctx.fillRect(inner.x, inner.y, inner.w, inner.h);
      ctx.strokeStyle = 'rgba(226,226,210,0.35)';
      ctx.lineWidth = 2;
      if (block.stalls) {
        for (const s of block.stalls) {
          ctx.save();
          ctx.translate(s.x, s.y);
          ctx.rotate(s.angle);
          ctx.strokeRect(-24, -30, 48, 60);
          ctx.restore();
        }
      }
      ctx.strokeStyle = 'rgba(226,226,210,0.5)';
      ctx.strokeRect(inner.x + 2, inner.y + 2, inner.w - 4, inner.h - 4);
    } else {
      ctx.fillStyle = '#5f5d58';
      ctx.fillRect(inner.x, inner.y, inner.w, inner.h);
      ctx.strokeStyle = 'rgba(0,0,0,0.12)';
      ctx.lineWidth = 1;
      for (let gx = inner.x; gx < inner.x + inner.w; gx += 40) {
        ctx.beginPath();
        ctx.moveTo(gx, inner.y);
        ctx.lineTo(gx, inner.y + inner.h);
        ctx.stroke();
      }
      for (const b of this.buildings) {
        if (b.x < block.x - 5 || b.x > block.x + block.w) continue;
        if (b.y < block.y - 5 || b.y > block.y + block.h) continue;
        this.drawBuilding(ctx, b, view);
      }
    }
  }

  drawPark(ctx, block) {
    const { inner } = block;
    ctx.fillStyle = '#446b4c';
    ctx.fillRect(inner.x, inner.y, inner.w, inner.h);
    ctx.fillStyle = '#4b7654';
    ctx.fillRect(inner.x + 4, inner.y + 4, inner.w - 8, inner.h - 8);

    // paths
    ctx.fillStyle = '#8c8375';
    ctx.fillRect(inner.x + inner.w / 2 - 13, inner.y, 26, inner.h);
    ctx.fillRect(inner.x, inner.y + inner.h / 2 - 13, inner.w, 26);

    if (block.pond) {
      const p = block.pond;
      ctx.fillStyle = '#2c5566';
      ctx.beginPath();
      ctx.ellipse(p.x, p.y, p.r * 1.15, p.r * 0.85, 0.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(150,220,230,0.25)';
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    for (const t of this.trees) {
      if (t.x < block.x || t.x > block.x + block.w || t.y < block.y || t.y > block.y + block.h) continue;
      this.drawTree(ctx, t);
    }
  }

  drawBuilding(ctx, b, view) {
    if (b.x > view.x + view.w + 60 || b.x + b.w < view.x - 60) return;
    if (b.y > view.y + view.h + 60 || b.y + b.h < view.y - 60) return;

    const d = 3 + b.stories * 2.6;

    // Long late-afternoon shadow
    ctx.fillStyle = 'rgba(8, 8, 12, 0.34)';
    ctx.fillRect(b.x + d + 8, b.y + d + 9, b.w + 2, b.h + 2);

    // South facade (the strip below the footprint)
    ctx.fillStyle = b.south;
    ctx.beginPath();
    ctx.moveTo(b.x, b.y + b.h);
    ctx.lineTo(b.x + b.w, b.y + b.h);
    ctx.lineTo(b.x + b.w + d, b.y + b.h + d);
    ctx.lineTo(b.x + d, b.y + b.h + d);
    ctx.closePath();
    ctx.fill();

    // East facade
    ctx.fillStyle = b.east;
    ctx.beginPath();
    ctx.moveTo(b.x + b.w, b.y);
    ctx.lineTo(b.x + b.w, b.y + b.h);
    ctx.lineTo(b.x + b.w + d, b.y + b.h + d);
    ctx.lineTo(b.x + b.w + d, b.y + d);
    ctx.closePath();
    ctx.fill();

    // Roof slab
    ctx.fillStyle = b.color;
    ctx.fillRect(b.x, b.y, b.w, b.h);
    ctx.fillStyle = b.roof;
    ctx.fillRect(b.x + 6, b.y + 6, b.w - 12, b.h - 12);

    // Parapet
    ctx.strokeStyle = b.edge;
    ctx.lineWidth = 2.5;
    ctx.strokeRect(b.x + 1.2, b.y + 1.2, b.w - 2.4, b.h - 2.4);

    // Rooftop texture
    ctx.strokeStyle = 'rgba(255,255,255,0.035)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let gx = b.x + 18; gx < b.x + b.w - 10; gx += 30) {
      ctx.moveTo(gx, b.y + 8);
      ctx.lineTo(gx, b.y + b.h - 8);
    }
    for (let gy = b.y + 18; gy < b.y + b.h - 10; gy += 30) {
      ctx.moveTo(b.x + 8, gy);
      ctx.lineTo(b.x + b.w - 8, gy);
    }
    ctx.stroke();

    // Facade windows (south strip)
    const rows = Math.max(1, Math.min(3, Math.floor(d / 5)));
    for (let r = 0; r < rows; r++) {
      const frac = (r + 0.55) / rows;
      const fy = b.y + b.h + d * frac;
      const fx = b.x + d * frac;
      for (let wx = fx + 9; wx < fx + b.w - 12; wx += 21) {
        const lit = b.lit && (Math.floor(wx + b.y) % 3 !== 0);
        ctx.fillStyle = lit ? 'rgba(255,214,150,0.72)' : 'rgba(24,28,38,0.72)';
        ctx.fillRect(wx, fy - 1.5, 8, 3);
      }
    }

    // Rooftop props
    for (const p of b.props) {
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      ctx.fillRect(p.x + 3, p.y + 3, p.w, p.h);
      if (p.kind === 'glass') {
        ctx.fillStyle = 'rgba(60,90,110,0.85)';
        ctx.fillRect(p.x, p.y, p.w, p.h);
        ctx.strokeStyle = 'rgba(200,230,245,0.35)';
        ctx.lineWidth = 1;
        ctx.strokeRect(p.x + 1, p.y + 1, p.w - 2, p.h - 2);
        continue;
      }
      ctx.fillStyle = p.kind === 'tank' ? '#9c8f7d' : '#8b9095';
      ctx.fillRect(p.x, p.y, p.w, p.h);
      ctx.fillStyle = 'rgba(255,255,255,0.18)';
      ctx.fillRect(p.x, p.y, p.w, 2);
      if (p.kind === 'ac') {
        ctx.strokeStyle = 'rgba(30,30,35,0.4)';
        ctx.strokeRect(p.x + 2.5, p.y + 2.5, p.w - 5, p.h - 5);
      } else {
        ctx.beginPath();
        ctx.arc(p.x + p.w / 2, p.y + p.h / 2, Math.min(p.w, p.h) / 2.4, 0, Math.PI * 2);
        ctx.fillStyle = '#6f6558';
        ctx.fill();
      }
    }

    // Helipad
    if (b.helipad) {
      const cx = b.x + b.w / 2;
      const cy = b.y + b.h / 2;
      const pr = Math.min(b.w, b.h) * 0.22;
      ctx.strokeStyle = 'rgba(255,220,120,0.55)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(cx, cy, pr, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = 'rgba(255,220,120,0.5)';
      ctx.font = `bold ${Math.round(pr)}px system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('H', cx, cy + 1);
    }

    // Neon sign
    if (b.sign) {
      ctx.save();
      ctx.shadowColor = b.sign.color;
      ctx.shadowBlur = 14;
      ctx.fillStyle = b.sign.color;
      ctx.fillRect(b.sign.x, b.sign.y, b.sign.w, 4);
      ctx.shadowBlur = 0;
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      ctx.fillRect(b.sign.x + 3, b.sign.y + 1, b.sign.w - 6, 1.5);
      ctx.restore();
    }
  }

  drawMarkings(ctx, view) {
    const i0 = Math.max(0, Math.floor(view.x / CELL) - 1);
    const i1 = Math.min(GRID, Math.floor((view.x + view.w) / CELL) + 1);
    const j0 = Math.max(0, Math.floor(view.y / CELL) - 1);
    const j1 = Math.min(GRID, Math.floor((view.y + view.h) / CELL) + 1);

    ctx.lineCap = 'round';

    // Vertical roads
    for (let i = i0; i <= i1; i++) {
      const x = i * CELL;
      if (x < view.x - 80 || x > view.x + view.w + 80) continue;
      for (let j = 0; j <= GRID; j++) {
        const y0 = j === 0 ? 0 : j * CELL + ROAD_HALF + 8;
        const y1 = j === GRID ? WORLD : j * CELL - ROAD_HALF - 8;
        if (y1 <= y0) continue;
        if (y0 > view.y + view.h || y1 < view.y) continue;
        ctx.strokeStyle = 'rgba(230,228,220,0.5)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(x - ROAD_HALF + 7, Math.max(y0, view.y));
        ctx.lineTo(x - ROAD_HALF + 7, Math.min(y1, view.y + view.h));
        ctx.moveTo(x + ROAD_HALF - 7, Math.max(y0, view.y));
        ctx.lineTo(x + ROAD_HALF - 7, Math.min(y1, view.y + view.h));
        ctx.stroke();
        // dashed centre
        ctx.strokeStyle = 'rgba(224,180,74,0.75)';
        ctx.lineWidth = 3;
        ctx.setLineDash([26, 26]);
        ctx.beginPath();
        ctx.moveTo(x, Math.max(y0, view.y));
        ctx.lineTo(x, Math.min(y1, view.y + view.h));
        ctx.stroke();
        ctx.setLineDash([]);
      }
    }

    // Horizontal roads
    for (let j = j0; j <= j1; j++) {
      const y = j * CELL;
      if (y < view.y - 80 || y > view.y + view.h + 80) continue;
      for (let i = 0; i <= GRID; i++) {
        const x0 = i === 0 ? 0 : i * CELL + ROAD_HALF + 8;
        const x1 = i === GRID ? WORLD : i * CELL - ROAD_HALF - 8;
        if (x1 <= x0) continue;
        if (x0 > view.x + view.w || x1 < view.x) continue;
        ctx.strokeStyle = 'rgba(230,228,220,0.5)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(Math.max(x0, view.x), y - ROAD_HALF + 7);
        ctx.lineTo(Math.min(x1, view.x + view.w), y - ROAD_HALF + 7);
        ctx.moveTo(Math.max(x0, view.x), y + ROAD_HALF - 7);
        ctx.lineTo(Math.min(x1, view.x + view.w), y + ROAD_HALF - 7);
        ctx.stroke();
        ctx.strokeStyle = 'rgba(224,180,74,0.75)';
        ctx.lineWidth = 3;
        ctx.setLineDash([26, 26]);
        ctx.beginPath();
        ctx.moveTo(Math.max(x0, view.x), y);
        ctx.lineTo(Math.min(x1, view.x + view.w), y);
        ctx.stroke();
        ctx.setLineDash([]);
      }
    }

    // Crosswalks
    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i <= i1; i++) {
        const cx = i * CELL;
        const cy = j * CELL;
        if (cx < view.x - 100 || cx > view.x + view.w + 100) continue;
        if (cy < view.y - 100 || cy > view.y + view.h + 100) continue;
        ctx.fillStyle = 'rgba(235,233,226,0.42)';
        for (let s = -3; s <= 3; s++) {
          const o = s * 13;
          ctx.fillRect(cx - ROAD_HALF - 26, cy + o - 4, 20, 8);
          ctx.fillRect(cx + ROAD_HALF + 6, cy + o - 4, 20, 8);
          ctx.fillRect(cx + o - 4, cy - ROAD_HALF - 26, 8, 20);
          ctx.fillRect(cx + o - 4, cy + ROAD_HALF + 6, 8, 20);
        }
      }
    }
  }
}
