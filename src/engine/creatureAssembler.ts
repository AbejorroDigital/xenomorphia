import * as THREE from 'three';
import { QUALITY_PRESETS, SIZE_PRESETS } from './constants';
import { resolveCreatureGenes, ResolvedGenes } from './archetypes';
import {
  acquireCachedBlueprint,
  acquireCachedTextures,
  buildCreatureCacheKey,
  buildTextureCacheKey,
  CachedCreatureBlueprint,
  CachedPartMeshTemplate,
  releaseCachedBlueprint,
  releaseCachedTextures,
  storeCachedBlueprint,
  storeCachedTextures,
} from './creatureCache';
import {
  buildEyePart,
  buildFinPart,
  buildHeadAccents,
  buildLimbPart,
  buildShellPart,
  buildSpecialFeaturesGroup,
  buildSurfaceDetailLayer,
  buildTailPart,
  buildTentaclePart,
  buildWingPart,
} from './partsBuilder';
import { ProceduralNoise, SeededPRNG } from './prng';
import { createCreatureMaterialSuite, CreatureMaterialSuite } from './shaders';
import { generateCreatureTextures, ProceduralTextureSet } from './textures';
import { buildOrganicTorso, buildSlotsVisualizerGroup } from './torsoBuilder';
import { applyCreaturePose } from './poses';
import { CreatureBuildStats, CreatureGenome, LimbCategory, QualityLevel, SubMorphotype } from './types';

export interface AssembledCreature {
  group: THREE.Group;
  exportGroup: THREE.Group;
  stats: CreatureBuildStats;
  subMorphotype: SubMorphotype;
  materials: CreatureMaterialSuite;
  textures: ProceduralTextureSet;
  bounds: THREE.Box3;
  dispose: () => void;
}

const LIMB_CATEGORY_LABELS: Record<LimbCategory, string> = {
  arm: 'brazos',
  leg: 'patas',
  jumping_leg: 'patas saltadoras',
  raptorial: 'raptoras',
  chela: 'pinzas quelas',
  digging: 'palas excavadoras',
  flipper: 'aletas',
  reduced: 'extrem. reducidas',
  none: 'ninguna',
};

function formatLimbSummary(genes: ResolvedGenes): string {
  const sub = genes.subMorphotype;
  const parts: string[] = [];
  if (sub.limbConfiguration.forelimbs.count > 0 && sub.limbConfiguration.forelimbs.type !== 'none') {
    parts.push(
      `${sub.limbConfiguration.forelimbs.count} ${LIMB_CATEGORY_LABELS[sub.limbConfiguration.forelimbs.type]}`
    );
  }
  if (sub.limbConfiguration.hindlimbs.count > 0 && sub.limbConfiguration.hindlimbs.type !== 'none') {
    parts.push(
      `${sub.limbConfiguration.hindlimbs.count} ${LIMB_CATEGORY_LABELS[sub.limbConfiguration.hindlimbs.type]}`
    );
  }
  if (genes.tentacleCount > 0) {
    parts.push(`${genes.tentacleCount} tentáculos`);
  }
  if (sub.wingPresence === 'four_wings') {
    parts.push('4 alas');
  } else if (sub.wingPresence !== 'none') {
    parts.push(sub.wingPresence === 'elytra' ? 'élitros' : '2 alas');
  }
  if (parts.length === 0) return '0 extremidades (ápodo)';
  return parts.join(' + ');
}

function getMaterialSlot(
  mat: THREE.Material,
  materials: CreatureMaterialSuite
): CachedPartMeshTemplate['materialSlot'] {
  if (mat === materials.carapaceMaterial) return 'carapace';
  if (mat === materials.membraneMaterial) return 'membrane';
  if (mat === materials.corneaMaterial) return 'cornea';
  if (mat === materials.irisMaterial) return 'iris';
  if (mat === materials.biolumMaterial) return 'biolum';
  if (mat === materials.detailMaterial) return 'detail';
  return 'skin';
}

function resolveMaterialFromSlot(
  slot: CachedPartMeshTemplate['materialSlot'],
  materials: CreatureMaterialSuite
): THREE.Material {
  switch (slot) {
    case 'carapace':
      return materials.carapaceMaterial;
    case 'membrane':
      return materials.membraneMaterial;
    case 'cornea':
      return materials.corneaMaterial;
    case 'iris':
      return materials.irisMaterial;
    case 'biolum':
      return materials.biolumMaterial;
    case 'detail':
      return materials.detailMaterial;
    case 'skin':
    default:
      return materials.skinMaterial;
  }
}

/**
 * Instantiates a 3-level THREE.LOD (plus exportable LOD0 group) from a CachedCreatureBlueprint,
 * wrapping articulated parts in socket-aligned JointPivot groups for pose transitions.
 */
function instantiateFromBlueprint(
  blueprint: CachedCreatureBlueprint,
  materials: CreatureMaterialSuite,
  useLod: boolean
): {
  lodObject: THREE.Object3D;
  lod0Group: THREE.Group;
  lodLevels: number;
} {
  const lod0Group = new THREE.Group();
  lod0Group.name = 'CreatureLOD0';

  const partsGroup0 = new THREE.Group();
  partsGroup0.name = 'PartsGroup';

  const lod1Group = new THREE.Group();
  lod1Group.name = 'CreatureLOD1';

  const pivotMap0 = new Map<string, THREE.Group>();
  const pivotMap1 = new Map<string, THREE.Group>();

  const getPivotGroup = (
    map: Map<string, THREE.Group>,
    parent: THREE.Group,
    tpl: CachedPartMeshTemplate,
    suffix: string
  ): THREE.Group => {
    const key = `${tpl.partRole}_${tpl.partSide}_${tpl.partIndex}`;
    let g = map.get(key);
    if (!g) {
      g = new THREE.Group();
      g.name = `JointPivot_${key}${suffix}`;
      g.position.copy(tpl.pivot);
      g.userData.partCategory = tpl.partCategory;
      g.userData.partRole = tpl.partRole;
      g.userData.partSide = tpl.partSide;
      g.userData.partIndex = tpl.partIndex;
      map.set(key, g);
      parent.add(g);
    }
    return g;
  };

  for (let i = 0; i < blueprint.parts.length; i++) {
    const tpl = blueprint.parts[i];
    const mat = resolveMaterialFromSlot(tpl.materialSlot, materials);

    if (tpl.isInstanced && tpl.instanceMatrices && tpl.instanceCount) {
      const inst = new THREE.InstancedMesh(tpl.geometry, mat, tpl.instanceCount);
      inst.name = tpl.name;
      inst.castShadow = tpl.castShadow;
      inst.receiveShadow = tpl.receiveShadow;
      inst.userData.partCategory = tpl.partCategory;
      inst.instanceMatrix.array.set(tpl.instanceMatrices);
      inst.instanceMatrix.needsUpdate = true;
      if (tpl.instanceColors) {
        inst.instanceColor = new THREE.InstancedBufferAttribute(
          new Float32Array(tpl.instanceColors),
          3
        );
      }
      inst.computeBoundingSphere();
      partsGroup0.add(inst);
      continue;
    }

    const mesh0 = new THREE.Mesh(tpl.geometry, mat);
    mesh0.name = tpl.name;
    mesh0.castShadow = tpl.castShadow;
    mesh0.receiveShadow = tpl.receiveShadow;
    mesh0.userData.partCategory = tpl.partCategory;
    mesh0.rotation.copy(tpl.rotation);
    mesh0.scale.copy(tpl.scale);

    if (tpl.name === 'Torso_SDF') {
      mesh0.position.copy(tpl.position);
      lod0Group.add(mesh0);
    } else {
      const pivot0 = getPivotGroup(pivotMap0, partsGroup0, tpl, '');
      mesh0.position.copy(tpl.position).sub(tpl.pivot);
      pivot0.add(mesh0);
    }

    if (useLod && tpl.lodLevel === 1) {
      const mesh1 = new THREE.Mesh(tpl.geometry, mat);
      mesh1.name = `${tpl.name}_lod1`;
      mesh1.castShadow = false;
      mesh1.receiveShadow = tpl.receiveShadow;
      mesh1.userData.partCategory = tpl.partCategory;
      mesh1.rotation.copy(tpl.rotation);
      mesh1.scale.copy(tpl.scale);
      if (tpl.name === 'Torso_SDF') {
        mesh1.position.copy(tpl.position);
        lod1Group.add(mesh1);
      } else {
        const pivot1 = getPivotGroup(pivotMap1, lod1Group, tpl, '_lod1');
        mesh1.position.copy(tpl.position).sub(tpl.pivot);
        pivot1.add(mesh1);
      }
    }
  }

  lod0Group.add(partsGroup0);

  if (!useLod) {
    return { lodObject: lod0Group, lod0Group, lodLevels: 1 };
  }

  const lod = new THREE.LOD();
  lod.name = 'CreatureLOD';
  lod.addLevel(lod0Group, 0);
  lod.addLevel(lod1Group, blueprint.maxDim * 3.8);

  const lod2Mesh = new THREE.Mesh(blueprint.lod2ProxyGeometry, materials.skinMaterial);
  lod2Mesh.name = 'CreatureLOD2_Proxy';
  lod2Mesh.castShadow = false;
  lod2Mesh.receiveShadow = false;
  lod2Mesh.userData.partCategory = 'torso';
  lod.addLevel(lod2Mesh, blueprint.maxDim * 8.2);

  return { lodObject: lod, lod0Group, lodLevels: 3 };
}

/**
 * Full procedural assembly pipeline with QualityLevel presets, LRU Creature & Texture Cache,
 * Instanced Surface Details, and automatic 3-level THREE.LOD.
 */
export function assembleCreature(
  genome: CreatureGenome,
  maxAnisotropy: number,
  isSoftwareGl: boolean,
  qualityLevel: QualityLevel = 'high',
  disableLod = false
): AssembledCreature {
  const t0 = performance.now();
  const quality = QUALITY_PRESETS[qualityLevel];
  const genes = resolveCreatureGenes(genome);

  // 1. Resolve Procedural Textures (with LRU Cache & lockable textureSeed)
  const texSeed = genome.textureSeed ?? genome.seed;
  const texKey = buildTextureCacheKey(genome, quality.textureResolution);
  let textures = acquireCachedTextures(texKey);
  if (!textures) {
    textures = generateCreatureTextures(
      genes.profile,
      texSeed,
      genes.hueShift,
      genes.saturationScale,
      maxAnisotropy,
      quality.textureResolution
    );
    storeCachedTextures(texKey, textures);
  }

  const materials = createCreatureMaterialSuite(
    genes.profile,
    textures,
    genes.hueShift,
    isSoftwareGl
  );

  // 2. Resolve Geometry Blueprint (with LRU Cache)
  const bpKey = buildCreatureCacheKey(genome, qualityLevel);
  let blueprint = acquireCachedBlueprint(bpKey);
  const cacheHit = blueprint !== null;

  if (!blueprint) {
    const rng = new SeededPRNG(genome.seed);
    const noise = new ProceduralNoise(genome.seed ^ 0x7f4a7c15);

    const torsoResult = buildOrganicTorso(genome, genes, quality.sdfResolution);
    const tempRoot = new THREE.Group();
    const torsoMesh = new THREE.Mesh(torsoResult.geometry, materials.skinMaterial);
    torsoMesh.name = 'Torso_SDF';
    torsoMesh.castShadow = quality.shadowsEnabled;
    torsoMesh.receiveShadow = true;
    torsoMesh.userData.partCategory = 'torso';
    torsoMesh.userData.partRole = 'torso';
    torsoMesh.userData.partSide = 0;
    torsoMesh.userData.partIndex = 0;
    torsoMesh.userData.pivot = torsoResult.torsoCenter.clone();
    tempRoot.add(torsoMesh);

    const partsGroup = new THREE.Group();
    partsGroup.name = 'PartsGroup';
    tempRoot.add(partsGroup);

    let partsCount = 1;

    const tagPartGroup = (
      g: THREE.Object3D,
      partCategory: CachedPartMeshTemplate['partCategory'],
      partRole: string,
      partSide: -1 | 0 | 1,
      partIndex: number,
      pivot: THREE.Vector3,
      lodLevel: 0 | 1
    ) => {
      g.userData.partCategory = partCategory;
      g.userData.partRole = partRole;
      g.userData.partSide = partSide;
      g.userData.partIndex = partIndex;
      g.userData.pivot = pivot;
      g.userData.lodLevel = lodLevel;
    };

    torsoResult.slots.forEach((slot) => {
      const partRng = rng.fork(partsCount + 11);
      if (slot.kind === 'arm' || slot.kind === 'leg') {
        const g = buildLimbPart(slot, genome, genes, materials, noise, partRng);
        const isFore = slot.id.includes('_fore_') || slot.kind === 'arm';
        tagPartGroup(g, 'limbs', isFore ? 'forelimb' : 'hindlimb', slot.side, slot.index, slot.position.clone(), 1);
        partsGroup.add(g);
        partsCount++;
      } else if (slot.kind === 'eye') {
        const g = buildEyePart(slot, genome, genes, materials);
        tagPartGroup(g, 'head', 'eye', slot.side, slot.index, torsoResult.headCenter.clone(), 0);
        partsGroup.add(g);
        partsCount++;
      } else if (slot.kind === 'tentacle') {
        const g = buildTentaclePart(slot, genome, genes, materials, noise, partRng);
        tagPartGroup(g, 'tentacles', 'tentacle', slot.side, slot.index, slot.position.clone(), 1);
        partsGroup.add(g);
        partsCount++;
      } else if (slot.kind === 'wing') {
        const g = buildWingPart(slot, genome, genes, materials);
        tagPartGroup(g, 'wings', 'wing', slot.side, slot.index, slot.position.clone(), 1);
        partsGroup.add(g);
        partsCount++;
      } else if (slot.kind === 'fin') {
        const g = buildFinPart(slot, genes, materials);
        tagPartGroup(g, 'limbs', 'forelimb', slot.side, slot.index, slot.position.clone(), 1);
        partsGroup.add(g);
        partsCount++;
      } else if (slot.kind === 'tail') {
        const g = buildTailPart(slot, genome, genes, materials, noise);
        tagPartGroup(g, 'tail', 'tail', 0, 0, slot.position.clone(), 1);
        partsGroup.add(g);
        partsCount++;
      } else if (slot.kind === 'shell') {
        const g = buildShellPart(slot, genome, genes, materials);
        tagPartGroup(g, 'shell', 'shell', 0, 0, slot.position.clone(), 1);
        partsGroup.add(g);
        partsCount++;
      }
    });

    const headAccents = buildHeadAccents(torsoResult.slots, genome, genes, materials);
    if (headAccents.children.length > 0) {
      tagPartGroup(headAccents, 'head', 'head', 0, 0, torsoResult.headCenter.clone(), 0);
      partsGroup.add(headAccents);
      partsCount += headAccents.children.length;
    }

    const specialGroup = buildSpecialFeaturesGroup(
      torsoResult.slots,
      torsoResult.headCenter,
      torsoResult.torsoCenter,
      genome,
      genes,
      materials
    );
    if (specialGroup.children.length > 0) {
      tagPartGroup(specialGroup, 'torso', 'crest', 0, 0, torsoResult.torsoCenter.clone(), 0);
      partsGroup.add(specialGroup);
      partsCount += specialGroup.children.length;
    }

    const detailLayer = buildSurfaceDetailLayer(
      torsoResult.geometry,
      genome,
      genes,
      materials,
      rng.fork(997),
      quality.maxSurfaceDetails
    );
    if (detailLayer) {
      detailLayer.name = 'SurfaceDetails';
      tagPartGroup(detailLayer, 'torso', 'detail', 0, 0, torsoResult.torsoCenter.clone(), 0);
      partsGroup.add(detailLayer);
      partsCount++;
    }

    tempRoot.updateMatrixWorld(true);
    const rawBox = new THREE.Box3().setFromObject(tempRoot);
    const rawSize = new THREE.Vector3();
    const rawCenter = new THREE.Vector3();
    rawBox.getSize(rawSize);
    rawBox.getCenter(rawCenter);
    const maxDim = Math.max(rawSize.x, rawSize.y, rawSize.z, 0.001);

    // Flatten into immutable geometry templates & compute telemetry
    const templates: CachedPartMeshTemplate[] = [];
    const uniqueGeometries = new Set<THREE.BufferGeometry>();
    let vertices = 0;
    let triangles = 0;

    const collectObject = (
      obj: THREE.Object3D,
      inheritedLod: 0 | 1,
      inheritedCategory: CachedPartMeshTemplate['partCategory'],
      inheritedRole: string,
      inheritedSide: -1 | 0 | 1,
      inheritedIndex: number,
      inheritedPivot: THREE.Vector3
    ) => {
      const ownLod: 0 | 1 =
        obj.userData.lodLevel === 0 || obj.userData.lodLevel === 1
          ? (obj.userData.lodLevel as 0 | 1)
          : inheritedLod;
      const ownCat = (obj.userData.partCategory as CachedPartMeshTemplate['partCategory']) ?? inheritedCategory;
      const ownRole = (obj.userData.partRole as string) ?? inheritedRole;
      const ownSide = (obj.userData.partSide as -1 | 0 | 1) ?? inheritedSide;
      const ownIdx = (obj.userData.partIndex as number) ?? inheritedIndex;
      const ownPivot = (obj.userData.pivot as THREE.Vector3) ?? inheritedPivot;

      if ((obj as THREE.Mesh).isMesh) {
        const mesh = obj as THREE.Mesh;
        const geo = mesh.geometry;
        uniqueGeometries.add(geo);
        const pos = geo.attributes.position;
        if (pos) {
          const isInst = Boolean((mesh as THREE.InstancedMesh).isInstancedMesh);
          const count = isInst ? (mesh as THREE.InstancedMesh).count : 1;
          vertices += pos.count * count;
          const triPerMesh = geo.index ? geo.index.count / 3 : pos.count / 3;
          triangles += Math.round(triPerMesh * count);

          // Extract local transform relative to tempRoot
          const worldMat = mesh.matrixWorld;
          const p = new THREE.Vector3();
          const q = new THREE.Quaternion();
          const s = new THREE.Vector3();
          worldMat.decompose(p, q, s);
          const euler = new THREE.Euler().setFromQuaternion(q);

          const singleMat = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
          const tpl: CachedPartMeshTemplate = {
            geometry: geo,
            materialSlot: getMaterialSlot(singleMat, materials),
            castShadow: mesh.castShadow,
            receiveShadow: mesh.receiveShadow,
            position: p,
            rotation: euler,
            scale: s,
            pivot: ownPivot.clone(),
            partCategory: ownCat,
            partRole: ownRole,
            partSide: ownSide,
            partIndex: ownIdx,
            name: mesh.name || 'PartMesh',
            lodLevel: obj.name === 'Torso_SDF' ? 1 : ownLod,
          };

          if (isInst) {
            const inst = mesh as THREE.InstancedMesh;
            tpl.isInstanced = true;
            tpl.instanceCount = inst.count;
            tpl.instanceMatrices = new Float32Array(inst.instanceMatrix.array);
            if (inst.instanceColor) {
              tpl.instanceColors = new Float32Array(inst.instanceColor.array);
            }
          }

          templates.push(tpl);
        }
      }
      for (const child of obj.children) {
        collectObject(child, ownLod, ownCat, ownRole, ownSide, ownIdx, ownPivot);
      }
    };

    collectObject(tempRoot, 1, 'torso', 'torso', 0, 0, torsoResult.torsoCenter.clone());

    // Lightweight LOD 2 far-distance proxy geometry (low-poly sculpted silhouette)
    const lod2ProxyGeometry = new THREE.IcosahedronGeometry(1.0, 1);
    lod2ProxyGeometry.scale(
      Math.max(0.2, rawSize.x * 0.42),
      Math.max(0.2, rawSize.y * 0.42),
      Math.max(0.2, rawSize.z * 0.44)
    );
    lod2ProxyGeometry.translate(rawCenter.x, rawCenter.y, rawCenter.z);
    uniqueGeometries.add(lod2ProxyGeometry);

    blueprint = {
      key: bpKey,
      parts: templates,
      lod2ProxyGeometry,
      slots: torsoResult.slots,
      slotsCount: torsoResult.slots.length,
      rawMinY: rawBox.min.y,
      rawCenterX: rawCenter.x,
      rawCenterZ: rawCenter.z,
      maxDim,
      vertices,
      triangles,
      partsCount,
      subdivisionLevel: quality.subdivisionLevel,
      subMorphotypeId: genes.baseSubMorphotype.id,
      subMorphotypeName: genes.baseSubMorphotype.name,
      hybridPartnerName: genes.hybridPartner?.name,
      bodyAxis: genes.subMorphotype.bodyAxis,
      limbSummary: formatLimbSummary(genes),
      specialFeatures: genes.subMorphotype.specialFeatures,
      refCount: 1,
      disposeResources: () => {
        uniqueGeometries.forEach((g) => g.dispose());
      },
    };
    storeCachedBlueprint(blueprint);
  }

  // 3. Instantiate Live Scene Graph + LOD + Grounded Size Normalization
  const root = new THREE.Group();
  root.name = `Creature_${genes.profile.id}_${genes.subMorphotype.id}_${genome.seed}`;

  const anatomy = new THREE.Group();
  anatomy.name = 'AnatomyRoot';
  root.add(anatomy);

  const useLod = quality.lodEnabled && !disableLod;
  const { lodObject, lod0Group, lodLevels } = instantiateFromBlueprint(blueprint, materials, useLod);
  anatomy.add(lodObject);

  // Build anatomical slot visualizer overlay cleanly from cached slots
  const slotsGroup = buildSlotsVisualizerGroup(blueprint.slots);
  slotsGroup.visible = false;
  anatomy.add(slotsGroup);

  const targetUnits = SIZE_PRESETS[genome.sizePreset].units;
  const uniformScale = targetUnits / blueprint.maxDim;
  anatomy.scale.setScalar(uniformScale);
  anatomy.position.set(
    -blueprint.rawCenterX * uniformScale,
    -blueprint.rawMinY * uniformScale,
    -blueprint.rawCenterZ * uniformScale
  );
  anatomy.userData.baseScale = uniformScale;
  anatomy.userData.basePosX = anatomy.position.x;
  anatomy.userData.basePosY = anatomy.position.y;
  anatomy.userData.basePosZ = anatomy.position.z;

  // Immediately snap to the genome's active pose & gait baseline before measuring final bounds
  applyCreaturePose(
    root,
    genome.pose ?? 'neutral',
    0,
    0.016,
    true,
    genome.animationMode ?? 'auto',
    genome.archetype,
    genes.subMorphotype
  );

  root.updateMatrixWorld(true);
  const finalBounds = new THREE.Box3().setFromObject(lod0Group);

  const generationMs = Math.max(1, Math.round(performance.now() - t0));

  const dispose = () => {
    slotsGroup.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) {
        const m = o as THREE.Mesh;
        m.geometry.dispose();
        (m.material as THREE.Material).dispose();
      }
    });
    materials.dispose();
    releaseCachedBlueprint(bpKey);
    releaseCachedTextures(texKey);
  };

  return {
    group: root,
    exportGroup: lod0Group,
    stats: {
      vertices: blueprint.vertices,
      triangles: blueprint.triangles,
      partsCount: blueprint.partsCount,
      slotCount: blueprint.slotsCount,
      subdivisionLevel: blueprint.subdivisionLevel,
      generationMs,
      cacheHit,
      lodLevels,
      rarityLabel: genes.rarityLabel,
      pose: genome.pose,
      subMorphotypeId: blueprint.subMorphotypeId,
      subMorphotypeName: blueprint.subMorphotypeName,
      hybridPartnerName: blueprint.hybridPartnerName,
      bodyAxis: blueprint.bodyAxis,
      limbSummary: blueprint.limbSummary,
      specialFeatures: blueprint.specialFeatures,
      texturePreviews: textures.previews,
    },
    subMorphotype: genes.subMorphotype,
    materials,
    textures,
    bounds: finalBounds,
    dispose,
  };
}
