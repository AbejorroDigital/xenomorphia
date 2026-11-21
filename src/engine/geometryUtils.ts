import * as THREE from 'three';
import { ProceduralNoise } from './prng';
import { ENGINE_CONSTANTS } from './constants';

/**
 * Polynomial smooth minimum (smin) for organic muscle-skin SDF blending.
 * Produces C1-continuous fluid unions between anatomical volumes.
 */
export function smin(a: number, b: number, k: number): number {
  const h = Math.max(k - Math.abs(a - b), 0.0) / k;
  return Math.min(a, b) - h * h * k * 0.25;
}

/**
 * Polynomial smooth maximum for organic SDF subtraction (e.g., orbital eye sockets, gill recesses).
 */
export function smax(a: number, b: number, k: number): number {
  const h = Math.max(k - Math.abs(a - b), 0.0) / k;
  return Math.max(a, b) + h * h * k * 0.25;
}

/** SDF of an oriented ellipsoid */
export function sdEllipsoid(p: THREE.Vector3, center: THREE.Vector3, radii: THREE.Vector3): number {
  const qx = (p.x - center.x) / radii.x;
  const qy = (p.y - center.y) / radii.y;
  const qz = (p.z - center.z) / radii.z;
  const k0 = Math.sqrt(qx * qx + qy * qy + qz * qz);
  if (k0 < 1e-6) return -Math.min(radii.x, radii.y, radii.z);
  const k1x = qx / radii.x;
  const k1y = qy / radii.y;
  const k1z = qz / radii.z;
  const k1 = Math.sqrt(k1x * k1x + k1y * k1y + k1z * k1z);
  return (k0 * (k0 - 1.0)) / (k1 || 1e-6);
}

/** SDF of a 3D capsule segment between a and b with tapered radii rA -> rB */
export function sdTaperedCapsule(
  p: THREE.Vector3,
  a: THREE.Vector3,
  b: THREE.Vector3,
  rA: number,
  rB: number
): number {
  const abx = b.x - a.x;
  const aby = b.y - a.y;
  const abz = b.z - a.z;
  const apx = p.x - a.x;
  const apy = p.y - a.y;
  const apz = p.z - a.z;
  const abLenSq = abx * abx + aby * aby + abz * abz;
  const t = abLenSq > 1e-6 ? Math.max(0, Math.min(1, (apx * abx + apy * aby + apz * abz) / abLenSq)) : 0;
  const cx = a.x + abx * t;
  const cy = a.y + aby * t;
  const cz = a.z + abz * t;
  const dx = p.x - cx;
  const dy = p.y - cy;
  const dz = p.z - cz;
  const r = rA + (rB - rA) * t;
  return Math.sqrt(dx * dx + dy * dy + dz * dz) - r;
}

/**
 * Extracts a watertight, organic manifold BufferGeometry from an arbitrary 3D SDF
 * using Surface Nets, followed by Taubin volume-preserving smoothing,
 * 3D Simplex/FBM vertex displacement, and seamless anatomical UV mapping.
 */
export function extractSdfIsosurface(
  sdfFn: (p: THREE.Vector3) => number,
  boundsMin: THREE.Vector3,
  boundsMax: THREE.Vector3,
  resolution: number = ENGINE_CONSTANTS.SDF_GRID_RESOLUTION,
  noise?: ProceduralNoise,
  displacementAmp = 0.03
): THREE.BufferGeometry {
  const nx = resolution;
  const ny = resolution;
  const nz = resolution;

  const size = new THREE.Vector3().subVectors(boundsMax, boundsMin);
  const dx = size.x / (nx - 1);
  const dy = size.y / (ny - 1);
  const dz = size.z / (nz - 1);

  const field = new Float32Array(nx * ny * nz);
  const probe = new THREE.Vector3();

  const idx = (i: number, j: number, k: number) => (k * ny + j) * nx + i;

  for (let k = 0; k < nz; k++) {
    probe.z = boundsMin.z + k * dz;
    for (let j = 0; j < ny; j++) {
      probe.y = boundsMin.y + j * dy;
      for (let i = 0; i < nx; i++) {
        probe.x = boundsMin.x + i * dx;
        field[idx(i, j, k)] = sdfFn(probe);
      }
    }
  }

  const cellVertexIndex = new Int32Array((nx - 1) * (ny - 1) * (nz - 1)).fill(-1);
  const cellIdx = (i: number, j: number, k: number) => (k * (ny - 1) + j) * (nx - 1) + i;

  const positions: number[] = [];

  // Cube corner offsets and 12 edges
  const cornerOffsets: [number, number, number][] = [
    [0, 0, 0],
    [1, 0, 0],
    [0, 1, 0],
    [1, 1, 0],
    [0, 0, 1],
    [1, 0, 1],
    [0, 1, 1],
    [1, 1, 1],
  ];
  const edges: [number, number][] = [
    [0, 1],
    [2, 3],
    [4, 5],
    [6, 7],
    [0, 2],
    [1, 3],
    [4, 6],
    [5, 7],
    [0, 4],
    [1, 5],
    [2, 6],
    [3, 7],
  ];

  // Step 1: Place one vertex at the centroid of zero-crossings per active voxel cell
  for (let k = 0; k < nz - 1; k++) {
    for (let j = 0; j < ny - 1; j++) {
      for (let i = 0; i < nx - 1; i++) {
        let mask = 0;
        const vals = new Float32Array(8);
        for (let c = 0; c < 8; c++) {
          const [ox, oy, oz] = cornerOffsets[c];
          const v = field[idx(i + ox, j + oy, k + oz)];
          vals[c] = v;
          if (v < 0) mask |= 1 << c;
        }
        if (mask === 0 || mask === 255) continue;

        let sx = 0;
        let sy = 0;
        let sz = 0;
        let crossings = 0;

        for (let e = 0; e < 12; e++) {
          const [a, b] = edges[e];
          const va = vals[a];
          const vb = vals[b];
          if ((va < 0) !== (vb < 0)) {
            const t = va / (va - vb);
            const [ax, ay, az] = cornerOffsets[a];
            const [bx, by, bz] = cornerOffsets[b];
            sx += ax + (bx - ax) * t;
            sy += ay + (by - ay) * t;
            sz += az + (bz - az) * t;
            crossings++;
          }
        }

        if (crossings > 0) {
          const vx = boundsMin.x + (i + sx / crossings) * dx;
          const vy = boundsMin.y + (j + sy / crossings) * dy;
          const vz = boundsMin.z + (k + sz / crossings) * dz;
          cellVertexIndex[cellIdx(i, j, k)] = positions.length / 3;
          positions.push(vx, vy, vz);
        }
      }
    }
  }

  const indices: number[] = [];

  const emitQuad = (a: number, b: number, c: number, d: number, flip: boolean) => {
    if (a < 0 || b < 0 || c < 0 || d < 0) return;
    if (!flip) {
      indices.push(a, b, c, a, c, d);
    } else {
      indices.push(a, d, c, a, c, b);
    }
  };

  // Step 2: Emit quads for every interior grid edge crossing zero
  for (let k = 1; k < nz - 1; k++) {
    for (let j = 1; j < ny - 1; j++) {
      for (let i = 0; i < nx - 1; i++) {
        const v0 = field[idx(i, j, k)];
        const v1 = field[idx(i + 1, j, k)];
        if ((v0 < 0) !== (v1 < 0)) {
          emitQuad(
            cellVertexIndex[cellIdx(i, j - 1, k - 1)],
            cellVertexIndex[cellIdx(i, j, k - 1)],
            cellVertexIndex[cellIdx(i, j, k)],
            cellVertexIndex[cellIdx(i, j - 1, k)],
            v0 >= 0
          );
        }
      }
    }
  }

  for (let k = 1; k < nz - 1; k++) {
    for (let j = 0; j < ny - 1; j++) {
      for (let i = 1; i < nx - 1; i++) {
        const v0 = field[idx(i, j, k)];
        const v1 = field[idx(i, j + 1, k)];
        if ((v0 < 0) !== (v1 < 0)) {
          emitQuad(
            cellVertexIndex[cellIdx(i - 1, j, k - 1)],
            cellVertexIndex[cellIdx(i - 1, j, k)],
            cellVertexIndex[cellIdx(i, j, k)],
            cellVertexIndex[cellIdx(i, j, k - 1)],
            v0 >= 0
          );
        }
      }
    }
  }

  for (let k = 0; k < nz - 1; k++) {
    for (let j = 1; j < ny - 1; j++) {
      for (let i = 1; i < nx - 1; i++) {
        const v0 = field[idx(i, j, k)];
        const v1 = field[idx(i, j, k + 1)];
        if ((v0 < 0) !== (v1 < 0)) {
          emitQuad(
            cellVertexIndex[cellIdx(i - 1, j - 1, k)],
            cellVertexIndex[cellIdx(i, j - 1, k)],
            cellVertexIndex[cellIdx(i, j, k)],
            cellVertexIndex[cellIdx(i - 1, j, k)],
            v0 >= 0
          );
        }
      }
    }
  }

  let geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);

  // Step 3: Taubin volume-preserving smoothing to eliminate voxel facets
  taubinSmoothGeometry(
    geometry,
    ENGINE_CONSTANTS.TORSO_LAPLACIAN_PASSES,
    ENGINE_CONSTANTS.TORSO_LAPLACIAN_LAMBDA,
    -ENGINE_CONSTANTS.TORSO_LAPLACIAN_LAMBDA * 1.04
  );

  // Step 4: Organic 3D FBM Vertex Displacement along vertex normals
  geometry.computeVertexNormals();
  if (noise && displacementAmp > 0.0001) {
    const posAttr = geometry.attributes.position as THREE.BufferAttribute;
    const normAttr = geometry.attributes.normal as THREE.BufferAttribute;
    for (let i = 0; i < posAttr.count; i++) {
      const px = posAttr.getX(i);
      const py = posAttr.getY(i);
      const pz = posAttr.getZ(i);
      const disp = noise.fbm3D(px * 2.4, py * 2.4, pz * 2.4, 3) * displacementAmp;
      posAttr.setXYZ(
        i,
        px + normAttr.getX(i) * disp,
        py + normAttr.getY(i) * disp,
        pz + normAttr.getZ(i) * disp
      );
    }
    posAttr.needsUpdate = true;
    geometry.computeVertexNormals();
  }

  // Step 5: Cylindrical-spherical organic UVs (for procedural scales, fur, pores, AO)
  assignOrganicUVs(geometry);
  geometry.setAttribute('uv2', geometry.attributes.uv.clone());
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();

  return geometry;
}

/**
 * Volume-preserving Taubin smoothing (alternating positive shrink & negative inflate passes).
 */
export function taubinSmoothGeometry(
  geometry: THREE.BufferGeometry,
  iterations = 2,
  lambda = 0.35,
  mu = -0.36
): void {
  const posAttr = geometry.attributes.position as THREE.BufferAttribute;
  const indexAttr = geometry.getIndex();
  if (!indexAttr || posAttr.count === 0) return;

  const vertCount = posAttr.count;
  const neighbors: Set<number>[] = Array.from({ length: vertCount }, () => new Set<number>());

  const arr = indexAttr.array;
  for (let i = 0; i < arr.length; i += 3) {
    const a = arr[i];
    const b = arr[i + 1];
    const c = arr[i + 2];
    neighbors[a].add(b).add(c);
    neighbors[b].add(a).add(c);
    neighbors[c].add(a).add(b);
  }

  const temp = new Float32Array(vertCount * 3);

  const step = (factor: number) => {
    for (let i = 0; i < vertCount; i++) {
      const nb = neighbors[i];
      const px = posAttr.getX(i);
      const py = posAttr.getY(i);
      const pz = posAttr.getZ(i);
      if (nb.size === 0) {
        temp[i * 3] = px;
        temp[i * 3 + 1] = py;
        temp[i * 3 + 2] = pz;
        continue;
      }
      let ax = 0;
      let ay = 0;
      let az = 0;
      nb.forEach((nIdx) => {
        ax += posAttr.getX(nIdx);
        ay += posAttr.getY(nIdx);
        az += posAttr.getZ(nIdx);
      });
      const inv = 1 / nb.size;
      temp[i * 3] = px + factor * (ax * inv - px);
      temp[i * 3 + 1] = py + factor * (ay * inv - py);
      temp[i * 3 + 2] = pz + factor * (az * inv - pz);
    }
    for (let i = 0; i < vertCount; i++) {
      posAttr.setXYZ(i, temp[i * 3], temp[i * 3 + 1], temp[i * 3 + 2]);
    }
  };

  for (let iter = 0; iter < iterations; iter++) {
    step(lambda);
    step(mu);
  }
  posAttr.needsUpdate = true;
}

/**
 * Genuine Loop Subdivision Surface for indexed triangle meshes (at least 2 levels for smooth anatomical curves).
 * Preserves manifold topology and computes smooth vertex positions via Loop valence weights.
 */
export function subdivideLoopGeometry(
  source: THREE.BufferGeometry,
  levels: number = ENGINE_CONSTANTS.SUBDIVISION_LEVELS
): THREE.BufferGeometry {
  let geo = source.index ? source : mergeVerticesSimple(source);

  for (let lvl = 0; lvl < levels; lvl++) {
    const posAttr = geo.attributes.position as THREE.BufferAttribute;
    const uvAttr = geo.attributes.uv as THREE.BufferAttribute | undefined;
    const indexAttr = geo.getIndex();
    if (!indexAttr) break;

    const oldVertCount = posAttr.count;
    const newPositions: number[] = Array.from(posAttr.array);
    const newUvs: number[] = uvAttr ? Array.from(uvAttr.array) : [];

    // Map edge key -> midpoint vertex index + opposite vertices for Loop weighted edge rule
    const edgeMidpoints = new Map<string, number>();
    const edgeOpposites = new Map<string, number[]>();
    const vertNeighbors: Set<number>[] = Array.from({ length: oldVertCount }, () => new Set<number>());

    const idxArr = indexAttr.array;
    const edgeKey = (a: number, b: number) => (a < b ? `${a}_${b}` : `${b}_${a}`);

    const registerEdge = (a: number, b: number, opp: number) => {
      vertNeighbors[a].add(b);
      vertNeighbors[b].add(a);
      const k = edgeKey(a, b);
      let opps = edgeOpposites.get(k);
      if (!opps) {
        opps = [];
        edgeOpposites.set(k, opps);
      }
      opps.push(opp);
    };

    for (let t = 0; t < idxArr.length; t += 3) {
      const a = idxArr[t];
      const b = idxArr[t + 1];
      const c = idxArr[t + 2];
      registerEdge(a, b, c);
      registerEdge(b, c, a);
      registerEdge(c, a, b);
    }

    const getMidpoint = (a: number, b: number): number => {
      const k = edgeKey(a, b);
      const existing = edgeMidpoints.get(k);
      if (existing !== undefined) return existing;

      const opps = edgeOpposites.get(k) || [];
      let mx: number;
      let my: number;
      let mz: number;

      if (opps.length === 2) {
        // Interior Loop edge weight: 3/8*(A+B) + 1/8*(C+D)
        const c = opps[0];
        const d = opps[1];
        mx = 0.375 * (posAttr.getX(a) + posAttr.getX(b)) + 0.125 * (posAttr.getX(c) + posAttr.getX(d));
        my = 0.375 * (posAttr.getY(a) + posAttr.getY(b)) + 0.125 * (posAttr.getY(c) + posAttr.getY(d));
        mz = 0.375 * (posAttr.getZ(a) + posAttr.getZ(b)) + 0.125 * (posAttr.getZ(c) + posAttr.getZ(d));
      } else {
        mx = 0.5 * (posAttr.getX(a) + posAttr.getX(b));
        my = 0.5 * (posAttr.getY(a) + posAttr.getY(b));
        mz = 0.5 * (posAttr.getZ(a) + posAttr.getZ(b));
      }

      const newIdx = newPositions.length / 3;
      newPositions.push(mx, my, mz);

      if (uvAttr) {
        newUvs.push(
          0.5 * (uvAttr.getX(a) + uvAttr.getX(b)),
          0.5 * (uvAttr.getY(a) + uvAttr.getY(b))
        );
      }

      edgeMidpoints.set(k, newIdx);
      return newIdx;
    };

    // Reposition original vertices using Loop beta weights
    const updatedOldPos = new Float32Array(oldVertCount * 3);
    for (let i = 0; i < oldVertCount; i++) {
      const n = vertNeighbors[i].size;
      if (n < 3) {
        updatedOldPos[i * 3] = posAttr.getX(i);
        updatedOldPos[i * 3 + 1] = posAttr.getY(i);
        updatedOldPos[i * 3 + 2] = posAttr.getZ(i);
        continue;
      }
      const beta = n === 3 ? 3 / 16 : 3 / (8 * n);
      let sx = 0;
      let sy = 0;
      let sz = 0;
      vertNeighbors[i].forEach((nb) => {
        sx += posAttr.getX(nb);
        sy += posAttr.getY(nb);
        sz += posAttr.getZ(nb);
      });
      const selfW = 1 - n * beta;
      updatedOldPos[i * 3] = selfW * posAttr.getX(i) + beta * sx;
      updatedOldPos[i * 3 + 1] = selfW * posAttr.getY(i) + beta * sy;
      updatedOldPos[i * 3 + 2] = selfW * posAttr.getZ(i) + beta * sz;
    }

    for (let i = 0; i < oldVertCount * 3; i++) {
      newPositions[i] = updatedOldPos[i];
    }

    const newIndices: number[] = [];
    for (let t = 0; t < idxArr.length; t += 3) {
      const a = idxArr[t];
      const b = idxArr[t + 1];
      const c = idxArr[t + 2];
      const ab = getMidpoint(a, b);
      const bc = getMidpoint(b, c);
      const ca = getMidpoint(c, a);
      newIndices.push(a, ab, ca, b, bc, ab, c, ca, bc, ab, bc, ca);
    }

    const nextGeo = new THREE.BufferGeometry();
    nextGeo.setAttribute('position', new THREE.Float32BufferAttribute(newPositions, 3));
    if (uvAttr) {
      nextGeo.setAttribute('uv', new THREE.Float32BufferAttribute(newUvs, 2));
    }
    nextGeo.setIndex(newIndices);
    if (lvl > 0) geo.dispose();
    geo = nextGeo;
  }

  geo.computeVertexNormals();
  if (geo.attributes.uv) {
    geo.setAttribute('uv2', geo.attributes.uv.clone());
  }
  geo.computeBoundingBox();
  geo.computeBoundingSphere();
  return geo;
}

/** Helper to weld duplicate vertices before Loop subdivision */
function mergeVerticesSimple(geometry: THREE.BufferGeometry): THREE.BufferGeometry {
  const pos = geometry.attributes.position as THREE.BufferAttribute;
  const uv = geometry.attributes.uv as THREE.BufferAttribute | undefined;
  const map = new Map<string, number>();
  const newPos: number[] = [];
  const newUv: number[] = [];
  const indices: number[] = [];

  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const key = `${Math.round(x * 1e4)}_${Math.round(y * 1e4)}_${Math.round(z * 1e4)}`;
    let idx = map.get(key);
    if (idx === undefined) {
      idx = newPos.length / 3;
      newPos.push(x, y, z);
      if (uv) newUv.push(uv.getX(i), uv.getY(i));
      map.set(key, idx);
    }
    indices.push(idx);
  }

  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(newPos, 3));
  if (uv) out.setAttribute('uv', new THREE.Float32BufferAttribute(newUv, 2));
  out.setIndex(indices);
  return out;
}

/**
 * Generates a Catmull-Rom TubeGeometry with variable radius profile and parallel-transport (Bishop) frames.
 * Supports oval cross-sections, muscular bulges, joint pinches, dorsal ridges, and sealed caps.
 */
export function createTaperedTubeGeometry(
  curve: THREE.CatmullRomCurve3,
  tubularSegments: number,
  radialSegments: number,
  radiusFn: (t: number, angle: number) => number,
  options?: {
    capStart?: boolean;
    capEnd?: boolean;
    ovalAspect?: number;
    noise?: ProceduralNoise;
    displacementAmp?: number;
  }
): THREE.BufferGeometry {
  const capStart = options?.capStart ?? true;
  const capEnd = options?.capEnd ?? true;
  const ovalAspect = options?.ovalAspect ?? 1.0;
  const noise = options?.noise;
  const dispAmp = options?.displacementAmp ?? 0;

  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  // Parallel transport frames to avoid Frenet twisting glitches on 3D S-curves
  const frames = curve.computeFrenetFrames(tubularSegments, false);
  const p = new THREE.Vector3();
  const n = new THREE.Vector3();
  const b = new THREE.Vector3();
  const vertex = new THREE.Vector3();

  for (let i = 0; i <= tubularSegments; i++) {
    const t = i / tubularSegments;
    curve.getPointAt(t, p);
    n.copy(frames.normals[i]);
    b.copy(frames.binormals[i]);

    for (let j = 0; j <= radialSegments; j++) {
      const v = j / radialSegments;
      const angle = v * Math.PI * 2;
      const r = Math.max(0.002, radiusFn(t, angle));

      const cos = Math.cos(angle) * r;
      const sin = Math.sin(angle) * r * ovalAspect;

      vertex.copy(p).addScaledVector(n, cos).addScaledVector(b, sin);

      if (noise && dispAmp > 0) {
        const d = noise.fbm3D(vertex.x * 4.2, vertex.y * 4.2, vertex.z * 4.2, 2) * dispAmp;
        const radialDir = new THREE.Vector3().subVectors(vertex, p).normalize();
        vertex.addScaledVector(radialDir, d);
      }

      positions.push(vertex.x, vertex.y, vertex.z);
      uvs.push(t, v);
    }
  }

  const stride = radialSegments + 1;
  for (let i = 0; i < tubularSegments; i++) {
    for (let j = 0; j < radialSegments; j++) {
      const a = i * stride + j;
      const bIdx = (i + 1) * stride + j;
      const c = (i + 1) * stride + (j + 1);
      const d = i * stride + (j + 1);
      indices.push(a, bIdx, d);
      indices.push(bIdx, c, d);
    }
  }

  if (capStart) {
    const startCenter = curve.getPointAt(0);
    const tangent0 = curve.getTangentAt(0);
    startCenter.addScaledVector(tangent0, -Math.max(0.004, radiusFn(0, 0) * 0.45));
    const centerIdx = positions.length / 3;
    positions.push(startCenter.x, startCenter.y, startCenter.z);
    uvs.push(0, 0.5);
    for (let j = 0; j < radialSegments; j++) {
      indices.push(centerIdx, j + 1, j);
    }
  }

  if (capEnd) {
    const endCenter = curve.getPointAt(1);
    const tangent1 = curve.getTangentAt(1);
    endCenter.addScaledVector(tangent1, Math.max(0.004, radiusFn(1, 0) * 0.45));
    const centerIdx = positions.length / 3;
    positions.push(endCenter.x, endCenter.y, endCenter.z);
    uvs.push(1, 0.5);
    const base = tubularSegments * stride;
    for (let j = 0; j < radialSegments; j++) {
      indices.push(centerIdx, base + j, base + j + 1);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.setAttribute('uv2', geometry.attributes.uv.clone());
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();

  return geometry;
}

/**
 * Assigns smooth cylindrical-organic UV coordinates to an SDF torso mesh
 * for crisp procedural texture mapping without pinching.
 */
export function assignOrganicUVs(geometry: THREE.BufferGeometry): void {
  geometry.computeBoundingBox();
  const box = geometry.boundingBox!;
  const size = new THREE.Vector3().subVectors(box.max, box.min);
  const center = new THREE.Vector3().addVectors(box.min, box.max).multiplyScalar(0.5);

  const pos = geometry.attributes.position as THREE.BufferAttribute;
  const uvs = new Float32Array(pos.count * 2);

  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i) - center.x;
    const y = pos.getY(i) - center.y;
    const z = (pos.getZ(i) - box.min.z) / Math.max(1e-4, size.z);
    // Mirrored bilateral azimuthal coordinate prevents atan2 wrap-around seam triangles
    const angle = Math.abs(Math.atan2(x, y)) / Math.PI;
    uvs[i * 2] = angle * 2.0;
    uvs[i * 2 + 1] = z * 2.0;
  }

  geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
}
