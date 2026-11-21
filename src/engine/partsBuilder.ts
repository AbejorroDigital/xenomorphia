import * as THREE from 'three';
import { ENGINE_CONSTANTS } from './constants';
import { ResolvedGenes } from './archetypes';
import { createTaperedTubeGeometry, subdivideLoopGeometry } from './geometryUtils';
import { ProceduralNoise, SeededPRNG } from './prng';
import { CreatureMaterialSuite } from './shaders';
import { AnatomicalSlot, CreatureGenome } from './types';

/**
 * Generates an articulated organic limb specialized by LimbCategory:
 * ('arm' | 'leg' | 'jumping_leg' | 'raptorial' | 'chela' | 'digging' | 'flipper' | 'reduced')
 * using Catmull-Rom variable-radius TubeGeometry + 2-level Loop Subdivision.
 */
export function buildLimbPart(
  slot: AnatomicalSlot,
  genome: CreatureGenome,
  genes: ResolvedGenes,
  materials: CreatureMaterialSuite,
  noise: ProceduralNoise,
  rng: SeededPRNG
): THREE.Group {
  const group = new THREE.Group();
  group.name = slot.id;

  const sideSign = slot.side === 0 ? 1 : slot.side;
  const stance = genes.profile.limbStance;
  const role = slot.limbRole ?? (slot.kind === 'arm' ? 'arm' : 'leg');
  const roleScale = slot.limbLengthScale ?? (slot.kind === 'arm' ? 0.85 : 1.0);
  const len = genes.limbLength * roleScale;
  const baseR = genes.limbRadius * (role === 'arm' || role === 'reduced' ? 0.84 : 1.06);

  const out = slot.normal.clone().normalize();
  const isRadial = genes.effectiveSymmetry.startsWith('radial');
  const radialHoriz = new THREE.Vector3(out.x, 0, out.z);
  if (radialHoriz.lengthSq() < 1e-4) radialHoriz.set(sideSign, 0, 0);
  radialHoriz.normalize();

  // Specialized hydrofoil flipper (whales, penguins, plesiosaurs)
  if (role === 'flipper') {
    const p0 = slot.position.clone().addScaledVector(out, -0.02);
    const pTip = p0
      .clone()
      .add(new THREE.Vector3(sideSign * len * 0.88, -len * 0.38, -len * 0.34));
    const pMid = p0
      .clone()
      .lerp(pTip, 0.45)
      .add(new THREE.Vector3(sideSign * len * 0.08, -len * 0.06, len * 0.14));

    const flipperCurve = new THREE.CatmullRomCurve3([p0, pMid, pTip]);
    const rawFlipper = createTaperedTubeGeometry(
      flipperCurve,
      14,
      8,
      (t) => baseR * (1.25 * Math.sin(Math.min(1, t * 1.08) * Math.PI * 0.88) + 0.25 * (1 - t)),
      { ovalAspect: 0.32, noise, displacementAmp: genome.displacementAmp * 0.2 }
    );
    const flipperGeo = subdivideLoopGeometry(rawFlipper, ENGINE_CONSTANTS.SUBDIVISION_LEVELS);
    rawFlipper.dispose();

    const mesh = new THREE.Mesh(flipperGeo, materials.skinMaterial);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    return group;
  }

  const p0 = slot.position.clone().addScaledVector(out, -0.02);
  let p1: THREE.Vector3;
  let p2: THREE.Vector3;
  let p3: THREE.Vector3;

  if (isRadial) {
    // Radiate outward symmetrically along slot direction
    p1 = p0.clone().addScaledVector(radialHoriz, len * 0.42).add(new THREE.Vector3(0, len * 0.18, 0));
    p2 = p1.clone().addScaledVector(radialHoriz, len * 0.36).add(new THREE.Vector3(0, -len * 0.56, 0));
    p3 = p2.clone().addScaledVector(radialHoriz, len * 0.14).add(new THREE.Vector3(0, -len * 0.52, 0));
  } else if (role === 'jumping_leg') {
    // Z-folded ballistic spring hindleg (kangaroo / frog / grasshopper)
    p1 = p0.clone().add(new THREE.Vector3(sideSign * len * 0.28, len * 0.14, len * 0.26));
    p2 = p1.clone().add(new THREE.Vector3(sideSign * len * 0.1, -len * 0.46, -len * 0.46));
    p3 = p2.clone().add(new THREE.Vector3(sideSign * len * 0.06, -len * 0.24, len * 0.44));
  } else if (role === 'raptorial') {
    // Mantis / forcipule folded scythe arm projecting forward
    p1 = p0.clone().add(new THREE.Vector3(sideSign * len * 0.26, len * 0.16, len * 0.36));
    p2 = p1.clone().add(new THREE.Vector3(sideSign * -len * 0.08, -len * 0.34, len * 0.34));
    p3 = p2.clone().add(new THREE.Vector3(sideSign * -len * 0.06, -len * 0.32, -len * 0.16));
  } else if (role === 'chela') {
    // Heavy pincer arm projecting outward & forward
    p1 = p0.clone().add(new THREE.Vector3(sideSign * len * 0.42, -len * 0.06, len * 0.26));
    p2 = p1.clone().add(new THREE.Vector3(sideSign * len * 0.12, -len * 0.1, len * 0.38));
    p3 = p2.clone().add(new THREE.Vector3(-sideSign * len * 0.16, 0.02, len * 0.28));
  } else if (role === 'digging') {
    // Short wide burrowing spade forelimb
    p1 = p0.clone().add(new THREE.Vector3(sideSign * len * 0.46, -len * 0.18, len * 0.16));
    p2 = p1.clone().add(new THREE.Vector3(sideSign * len * 0.12, -len * 0.26, len * 0.14));
    p3 = p2.clone().add(new THREE.Vector3(sideSign * len * 0.08, -len * 0.12, len * 0.2));
  } else if (role === 'reduced') {
    // Vestigial T-Rex / hummingbird limb
    p1 = p0.clone().add(new THREE.Vector3(sideSign * len * 0.22, -len * 0.28, len * 0.18));
    p2 = p1.clone().add(new THREE.Vector3(-sideSign * len * 0.06, -len * 0.22, len * 0.22));
    p3 = p2.clone().add(new THREE.Vector3(0, -len * 0.12, len * 0.12));
  } else if (role === 'arm') {
    // Articulated primate / brachiator / stalker arm
    p1 = p0.clone().add(new THREE.Vector3(sideSign * len * 0.26, -len * 0.34, len * 0.12));
    p2 = p1.clone().add(new THREE.Vector3(sideSign * len * 0.08, -len * 0.36, len * 0.24));
    p3 = p2.clone().add(new THREE.Vector3(-sideSign * len * 0.05, -len * 0.18, len * 0.16));
  } else if (stance === 'digitigrade') {
    p1 = p0.clone().add(new THREE.Vector3(sideSign * len * 0.22, -len * 0.28, len * 0.14));
    p2 = p1.clone().add(new THREE.Vector3(sideSign * len * 0.08, -len * 0.32, -len * 0.22));
    p3 = p2.clone().add(new THREE.Vector3(sideSign * len * 0.05, -len * 0.34, len * 0.26));
  } else if (stance === 'insectoid') {
    const zFan = (slot.index - 1.5) * -0.11;
    p1 = p0.clone().add(new THREE.Vector3(sideSign * len * 0.42, len * 0.26, zFan));
    p2 = p1.clone().add(new THREE.Vector3(sideSign * len * 0.36, -len * 0.46, zFan * 1.1));
    p3 = p2.clone().add(new THREE.Vector3(sideSign * len * 0.16, -len * 0.54, 0.05));
  } else {
    // Plantigrade / sprawled amphibian-reptile stance
    p1 = p0.clone().add(new THREE.Vector3(sideSign * len * 0.36, -len * 0.16, len * 0.08));
    p2 = p1.clone().add(new THREE.Vector3(sideSign * len * 0.12, -len * 0.38, -len * 0.05));
    p3 = p2.clone().add(new THREE.Vector3(sideSign * len * 0.04, -len * 0.14, len * 0.18));
  }

  p1.x += rng.signed() * 0.03 * genes.asymmetryJitter;
  p2.y += rng.signed() * 0.03 * genes.asymmetryJitter;

  const curve = new THREE.CatmullRomCurve3([p0, p1, p2, p3]);
  const rawTube = createTaperedTubeGeometry(
    curve,
    12,
    8,
    (t, angle) => {
      const shoulder = Math.exp(-Math.pow((t - 0.16) / 0.14, 2)) * (role === 'jumping_leg' ? 0.82 : 0.52);
      const jointPinch = Math.exp(-Math.pow((t - 0.38) / 0.07, 2)) * 0.24;
      const calf = Math.exp(-Math.pow((t - 0.62) / 0.15, 2)) * (role === 'digging' ? 0.65 : 0.32);
      const taper = 1.0 - t * 0.56;
      const ridge = stance === 'insectoid' ? Math.cos(angle * 4) * 0.08 : 0;
      const thickBoost = role === 'digging' || role === 'chela' ? 1.28 : role === 'reduced' ? 0.68 : 1.0;
      return baseR * thickBoost * Math.max(0.26, taper + shoulder + calf - jointPinch) * (1 + ridge);
    },
    {
      ovalAspect: role === 'digging' ? 0.65 : stance === 'insectoid' ? 0.85 : 1.12,
      noise,
      displacementAmp: genome.displacementAmp * 0.35,
    }
  );

  const limbGeo = subdivideLoopGeometry(rawTube, ENGINE_CONSTANTS.SUBDIVISION_LEVELS);
  rawTube.dispose();

  const limbMesh = new THREE.Mesh(limbGeo, materials.skinMaterial);
  limbMesh.castShadow = true;
  limbMesh.receiveShadow = true;
  group.add(limbMesh);

  // Specialized terminal appendages (chela pincers, raptorial spikes, opposable thumbs, claws)
  if (role === 'chela') {
    const crusherScale =
      genes.subMorphotype.specialFeatures.includes('asymmetric_crusher') && sideSign > 0 ? 1.55 : 1.0;
    const chelaLen = baseR * 3.4 * crusherScale;
    for (const jawSign of [-1, 1] as const) {
      const cCurve = new THREE.CatmullRomCurve3([
        p3.clone(),
        p3.clone().add(new THREE.Vector3(jawSign * chelaLen * 0.28, jawSign * 0.02, chelaLen * 0.55)),
        p3.clone().add(new THREE.Vector3(-jawSign * chelaLen * 0.06, 0, chelaLen)),
      ]);
      const rawPincher = createTaperedTubeGeometry(
        cCurve,
        8,
        6,
        (t) => baseR * 0.72 * crusherScale * (1 - t * 0.82),
        { ovalAspect: 0.7 }
      );
      const pincherGeo = subdivideLoopGeometry(rawPincher, ENGINE_CONSTANTS.SUBDIVISION_LEVELS);
      rawPincher.dispose();
      const pincherMesh = new THREE.Mesh(pincherGeo, materials.carapaceMaterial);
      pincherMesh.castShadow = true;
      group.add(pincherMesh);
    }
    return group;
  }

  if (role === 'raptorial') {
    // Row of predatory gripping spines along folded forearm
    for (const st of [0.46, 0.56, 0.66, 0.76, 0.86]) {
      const sPt = curve.getPointAt(st);
      const sCurve = new THREE.CatmullRomCurve3([
        sPt,
        sPt.clone().add(new THREE.Vector3(sideSign * baseR * 0.25, -baseR * 1.35, baseR * 0.45)),
      ]);
      const sGeo = createTaperedTubeGeometry(sCurve, 5, 5, (u) => baseR * 0.22 * (1 - u * 0.9));
      const sMesh = new THREE.Mesh(sGeo, materials.carapaceMaterial);
      sMesh.castShadow = true;
      group.add(sMesh);
    }
  }

  // Sculpted organic digits / claws / opposable thumb
  const digitCount = role === 'reduced' ? 2 : stance === 'insectoid' ? 2 : 3;
  const tangentEnd = curve.getTangentAt(1).normalize();
  const digitTips: THREE.Vector3[] = [];
  const hasOpposableThumb =
    role === 'arm' && genes.subMorphotype.specialFeatures.includes('opposable_thumbs');

  for (let d = 0; d < digitCount; d++) {
    const spread = (d - (digitCount - 1) / 2) * 0.36;
    const dDir = isRadial
      ? radialHoriz.clone().add(new THREE.Vector3(Math.sin(spread) * 0.35, -0.35, Math.cos(spread) * 0.25)).normalize()
      : new THREE.Vector3(
          tangentEnd.x + Math.sin(spread) * 0.65 * sideSign,
          -0.35,
          Math.cos(spread) * 0.75
        ).normalize();
    const clawLen =
      baseR *
      (role === 'digging' ? 2.65 : role === 'reduced' ? 1.1 : 1.85 + genome.limbComplexity * 1.1);
    const tipPos = p3.clone().addScaledVector(dDir, clawLen).add(new THREE.Vector3(0, -0.02, 0));
    digitTips.push(tipPos);

    const clawCurve = new THREE.CatmullRomCurve3([
      p3.clone(),
      p3.clone().addScaledVector(dDir, clawLen * 0.55).add(new THREE.Vector3(0, 0.02, 0)),
      tipPos,
    ]);
    const rawClaw = createTaperedTubeGeometry(
      clawCurve,
      5,
      5,
      (t) => baseR * (role === 'digging' ? 0.45 : 0.32) * (1 - t * 0.88)
    );
    const clawGeo = subdivideLoopGeometry(rawClaw, ENGINE_CONSTANTS.SUBDIVISION_LEVELS);
    rawClaw.dispose();

    const clawMesh = new THREE.Mesh(clawGeo, materials.carapaceMaterial);
    clawMesh.castShadow = true;
    group.add(clawMesh);
  }

  if (hasOpposableThumb) {
    const thumbCurve = new THREE.CatmullRomCurve3([
      p3.clone(),
      p3.clone().add(new THREE.Vector3(-sideSign * baseR * 1.15, -baseR * 0.4, baseR * 0.45)),
      p3.clone().add(new THREE.Vector3(-sideSign * baseR * 1.75, -baseR * 0.6, baseR * 0.95)),
    ]);
    const rawThumb = createTaperedTubeGeometry(thumbCurve, 5, 5, (t) => baseR * 0.34 * (1 - t * 0.75));
    const thumbGeo = subdivideLoopGeometry(rawThumb, ENGINE_CONSTANTS.SUBDIVISION_LEVELS);
    rawThumb.dispose();
    group.add(new THREE.Mesh(thumbGeo, materials.skinMaterial));
  }

  // Interdigital webbing for amphibians & webbed-foot birds
  if (
    (genome.archetype === 'anfibio' || genes.subMorphotype.specialFeatures.includes('webbed_feet')) &&
    digitTips.length >= 2
  ) {
    for (let d = 0; d < digitTips.length - 1; d++) {
      const a = p3.clone();
      const b = p3.clone().lerp(digitTips[d], 0.84);
      const c = p3.clone().lerp(digitTips[d + 1], 0.84);
      const webGeo = new THREE.BufferGeometry();
      webGeo.setAttribute(
        'position',
        new THREE.Float32BufferAttribute([a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z], 3)
      );
      webGeo.setAttribute('uv', new THREE.Float32BufferAttribute([0.5, 0, 0, 1, 1, 1], 2));
      webGeo.setIndex([0, 1, 2]);
      webGeo.computeVertexNormals();
      group.add(new THREE.Mesh(webGeo, materials.membraneMaterial));
    }
  } else if (stance === 'insectoid') {
    for (const spurT of [0.56, 0.72]) {
      const sPos = curve.getPointAt(spurT);
      const spurCurve = new THREE.CatmullRomCurve3([
        sPos,
        sPos.clone().add(new THREE.Vector3(sideSign * baseR * 0.9, -baseR * 0.5, -baseR * 0.6)),
        sPos.clone().add(new THREE.Vector3(sideSign * baseR * 1.4, -baseR * 1.2, -baseR * 1.1)),
      ]);
      const spurGeo = createTaperedTubeGeometry(spurCurve, 6, 5, (t) => baseR * 0.22 * (1 - t * 0.85));
      group.add(new THREE.Mesh(spurGeo, materials.carapaceMaterial));
    }
  } else if (genome.archetype === 'alien') {
    const jointPt = curve.getPointAt(0.38);
    const jointTan = curve.getTangentAt(0.38);
    const ringProfile = [
      new THREE.Vector2(baseR * 0.62, -baseR * 0.14),
      new THREE.Vector2(baseR * 0.78, 0),
      new THREE.Vector2(baseR * 0.62, baseR * 0.14),
    ];
    const ringGeo = new THREE.LatheGeometry(ringProfile, 14);
    ringGeo.rotateX(Math.PI / 2);
    const jointRing = new THREE.Mesh(ringGeo, materials.biolumMaterial);
    jointRing.position.copy(jointPt);
    jointRing.lookAt(jointPt.clone().add(jointTan));
    group.add(jointRing);
  }

  return group;
}

/**
 * Generates multi-layered organic eyes: sculpted eyelid fold, fibrous iris LatheGeometry,
 * transmissive glossy cornea dome, and (for compound eyes) instanced hexagonal ommatidia facets.
 */
export function buildEyePart(
  slot: AnatomicalSlot,
  genome: CreatureGenome,
  genes: ResolvedGenes,
  materials: CreatureMaterialSuite
): THREE.Group {
  const group = new THREE.Group();
  group.name = slot.id;
  group.position.copy(slot.position);

  const lookTarget = slot.position.clone().add(slot.normal);
  group.lookAt(lookTarget);

  const bias = genes.subMorphotype.eyeScaleBias ?? 1.0;
  const r = 0.072 * genome.eyeScale * bias * (0.75 + genes.headScale * 0.45);

  const browPts: THREE.Vector3[] = [];
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2;
    const upperArch = Math.sin(a) > 0 ? 1.06 : 0.92;
    browPts.push(new THREE.Vector3(Math.cos(a) * r * 1.1, Math.sin(a) * r * upperArch, -r * 0.1));
  }
  const browCurve = new THREE.CatmullRomCurve3(browPts, true);
  const rawBrow = createTaperedTubeGeometry(
    browCurve,
    12,
    6,
    (t) => r * (0.2 + 0.09 * Math.sin(t * Math.PI * 2)),
    { capStart: false, capEnd: false }
  );
  const browGeo = subdivideLoopGeometry(rawBrow, ENGINE_CONSTANTS.SUBDIVISION_LEVELS);
  rawBrow.dispose();

  const browMesh = new THREE.Mesh(browGeo, materials.skinMaterial);
  browMesh.castShadow = true;
  group.add(browMesh);

  const irisProfile: THREE.Vector2[] = [];
  for (let i = 0; i <= 14; i++) {
    const theta = (i / 14) * Math.PI;
    const recess = theta < 0.45 ? 0.84 : 1.0;
    irisProfile.push(new THREE.Vector2(Math.sin(theta) * r * 0.92, Math.cos(theta) * r * 0.92 * recess));
  }
  const irisGeo = new THREE.LatheGeometry(irisProfile, 22);
  irisGeo.rotateX(Math.PI / 2);
  group.add(new THREE.Mesh(irisGeo, materials.irisMaterial));

  const corneaProfile: THREE.Vector2[] = [];
  for (let i = 0; i <= 12; i++) {
    const theta = (i / 12) * Math.PI * 0.58;
    corneaProfile.push(new THREE.Vector2(Math.sin(theta) * r * 1.03, Math.cos(theta) * r * 1.1));
  }
  const corneaGeo = new THREE.LatheGeometry(corneaProfile, 22);
  corneaGeo.rotateX(Math.PI / 2);
  const corneaMesh = new THREE.Mesh(corneaGeo, materials.corneaMaterial);
  corneaMesh.renderOrder = 2;
  group.add(corneaMesh);

  if (genes.profile.eyeStyle === 'compound') {
    const hexShape = new THREE.Shape();
    const hexR = r * 0.18;
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      if (i === 0) hexShape.moveTo(Math.cos(a) * hexR, Math.sin(a) * hexR);
      else hexShape.lineTo(Math.cos(a) * hexR, Math.sin(a) * hexR);
    }
    hexShape.closePath();
    const hexGeo = new THREE.ExtrudeGeometry(hexShape, {
      depth: r * 0.08,
      bevelEnabled: true,
      bevelThickness: r * 0.03,
      bevelSize: r * 0.02,
      bevelSegments: 1,
    });
    const count = ENGINE_CONSTANTS.OMMATIDIA_HEX_COUNT;
    const inst = new THREE.InstancedMesh(hexGeo, materials.biolumMaterial, count);
    const dummy = new THREE.Object3D();
    const goldenAngle = Math.PI * (3 - Math.sqrt(5));
    for (let i = 0; i < count; i++) {
      const y = 1 - (i / count) * 0.72;
      const rad = Math.sqrt(Math.max(0, 1 - y * y));
      const theta = goldenAngle * i;
      const dir = new THREE.Vector3(Math.cos(theta) * rad, Math.sin(theta) * rad, y).normalize();
      dummy.position.copy(dir).multiplyScalar(r * 0.96);
      dummy.lookAt(dir.clone().multiplyScalar(2));
      dummy.updateMatrix();
      inst.setMatrixAt(i, dummy.matrix);
    }
    inst.instanceMatrix.needsUpdate = true;
    inst.computeBoundingSphere();
    group.add(inst);
  }

  return group;
}

/**
 * Generates muscular hydrostatic tentacles with helical S-curves and InstancedMesh suction cups.
 */
export function buildTentaclePart(
  slot: AnatomicalSlot,
  genome: CreatureGenome,
  genes: ResolvedGenes,
  materials: CreatureMaterialSuite,
  noise: ProceduralNoise,
  rng: SeededPRNG
): THREE.Group {
  const group = new THREE.Group();
  group.name = slot.id;

  const isPentaradial = genes.effectiveSymmetry === 'radial5';
  const len =
    genes.limbLength * (isPentaradial ? 0.92 : 1.15) * genes.tentacleLengthScale * rng.range(0.86, 1.18);
  const baseR = genes.limbRadius * (isPentaradial ? 1.35 : 0.92);
  const out = slot.normal.clone().normalize();
  const tan = slot.tangent.clone().normalize();

  const pts: THREE.Vector3[] = [];
  const segs = 5;
  for (let i = 0; i <= segs; i++) {
    const t = i / segs;
    const curl = Math.sin(t * Math.PI * 1.45 + slot.index * 0.6) * len * (isPentaradial ? 0.14 : 0.24);
    const lift = isPentaradial ? 0 : Math.pow(t, 1.4) * len * 0.32;
    const p = slot.position
      .clone()
      .addScaledVector(out, t * len * (isPentaradial ? 1.05 : 0.85))
      .addScaledVector(tan, curl)
      .add(new THREE.Vector3(0, isPentaradial ? -t * len * 0.08 : -t * len * 0.48 + lift, 0));
    pts.push(p);
  }

  const curve = new THREE.CatmullRomCurve3(pts);
  const tentGeo = createTaperedTubeGeometry(
    curve,
    ENGINE_CONSTANTS.TENTACLE_TUBULAR_SEGMENTS,
    ENGINE_CONSTANTS.TENTACLE_RADIAL_SEGMENTS,
    (t) => baseR * (1.0 - Math.pow(t, 0.78) * 0.88),
    { noise, displacementAmp: genome.displacementAmp * 0.3 }
  );

  const mesh = new THREE.Mesh(tentGeo, materials.skinMaterial);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  group.add(mesh);

  const cupPts = [
    new THREE.Vector2(0.0, 0.0),
    new THREE.Vector2(baseR * 0.34, 0.0),
    new THREE.Vector2(baseR * 0.38, baseR * 0.18),
    new THREE.Vector2(baseR * 0.24, baseR * 0.22),
    new THREE.Vector2(0.0, baseR * 0.08),
  ];
  const cupGeo = new THREE.LatheGeometry(cupPts, 10);
  const cupCount = ENGINE_CONSTANTS.SUCTION_CUPS_PER_TENTACLE;
  const cups = new THREE.InstancedMesh(cupGeo, materials.biolumMaterial, cupCount);
  const dummy = new THREE.Object3D();

  for (let i = 0; i < cupCount; i++) {
    const t = 0.14 + (i / cupCount) * 0.76;
    const pos = curve.getPointAt(t);
    const rAtT = baseR * (1.0 - Math.pow(t, 0.78) * 0.88);
    dummy.position.copy(pos).add(new THREE.Vector3(0, -rAtT * 0.85, 0));
    dummy.rotation.set(Math.PI, 0, 0);
    dummy.scale.setScalar(1.0 - t * 0.68);
    dummy.updateMatrix();
    cups.setMatrixAt(i, dummy.matrix);
  }
  cups.instanceMatrix.needsUpdate = true;
  cups.computeBoundingSphere();
  group.add(cups);

  return group;
}

/**
 * Generates swept organic wings: hardened elytra shells, 4-wing insect pairs,
 * multi-fingered patagium (bat/pterosaur), feathered avian wing, or veined insect membrane.
 */
export function buildWingPart(
  slot: AnatomicalSlot,
  genome: CreatureGenome,
  genes: ResolvedGenes,
  materials: CreatureMaterialSuite
): THREE.Group {
  const group = new THREE.Group();
  group.name = slot.id;

  const side = slot.side === 0 ? 1 : slot.side;
  const wingMode = genes.subMorphotype.wingPresence;
  const isHindWing = slot.index > 0;
  const span = genes.wingSpan * 0.85 * (isHindWing ? 0.82 : 1.0);
  const p0 = slot.position.clone();

  // Hardened Coleopteran Elytra Wing Covers
  if (wingMode === 'elytra') {
    const wLen = genes.torsoLength * 0.68;
    const wWid = genes.torsoWidth * 0.34;
    const cols = 10;
    const rows = 8;
    const positions: number[] = [];
    const uvs: number[] = [];
    const indices: number[] = [];

    for (let i = 0; i <= cols; i++) {
      const u = i / cols;
      const zOff = -u * wLen;
      const arcY = Math.sin(u * Math.PI * 0.88) * 0.16 * genes.torsoHeight - u * u * 0.12;
      for (let j = 0; j <= rows; j++) {
        const v = j / rows;
        const xOff = side * (0.015 + v * wWid * Math.sin(u * Math.PI * 0.85 + 0.18));
        const camber = Math.sin(v * Math.PI) * 0.14 * genes.torsoHeight;
        positions.push(p0.x + xOff, p0.y + arcY + camber - v * 0.14, p0.z + zOff);
        uvs.push(u, v);
      }
    }
    const stride = rows + 1;
    for (let i = 0; i < cols; i++) {
      for (let j = 0; j < rows; j++) {
        const a = i * stride + j;
        const b = (i + 1) * stride + j;
        const c = (i + 1) * stride + (j + 1);
        const d = i * stride + (j + 1);
        indices.push(a, b, d, b, c, d);
      }
    }
    const elyGeo = new THREE.BufferGeometry();
    elyGeo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    elyGeo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    elyGeo.setIndex(indices);
    elyGeo.computeVertexNormals();
    elyGeo.setAttribute('uv2', elyGeo.attributes.uv.clone());
    const elyMesh = new THREE.Mesh(elyGeo, materials.carapaceMaterial);
    elyMesh.castShadow = true;
    elyMesh.receiveShadow = true;
    group.add(elyMesh);
    return group;
  }

  const sweepZ = isHindWing ? -0.34 : 0.14;
  const p1 = p0.clone().add(new THREE.Vector3(side * span * 0.42, span * (isHindWing ? 0.18 : 0.32), span * sweepZ));
  const p2 = p1.clone().add(new THREE.Vector3(side * span * 0.56, span * 0.08, -span * (isHindWing ? 0.38 : 0.26)));

  const sparCurve = new THREE.CatmullRomCurve3([p0, p1, p2]);
  const sparGeo = createTaperedTubeGeometry(
    sparCurve,
    18,
    9,
    (t) => 0.04 * genome.thickness * (1 - t * 0.72)
  );
  const sparMesh = new THREE.Mesh(sparGeo, materials.carapaceMaterial);
  sparMesh.castShadow = true;
  group.add(sparMesh);

  if (wingMode === 'feathered') {
    const featherShape = new THREE.Shape();
    featherShape.moveTo(0, 0);
    featherShape.quadraticCurveTo(0.05, 0.18, 0.015, 0.48);
    featherShape.quadraticCurveTo(0, 0.52, -0.015, 0.48);
    featherShape.quadraticCurveTo(-0.05, 0.18, 0, 0);
    const featherGeo = new THREE.ExtrudeGeometry(featherShape, {
      depth: 0.008,
      bevelEnabled: true,
      bevelSize: 0.004,
      bevelThickness: 0.004,
      bevelSegments: 1,
    });

    const count = ENGINE_CONSTANTS.AVIAN_FEATHERS_PER_WING;
    const feathers = new THREE.InstancedMesh(featherGeo, materials.membraneMaterial, count);
    const dummy = new THREE.Object3D();
    for (let i = 0; i < count; i++) {
      const t = 0.08 + (i / (count - 1)) * 0.9;
      const pt = sparCurve.getPointAt(t);
      dummy.position.copy(pt);
      dummy.rotation.set(-Math.PI * 0.45, side * (0.35 + t * 0.55), side * -0.15);
      const sc = (0.55 + Math.sin(t * Math.PI * 0.85) * 0.65) * span * 0.85;
      dummy.scale.set(sc, sc * 1.15, sc);
      dummy.updateMatrix();
      feathers.setMatrixAt(i, dummy.matrix);
    }
    feathers.instanceMatrix.needsUpdate = true;
    feathers.computeBoundingSphere();
    group.add(feathers);
  } else {
    // Membranous or Patagium (4 elongated fingers for bat/pterosaur)
    const fanTips =
      wingMode === 'patagium'
        ? [
            p1.clone().add(new THREE.Vector3(side * span * 0.04, -span * 0.36, -span * 0.48)),
            p1.clone().add(new THREE.Vector3(side * span * 0.22, -span * 0.28, -span * 0.56)),
            p1.clone().add(new THREE.Vector3(side * span * 0.42, -span * 0.18, -span * 0.5)),
            p2.clone().add(new THREE.Vector3(side * span * 0.1, -span * 0.12, -span * 0.38)),
          ]
        : [
            p1.clone().add(new THREE.Vector3(side * span * 0.08, -span * 0.3, -span * 0.44)),
            p1.clone().add(new THREE.Vector3(side * span * 0.28, -span * 0.22, -span * 0.5)),
            p2.clone().add(new THREE.Vector3(side * span * 0.12, -span * 0.14, -span * 0.36)),
          ];

    const wristCurve = new THREE.CatmullRomCurve3([
      p1.clone(),
      p1.clone().add(new THREE.Vector3(side * span * 0.05, span * 0.08, span * 0.1)),
      p1.clone().add(new THREE.Vector3(side * span * 0.02, span * 0.04, span * 0.18)),
    ]);
    const rawThumb = createTaperedTubeGeometry(wristCurve, 5, 5, (t) => 0.024 * genome.thickness * (1 - t * 0.9));
    const thumbGeo = subdivideLoopGeometry(rawThumb, ENGINE_CONSTANTS.SUBDIVISION_LEVELS);
    rawThumb.dispose();
    const thumbMesh = new THREE.Mesh(thumbGeo, materials.carapaceMaterial);
    thumbMesh.castShadow = true;
    group.add(thumbMesh);

    fanTips.forEach((tip) => {
      const veinCurve = new THREE.CatmullRomCurve3([
        p1,
        p1.clone().lerp(tip, 0.5).add(new THREE.Vector3(0, 0.04, 0)),
        tip,
      ]);
      const veinGeo = createTaperedTubeGeometry(veinCurve, 10, 6, (t) => 0.017 * (1 - t * 0.78));
      const veinMesh = new THREE.Mesh(veinGeo, materials.carapaceMaterial);
      veinMesh.castShadow = true;
      group.add(veinMesh);
    });

    const cols = 16;
    const rows = 10;
    const positions: number[] = [];
    const uvs: number[] = [];
    const indices: number[] = [];

    const trailingCurve = new THREE.CatmullRomCurve3([
      p0.clone().add(new THREE.Vector3(0, -span * 0.22, -span * 0.36)),
      ...fanTips,
      p2,
    ]);

    for (let i = 0; i <= cols; i++) {
      const u = i / cols;
      const topPt = sparCurve.getPointAt(u);
      const botPt = trailingCurve.getPointAt(u);
      for (let j = 0; j <= rows; j++) {
        const v = j / rows;
        const pt = topPt.clone().lerp(botPt, v);
        pt.y += Math.sin(v * Math.PI) * Math.sin(u * Math.PI) * 0.08 * span;
        positions.push(pt.x, pt.y, pt.z);
        uvs.push(u, v);
      }
    }

    const stride = rows + 1;
    for (let i = 0; i < cols; i++) {
      for (let j = 0; j < rows; j++) {
        const a = i * stride + j;
        const b = (i + 1) * stride + j;
        const c = (i + 1) * stride + (j + 1);
        const d = i * stride + (j + 1);
        indices.push(a, b, d, b, c, d);
      }
    }

    const memGeo = new THREE.BufferGeometry();
    memGeo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    memGeo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    memGeo.setIndex(indices);
    memGeo.computeVertexNormals();
    memGeo.setAttribute('uv2', memGeo.attributes.uv.clone());

    const memMesh = new THREE.Mesh(memGeo, materials.membraneMaterial);
    memMesh.castShadow = true;
    memMesh.receiveShadow = true;
    group.add(memMesh);
  }

  return group;
}

/**
 * Generates aquatic fins with structural fin rays and translucent webbed membrane.
 */
export function buildFinPart(
  slot: AnatomicalSlot,
  genes: ResolvedGenes,
  materials: CreatureMaterialSuite
): THREE.Group {
  const group = new THREE.Group();
  group.name = slot.id;

  const side = slot.side === 0 ? 1 : slot.side;
  const finLen = 0.34 * genes.torsoWidth;
  const p0 = slot.position.clone();
  const pLead = p0.clone().add(new THREE.Vector3(side * finLen, -finLen * 0.25, -finLen * 0.28));
  const pTrail = p0.clone().add(new THREE.Vector3(side * finLen * 0.55, -finLen * 0.38, -finLen * 0.85));

  const leadingCurve = new THREE.CatmullRomCurve3([
    p0,
    p0.clone().lerp(pLead, 0.5).add(new THREE.Vector3(0, 0.04, 0)),
    pLead,
  ]);
  const trailingCurve = new THREE.CatmullRomCurve3([
    p0.clone().add(new THREE.Vector3(0, -0.05, -0.18)),
    pTrail,
    pLead,
  ]);

  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  const cols = 10;
  const rows = 6;
  for (let i = 0; i <= cols; i++) {
    const u = i / cols;
    const a = leadingCurve.getPointAt(u);
    const b = trailingCurve.getPointAt(u);
    for (let j = 0; j <= rows; j++) {
      const v = j / rows;
      const pt = a.clone().lerp(b, v);
      pt.y += Math.sin(u * Math.PI * 2) * 0.015 * v;
      positions.push(pt.x, pt.y, pt.z);
      uvs.push(u, v);
    }
  }
  const stride = rows + 1;
  for (let i = 0; i < cols; i++) {
    for (let j = 0; j < rows; j++) {
      const a = i * stride + j;
      const b = (i + 1) * stride + j;
      const c = (i + 1) * stride + (j + 1);
      const d = i * stride + (j + 1);
      indices.push(a, b, d, b, c, d);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  geo.setAttribute('uv2', geo.attributes.uv.clone());

  const finMesh = new THREE.Mesh(geo, materials.membraneMaterial);
  finMesh.castShadow = true;
  group.add(finMesh);

  const rayGeo = createTaperedTubeGeometry(leadingCurve, 10, 6, (t) => 0.022 * (1 - t * 0.72));
  group.add(new THREE.Mesh(rayGeo, materials.carapaceMaterial));

  return group;
}

/**
 * Generates specialized tails: prehensile curl, whip, vertical caudal fin, horizontal cetacean fluke,
 * armored ankylosaur club, scorpion/wasp stinger, or segmented abdomen.
 */
export function buildTailPart(
  slot: AnatomicalSlot,
  genome: CreatureGenome,
  genes: ResolvedGenes,
  materials: CreatureMaterialSuite,
  noise: ProceduralNoise
): THREE.Group {
  const group = new THREE.Group();
  group.name = slot.id;

  const tailType = genes.subMorphotype.tailType;
  const len = genes.tailLength * 0.85 * (tailType === 'short' ? 0.55 : 1.0);
  const p0 = slot.position.clone().add(new THREE.Vector3(0, 0, 0.05));

  let pts: THREE.Vector3[];
  if (tailType === 'stinger' && genes.subMorphotype.archetype !== 'insecto') {
    // High dorsal arch for xenomorph / scorpion-like predators
    const p1 = p0.clone().add(new THREE.Vector3(0, len * 0.14, -len * 0.32));
    const p2 = p1.clone().add(new THREE.Vector3(0, len * 0.42, -len * 0.2));
    const p3 = p2.clone().add(new THREE.Vector3(0, len * 0.36, len * 0.25));
    const p4 = p3.clone().add(new THREE.Vector3(0, -len * 0.1, len * 0.22));
    pts = [p0, p1, p2, p3, p4];
  } else if (tailType === 'stinger' && genes.subMorphotype.specialFeatures.includes('arched_stinger')) {
    const p1 = p0.clone().add(new THREE.Vector3(0, len * 0.22, -len * 0.28));
    const p2 = p1.clone().add(new THREE.Vector3(0, len * 0.46, -len * 0.08));
    const p3 = p2.clone().add(new THREE.Vector3(0, len * 0.24, len * 0.34));
    const p4 = p3.clone().add(new THREE.Vector3(0, -len * 0.14, len * 0.22));
    pts = [p0, p1, p2, p3, p4];
  } else {
    const p1 = p0.clone().add(new THREE.Vector3(0.08 * genes.asymmetryJitter, -len * 0.12, -len * 0.28));
    const p2 = p1.clone().add(new THREE.Vector3(-0.14 * (0.35 + genes.asymmetryJitter), len * 0.08, -len * 0.3));
    const p3 = p2.clone().add(new THREE.Vector3(0.1, len * 0.18, -len * 0.26));
    const p4 =
      tailType === 'prehensile'
        ? p3.clone().add(new THREE.Vector3(0.16, len * 0.12, 0.08))
        : p3.clone().add(new THREE.Vector3(0.02, len * 0.05, -len * 0.14));
    pts = [p0, p1, p2, p3, p4];
  }

  const curve = new THREE.CatmullRomCurve3(pts);
  const p4 = pts[pts.length - 1];
  const baseR =
    genes.torsoWidth *
    (tailType === 'abdomen' ? 0.28 : tailType === 'whip' ? 0.1 : tailType === 'short' ? 0.14 : 0.16);

  const rawTail = createTaperedTubeGeometry(
    curve,
    14,
    8,
    (t) => {
      if (tailType === 'abdomen') {
        const bulge = Math.sin(t * Math.PI) * 1.45;
        const segs = 1 - Math.abs(Math.sin(t * Math.PI * 5)) * 0.18;
        return baseR * Math.max(0.18, (0.45 + bulge) * segs * (1 - t * 0.35));
      }
      if (tailType === 'club') {
        const clubBulge = Math.exp(-Math.pow((t - 0.9) / 0.09, 2)) * 1.65;
        return baseR * (1 - Math.pow(t, 0.72) * 0.65 + clubBulge);
      }
      return baseR * (1 - Math.pow(t, 0.72) * 0.88);
    },
    { ovalAspect: tailType === 'prehensile' ? 1.15 : 1.0, noise, displacementAmp: genome.displacementAmp * 0.4 }
  );
  const tailGeo = subdivideLoopGeometry(rawTail, ENGINE_CONSTANTS.SUBDIVISION_LEVELS);
  rawTail.dispose();

  const tailMesh = new THREE.Mesh(tailGeo, materials.skinMaterial);
  tailMesh.castShadow = true;
  tailMesh.receiveShadow = true;
  group.add(tailMesh);

  if (tailType === 'stinger' || tailType === 'abdomen') {
    const stingCurve = new THREE.CatmullRomCurve3([
      p4.clone(),
      p4.clone().add(new THREE.Vector3(0, 0.07, -0.1)),
      p4.clone().add(new THREE.Vector3(0, 0.16, 0.04)),
    ]);
    const rawSting = createTaperedTubeGeometry(stingCurve, 6, 6, (t) => baseR * 0.26 * (1 - t * 0.92));
    const stingGeo = subdivideLoopGeometry(rawSting, ENGINE_CONSTANTS.SUBDIVISION_LEVELS);
    rawSting.dispose();
    const stingMesh = new THREE.Mesh(stingGeo, materials.carapaceMaterial);
    stingMesh.castShadow = true;
    group.add(stingMesh);
  } else if (tailType === 'club') {
    // Osteoderm spikes on ankylosaur club
    for (const sSide of [-1, 1] as const) {
      const spCurve = new THREE.CatmullRomCurve3([
        p4.clone(),
        p4.clone().add(new THREE.Vector3(sSide * baseR * 2.2, 0.02, -0.05)),
      ]);
      const spGeo = createTaperedTubeGeometry(spCurve, 5, 5, (u) => baseR * 0.55 * (1 - u * 0.9));
      group.add(new THREE.Mesh(spGeo, materials.carapaceMaterial));
    }
  } else if (genome.archetype === 'reptil' || genome.archetype === 'alien') {
    for (const sT of [0.22, 0.42, 0.62, 0.78]) {
      const sPt = curve.getPointAt(sT);
      const sCurve = new THREE.CatmullRomCurve3([
        sPt.clone(),
        sPt.clone().add(new THREE.Vector3(0, 0.07 * (1 - sT * 0.5), -0.04)),
      ]);
      const sGeo = createTaperedTubeGeometry(sCurve, 5, 5, (u) => baseR * 0.25 * (1 - u * 0.9), { ovalAspect: 0.5 });
      const sMesh = new THREE.Mesh(sGeo, materials.carapaceMaterial);
      sMesh.castShadow = true;
      group.add(sMesh);
    }
  }

  if (tailType === 'caudal_fin' || tailType === 'fluke_horizontal') {
    const flukeShape = new THREE.Shape();
    flukeShape.moveTo(0, 0);
    flukeShape.quadraticCurveTo(0.14, 0.18, 0.02, 0.36);
    flukeShape.lineTo(0, 0.08);
    flukeShape.lineTo(-0.02, 0.36);
    flukeShape.quadraticCurveTo(-0.14, 0.18, 0, 0);
    const flukeGeo = new THREE.ExtrudeGeometry(flukeShape, {
      depth: 0.015,
      bevelEnabled: true,
      bevelSize: 0.008,
      bevelThickness: 0.008,
      bevelSegments: 2,
    });
    const fluke = new THREE.Mesh(flukeGeo, materials.membraneMaterial);
    fluke.position.copy(p4);
    if (tailType === 'fluke_horizontal') {
      fluke.rotation.set(-Math.PI * 0.5, 0, 0);
    } else {
      fluke.rotation.set(-Math.PI * 0.5, Math.PI * 0.5, 0);
    }
    fluke.scale.setScalar(0.95 * genes.torsoWidth);
    group.add(fluke);
  }

  return group;
}

/**
 * Generates dorsal shells, spiral gastropod/nautilus shells, hinged bivalve shells,
 * overlapping pangolin/crustacean armor plates, or stegosaur dorsal osteoderm plates.
 */
export function buildShellPart(
  slot: AnatomicalSlot,
  genome: CreatureGenome,
  genes: ResolvedGenes,
  materials: CreatureMaterialSuite
): THREE.Group {
  const group = new THREE.Group();
  group.name = slot.id;

  const shellType = genes.subMorphotype.shellType;
  const w = genes.torsoWidth * 0.5;
  const h = genes.torsoHeight * 0.45;
  const l = genes.torsoLength * 0.5;

  if (shellType === 'spiral_shell') {
    // Logarithmic spiral nautilus / gastropod shell via CatmullRomCurve3 TubeGeometry
    const isGastropod = genes.subMorphotype.id === 'gastropod_snail';
    const pts: THREE.Vector3[] = [];
    const turns = 2.6;
    const steps = 28;
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const theta = t * Math.PI * 2 * turns;
      const rad = 0.02 + Math.pow(t, 1.35) * w * 0.85;
      const x = isGastropod ? Math.cos(theta) * rad + t * w * 0.35 : Math.sin(theta) * 0.02;
      const y = Math.sin(theta) * rad + h * 0.45;
      const z = isGastropod ? Math.sin(theta) * rad * 0.65 - l * 0.15 : Math.cos(theta) * rad - l * 0.15;
      pts.push(slot.position.clone().add(new THREE.Vector3(x, y, z)));
    }
    const curve = new THREE.CatmullRomCurve3(pts);
    const rawShell = createTaperedTubeGeometry(
      curve,
      36,
      12,
      (t) => (0.018 + Math.pow(t, 1.25) * w * 0.46) * (1 + 0.08 * Math.sin(t * Math.PI * 22)),
      { ovalAspect: 0.92 }
    );
    const shellGeo = subdivideLoopGeometry(rawShell, 1);
    rawShell.dispose();
    const mesh = new THREE.Mesh(shellGeo, materials.carapaceMaterial);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
  } else if (shellType === 'bivalve') {
    // Dual hinged corrugated valve shells cradling the soft mantle
    const valveShape = new THREE.Shape();
    valveShape.moveTo(0, 0);
    valveShape.quadraticCurveTo(w * 0.95, l * 0.45, w * 0.65, l * 1.15);
    valveShape.quadraticCurveTo(0, l * 1.35, -w * 0.65, l * 1.15);
    valveShape.quadraticCurveTo(-w * 0.95, l * 0.45, 0, 0);

    const valveGeo = new THREE.ExtrudeGeometry(valveShape, {
      depth: 0.06,
      bevelEnabled: true,
      bevelSize: 0.03,
      bevelThickness: 0.03,
      bevelSegments: 2,
    });

    const topValve = new THREE.Mesh(valveGeo, materials.carapaceMaterial);
    topValve.position.copy(slot.position).add(new THREE.Vector3(0, h * 0.18, -l * 0.65));
    topValve.rotation.set(Math.PI * 0.42, 0, 0);
    topValve.castShadow = true;
    group.add(topValve);

    const botValve = new THREE.Mesh(valveGeo, materials.carapaceMaterial);
    botValve.position.copy(slot.position).add(new THREE.Vector3(0, -h * 0.55, -l * 0.65));
    botValve.rotation.set(Math.PI * 0.56, 0, 0);
    botValve.castShadow = true;
    group.add(botValve);
  } else if (shellType === 'dorsal_plates') {
    // Stegosaur double alternating rows of diamond osteoderm plates
    const plateShape = new THREE.Shape();
    plateShape.moveTo(0, 0);
    plateShape.lineTo(0.09 * w, 0.22 * h);
    plateShape.lineTo(0.02 * w, 0.48 * h);
    plateShape.lineTo(-0.08 * w, 0.2 * h);
    plateShape.closePath();

    const plateGeo = new THREE.ExtrudeGeometry(plateShape, {
      depth: 0.02,
      bevelEnabled: true,
      bevelSize: 0.008,
      bevelThickness: 0.008,
      bevelSegments: 1,
    });

    const count = 8;
    for (let i = 0; i < count; i++) {
      const t = i / (count - 1);
      const side = i % 2 === 0 ? -1 : 1;
      const sc = 0.65 + Math.sin(t * Math.PI) * 0.75;
      const pMesh = new THREE.Mesh(plateGeo, materials.carapaceMaterial);
      pMesh.position.copy(slot.position).add(new THREE.Vector3(side * 0.07 * w, 0.04, (0.5 - t) * l * 1.45));
      pMesh.rotation.set(-0.15, Math.PI * 0.5, side * 0.18);
      pMesh.scale.setScalar(sc * (0.9 + genome.thickness * 0.2));
      pMesh.castShadow = true;
      group.add(pMesh);
    }
  } else if (shellType === 'armored_plates' || shellType === 'turtle_carapace') {
    // Overlapping dorsal scute bands / carapace ridge
    const bandCount = shellType === 'turtle_carapace' ? 4 : 6;
    for (let i = 0; i < bandCount; i++) {
      const t = i / (bandCount - 1);
      const zOff = (0.45 - t) * l * 1.35;
      const arcSpan = w * (0.88 + Math.sin(t * Math.PI) * 0.35);
      const bandCurve = new THREE.CatmullRomCurve3([
        slot.position.clone().add(new THREE.Vector3(-arcSpan, -h * 0.35, zOff)),
        slot.position.clone().add(new THREE.Vector3(0, h * 0.28, zOff + 0.04)),
        slot.position.clone().add(new THREE.Vector3(arcSpan, -h * 0.35, zOff)),
      ]);
      const bandGeo = createTaperedTubeGeometry(
        bandCurve,
        12,
        6,
        (u) => 0.045 * (0.65 + Math.sin(u * Math.PI) * 0.6),
        { ovalAspect: 0.45 }
      );
      const bandMesh = new THREE.Mesh(bandGeo, materials.carapaceMaterial);
      bandMesh.castShadow = true;
      group.add(bandMesh);
    }
  }

  return group;
}

/**
 * Generates head accents: curved beaks, articulated mandibles, antennae, ears, or bifid tongue.
 */
export function buildHeadAccents(
  slots: AnatomicalSlot[],
  genome: CreatureGenome,
  genes: ResolvedGenes,
  materials: CreatureMaterialSuite
): THREE.Group {
  const group = new THREE.Group();
  group.name = 'head_accents';

  const sub = genes.subMorphotype;
  const jawSlot = slots.find((s) => s.kind === 'jaw');
  const hs = genes.headScale;

  if (jawSlot) {
    if (sub.hasBeak) {
      const isNeedle = sub.specialFeatures.includes('needle_beak');
      const isFlat = sub.specialFeatures.includes('flat_bill');
      const beakLen = isNeedle ? 0.65 * hs : 0.36 * hs;
      const beakCurve = new THREE.CatmullRomCurve3([
        jawSlot.position.clone().add(new THREE.Vector3(0, 0.04 * hs, 0)),
        jawSlot.position.clone().add(new THREE.Vector3(0, 0.02 * hs, beakLen * 0.6)),
        jawSlot.position.clone().add(new THREE.Vector3(0, isNeedle ? 0.01 * hs : -0.09 * hs, beakLen)),
      ]);
      const beakGeo = createTaperedTubeGeometry(
        beakCurve,
        14,
        8,
        (t) => (isNeedle ? 0.045 : 0.11) * hs * (1 - t * 0.9),
        { ovalAspect: isFlat ? 2.1 : 1.15 }
      );
      const beak = new THREE.Mesh(beakGeo, materials.carapaceMaterial);
      beak.castShadow = true;
      group.add(beak);
    }

    if (sub.hasMandibles) {
      const isCrushing = sub.specialFeatures.includes('crushing_mandibles');
      const scaleM = isCrushing ? 1.4 : 1.0;
      for (const side of [-1, 1] as const) {
        const mCurve = new THREE.CatmullRomCurve3([
          jawSlot.position.clone().add(new THREE.Vector3(side * 0.08 * hs, -0.02 * hs, 0)),
          jawSlot.position.clone().add(new THREE.Vector3(side * 0.22 * hs * scaleM, -0.04 * hs, 0.18 * hs * scaleM)),
          jawSlot.position.clone().add(new THREE.Vector3(side * 0.06 * hs, -0.03 * hs, 0.34 * hs * scaleM)),
        ]);
        const mGeo = createTaperedTubeGeometry(mCurve, 14, 8, (t) => 0.048 * hs * scaleM * (1 - t * 0.85));
        const mandible = new THREE.Mesh(mGeo, materials.carapaceMaterial);
        mandible.castShadow = true;
        group.add(mandible);
      }
    }

    if (sub.hasBifidTongue) {
      for (const side of [-1, 1] as const) {
        const tCurve = new THREE.CatmullRomCurve3([
          jawSlot.position.clone().add(new THREE.Vector3(0, -0.03 * hs, 0.02)),
          jawSlot.position.clone().add(new THREE.Vector3(0, -0.05 * hs, 0.18 * hs)),
          jawSlot.position.clone().add(new THREE.Vector3(side * 0.06 * hs, -0.07 * hs, 0.31 * hs)),
        ]);
        const tGeo = createTaperedTubeGeometry(tCurve, 12, 6, (t) => 0.018 * hs * (1 - t * 0.72));
        group.add(new THREE.Mesh(tGeo, materials.biolumMaterial));
      }
    }
  }

  const earSlots = slots.filter((s) => s.kind === 'ear_antenna');
  earSlots.forEach((slot) => {
    const side = slot.side === 0 ? 1 : slot.side;
    if (sub.hasAntennae) {
      const aLen = 0.55 * hs * (0.7 + genome.limbComplexity * 0.5);
      const isElbowed = sub.specialFeatures.includes('elbowed_antennae');
      const aCurve = new THREE.CatmullRomCurve3([
        slot.position.clone(),
        slot.position.clone().add(new THREE.Vector3(side * aLen * 0.32, aLen * 0.55, aLen * 0.28)),
        slot.position.clone().add(new THREE.Vector3(side * aLen * (isElbowed ? 0.92 : 0.68), aLen * 0.82, aLen * 0.64)),
        slot.position.clone().add(new THREE.Vector3(side * aLen * 0.82, aLen * (isElbowed ? 0.35 : 0.65), aLen * 0.92)),
      ]);
      const aGeo = createTaperedTubeGeometry(
        aCurve,
        16,
        7,
        (t) => 0.026 * hs * (1 - t * 0.65) * (1 + 0.15 * Math.sin(t * Math.PI * 10))
      );
      const ant = new THREE.Mesh(aGeo, materials.carapaceMaterial);
      ant.castShadow = true;
      group.add(ant);
    } else if (genome.archetype === 'mamifero') {
      const earLen = sub.specialFeatures.includes('long_ears') || sub.specialFeatures.includes('echolocation_ears') ? 1.7 : 1.0;
      const earCurve = new THREE.CatmullRomCurve3([
        slot.position.clone(),
        slot.position.clone().add(new THREE.Vector3(side * 0.14 * hs, 0.22 * hs * earLen, -0.04 * hs)),
        slot.position.clone().add(new THREE.Vector3(side * 0.24 * hs, 0.42 * hs * earLen, -0.1 * hs)),
      ]);
      const earGeo = createTaperedTubeGeometry(earCurve, 12, 8, (t) => 0.08 * hs * (1 - t * 0.82), {
        ovalAspect: 0.45,
      });
      const ear = new THREE.Mesh(earGeo, materials.skinMaterial);
      ear.castShadow = true;
      group.add(ear);
    }
  });

  const crestSlots = slots.filter((s) => s.kind === 'crest');
  crestSlots.forEach((slot, idx) => {
    const t = idx / Math.max(1, crestSlots.length - 1);
    const spineH = genes.crestHeight * (1.2 - Math.abs(t - 0.35) * 0.9);
    const cCurve = new THREE.CatmullRomCurve3([
      slot.position.clone().add(new THREE.Vector3(0, -0.02, 0)),
      slot.position.clone().add(new THREE.Vector3(0, spineH * 0.55, -spineH * 0.18)),
      slot.position.clone().add(new THREE.Vector3(0, spineH, -spineH * 0.48)),
    ]);
    const cGeo = createTaperedTubeGeometry(cCurve, 8, 6, (u) => 0.035 * (1 - u * 0.88), {
      ovalAspect: 0.48,
    });
    const crestMesh = new THREE.Mesh(cGeo, materials.carapaceMaterial);
    crestMesh.castShadow = true;
    group.add(crestMesh);
  });

  return group;
}

/**
 * Generates special SubMorphotype anatomical organs:
 * external feathery gills, benthic barbels, abyssal bioluminescent esca lure,
 * ceratopsian/horned frill, gliding patagium membranes, tall dorsal sail fins,
 * and branching multi-head necks for Crystalline Hydra.
 */
export function buildSpecialFeaturesGroup(
  slots: AnatomicalSlot[],
  headCenter: THREE.Vector3,
  torsoCenter: THREE.Vector3,
  genome: CreatureGenome,
  genes: ResolvedGenes,
  materials: CreatureMaterialSuite
): THREE.Group {
  const group = new THREE.Group();
  group.name = 'special_features';

  const features = genes.subMorphotype.specialFeatures;
  const hs = genes.headScale;
  const w = genes.torsoWidth * 0.48;
  const h = genes.torsoHeight * 0.46;

  // 1. External feathery axolotl gills
  if (features.includes('external_gills')) {
    for (const side of [-1, 1] as const) {
      for (let g = 0; g < 3; g++) {
        const yOff = (g - 1) * 0.09 * hs;
        const base = headCenter.clone().add(new THREE.Vector3(side * 0.24 * hs, yOff, -0.14 * hs));
        const tip = base.clone().add(new THREE.Vector3(side * 0.38 * hs, 0.12 * hs + yOff * 0.5, -0.22 * hs));
        const gCurve = new THREE.CatmullRomCurve3([base, base.clone().lerp(tip, 0.55).add(new THREE.Vector3(0, 0.05, 0)), tip]);
        const gGeo = createTaperedTubeGeometry(gCurve, 10, 6, (t) => 0.025 * hs * (1 - t * 0.72));
        group.add(new THREE.Mesh(gGeo, materials.biolumMaterial));
      }
    }
  }

  // 2. Benthic sensory barbels around jaw
  if (features.includes('barbels')) {
    const jawSlot = slots.find((s) => s.kind === 'jaw');
    const origin = jawSlot ? jawSlot.position : headCenter;
    for (const side of [-1, 1] as const) {
      const bCurve = new THREE.CatmullRomCurve3([
        origin.clone().add(new THREE.Vector3(side * 0.08 * hs, -0.02, 0.04)),
        origin.clone().add(new THREE.Vector3(side * 0.24 * hs, -0.1, 0.18 * hs)),
        origin.clone().add(new THREE.Vector3(side * 0.3 * hs, -0.22 * hs, 0.12 * hs)),
      ]);
      const bGeo = createTaperedTubeGeometry(bCurve, 12, 6, (t) => 0.018 * hs * (1 - t * 0.8));
      group.add(new THREE.Mesh(bGeo, materials.skinMaterial));
    }
  }

  // 3. Abyssal anglerfish bioluminescent lure (illicium + esca)
  if (features.includes('biolum_lure')) {
    const lureCurve = new THREE.CatmullRomCurve3([
      headCenter.clone().add(new THREE.Vector3(0, 0.22 * hs, 0.04)),
      headCenter.clone().add(new THREE.Vector3(0, 0.55 * hs, 0.28 * hs)),
      headCenter.clone().add(new THREE.Vector3(0, 0.38 * hs, 0.62 * hs)),
    ]);
    const stalkGeo = createTaperedTubeGeometry(lureCurve, 14, 6, (t) => 0.016 * hs * (1 - t * 0.6));
    group.add(new THREE.Mesh(stalkGeo, materials.carapaceMaterial));

    const escaTip = lureCurve.getPointAt(1);
    const escaProfile = [
      new THREE.Vector2(0, -0.05 * hs),
      new THREE.Vector2(0.065 * hs, 0),
      new THREE.Vector2(0.04 * hs, 0.06 * hs),
      new THREE.Vector2(0, 0.08 * hs),
    ];
    const escaGeo = new THREE.LatheGeometry(escaProfile, 12);
    const escaMesh = new THREE.Mesh(escaGeo, materials.biolumMaterial);
    escaMesh.position.copy(escaTip);
    group.add(escaMesh);
  }

  // 4. Horns & bony cranial frill (Ceratopsian / Pacman frog / Coleopteran)
  if (features.includes('horns_frill') || features.includes('cephalic_horn')) {
    for (const side of [-1, 1] as const) {
      const hCurve = new THREE.CatmullRomCurve3([
        headCenter.clone().add(new THREE.Vector3(side * 0.12 * hs, 0.18 * hs, 0.08 * hs)),
        headCenter.clone().add(new THREE.Vector3(side * 0.22 * hs, 0.36 * hs, 0.32 * hs)),
        headCenter.clone().add(new THREE.Vector3(side * 0.16 * hs, 0.44 * hs, 0.55 * hs)),
      ]);
      const hGeo = createTaperedTubeGeometry(hCurve, 12, 7, (t) => 0.048 * hs * (1 - t * 0.88));
      const horn = new THREE.Mesh(hGeo, materials.carapaceMaterial);
      horn.castShadow = true;
      group.add(horn);
    }

    if (features.includes('horns_frill')) {
      const frillShape = new THREE.Shape();
      frillShape.moveTo(-0.36 * hs, 0);
      frillShape.quadraticCurveTo(-0.48 * hs, 0.42 * hs, 0, 0.52 * hs);
      frillShape.quadraticCurveTo(0.48 * hs, 0.42 * hs, 0.36 * hs, 0);
      frillShape.closePath();
      const frillGeo = new THREE.ExtrudeGeometry(frillShape, {
        depth: 0.035,
        bevelEnabled: true,
        bevelSize: 0.015,
        bevelThickness: 0.015,
        bevelSegments: 2,
      });
      const frillMesh = new THREE.Mesh(frillGeo, materials.carapaceMaterial);
      frillMesh.position.copy(headCenter).add(new THREE.Vector3(0, 0.08 * hs, -0.15 * hs));
      frillMesh.rotation.set(-0.28, 0, 0);
      frillMesh.castShadow = true;
      group.add(frillMesh);
    }
  }

  // 5. Lateral gliding patagium membrane (Flying Squirrel / Draco Lizard / Wallace Frog)
  if (features.includes('gliding_membrane')) {
    for (const side of [-1, 1] as const) {
      const fore = slots.find((s) => (s.kind === 'arm' || s.kind === 'leg') && s.id.includes('fore') && s.side === side);
      const hind = slots.find((s) => s.kind === 'leg' && s.id.includes('hind') && s.side === side);
      if (fore && hind) {
        const pF = fore.position.clone().add(new THREE.Vector3(side * 0.34, -0.12, 0.08));
        const pH = hind.position.clone().add(new THREE.Vector3(side * 0.34, -0.12, -0.06));
        const midOuter = pF.clone().lerp(pH, 0.5).add(new THREE.Vector3(side * 0.14, 0.04, 0));

        const gShape = new THREE.BufferGeometry();
        const verts = [
          fore.position.x, fore.position.y, fore.position.z,
          pF.x, pF.y, pF.z,
          midOuter.x, midOuter.y, midOuter.z,
          pH.x, pH.y, pH.z,
          hind.position.x, hind.position.y, hind.position.z,
        ];
        const uvs = [0, 0, 1, 0, 1, 0.5, 1, 1, 0, 1];
        gShape.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
        gShape.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
        gShape.setIndex([0, 1, 2, 0, 2, 4, 2, 3, 4]);
        gShape.computeVertexNormals();
        gShape.setAttribute('uv2', gShape.attributes.uv.clone());
        group.add(new THREE.Mesh(gShape, materials.membraneMaterial));
      }
    }
  }

  // 6. Huge compressed angelfish dorsal sail fin
  if (features.includes('huge_dorsal_fin')) {
    const sailShape = new THREE.Shape();
    sailShape.moveTo(0, 0);
    sailShape.quadraticCurveTo(0.28 * w, 0.9 * h, -0.42 * w, 1.35 * h);
    sailShape.quadraticCurveTo(-0.3 * w, 0.5 * h, -0.5 * w, 0);
    sailShape.closePath();
    const sailGeo = new THREE.ExtrudeGeometry(sailShape, {
      depth: 0.012,
      bevelEnabled: true,
      bevelSize: 0.004,
      bevelThickness: 0.004,
      bevelSegments: 1,
    });
    const sail = new THREE.Mesh(sailGeo, materials.membraneMaterial);
    sail.position.copy(torsoCenter).add(new THREE.Vector3(0, h * 0.65, 0));
    sail.rotation.y = Math.PI * 0.5;
    group.add(sail);
  }

  // 7. Branching extra necks & heads for Crystalline Hydra
  if (features.includes('multi_head')) {
    for (const side of [-1, 1] as const) {
      const neckStart = torsoCenter.clone().add(new THREE.Vector3(side * w * 0.45, h * 0.35, 0.25));
      const neckMid = neckStart.clone().add(new THREE.Vector3(side * w * 0.72, h * 0.65, 0.36));
      const secHead = neckMid.clone().add(new THREE.Vector3(side * w * 0.22, h * 0.32, 0.38));

      const nCurve = new THREE.CatmullRomCurve3([neckStart, neckMid, secHead]);
      const rawNeck = createTaperedTubeGeometry(nCurve, 14, 8, (t) => 0.14 * hs * (1 - t * 0.25));
      const neckGeo = subdivideLoopGeometry(rawNeck, 1);
      rawNeck.dispose();
      const neckMesh = new THREE.Mesh(neckGeo, materials.skinMaterial);
      neckMesh.castShadow = true;
      group.add(neckMesh);

      // Sculpted LatheGeometry cranium for secondary hydra head
      const skullPts = [
        new THREE.Vector2(0, -0.18 * hs),
        new THREE.Vector2(0.18 * hs, -0.08 * hs),
        new THREE.Vector2(0.22 * hs, 0.08 * hs),
        new THREE.Vector2(0.12 * hs, 0.24 * hs),
        new THREE.Vector2(0, 0.32 * hs),
      ];
      const skullGeo = new THREE.LatheGeometry(skullPts, 14);
      skullGeo.rotateX(Math.PI * 0.5);
      const skullMesh = new THREE.Mesh(skullGeo, materials.skinMaterial);
      skullMesh.position.copy(secHead);
      skullMesh.castShadow = true;
      group.add(skullMesh);

      // Glowing secondary eyes
      for (const eSide of [-1, 1] as const) {
        const eyeSlot: AnatomicalSlot = {
          id: `hydra_eye_${side}_${eSide}`,
          kind: 'eye',
          position: secHead.clone().add(new THREE.Vector3(eSide * 0.14 * hs, 0.08 * hs, 0.14 * hs)),
          normal: new THREE.Vector3(eSide * 0.6, 0.2, 0.75).normalize(),
          tangent: new THREE.Vector3(0, 1, 0),
          side: eSide,
          index: 0,
        };
        group.add(buildEyePart(eyeSlot, genome, genes, materials));
      }
    }
  }

  return group;
}

/**
 * Generates instanced surface details (scales, fur tufts, feathers, osteoderms, or alien crystal spines)
 * aligned to torso surface normals with per-instance color & scale jitter.
 */
export function buildSurfaceDetailLayer(
  torsoGeo: THREE.BufferGeometry,
  genome: CreatureGenome,
  genes: ResolvedGenes,
  materials: CreatureMaterialSuite,
  rng: SeededPRNG,
  maxSurfaceDetails: number = ENGINE_CONSTANTS.MAX_SURFACE_DETAILS
): THREE.InstancedMesh | null {
  if (genome.detailDensity <= 0.04) return null;

  const count = Math.round(
    THREE.MathUtils.lerp(
      Math.min(ENGINE_CONSTANTS.MIN_SURFACE_DETAILS, maxSurfaceDetails),
      maxSurfaceDetails,
      genome.detailDensity
    )
  );

  const shape = new THREE.Shape();
  const isFurOrFeather = genome.archetype === 'mamifero' || genome.archetype === 'ave';
  const w = isFurOrFeather ? 0.016 : 0.034;
  const h = isFurOrFeather ? 0.11 : 0.065;

  shape.moveTo(-w, 0);
  shape.quadraticCurveTo(-w * 0.65, h * 0.65, 0, h);
  shape.quadraticCurveTo(w * 0.65, h * 0.65, w, 0);
  shape.closePath();

  const detailGeo = new THREE.ExtrudeGeometry(shape, {
    depth: 0.008,
    bevelEnabled: true,
    bevelSize: 0.003,
    bevelThickness: 0.003,
    bevelSegments: 1,
  });

  const instanced = new THREE.InstancedMesh(detailGeo, materials.detailMaterial, count);
  instanced.castShadow = false;
  instanced.receiveShadow = true;

  const posAttr = torsoGeo.attributes.position as THREE.BufferAttribute;
  const normAttr = torsoGeo.attributes.normal as THREE.BufferAttribute;
  if (!posAttr || !normAttr || posAttr.count === 0) return null;

  const dummy = new THREE.Object3D();
  const p = new THREE.Vector3();
  const n = new THREE.Vector3();
  const target = new THREE.Vector3();
  const baseColor = new THREE.Color(genes.profile.palette.primaryHex);
  const accentColor = new THREE.Color(genes.profile.palette.accentHex);
  const instColor = new THREE.Color();

  for (let i = 0; i < count; i++) {
    let vIdx = rng.int(0, posAttr.count - 1);
    for (let attempt = 0; attempt < 4; attempt++) {
      const candidate = rng.int(0, posAttr.count - 1);
      if (normAttr.getY(candidate) > -0.15) {
        vIdx = candidate;
        break;
      }
    }

    p.fromBufferAttribute(posAttr, vIdx);
    n.fromBufferAttribute(normAttr, vIdx).normalize();

    dummy.position.copy(p).addScaledVector(n, -0.006);
    target.copy(p).add(n).add(new THREE.Vector3(0, 0.25, -0.45));
    dummy.lookAt(target);
    dummy.rotateX(Math.PI * 0.34);

    const scaleJitter = rng.range(0.85, 1.15) * (0.75 + genome.thickness * 0.25);
    dummy.scale.setScalar(scaleJitter);
    dummy.updateMatrix();
    instanced.setMatrixAt(i, dummy.matrix);

    instColor.copy(baseColor).lerp(accentColor, rng.range(0.05, 0.45));
    instanced.setColorAt(i, instColor);
  }

  instanced.instanceMatrix.needsUpdate = true;
  if (instanced.instanceColor) instanced.instanceColor.needsUpdate = true;
  instanced.computeBoundingSphere();
  return instanced;
}
