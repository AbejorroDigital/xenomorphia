/**
 * Deterministic Mulberry32 PRNG and seeded 3D Gradient/Simplex + 2D Worley noise utilities.
 * Ensures any seed reproduces the exact same creature morphology, textures, and colors.
 */

export class SeededPRNG {
  private state: number;

  constructor(seed: number) {
    this.state = (seed >>> 0) || 1;
  }

  /** Returns deterministic float in [0, 1) using Mulberry32 */
  next(): number {
    let t = (this.state += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** Float in [min, max) */
  range(min: number, max: number): number {
    return min + this.next() * (max - min);
  }

  /** Integer in [min, max] inclusive */
  int(min: number, max: number): number {
    return Math.floor(this.range(min, max + 1));
  }

  /** Signed float in [-1, 1) */
  signed(): number {
    return this.next() * 2 - 1;
  }

  /** Boolean with given probability */
  chance(probability: number): boolean {
    return this.next() < probability;
  }

  /** Pick random element from non-empty array */
  pick<T>(items: readonly T[]): T {
    return items[Math.floor(this.next() * items.length)];
  }

  /** Approximate Gaussian via Box-Muller */
  gaussian(mean = 0, stdDev = 1): number {
    const u1 = Math.max(1e-7, this.next());
    const u2 = this.next();
    const z = Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2);
    return mean + z * stdDev;
  }

  /** Derive a sub-PRNG for isolated subsystems so changing one feature doesn't scramble others */
  fork(salt: number): SeededPRNG {
    const mixed = Math.imul(this.state ^ (salt * 0x9e3779b1), 0x85ebca6b) >>> 0;
    return new SeededPRNG(mixed || 1);
  }
}

/**
 * Deterministic 3D Simplex-style Gradient Noise + FBM & 2D Worley Cellular Noise.
 */
export class ProceduralNoise {
  private perm: Uint8Array;

  constructor(seed: number) {
    const rng = new SeededPRNG(seed);
    const p = new Uint8Array(256);
    for (let i = 0; i < 256; i++) p[i] = i;
    for (let i = 255; i > 0; i--) {
      const j = Math.floor(rng.next() * (i + 1));
      const tmp = p[i];
      p[i] = p[j];
      p[j] = tmp;
    }
    this.perm = new Uint8Array(512);
    for (let i = 0; i < 512; i++) {
      this.perm[i] = p[i & 255];
    }
  }

  private static fade(t: number): number {
    return t * t * t * (t * (t * 6 - 15) + 10);
  }

  private static lerp(a: number, b: number, t: number): number {
    return a + t * (b - a);
  }

  private static grad3(hash: number, x: number, y: number, z: number): number {
    const h = hash & 15;
    const u = h < 8 ? x : y;
    const v = h < 4 ? y : h === 12 || h === 14 ? x : z;
    return ((h & 1) === 0 ? u : -u) + ((h & 2) === 0 ? v : -v);
  }

  /** Smooth 3D Perlin gradient noise in approx [-1, 1] */
  noise3D(x: number, y: number, z: number): number {
    const X = Math.floor(x) & 255;
    const Y = Math.floor(y) & 255;
    const Z = Math.floor(z) & 255;

    const xf = x - Math.floor(x);
    const yf = y - Math.floor(y);
    const zf = z - Math.floor(z);

    const u = ProceduralNoise.fade(xf);
    const v = ProceduralNoise.fade(yf);
    const w = ProceduralNoise.fade(zf);

    const p = this.perm;
    const A = p[X] + Y;
    const AA = p[A] + Z;
    const AB = p[A + 1] + Z;
    const B = p[X + 1] + Y;
    const BA = p[B] + Z;
    const BB = p[B + 1] + Z;

    return ProceduralNoise.lerp(
      ProceduralNoise.lerp(
        ProceduralNoise.lerp(
          ProceduralNoise.grad3(p[AA], xf, yf, zf),
          ProceduralNoise.grad3(p[BA], xf - 1, yf, zf),
          u
        ),
        ProceduralNoise.lerp(
          ProceduralNoise.grad3(p[AB], xf, yf - 1, zf),
          ProceduralNoise.grad3(p[BB], xf - 1, yf - 1, zf),
          u
        ),
        v
      ),
      ProceduralNoise.lerp(
        ProceduralNoise.lerp(
          ProceduralNoise.grad3(p[AA + 1], xf, yf, zf - 1),
          ProceduralNoise.grad3(p[BA + 1], xf - 1, yf, zf - 1),
          u
        ),
        ProceduralNoise.lerp(
          ProceduralNoise.grad3(p[AB + 1], xf, yf - 1, zf - 1),
          ProceduralNoise.grad3(p[BB + 1], xf - 1, yf - 1, zf - 1),
          u
        ),
        v
      ),
      w
    );
  }

  /** Multi-octave 3D Fractal Brownian Motion */
  fbm3D(x: number, y: number, z: number, octaves = 4, lacunarity = 2.05, gain = 0.5): number {
    let sum = 0;
    let amp = 0.5;
    let freq = 1.0;
    let norm = 0;
    for (let i = 0; i < octaves; i++) {
      sum += amp * this.noise3D(x * freq, y * freq, z * freq);
      norm += amp;
      freq *= lacunarity;
      amp *= gain;
    }
    return sum / (norm || 1);
  }

  /** Tileable 2D FBM via toroidal mapping in 3D space (seamless textures!) */
  tileableFbm2D(u: number, v: number, scale = 4, octaves = 4): number {
    const a = u * Math.PI * 2;
    const b = v * Math.PI * 2;
    const r = scale / (Math.PI * 2);
    const nx = Math.cos(a) * r + 1.37;
    const ny = Math.sin(a) * r + 2.91;
    const nz = Math.cos(b) * r + Math.sin(b) * r * 0.7;
    return this.fbm3D(nx, ny, nz, octaves) * 0.5 + 0.5;
  }

  /**
   * Tileable 2D Worley (cellular) noise returning [f1, f2, f2 - f1]
   * Ideal for scales, chitin plates, amphibian pores, and alien cellular patterns.
   */
  tileableWorley2D(u: number, v: number, cellsX: number, cellsY: number, jitter = 0.85): [number, number, number] {
    const px = u * cellsX;
    const py = v * cellsY;
    const ix = Math.floor(px);
    const iy = Math.floor(py);

    let f1 = 10.0;
    let f2 = 10.0;

    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const cx = ((ix + dx) % cellsX + cellsX) % cellsX;
        const cy = ((iy + dy) % cellsY + cellsY) % cellsY;
        const h1 = this.perm[(this.perm[cx & 255] + cy) & 255] / 255;
        const h2 = this.perm[(this.perm[(cx + 37) & 255] + cy + 71) & 255] / 255;

        const fx = ix + dx + 0.5 + (h1 - 0.5) * jitter;
        const fy = iy + dy + 0.5 + (h2 - 0.5) * jitter;

        const distSq = (fx - px) * (fx - px) + (fy - py) * (fy - py);
        if (distSq < f1) {
          f2 = f1;
          f1 = distSq;
        } else if (distSq < f2) {
          f2 = distSq;
        }
      }
    }

    const d1 = Math.sqrt(f1);
    const d2 = Math.sqrt(f2);
    return [d1, d2, d2 - d1];
  }
}
