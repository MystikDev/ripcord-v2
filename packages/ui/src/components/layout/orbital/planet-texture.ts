/**
 * @module planet-texture
 * Procedural planet texture generation for the orbital canvas renderer.
 * Generates offscreen canvas textures for gas, rock, and ice type planets
 * using a seeded PRNG derived from channel ID for deterministic results.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type PlanetType = 'gas' | 'rock' | 'ice';

// ---------------------------------------------------------------------------
// Seeded PRNG (mulberry32)
// ---------------------------------------------------------------------------

function mulberry32(seed: number): () => number {
  return () => {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  return hash;
}

// ---------------------------------------------------------------------------
// Noise helpers
// ---------------------------------------------------------------------------

function smoothNoise(
  x: number,
  y: number,
  seedA: number,
  seedB: number,
): number {
  const noise = (nx: number, ny: number) => {
    const n = Math.sin(nx * 12.9898 + ny * 78.233 + seedA) * 43758.5453 + seedB;
    return n - Math.floor(n);
  };

  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;
  const a = noise(ix, iy);
  const b = noise(ix + 1, iy);
  const c = noise(ix, iy + 1);
  const d = noise(ix + 1, iy + 1);
  const u = fx * fx * (3 - 2 * fx);
  const v = fy * fy * (3 - 2 * fy);
  return lerp(lerp(a, b, u), lerp(c, d, u), v);
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

// ---------------------------------------------------------------------------
// HSL → RGB conversion
// ---------------------------------------------------------------------------

function hslToRgb(
  h: number,
  s: number,
  l: number,
): [number, number, number] {
  const H = (((h % 360) + 360) % 360) / 360;
  const S = clamp(s / 100, 0, 1);
  const L = clamp(l / 100, 0, 1);
  const q = L < 0.5 ? L * (1 + S) : L + S - L * S;
  const p = 2 * L - q;
  const tc = (t: number) => {
    t = ((t % 1) + 1) % 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  return [
    Math.floor(tc(H + 1 / 3) * 255),
    Math.floor(tc(H) * 255),
    Math.floor(tc(H - 1 / 3) * 255),
  ];
}

// ---------------------------------------------------------------------------
// Hex → hue
// ---------------------------------------------------------------------------

function hexToHue(hex: string): number {
  const n = parseInt(hex.replace('#', ''), 16);
  const r = ((n >> 16) & 255) / 255;
  const g = ((n >> 8) & 255) / 255;
  const b = (n & 255) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  if (d === 0) return 0;
  let h = 0;
  if (max === r) h = ((g - b) / d) % 6;
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  return ((h * 60 + 360) % 360);
}

// ---------------------------------------------------------------------------
// Planet type from channel index
// ---------------------------------------------------------------------------

export function getPlanetType(channelId: string): PlanetType {
  const hash = Math.abs(hashString(channelId));
  const types: PlanetType[] = ['gas', 'rock', 'ice'];
  return types[hash % 3];
}

// ---------------------------------------------------------------------------
// Main texture generator
// ---------------------------------------------------------------------------

export function generatePlanetTexture(
  channelId: string,
  orbitColor: string,
  size: number = 64,
): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const g = canvas.getContext('2d')!;
  const img = g.createImageData(size, size);
  const data = img.data;

  const seed = hashString(channelId);
  const prng = mulberry32(seed);
  const type = getPlanetType(channelId);
  const baseHue = hexToHue(orbitColor);

  const seedA = prng() * 1000;
  const seedB = prng() * 1000;
  const scale = type === 'gas' ? 6 : type === 'ice' ? 10 : 12;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const nx = x / size;
      const ny = y / size;

      // fBm noise
      let v = 0;
      let amp = 1;
      let freq = 1;
      for (let o = 0; o < 4; o++) {
        v += smoothNoise(
          nx * scale * freq * size * 0.02,
          ny * scale * freq * size * 0.02,
          seedA,
          seedB,
        ) * amp;
        amp *= 0.55;
        freq *= 2.0;
      }
      v = v / (1 + 0.55 + 0.55 * 0.55 + 0.55 * 0.55 * 0.55);

      // Type-specific styling
      let sat = type === 'rock' ? 35 : type === 'ice' ? 25 : 55;
      let lum = type === 'rock'
        ? lerp(22, 55, v)
        : type === 'ice'
          ? lerp(45, 78, v)
          : lerp(28, 66, v);

      // Gas bands
      if (type === 'gas') {
        const band = 0.55 + 0.45 * Math.sin(ny * size * 0.15 + v * 3.0);
        lum = lum * 0.65 + band * 45;
        sat = sat * 0.8 + 10;
      }

      // Rock craters
      if (type === 'rock' && v > 0.58) {
        lum -= (v - 0.58) * 35;
      }

      const hue = baseHue
        + (type === 'ice' ? -18 : type === 'rock' ? -8 : 0)
        + (v - 0.5) * 16;

      const [r, gg, b] = hslToRgb(hue, sat, lum);
      const idx = (y * size + x) * 4;
      data[idx] = r;
      data[idx + 1] = gg;
      data[idx + 2] = b;
      data[idx + 3] = 255;
    }
  }

  g.putImageData(img, 0, 0);

  // Add speckles
  g.globalAlpha = 0.18;
  const speckleCount = Math.floor(size * 0.5);
  for (let i = 0; i < speckleCount; i++) {
    g.fillStyle = `rgba(255,255,255,${lerp(0.08, 0.25, prng())})`;
    const sx = prng() * size;
    const sy = prng() * size;
    const sr = lerp(0.5, 2, prng());
    g.beginPath();
    g.arc(sx, sy, sr, 0, Math.PI * 2);
    g.fill();
  }
  g.globalAlpha = 1;

  return canvas;
}
