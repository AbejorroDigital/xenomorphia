import * as THREE from 'three';
import { ENGINE_CONSTANTS } from './constants';
import { ResolvedGenes } from './archetypes';
import {
  createTaperedTubeGeometry,
  extractSdfIsosurface,
  sdEllipsoid,
  sdTaperedCapsule,
  smax,
  smin,
} from './geometryUtils';
import { ProceduralNoise, SeededPRNG } from './prng';
import { AnatomicalSlot, CreatureGenome } from './types';

export interface TorsoBuildResult {
  geometry: THREE.BufferGeometry;
  slots: AnatomicalSlot[];
  headCenter: THREE.Vector3;
  torsoCenter: THREE.Vector3;
  bounds: THREE.Box3;
}

/**
 * Generates the organic SDF-blended torso + neck + cranium + muscle sockets
 * driven dynamically by the resolved SubMorphotype (bodyAxis, headPosition, spineSegments,
 * shellType, radial symmetry, and limb configurations).
 */
export function buildOrganicTorso(
  genome: CreatureGenome,
  genes: ResolvedGenes,
  sdfResolution: number = ENGINE_CONSTANTS.SDF_GRID_RESOLUTION
): TorsoBuildResult {
  const rng = new SeededPRNG(genome.seed ^ 0x13579bdf);
  const noise = new ProceduralNoise(genome.seed ^ 0x2468ace1);

  const sub = genes.subMorphotype;
  const sym = genes.effectiveSymmetry;

  const w = genes.torsoWidth * 0.48;
  const h = genes.torsoHeight * 0.46;
  const l = genes.torsoLength * 0.52;
  const arch = genes.spineArch;
  const headR = genes.headScale * 0.38;
  const neckLen = genes.neckLength * 0.55;

  const isRadial =
    sym === 'radial4' || sym === 'radial5' || sym === 'radial6' || sym === 'radial8';

  const radialCount =
    sym === 'radial8' ? 8 : sym === 'radial6' ? 6 : sym === 'radial5' ? 5 : sym === 'radial4' ? 4 : 2;

  const axis = sub.bodyAxis;
  const isVertical = axis === 'vertical' && !isRadial;
  const isCoiled = axis === 'coiled' && !isRadial;

  // Spine nodes (Pelvis -> Abdomen -> Thorax -> Neck -> Cranium -> Snout)
  let pelvisPos: THREE.Vector3;
  let abdomenPos: THREE.Vector3;
  let thoraxPos: THREE.Vector3;
  let neckStart: THREE.Vector3;
  let headPos: THREE.Vector3;
  let snoutPos: THREE.Vector3;

  // Metameric spline nodes for coiled/serpentine topologies (e.g. snakes, eels, centipedes, caecilians)
  const coiledNodes: THREE.Vector3[] = [];

  if (isRadial) {
    pelvisPos = new THREE.Vector3(0, -h * 0.42, 0);
    abdomenPos = new THREE.Vector3(0, 0.0, 0);
    thoraxPos = new THREE.Vector3(0, h * 0.25, 0);
    neckStart = new THREE.Vector3(0, h * 0.45, 0);
    headPos =
      sub.headPosition === 'embedded'
        ? new THREE.Vector3(0, h * 0.35, w * 0.18)
        : new THREE.Vector3(0, h * 0.68 + neckLen * 0.32, 0);
    snoutPos = new THREE.Vector3(0, headPos.y + headR * 0.25, headPos.z + headR * 0.38);
  } else if (isVertical) {
    // Upright bipedal / arboreal / avian-owl / penguin / seahorse axis
    pelvisPos = new THREE.Vector3(0, -h * 0.55, -w * 0.14);
    abdomenPos = new THREE.Vector3(0, -h * 0.05, arch * 0.08);
    thoraxPos = new THREE.Vector3(0, h * 0.45, w * 0.12);
    neckStart = new THREE.Vector3(0, thoraxPos.y + h * 0.28, thoraxPos.z + w * 0.05);
    headPos =
      sub.headPosition === 'embedded'
        ? new THREE.Vector3(0, thoraxPos.y + h * 0.42, thoraxPos.z + w * 0.25)
        : new THREE.Vector3(0, thoraxPos.y + h * 0.48 + neckLen * 0.65, thoraxPos.z + w * 0.14 + neckLen * 0.18);
    snoutPos = new THREE.Vector3(0, headPos.y - headR * 0.1, headPos.z + headR * 0.92);
  } else if (isCoiled) {
    // Sinuous multi-segment serpentine / myriapod / anguilliform spine
    const segCount = Math.min(9, Math.max(5, sub.spineSegments || 6));
    const waveAmp = w * (0.45 + arch * 0.85);
    for (let i = 0; i < segCount; i++) {
      const t = i / (segCount - 1); // 0 = rear pelvis, 1 = front thorax
      const z = THREE.MathUtils.lerp(-l * 0.92, l * 0.72, t);
      const x = Math.sin(t * Math.PI * 2.2) * waveAmp;
      const y = Math.sin(t * Math.PI) * arch * 0.12;
      coiledNodes.push(new THREE.Vector3(x, y, z));
    }
    pelvisPos = coiledNodes[0].clone();
    abdomenPos = coiledNodes[Math.floor(segCount / 2)].clone();
    thoraxPos = coiledNodes[segCount - 1].clone();
    neckStart = thoraxPos.clone().add(new THREE.Vector3(0, h * 0.06, l * 0.08));
    headPos = new THREE.Vector3(
      thoraxPos.x * 0.5,
      thoraxPos.y + h * 0.22 + neckLen * 0.35,
      thoraxPos.z + headR * 0.85 + neckLen * 0.55
    );
    snoutPos = new THREE.Vector3(headPos.x, headPos.y - headR * 0.08, headPos.z + headR * 0.95);
  } else {
    // Horizontal / curved quadruped, theropod, sauropod, ray, turtle, etc.
    pelvisPos = new THREE.Vector3(0, 0.02, -l * 0.64);
    abdomenPos = new THREE.Vector3(0, arch * 0.18, -l * 0.14);
    thoraxPos = new THREE.Vector3(0, arch * 0.36 + 0.06, l * 0.34);
    neckStart = new THREE.Vector3(0, thoraxPos.y + h * 0.14, thoraxPos.z + l * 0.16);

    if (sub.headPosition === 'embedded') {
      headPos = new THREE.Vector3(0, thoraxPos.y + h * 0.08, thoraxPos.z + l * 0.36);
    } else if (sub.headPosition === 'top') {
      headPos = new THREE.Vector3(
        0,
        thoraxPos.y + h * 0.48 + neckLen * 0.82,
        thoraxPos.z + l * 0.24 + neckLen * 0.42
      );
    } else if (sub.headPosition === 'lateral') {
      headPos = new THREE.Vector3(
        w * 0.55,
        thoraxPos.y + h * 0.28 + neckLen * 0.35,
        thoraxPos.z + l * 0.28 + neckLen * 0.52
      );
    } else {
      // 'front'
      headPos = new THREE.Vector3(
        0,
        thoraxPos.y + h * 0.26 + neckLen * 0.32,
        thoraxPos.z + l * 0.28 + neckLen * 0.78
      );
    }
    snoutPos = new THREE.Vector3(headPos.x, headPos.y - headR * 0.1, headPos.z + headR * 0.95);
  }

  const kBlend = ENGINE_CONSTANTS.SDF_SMOOTH_MIN_K * (0.75 + genome.thickness * 0.25);

  const thoraxRadii = isVertical
    ? new THREE.Vector3(w * 1.05, h * 0.62, l * 0.82)
    : new THREE.Vector3(w * 1.05, h * 0.96, l * 0.55);
  const pelvisRadii = isVertical
    ? new THREE.Vector3(w * 0.88, h * 0.48, l * 0.72)
    : new THREE.Vector3(w * 0.84, h * 0.78, l * 0.42);
  const headRadii = new THREE.Vector3(headR * 0.95, headR * 0.86, headR * 1.15);
  const snoutRadii = new THREE.Vector3(headR * 0.58, headR * 0.5, headR * 0.78);

  const asymShiftX = genes.asymmetryJitter * rng.signed() * 0.14;
  const isAlien = genome.archetype === 'alien';
  const isInsect = genome.archetype === 'insecto';
  const isAvian = genome.archetype === 'ave';
  const isFish = genome.archetype === 'pez';
  const isAmphibian = genome.archetype === 'anfibio';
  const isMammal = genome.archetype === 'mamifero';

  const hasTurtleShell = sub.shellType === 'turtle_carapace';
  const hasFlattenedDisc =
    sub.specialFeatures.includes('flattened_disc') || sub.specialFeatures.includes('manta_glider_disc');
  const hasPetioleWaist = sub.specialFeatures.includes('petiole_waist');
  const isPentaradial = sym === 'radial5';

  // Composite SDF scalar field
  const sdfFn = (p: THREE.Vector3): number => {
    let d: number;

    if (isRadial) {
      if (isPentaradial) {
        // Flattened star disc for echinoderms
        const dDisc = sdEllipsoid(
          p,
          new THREE.Vector3(0, 0, 0),
          new THREE.Vector3(w * 1.25, h * 0.55, w * 1.25)
        );
        const angle = Math.atan2(p.z, p.x);
        const rDist = Math.sqrt(p.x * p.x + p.z * p.z);
        const starLobe = Math.cos(angle * 5) * 0.14 * Math.min(1, rDist * 1.8);
        d = dDisc - starLobe;
      } else {
        const dMantle = sdEllipsoid(
          p,
          new THREE.Vector3(asymShiftX * 0.5, 0.12, 0),
          new THREE.Vector3(w * 1.08, h * 1.24, w * 1.08)
        );
        const dCrown = sdEllipsoid(
          p,
          headPos,
          new THREE.Vector3(headR * 1.12, headR * 1.02, headR * 1.12)
        );
        const dBase = sdTaperedCapsule(
          p,
          new THREE.Vector3(0, -h * 0.55, 0),
          headPos,
          w * 0.65,
          headR * 0.85
        );
        d = smin(dMantle, dBase, kBlend);
        d = smin(d, dCrown, kBlend * 0.85);

        const angle = Math.atan2(p.z, p.x);
        const rDist = Math.sqrt(p.x * p.x + p.z * p.z);
        const rib = Math.cos(angle * radialCount) * 0.045 * Math.min(1, rDist * 2.2);
        d -= rib;
      }
    } else if (isCoiled) {
      // Sinuous multi-segment spline SDF
      d = Infinity;
      for (let i = 0; i < coiledNodes.length - 1; i++) {
        const t = i / (coiledNodes.length - 1);
        const segR = w * (0.62 + Math.sin(t * Math.PI) * 0.34);
        const nextR = w * (0.62 + Math.sin(((i + 1) / (coiledNodes.length - 1)) * Math.PI) * 0.34);
        const segD = sdTaperedCapsule(p, coiledNodes[i], coiledNodes[i + 1], segR, nextR);
        d = i === 0 ? segD : smin(d, segD, kBlend * 0.45);
      }
      const dNeck = sdTaperedCapsule(p, neckStart, headPos, headR * 0.72, headR * 0.62);
      const dHead = sdEllipsoid(p, headPos, headRadii);
      const dSnout = sdEllipsoid(p, snoutPos, snoutRadii);
      d = smin(d, dNeck, kBlend * 0.55);
      d = smin(d, dHead, kBlend * 0.55);
      d = smin(d, dSnout, kBlend * 0.45);

      if (sub.spineSegments >= 6) {
        // Metameric exoskeleton/annuli ring pinch
        const segPinch = Math.abs(Math.sin(p.z * 9.5)) * 0.025;
        d += segPinch;
      }
    } else {
      // Anterior-posterior or vertical articulated spine
      const dSpineRear = sdTaperedCapsule(p, pelvisPos, abdomenPos, w * 0.68, w * 0.82);
      const dSpineFront = sdTaperedCapsule(p, abdomenPos, thoraxPos, w * 0.82, w * 0.92);
      const dThorax = sdEllipsoid(p, thoraxPos, thoraxRadii);
      const dPelvis = sdEllipsoid(p, pelvisPos, pelvisRadii);

      let dNeck: number;
      if (isAvian || sub.neckRatio > 0.85) {
        // S-curved avian / sauropod / heron neck
        const neckMid = neckStart
          .clone()
          .lerp(headPos, 0.5)
          .add(new THREE.Vector3(0, -neckLen * 0.14, neckLen * 0.22));
        const dN1 = sdTaperedCapsule(p, neckStart, neckMid, headR * 0.7, headR * 0.5);
        const dN2 = sdTaperedCapsule(p, neckMid, headPos, headR * 0.5, headR * 0.54);
        dNeck = smin(dN1, dN2, kBlend * 0.45);
      } else {
        dNeck = sdTaperedCapsule(p, neckStart, headPos, headR * 0.72, headR * 0.62);
      }

      const dHead = sdEllipsoid(p, headPos, headRadii);
      const dSnout = sdEllipsoid(p, snoutPos, snoutRadii);

      d = smin(dSpineRear, dSpineFront, kBlend);
      d = smin(d, dThorax, kBlend);
      d = smin(d, dPelvis, kBlend * 0.9);
      if (sub.neckRatio > 0.04) {
        d = smin(d, dNeck, kBlend * 0.68);
      }
      d = smin(d, dHead, kBlend * 0.62);
      d = smin(d, dSnout, kBlend * 0.5);

      // Turtle rib-fused carapace dome + flat plastron
      if (hasTurtleShell) {
        const dDome = sdEllipsoid(
          p,
          abdomenPos.clone().add(new THREE.Vector3(0, h * 0.35, 0)),
          new THREE.Vector3(w * 1.48, h * 1.05, l * 1.02)
        );
        d = smin(d, dDome, kBlend * 0.45);
      }

      // Flattened disc for mantas / rays / void_manta
      if (hasFlattenedDisc) {
        const dDisc = sdEllipsoid(
          p,
          abdomenPos,
          new THREE.Vector3(w * 1.75, h * 0.35, l * 0.85)
        );
        d = smin(d, dDisc, kBlend * 0.65);
      }

      const absP = new THREE.Vector3(Math.abs(p.x), p.y, p.z);
      if (!isFish && !hasTurtleShell) {
        const shoulderSocket = sdEllipsoid(
          absP,
          new THREE.Vector3(w * 0.85, thoraxPos.y - h * 0.12, thoraxPos.z + l * 0.06),
          new THREE.Vector3(w * 0.32, h * 0.32, l * 0.22)
        );
        const hipSocket = sdEllipsoid(
          absP,
          new THREE.Vector3(w * 0.74, pelvisPos.y - h * 0.08, pelvisPos.z - l * 0.04),
          new THREE.Vector3(w * 0.28, h * 0.28, l * 0.22)
        );
        d = smin(d, shoulderSocket, kBlend * 0.42);
        d = smin(d, hipSocket, kBlend * 0.4);
      } else if (isFish) {
        for (let g = 0; g < 3; g++) {
          const gillCleft = sdEllipsoid(
            absP,
            new THREE.Vector3(w * 0.72, thoraxPos.y, thoraxPos.z + l * (0.26 - g * 0.09)),
            new THREE.Vector3(w * 0.16, h * 0.42, l * 0.032)
          );
          d = smax(d, -gillCleft, kBlend * 0.09);
        }
      }

      if (sub.eyeCount > 0 && sub.headPosition !== 'embedded') {
        const browRidge = sdEllipsoid(
          absP,
          new THREE.Vector3(headR * 0.56, headPos.y + headR * 0.32, headPos.z + headR * 0.34),
          new THREE.Vector3(headR * 0.24, headR * 0.16, headR * 0.28)
        );
        const eyeRecess = sdEllipsoid(
          absP,
          new THREE.Vector3(headR * 0.68, headPos.y + headR * 0.14, headPos.z + headR * 0.42),
          new THREE.Vector3(headR * 0.22, headR * 0.2, headR * 0.2)
        );
        d = smin(d, browRidge, kBlend * 0.25);
        d = smax(d, -eyeRecess, kBlend * 0.18);
      }

      if (isAmphibian) {
        const parotid = sdEllipsoid(
          absP,
          new THREE.Vector3(headR * 0.82, headPos.y - headR * 0.05, headPos.z - headR * 0.32),
          new THREE.Vector3(headR * 0.4, headR * 0.3, headR * 0.42)
        );
        d = smin(d, parotid, kBlend * 0.38);
      }

      if (isMammal && !isVertical) {
        const waistPinch = Math.exp(-Math.pow((p.z - abdomenPos.z) / Math.max(0.15, l * 0.24), 2));
        if (p.y < thoraxPos.y) {
          d += waistPinch * 0.058;
        }
      }

      if (isAvian && !isVertical) {
        const keel = sdTaperedCapsule(
          p,
          new THREE.Vector3(0, thoraxPos.y - h * 0.62, thoraxPos.z - l * 0.1),
          new THREE.Vector3(0, thoraxPos.y - h * 0.42, thoraxPos.z + l * 0.36),
          w * 0.14,
          w * 0.26
        );
        d = smin(d, keel, kBlend * 0.48);
      }

      if (isInsect) {
        const segFreq = sub.spineSegments >= 3 ? 7.5 : 5.2;
        const segWave = Math.abs(Math.sin(p.z * segFreq)) * 0.032;
        const petiolePinch = hasPetioleWaist
          ? Math.exp(-Math.pow((p.z - pelvisPos.z * 0.45) / Math.max(0.1, l * 0.13), 2)) * 0.095
          : 0;
        d += segWave + petiolePinch;
      }

      if (genes.asymmetryJitter > 0.05) {
        d += Math.sin(p.z * 4.5 + p.x * 3.0) * 0.025 * genes.asymmetryJitter;
      }
    }

    if (isAlien) {
      const gx = p.x * 5.2;
      const gy = p.y * 5.2;
      const gz = p.z * 5.2;
      const gyroid =
        Math.sin(gx) * Math.cos(gy) + Math.sin(gy) * Math.cos(gz) + Math.sin(gz) * Math.cos(gx);
      d += gyroid * 0.026;
    }

    return d;
  };

  // Compute tight SDF bounding box dynamically around all spine + head + shell bounds
  const extraX = hasFlattenedDisc ? w * 1.9 : hasTurtleShell ? w * 1.65 : w * 1.55;
  const pad = ENGINE_CONSTANTS.SDF_FIELD_PADDING + w * 0.55;
  const minY = Math.min(pelvisPos.y - h, thoraxPos.y - h, -h * 1.4) - pad;
  const maxY = Math.max(headPos.y + headR * 1.4, thoraxPos.y + h * 1.35, h * 1.55) + pad;
  const minZ = Math.min(pelvisPos.z - l * 0.55, -w * 1.5) - pad;
  const maxZ = Math.max(snoutPos.z + headR * 1.2, thoraxPos.z + l * 0.55, w * 1.5) + pad;

  const boundsMin = new THREE.Vector3(-extraX - pad, minY, minZ);
  const boundsMax = new THREE.Vector3(extraX + pad, maxY, maxZ);

  const geometry = extractSdfIsosurface(
    sdfFn,
    boundsMin,
    boundsMax,
    sdfResolution,
    noise,
    genome.displacementAmp
  );

  // Project anatomical attachment slots onto exact SDF surface (sdf = 0)
  const snapToSurface = (
    origin: THREE.Vector3,
    dir: THREE.Vector3
  ): { pos: THREE.Vector3; normal: THREE.Vector3 } => {
    const rayDir = dir.clone().normalize();
    let bestT = 0;
    let minAbs = Infinity;
    const probe = new THREE.Vector3();
    const maxRay = Math.max(1.2, (w + h + l) * 1.28);
    for (let s = 0; s <= 40; s++) {
      const t = (s / 40) * maxRay;
      probe.copy(origin).addScaledVector(rayDir, t);
      const val = Math.abs(sdfFn(probe));
      if (val < minAbs) {
        minAbs = val;
        bestT = t;
      }
    }
    const pos = origin.clone().addScaledVector(rayDir, Math.max(0.02, bestT - 0.024));

    const eps = 0.015;
    const nx =
      sdfFn(new THREE.Vector3(pos.x + eps, pos.y, pos.z)) -
      sdfFn(new THREE.Vector3(pos.x - eps, pos.y, pos.z));
    const ny =
      sdfFn(new THREE.Vector3(pos.x, pos.y + eps, pos.z)) -
      sdfFn(new THREE.Vector3(pos.x, pos.y - eps, pos.z));
    const nz =
      sdfFn(new THREE.Vector3(pos.x, pos.y, pos.z + eps)) -
      sdfFn(new THREE.Vector3(pos.x, pos.y, pos.z - eps));
    const normal = new THREE.Vector3(nx, ny, nz);
    if (normal.lengthSq() < 1e-6) normal.copy(rayDir);
    else normal.normalize();

    return { pos, normal };
  };

  const slots: AnatomicalSlot[] = [];

  const makeSlot = (
    id: string,
    kind: AnatomicalSlot['kind'],
    origin: THREE.Vector3,
    dir: THREE.Vector3,
    side: -1 | 0 | 1,
    index: number,
    extra?: Pick<AnatomicalSlot, 'limbRole' | 'limbLengthScale' | 'articulation'>
  ) => {
    const { pos, normal } = snapToSurface(origin, dir);
    const up = new THREE.Vector3(0, 1, 0);
    const tangent = new THREE.Vector3().crossVectors(up, normal);
    if (tangent.lengthSq() < 1e-5) tangent.set(1, 0, 0);
    else tangent.normalize();

    if (genes.asymmetryJitter > 0.02 && side !== 0) {
      pos.y += rng.signed() * 0.045 * genes.asymmetryJitter;
      pos.z += rng.signed() * 0.055 * genes.asymmetryJitter;
    }

    slots.push({ id, kind, position: pos, normal, tangent, side, index, ...extra });
  };

  // 1. Eyes (0..N)
  if (genes.eyeCount > 0) {
    const eyePairs = Math.ceil(genes.eyeCount / 2);
    for (let p = 0; p < eyePairs; p++) {
      const zOff = isRadial ? headR * 0.68 : headR * (0.5 - p * 0.24);
      const yOff = headR * (0.26 + p * 0.14);
      if (isRadial) {
        for (let r = 0; r < radialCount; r++) {
          if (r >= genes.eyeCount) break;
          const a = (r / radialCount) * Math.PI * 2;
          makeSlot(
            `eye_${p}_${r}`,
            'eye',
            headPos,
            new THREE.Vector3(Math.cos(a), 0.25, Math.sin(a)),
            0,
            r
          );
        }
        break;
      } else {
        for (const side of [-1, 1] as const) {
          if (p * 2 + (side === 1 ? 1 : 0) >= genes.eyeCount) continue;
          const eyeDir = sub.specialFeatures.includes('frontal_owl_eyes')
            ? new THREE.Vector3(side * 0.42, 0.22, 0.88)
            : new THREE.Vector3(side * 0.72, 0.26, 0.62);
          makeSlot(
            `eye_${p}_${side}`,
            'eye',
            new THREE.Vector3(headPos.x, headPos.y + yOff, headPos.z + zOff * 0.35),
            eyeDir,
            side,
            p
          );
        }
      }
    }
  }

  // 2. Jaw / Beak / Mandibles / Tongue
  if (!sub.specialFeatures.includes('headless_mantle')) {
    makeSlot(
      'jaw_main',
      'jaw',
      headPos,
      isRadial ? new THREE.Vector3(0, -0.85, 0.45) : new THREE.Vector3(0, -0.3, 0.95),
      0,
      0
    );
  }

  // 3. Ears or Antennae
  if (sub.hasAntennae || genome.archetype === 'mamifero') {
    for (const side of [-1, 1] as const) {
      makeSlot(
        `ear_antenna_${side}`,
        'ear_antenna',
        new THREE.Vector3(headPos.x, headPos.y + headR * 0.38, headPos.z),
        new THREE.Vector3(side * 0.62, 0.75, isRadial ? 0.1 : 0.35),
        side,
        0
      );
    }
  }

  // 4. Dynamic Limbs (Forelimbs & Hindlimbs driven strictly by SubMorphotype)
  const fore = sub.limbConfiguration.forelimbs;
  const hind = sub.limbConfiguration.hindlimbs;

  if (isRadial) {
    const radialLimbCount = Math.max(fore.count + hind.count, 0);
    if (radialLimbCount > 0) {
      const count = Math.min(radialCount, radialLimbCount);
      for (let r = 0; r < count; r++) {
        const a = (r / count) * Math.PI * 2;
        makeSlot(
          `leg_radial_${r}`,
          'leg',
          new THREE.Vector3(0, -h * 0.3, 0),
          new THREE.Vector3(Math.cos(a), -0.45, Math.sin(a)),
          r % 2 === 0 ? 1 : -1,
          r,
          {
            limbRole: hind.type !== 'none' ? hind.type : fore.type,
            limbLengthScale: hind.type !== 'none' ? hind.lengthScale : fore.lengthScale,
            articulation: hind.articulation,
          }
        );
      }
    }
  } else {
    // Forelimbs (0, 2, or 4)
    const forePairs = Math.floor(fore.count / 2);
    for (let i = 0; i < forePairs; i++) {
      const frac = forePairs === 1 ? 0.0 : i / Math.max(1, forePairs - 1);
      const anchorPos = thoraxPos.clone().lerp(abdomenPos, frac * 0.55);
      const isArmKind =
        fore.type === 'arm' || fore.type === 'chela' || fore.type === 'raptorial';
      const kind: AnatomicalSlot['kind'] = isArmKind ? 'arm' : 'leg';

      for (const side of [-1, 1] as const) {
        const dir = isVertical
          ? new THREE.Vector3(side * 0.94, -0.15, 0.22)
          : new THREE.Vector3(side * 0.92, -0.32, 0.16);
        makeSlot(`${kind}_fore_${i}_${side}`, kind, anchorPos, dir, side, i, {
          limbRole: fore.type,
          limbLengthScale: fore.lengthScale,
          articulation: fore.articulation,
        });
      }
    }

    // Hindlimbs (0, 2, 4, 8, 12...)
    const hindPairs = Math.floor(hind.count / 2);
    for (let i = 0; i < hindPairs; i++) {
      const t = hindPairs === 1 ? 0.92 : (i + 1) / (hindPairs + 0.3);
      let anchorPos: THREE.Vector3;

      if (isCoiled && coiledNodes.length >= 2) {
        // Distribute along metameric spline segments
        const idxF = THREE.MathUtils.clamp(t * (coiledNodes.length - 1), 0, coiledNodes.length - 1.001);
        const idx0 = Math.floor(idxF);
        anchorPos = coiledNodes[idx0].clone().lerp(coiledNodes[idx0 + 1], idxF - idx0);
      } else if (isVertical) {
        anchorPos = pelvisPos.clone().add(new THREE.Vector3(0, -h * 0.12, 0));
      } else {
        anchorPos = abdomenPos.clone().lerp(pelvisPos, THREE.MathUtils.clamp(t, 0.1, 1.0));
      }

      for (const side of [-1, 1] as const) {
        const dir = isCoiled
          ? new THREE.Vector3(side * 0.96, -0.28, -0.05)
          : new THREE.Vector3(side * 0.88, -0.45, -0.08);
        makeSlot(`leg_hind_${i}_${side}`, 'leg', anchorPos, dir, side, i + forePairs, {
          limbRole: hind.type,
          limbLengthScale: hind.lengthScale,
          articulation: hind.articulation,
        });
      }
    }
  }

  // 5. Tentacles
  if (sub.hasTentacles && genes.tentacleCount > 0) {
    const count = genes.tentacleCount;
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2 + 0.18;
      const origin = isRadial
        ? new THREE.Vector3(0, -h * 0.52, 0)
        : sub.headPosition === 'front' && !sub.specialFeatures.includes('bioluminescent_whip')
          ? headPos.clone().add(new THREE.Vector3(0, -headR * 0.3, headR * 0.45))
          : pelvisPos.clone().add(new THREE.Vector3(0, -h * 0.1, 0));
      const dir = isRadial
        ? new THREE.Vector3(Math.cos(a), -0.65, Math.sin(a))
        : new THREE.Vector3(Math.cos(a) * 0.65, -0.45, Math.sin(a) * 0.65 + 0.4);
      makeSlot(
        `tentacle_${i}`,
        'tentacle',
        origin,
        dir,
        Math.cos(a) >= 0 ? 1 : -1,
        i
      );
    }
  }

  // 6. Wings (single pair or four_wings)
  if (sub.wingPresence !== 'none') {
    const wingPairs = sub.wingPresence === 'four_wings' ? 2 : 1;
    for (let wp = 0; wp < wingPairs; wp++) {
      const wAnchor = thoraxPos.clone().lerp(abdomenPos, wp * 0.45);
      for (const side of [-1, 1] as const) {
        makeSlot(
          `wing_${wp}_${side}`,
          'wing',
          new THREE.Vector3(wAnchor.x, wAnchor.y + h * 0.34, wAnchor.z),
          new THREE.Vector3(side * 0.88, 0.52 - wp * 0.12, -0.15 - wp * 0.18),
          side,
          wp
        );
      }
    }
  }

  // 7. Fins
  if (sub.hasFins) {
    for (const side of [-1, 1] as const) {
      makeSlot(
        `fin_${side}`,
        'fin',
        new THREE.Vector3(thoraxPos.x, thoraxPos.y - h * 0.14, thoraxPos.z),
        new THREE.Vector3(side * 0.95, -0.15, -0.2),
        side,
        0
      );
    }
  }

  // 8. Tail / Abdomen
  if (sub.tailPresence && sub.tailType !== 'none') {
    const tailDir = isVertical ? new THREE.Vector3(0, -0.45, -0.88) : new THREE.Vector3(0, -0.08, -1.0);
    makeSlot('tail_main', 'tail', pelvisPos, tailDir, 0, 0);
  }

  // 9. Dorsal Crest Spines
  if (sub.hasDorsalCrest && !isPentaradial) {
    const spineSteps = 6;
    for (let s = 0; s < spineSteps; s++) {
      const t = s / (spineSteps - 1);
      const pt = isRadial
        ? new THREE.Vector3(0, THREE.MathUtils.lerp(headPos.y, thoraxPos.y, t), 0)
        : headPos.clone().lerp(pelvisPos, t);
      const dir = isVertical ? new THREE.Vector3(0, 0.25, -1) : new THREE.Vector3(0, 1, -0.1);
      makeSlot(`crest_${s}`, 'crest', pt, dir, 0, s);
    }
  }

  // 10. Shell / Carapace / Dorsal Plates anchor slot
  if (sub.shellType !== 'none') {
    makeSlot(
      'shell_main',
      'shell',
      abdomenPos.clone().lerp(thoraxPos, 0.35),
      new THREE.Vector3(0, 1, -0.05),
      0,
      0
    );
  }

  geometry.computeBoundingBox();

  return {
    geometry,
    slots,
    headCenter: headPos,
    torsoCenter: abdomenPos,
    bounds: geometry.boundingBox!,
  };
}

/**
 * Builds an anatomical slot gizmo overlay group (surface anchor rings + outward normal vectors)
 * for inspecting local coordinates & orientations without Box/Sphere primitives.
 */
export function buildSlotsVisualizerGroup(slots: AnatomicalSlot[]): THREE.Group {
  const group = new THREE.Group();
  group.name = 'SlotsVisualizer';

  const colorByKind: Record<AnatomicalSlot['kind'], number> = {
    head: 0x38bdf8,
    eye: 0xfacc15,
    ear_antenna: 0xc084fc,
    jaw: 0xf43f5e,
    arm: 0x2dd4bf,
    leg: 0x34d399,
    wing: 0x60a5fa,
    fin: 0x22d3ee,
    tail: 0xfb923c,
    tentacle: 0xf472b6,
    crest: 0xa3e635,
    shell: 0xfbbf24,
  };

  const ringProfile = [
    new THREE.Vector2(0.032, 0.0),
    new THREE.Vector2(0.045, 0.005),
    new THREE.Vector2(0.032, 0.01),
    new THREE.Vector2(0.022, 0.005),
    new THREE.Vector2(0.032, 0.0),
  ];
  const ringGeo = new THREE.LatheGeometry(ringProfile, 16);
  ringGeo.rotateX(Math.PI / 2);

  slots.forEach((slot) => {
    const color = colorByKind[slot.kind] ?? 0x2dd4bf;
    const mat = new THREE.MeshBasicMaterial({ color, depthTest: true });

    const ring = new THREE.Mesh(ringGeo, mat);
    ring.position.copy(slot.position);
    ring.lookAt(slot.position.clone().add(slot.normal));
    group.add(ring);

    const arrowCurve = new THREE.CatmullRomCurve3([
      slot.position.clone(),
      slot.position.clone().addScaledVector(slot.normal, 0.14),
    ]);
    const arrowGeo = createTaperedTubeGeometry(arrowCurve, 4, 6, (t) => 0.009 * (1 - t * 0.75));
    const arrow = new THREE.Mesh(arrowGeo, mat);
    group.add(arrow);
  });

  return group;
}
