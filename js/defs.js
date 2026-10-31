// Shared constants and small helpers for Sunset City.
export const TAU = Math.PI * 2;
export const rand = (a = 0, b = 1) => a + Math.random() * (b - a);
export const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
export const dist = (ax, ay, bx, by) => Math.hypot(ax - bx, ay - by);
export const fmtMoney = (n) => '$' + Math.max(0, Math.round(n)).toLocaleString('en-US');

export function angLerp(a, b, t) {
  const d = (((b - a + Math.PI) % TAU) + TAU) % TAU - Math.PI;
  return a + d * Math.min(1, Math.max(0, t));
}

export const CAR_TYPES = {
  sedan: {
    len: 88, wid: 44, accel: 255, max: 420, rev: 140, turn: 2.6, hp: 100,
    colors: ['#c94f4f', '#3f7fbf', '#e2e2df', '#4c4f57', '#d9a441', '#5b8c6b', '#8c5ba6'],
  },
  sport: {
    len: 92, wid: 44, accel: 400, max: 570, rev: 175, turn: 3.0, hp: 80,
    colors: ['#ff5a3c', '#f2c14e', '#34c3d6', '#eceff1', '#bf2f2f', '#42d17a'],
  },
  van: {
    len: 112, wid: 52, accel: 200, max: 340, rev: 120, turn: 2.0, hp: 165,
    colors: ['#d8d4c8', '#6a7b8a', '#a3785a', '#7d8c5a'],
  },
  taxi: {
    len: 90, wid: 46, accel: 265, max: 440, rev: 140, turn: 2.7, hp: 110,
    colors: ['#f0c020'],
  },
  police: {
    len: 96, wid: 48, accel: 360, max: 530, rev: 160, turn: 2.9, hp: 175,
    colors: ['#e8ebf0'],
  },
};

export const PED_COLORS = [
  '#e07a5f', '#3d8bfd', '#81b29a', '#f2cc8f', '#9c89b8',
  '#ef8354', '#4f6d7a', '#e5989b', '#c9ada7', '#f6f4f1',
];
export const SKIN_COLORS = ['#f1c27d', '#e0ac69', '#c68642', '#8d5524', '#ffdbac', '#5c3a21'];

export const CAR_KINDS = ['sedan', 'sedan', 'sedan', 'sport', 'van', 'taxi'];
