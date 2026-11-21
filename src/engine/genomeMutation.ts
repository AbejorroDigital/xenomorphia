import { ARCHETYPE_LIST } from './archetypes';
import { ENGINE_CONSTANTS } from './constants';
import { SeededPRNG } from './prng';
import { getSubMorphotypesForArchetype } from './subMorphotypes';
import {
  AnimationModeId,
  CreatureGenome,
  MutationLockKey,
  PartEditsConfig,
  PartialMutationLocks,
  PosePresetId,
} from './types';

export const DEFAULT_PART_EDITS: PartEditsConfig = {
  torsoWidthScale: 1.0,
  torsoHeightScale: 1.0,
  torsoLengthScale: 1.0,
  spineArchScale: 1.0,
  headScale: 1.0,
  neckScale: 1.0,
  eyeCountOverride: 'auto',
  crestOverride: 'auto',
  limbsEnabled: true,
  limbLengthScale: 1.0,
  limbThicknessScale: 1.0,
  wingOverride: 'auto',
  wingSpanScale: 1.0,
  tailOverride: 'auto',
  tailLengthScale: 1.0,
  tentacleCountOverride: 'auto',
  tentacleLengthScale: 1.0,
  shellOverride: 'auto',
};

export const DEFAULT_MUTATION_LOCKS: PartialMutationLocks = {
  archetype: false,
  torso: false,
  head: false,
  limbs: false,
  details: false,
  colors: false,
};

export const LOCK_DOMAIN_META: Array<{
  key: MutationLockKey;
  label: string;
  hint: string;
}> = [
  { key: 'archetype', label: 'Arquetipo y Plan', hint: 'Conserva especie, sub-morfotipo y simetría' },
  { key: 'torso', label: 'Torso', hint: 'Conserva grosor, longitud y curvatura axial' },
  { key: 'head', label: 'Cabeza y Ojos', hint: 'Conserva cráneo, cuello, ojos y cresta' },
  { key: 'limbs', label: 'Extremidades', hint: 'Conserva patas, alas, cola y tentáculos' },
  { key: 'details', label: 'Piel y Rareza', hint: 'Conserva densidad, relieve 3D y anomalía' },
  { key: 'colors', label: 'Color y Textura', hint: 'Conserva paleta cromática y patrones PBR' },
];

export function getRarityClassification(rarity: number): {
  label: string;
  color: string;
} {
  if (rarity >= 0.8) return { label: 'Anomalía Abisal', color: '#f43f5e' };
  if (rarity >= 0.6) return { label: 'Épico Mutante', color: '#c084fc' };
  if (rarity >= 0.38) return { label: 'Raro', color: '#38bdf8' };
  if (rarity >= 0.18) return { label: 'Inusual', color: '#2dd4bf' };
  return { label: 'Común', color: '#94a3b8' };
}

export function hasActiveMutationLocks(locks: PartialMutationLocks): boolean {
  return Object.values(locks).some(Boolean);
}

/**
 * Mutates a CreatureGenome respecting active per-domain locks.
 * When `respectLocks` is true, locked anatomical or chromatic traits remain frozen
 * while unlocked domains evolve deterministically from a fresh seed.
 */
export function mutateCreatureGenome(
  current: CreatureGenome,
  respectLocks = true
): CreatureGenome {
  const nextSeed = Math.floor(10000 + Math.random() * (ENGINE_CONSTANTS.MAX_SEED - 10000));
  const rng = new SeededPRNG(nextSeed ^ 0x517cc1b7);
  const locks = respectLocks ? current.locks : DEFAULT_MUTATION_LOCKS;

  let archetype = current.archetype;
  let subMorphotypeId = current.subMorphotypeId;
  let symmetry = current.symmetry;
  let morphVariation = current.morphVariation;

  if (!locks.archetype) {
    const pickedArch = rng.pick(ARCHETYPE_LIST);
    archetype = pickedArch.id;
    const subs = getSubMorphotypesForArchetype(archetype);
    const pickedSub = rng.pick(subs);
    subMorphotypeId = rng.chance(0.35) ? 'auto' : pickedSub.id;
    symmetry = subMorphotypeId === 'auto' ? pickedArch.defaultSymmetry : pickedSub.symmetry;
    morphVariation = Number(rng.range(0.05, 0.55).toFixed(2));
  }

  const nextPartEdits: PartEditsConfig = { ...current.partEdits };

  let thickness = current.thickness;
  let length = current.length;
  if (!locks.torso) {
    thickness = Number(rng.range(0.76, 1.32).toFixed(2));
    length = Number(rng.range(0.78, 1.38).toFixed(2));
    nextPartEdits.torsoWidthScale = Number(rng.range(0.84, 1.22).toFixed(2));
    nextPartEdits.torsoHeightScale = Number(rng.range(0.84, 1.22).toFixed(2));
    nextPartEdits.torsoLengthScale = Number(rng.range(0.84, 1.22).toFixed(2));
    nextPartEdits.spineArchScale = Number(rng.range(0.7, 1.35).toFixed(2));
    if (rng.chance(0.28)) {
      nextPartEdits.shellOverride = rng.pick(['auto', 'none', 'armored_plates', 'dorsal_plates']);
    } else {
      nextPartEdits.shellOverride = 'auto';
    }
  }

  let eyeScale = current.eyeScale;
  if (!locks.head) {
    eyeScale = Number(rng.range(0.7, 1.45).toFixed(2));
    nextPartEdits.headScale = Number(rng.range(0.82, 1.28).toFixed(2));
    nextPartEdits.neckScale = Number(rng.range(0.78, 1.32).toFixed(2));
    nextPartEdits.eyeCountOverride = 'auto';
    nextPartEdits.crestOverride = 'auto';
  }

  let limbComplexity = current.limbComplexity;
  if (!locks.limbs) {
    limbComplexity = Number(rng.range(0.35, 0.95).toFixed(2));
    nextPartEdits.limbsEnabled = true;
    nextPartEdits.limbLengthScale = Number(rng.range(0.8, 1.28).toFixed(2));
    nextPartEdits.limbThicknessScale = Number(rng.range(0.82, 1.24).toFixed(2));
    nextPartEdits.wingSpanScale = Number(rng.range(0.82, 1.25).toFixed(2));
    nextPartEdits.tailLengthScale = Number(rng.range(0.8, 1.3).toFixed(2));
    nextPartEdits.tentacleLengthScale = Number(rng.range(0.8, 1.25).toFixed(2));
    nextPartEdits.wingOverride = 'auto';
    nextPartEdits.tailOverride = 'auto';
    nextPartEdits.tentacleCountOverride = 'auto';
  }

  let detailDensity = current.detailDensity;
  let displacementAmp = current.displacementAmp;
  let asymmetry = current.asymmetry;
  let rarity = current.rarity;
  if (!locks.details) {
    detailDensity = Number(rng.range(0.25, 0.9).toFixed(2));
    displacementAmp = Number(rng.range(0.02, 0.075).toFixed(3));
    asymmetry = Number(rng.range(0.04, 0.24).toFixed(2));
    rarity = Number(Math.pow(rng.next(), 1.35).toFixed(2));
  }

  const textureSeed = locks.colors ? (current.textureSeed ?? current.seed) : nextSeed;

  return {
    ...current,
    seed: nextSeed,
    textureSeed,
    archetype,
    subMorphotypeId,
    morphVariation,
    rarity,
    symmetry,
    thickness,
    length,
    asymmetry,
    detailDensity,
    eyeScale,
    limbComplexity,
    displacementAmp,
    partEdits: nextPartEdits,
  };
}

/**
 * Combines two parent genomes (A × B) into an F1 hybrid specimen.
 */
export function hybridizeGenomes(a: CreatureGenome, b: CreatureGenome): CreatureGenome {
  const mixedSeed = ((a.seed * 73856093) ^ (b.seed * 19349663)) % ENGINE_CONSTANTS.MAX_SEED;
  const seed = Math.max(1000, Math.abs(mixedSeed));
  const rng = new SeededPRNG(seed);
  const useAArch = rng.chance(0.5);
  const primary = useAArch ? a : b;
  const secondary = useAArch ? b : a;

  const avg = (x: number, y: number, digits = 2) => Number(((x + y) * 0.5).toFixed(digits));

  return {
    seed,
    textureSeed: rng.chance(0.5) ? (a.textureSeed ?? a.seed) : (b.textureSeed ?? b.seed),
    archetype: primary.archetype,
    subMorphotypeId: primary.subMorphotypeId,
    morphVariation: Number(Math.min(0.85, Math.max(0.32, avg(a.morphVariation, b.morphVariation) + 0.2)).toFixed(2)),
    rarity: Number(Math.min(1, Math.max(a.rarity, b.rarity) * 0.85 + 0.12).toFixed(2)),
    pose: (rng.chance(0.5) ? a.pose : b.pose) as PosePresetId,
    animationMode: (rng.chance(0.5) ? a.animationMode : b.animationMode) as AnimationModeId,
    animationSpeed: avg(a.animationSpeed, b.animationSpeed),
    symmetry: primary.symmetry,
    sizePreset: primary.sizePreset,
    thickness: avg(a.thickness, b.thickness),
    length: avg(a.length, b.length),
    asymmetry: avg(a.asymmetry, b.asymmetry),
    detailDensity: avg(a.detailDensity, b.detailDensity),
    eyeScale: avg(a.eyeScale, b.eyeScale),
    limbComplexity: avg(a.limbComplexity, b.limbComplexity),
    displacementAmp: avg(a.displacementAmp, b.displacementAmp, 3),
    partEdits: {
      ...DEFAULT_PART_EDITS,
      torsoWidthScale: avg(a.partEdits.torsoWidthScale, b.partEdits.torsoWidthScale),
      torsoHeightScale: avg(a.partEdits.torsoHeightScale, b.partEdits.torsoHeightScale),
      torsoLengthScale: avg(a.partEdits.torsoLengthScale, b.partEdits.torsoLengthScale),
      spineArchScale: avg(a.partEdits.spineArchScale, b.partEdits.spineArchScale),
      headScale: avg(a.partEdits.headScale, b.partEdits.headScale),
      neckScale: avg(a.partEdits.neckScale, b.partEdits.neckScale),
      limbLengthScale: avg(a.partEdits.limbLengthScale, b.partEdits.limbLengthScale),
      limbThicknessScale: avg(a.partEdits.limbThicknessScale, b.partEdits.limbThicknessScale),
      wingOverride:
        secondary.partEdits.wingOverride !== 'auto'
          ? secondary.partEdits.wingOverride
          : primary.partEdits.wingOverride,
      wingSpanScale: avg(a.partEdits.wingSpanScale, b.partEdits.wingSpanScale),
      tailLengthScale: avg(a.partEdits.tailLengthScale, b.partEdits.tailLengthScale),
      shellOverride:
        secondary.partEdits.shellOverride !== 'auto'
          ? secondary.partEdits.shellOverride
          : primary.partEdits.shellOverride,
    },
    locks: { ...DEFAULT_MUTATION_LOCKS },
  };
}
