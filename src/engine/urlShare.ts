import { ARCHETYPE_PROFILES } from './archetypes';
import { ENGINE_CONSTANTS, SIZE_PRESETS } from './constants';
import { DEFAULT_MUTATION_LOCKS, DEFAULT_PART_EDITS } from './genomeMutation';
import { ANIMATION_MODES, POSE_PRESETS } from './poses';
import { NARRATIVE_SCENES } from './scenePresets';
import {
  AnimationModeId,
  ArchetypeId,
  CreatureGenome,
  NarrativeSceneId,
  PosePresetId,
  ShellType,
  SizePresetId,
  SymmetryMode,
  TailType,
  WingPresence,
} from './types';

export interface SharedCreaturePayload {
  genome: CreatureGenome;
  narrativeScene?: NarrativeSceneId;
  autoMatchScene?: boolean;
}

const VALID_ARCHETYPES = new Set<string>(Object.keys(ARCHETYPE_PROFILES));
const VALID_SYMMETRIES = new Set<string>([
  'bilateral',
  'radial4',
  'radial5',
  'radial6',
  'radial8',
  'asymmetric',
]);
const VALID_SIZES = new Set<string>(Object.keys(SIZE_PRESETS));
const VALID_POSES = new Set<string>(Object.keys(POSE_PRESETS));
const VALID_ANIMATIONS = new Set<string>(Object.keys(ANIMATION_MODES));
const VALID_SCENES = new Set<string>(Object.keys(NARRATIVE_SCENES));
const VALID_WINGS = new Set<string>(['auto', 'none', 'membranous', 'feathered', 'elytra', 'four_wings', 'patagium']);
const VALID_TAILS = new Set<string>([
  'auto',
  'prehensile',
  'whip',
  'caudal_fin',
  'fluke_horizontal',
  'abdomen',
  'stinger',
  'club',
  'short',
  'none',
]);
const VALID_SHELLS = new Set<string>([
  'auto',
  'none',
  'turtle_carapace',
  'spiral_shell',
  'bivalve',
  'armored_plates',
  'dorsal_plates',
]);

function clampNum(val: unknown, min: number, max: number, fallback: number): number {
  if (typeof val !== 'number' || !Number.isFinite(val)) return fallback;
  return Math.max(min, Math.min(max, val));
}

function toUrlSafeBase64(str: string): string {
  const bytes = new TextEncoder().encode(str);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function fromUrlSafeBase64(b64: string): string {
  const padded = b64.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((b64.length + 3) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new TextDecoder().decode(bytes);
}

/**
 * Encodes a CreatureGenome + optional active scene into a compact URL-safe token (`c=...`)
 * preserving custom part edits, rarity, pose, animation mode, and textureSeed.
 */
export function encodeSharedCreatureToken(
  genome: CreatureGenome,
  narrativeScene?: NarrativeSceneId,
  autoMatchScene?: boolean
): string {
  const compactedParts: Record<string, unknown> = {};
  (Object.keys(DEFAULT_PART_EDITS) as Array<keyof typeof DEFAULT_PART_EDITS>).forEach((k) => {
    if (genome.partEdits[k] !== DEFAULT_PART_EDITS[k]) {
      compactedParts[k] = genome.partEdits[k];
    }
  });

  const compactedLocks: Record<string, boolean> = {};
  (Object.keys(DEFAULT_MUTATION_LOCKS) as Array<keyof typeof DEFAULT_MUTATION_LOCKS>).forEach((k) => {
    if (genome.locks[k]) compactedLocks[k] = true;
  });

  const compact: Record<string, unknown> = {
    v: 1,
    s: genome.seed,
    a: genome.archetype,
    sm: genome.subMorphotypeId,
    mv: Number(genome.morphVariation.toFixed(2)),
    r: Number(genome.rarity.toFixed(2)),
    p: genome.pose,
    am: genome.animationMode,
    as: Number(genome.animationSpeed.toFixed(2)),
    sy: genome.symmetry,
    sz: genome.sizePreset,
    th: Number(genome.thickness.toFixed(2)),
    ln: Number(genome.length.toFixed(2)),
    ay: Number(genome.asymmetry.toFixed(2)),
    dd: Number(genome.detailDensity.toFixed(2)),
    es: Number(genome.eyeScale.toFixed(2)),
    lc: Number(genome.limbComplexity.toFixed(2)),
    da: Number(genome.displacementAmp.toFixed(3)),
  };

  if (genome.textureSeed !== undefined && genome.textureSeed !== genome.seed) {
    compact.ts = genome.textureSeed;
  }
  if (Object.keys(compactedParts).length > 0) {
    compact.pe = compactedParts;
  }
  if (Object.keys(compactedLocks).length > 0) {
    compact.lk = compactedLocks;
  }
  if (narrativeScene) {
    compact.ns = narrativeScene;
  }
  if (autoMatchScene !== undefined) {
    compact.ams = autoMatchScene ? 1 : 0;
  }

  return toUrlSafeBase64(JSON.stringify(compact));
}

export function buildShareableCreatureUrl(
  genome: CreatureGenome,
  narrativeScene: NarrativeSceneId,
  autoMatchScene: boolean
): string {
  const token = encodeSharedCreatureToken(genome, narrativeScene, autoMatchScene);
  if (typeof window === 'undefined') {
    return `?c=${token}`;
  }
  const url = new URL(window.location.href);
  url.searchParams.set('c', token);
  url.hash = '';
  return url.toString();
}

export function decodeSharedCreatureToken(
  token: string,
  fallbackGenome: CreatureGenome
): SharedCreaturePayload | null {
  try {
    const cleanToken = token.trim();
    if (!cleanToken) return null;
    const rawJson = fromUrlSafeBase64(cleanToken);
    const data = JSON.parse(rawJson) as Record<string, unknown>;
    if (!data || typeof data !== 'object') return null;

    const archetype = VALID_ARCHETYPES.has(String(data.a))
      ? (String(data.a) as ArchetypeId)
      : fallbackGenome.archetype;
    const seed = Math.round(
      clampNum(data.s, ENGINE_CONSTANTS.MIN_SEED, ENGINE_CONSTANTS.MAX_SEED, fallbackGenome.seed)
    );
    const textureSeed =
      data.ts !== undefined
        ? Math.round(clampNum(data.ts, ENGINE_CONSTANTS.MIN_SEED, ENGINE_CONSTANTS.MAX_SEED, seed))
        : seed;

    const peIn = (data.pe && typeof data.pe === 'object' ? data.pe : {}) as Record<string, unknown>;
    const partEdits = {
      ...DEFAULT_PART_EDITS,
      torsoWidthScale: clampNum(peIn.torsoWidthScale, 0.5, 1.8, DEFAULT_PART_EDITS.torsoWidthScale),
      torsoHeightScale: clampNum(peIn.torsoHeightScale, 0.5, 1.8, DEFAULT_PART_EDITS.torsoHeightScale),
      torsoLengthScale: clampNum(peIn.torsoLengthScale, 0.5, 1.8, DEFAULT_PART_EDITS.torsoLengthScale),
      spineArchScale: clampNum(peIn.spineArchScale, 0, 2.2, DEFAULT_PART_EDITS.spineArchScale),
      headScale: clampNum(peIn.headScale, 0.5, 1.8, DEFAULT_PART_EDITS.headScale),
      neckScale: clampNum(peIn.neckScale, 0.3, 2.2, DEFAULT_PART_EDITS.neckScale),
      eyeCountOverride:
        peIn.eyeCountOverride === 'auto'
          ? ('auto' as const)
          : typeof peIn.eyeCountOverride === 'number'
            ? Math.round(clampNum(peIn.eyeCountOverride, 0, 8, 2))
            : DEFAULT_PART_EDITS.eyeCountOverride,
      crestOverride:
        peIn.crestOverride === 'on' || peIn.crestOverride === 'off' || peIn.crestOverride === 'auto'
          ? peIn.crestOverride
          : DEFAULT_PART_EDITS.crestOverride,
      limbsEnabled: typeof peIn.limbsEnabled === 'boolean' ? peIn.limbsEnabled : DEFAULT_PART_EDITS.limbsEnabled,
      limbLengthScale: clampNum(peIn.limbLengthScale, 0.4, 1.9, DEFAULT_PART_EDITS.limbLengthScale),
      limbThicknessScale: clampNum(peIn.limbThicknessScale, 0.4, 1.9, DEFAULT_PART_EDITS.limbThicknessScale),
      wingOverride: VALID_WINGS.has(String(peIn.wingOverride))
        ? (String(peIn.wingOverride) as WingPresence | 'auto')
        : DEFAULT_PART_EDITS.wingOverride,
      wingSpanScale: clampNum(peIn.wingSpanScale, 0.4, 2.0, DEFAULT_PART_EDITS.wingSpanScale),
      tailOverride: VALID_TAILS.has(String(peIn.tailOverride))
        ? (String(peIn.tailOverride) as TailType | 'auto')
        : DEFAULT_PART_EDITS.tailOverride,
      tailLengthScale: clampNum(peIn.tailLengthScale, 0.3, 2.0, DEFAULT_PART_EDITS.tailLengthScale),
      tentacleCountOverride:
        peIn.tentacleCountOverride === 'auto'
          ? ('auto' as const)
          : typeof peIn.tentacleCountOverride === 'number'
            ? Math.round(clampNum(peIn.tentacleCountOverride, 0, 12, 4))
            : DEFAULT_PART_EDITS.tentacleCountOverride,
      tentacleLengthScale: clampNum(peIn.tentacleLengthScale, 0.4, 2.0, DEFAULT_PART_EDITS.tentacleLengthScale),
      shellOverride: VALID_SHELLS.has(String(peIn.shellOverride))
        ? (String(peIn.shellOverride) as ShellType | 'auto')
        : DEFAULT_PART_EDITS.shellOverride,
    };

    const lkIn = (data.lk && typeof data.lk === 'object' ? data.lk : {}) as Record<string, unknown>;
    const locks = {
      archetype: Boolean(lkIn.archetype),
      torso: Boolean(lkIn.torso),
      head: Boolean(lkIn.head),
      limbs: Boolean(lkIn.limbs),
      details: Boolean(lkIn.details),
      colors: Boolean(lkIn.colors),
    };

    const genome: CreatureGenome = {
      seed,
      textureSeed,
      archetype,
      subMorphotypeId: typeof data.sm === 'string' && data.sm.length > 0 ? data.sm : 'auto',
      morphVariation: clampNum(data.mv, 0, 1, fallbackGenome.morphVariation),
      rarity: clampNum(data.r, 0, 1, fallbackGenome.rarity),
      pose: VALID_POSES.has(String(data.p)) ? (String(data.p) as PosePresetId) : fallbackGenome.pose,
      animationMode: VALID_ANIMATIONS.has(String(data.am))
        ? (String(data.am) as AnimationModeId)
        : fallbackGenome.animationMode,
      animationSpeed: clampNum(data.as, 0.25, 2.5, fallbackGenome.animationSpeed),
      symmetry: VALID_SYMMETRIES.has(String(data.sy))
        ? (String(data.sy) as SymmetryMode)
        : fallbackGenome.symmetry,
      sizePreset: VALID_SIZES.has(String(data.sz))
        ? (String(data.sz) as SizePresetId)
        : fallbackGenome.sizePreset,
      thickness: clampNum(data.th, 0.5, 1.6, fallbackGenome.thickness),
      length: clampNum(data.ln, 0.6, 1.7, fallbackGenome.length),
      asymmetry: clampNum(data.ay, 0, 0.85, fallbackGenome.asymmetry),
      detailDensity: clampNum(data.dd, 0, 1, fallbackGenome.detailDensity),
      eyeScale: clampNum(data.es, 0.4, 1.8, fallbackGenome.eyeScale),
      limbComplexity: clampNum(data.lc, 0.2, 1.0, fallbackGenome.limbComplexity),
      displacementAmp: clampNum(data.da, 0, 0.18, fallbackGenome.displacementAmp),
      partEdits,
      locks,
    };

    const narrativeScene = VALID_SCENES.has(String(data.ns))
      ? (String(data.ns) as NarrativeSceneId)
      : undefined;
    const autoMatchScene =
      data.ams === 0 ? false : data.ams === 1 ? true : undefined;

    return { genome, narrativeScene, autoMatchScene };
  } catch {
    return null;
  }
}

export function parseSharedCreatureInput(
  rawInput: string,
  fallbackGenome: CreatureGenome
): SharedCreaturePayload | null {
  const trimmed = rawInput.trim();
  if (!trimmed) return null;

  try {
    if (trimmed.includes('c=')) {
      const fakeUrl = trimmed.startsWith('http')
        ? new URL(trimmed)
        : new URL(trimmed.startsWith('?') ? `https://x.local/${trimmed}` : `https://x.local/?${trimmed}`);
      const cParam = fakeUrl.searchParams.get('c');
      if (cParam) return decodeSharedCreatureToken(cParam, fallbackGenome);
    }
  } catch {
    // Fallback to raw extraction below
  }

  const match = trimmed.match(/(?:[?&#]c=)([A-Za-z0-9\-_]+)/);
  if (match && match[1]) {
    return decodeSharedCreatureToken(match[1], fallbackGenome);
  }
  return decodeSharedCreatureToken(trimmed, fallbackGenome);
}

export function parseSharedCreatureFromWindowUrl(
  fallbackGenome: CreatureGenome
): SharedCreaturePayload | null {
  if (typeof window === 'undefined') return null;
  const searchParams = new URLSearchParams(window.location.search);
  const paramToken = searchParams.get('c');
  if (paramToken) {
    return decodeSharedCreatureToken(paramToken, fallbackGenome);
  }
  if (window.location.hash && window.location.hash.includes('c=')) {
    return parseSharedCreatureInput(window.location.hash.replace(/^#/, '?'), fallbackGenome);
  }
  return null;
}
