import * as THREE from 'three';
import { AnatomicalSlot, CreatureGenome, QualityLevel } from './types';
import type { ProceduralTextureSet } from './textures';

export interface CachedPartMeshTemplate {
  geometry: THREE.BufferGeometry;
  materialSlot: 'skin' | 'carapace' | 'membrane' | 'cornea' | 'iris' | 'biolum' | 'detail';
  castShadow: boolean;
  receiveShadow: boolean;
  position: THREE.Vector3;
  rotation: THREE.Euler;
  scale: THREE.Vector3;
  pivot: THREE.Vector3;
  partCategory: 'torso' | 'head' | 'limbs' | 'wings' | 'tail' | 'tentacles' | 'shell';
  partRole: string;
  partSide: -1 | 0 | 1;
  partIndex: number;
  name: string;
  lodLevel: 0 | 1; // 0 = high-detail / special / micro-accent, 1 = primary silhouette (kept in LOD1)
  isInstanced?: boolean;
  instanceMatrices?: Float32Array;
  instanceColors?: Float32Array;
  instanceCount?: number;
}

export interface CachedCreatureBlueprint {
  key: string;
  parts: CachedPartMeshTemplate[];
  lod2ProxyGeometry: THREE.BufferGeometry;
  slots: AnatomicalSlot[];
  slotsCount: number;
  rawMinY: number;
  rawCenterX: number;
  rawCenterZ: number;
  maxDim: number;
  vertices: number;
  triangles: number;
  partsCount: number;
  subdivisionLevel: number;
  subMorphotypeId: string;
  subMorphotypeName: string;
  hybridPartnerName?: string;
  bodyAxis: 'horizontal' | 'vertical' | 'curved' | 'coiled';
  limbSummary: string;
  specialFeatures: string[];
  refCount: number;
  disposeResources: () => void;
}

interface CachedTextureEntry {
  key: string;
  textures: ProceduralTextureSet;
  refCount: number;
}

const MAX_CREATURE_BLUEPRINTS = 8;
const MAX_TEXTURE_ENTRIES = 10;

const blueprintCache = new Map<string, CachedCreatureBlueprint>();
const textureCache = new Map<string, CachedTextureEntry>();

export function buildTextureCacheKey(
  genome: CreatureGenome,
  textureResolution: number
): string {
  const texSeed = genome.textureSeed ?? genome.seed;
  return `${texSeed}|${genome.archetype}|${(genome.rarity ?? 0).toFixed(2)}|${textureResolution}`;
}

export function buildCreatureCacheKey(
  genome: CreatureGenome,
  qualityLevel: QualityLevel
): string {
  const pe = genome.partEdits;
  return [
    genome.seed,
    genome.textureSeed ?? genome.seed,
    genome.archetype,
    genome.subMorphotypeId,
    genome.morphVariation.toFixed(2),
    (genome.rarity ?? 0).toFixed(2),
    genome.symmetry,
    genome.thickness.toFixed(2),
    genome.length.toFixed(2),
    genome.asymmetry.toFixed(2),
    genome.detailDensity.toFixed(2),
    genome.eyeScale.toFixed(2),
    genome.limbComplexity.toFixed(2),
    genome.displacementAmp.toFixed(3),
    pe.torsoWidthScale.toFixed(2),
    pe.torsoHeightScale.toFixed(2),
    pe.torsoLengthScale.toFixed(2),
    pe.spineArchScale.toFixed(2),
    pe.headScale.toFixed(2),
    pe.neckScale.toFixed(2),
    String(pe.eyeCountOverride),
    pe.crestOverride,
    String(pe.limbsEnabled),
    pe.limbLengthScale.toFixed(2),
    pe.limbThicknessScale.toFixed(2),
    pe.wingOverride,
    pe.wingSpanScale.toFixed(2),
    pe.tailOverride,
    pe.tailLengthScale.toFixed(2),
    String(pe.tentacleCountOverride),
    pe.tentacleLengthScale.toFixed(2),
    pe.shellOverride,
    qualityLevel,
  ].join('|');
}

export function acquireCachedTextures(key: string): ProceduralTextureSet | null {
  const entry = textureCache.get(key);
  if (!entry) return null;
  // Move to MRU end
  textureCache.delete(key);
  textureCache.set(key, entry);
  entry.refCount++;
  return entry.textures;
}

export function storeCachedTextures(key: string, textures: ProceduralTextureSet): void {
  const existing = textureCache.get(key);
  if (existing) {
    existing.refCount++;
    return;
  }
  textureCache.set(key, { key, textures, refCount: 1 });
  evictTexturesIfNeeded();
}

export function releaseCachedTextures(key: string): void {
  const entry = textureCache.get(key);
  if (!entry) return;
  entry.refCount = Math.max(0, entry.refCount - 1);
  if (!textureCache.has(key) && entry.refCount === 0) {
    entry.textures.dispose();
  }
}

function evictTexturesIfNeeded(): void {
  if (textureCache.size <= MAX_TEXTURE_ENTRIES) return;
  for (const [k, entry] of textureCache.entries()) {
    if (textureCache.size <= MAX_TEXTURE_ENTRIES) break;
    if (entry.refCount <= 0) {
      textureCache.delete(k);
      entry.textures.dispose();
    }
  }
}

export function acquireCachedBlueprint(key: string): CachedCreatureBlueprint | null {
  const entry = blueprintCache.get(key);
  if (!entry) return null;
  blueprintCache.delete(key);
  blueprintCache.set(key, entry);
  entry.refCount++;
  return entry;
}

export function storeCachedBlueprint(blueprint: CachedCreatureBlueprint): void {
  const existing = blueprintCache.get(blueprint.key);
  if (existing) {
    existing.refCount++;
    return;
  }
  blueprint.refCount = 1;
  blueprintCache.set(blueprint.key, blueprint);
  evictBlueprintsIfNeeded();
}

export function releaseCachedBlueprint(key: string): void {
  const entry = blueprintCache.get(key);
  if (!entry) return;
  entry.refCount = Math.max(0, entry.refCount - 1);
  if (entry.refCount <= 0 && !blueprintCache.has(key)) {
    entry.disposeResources();
  }
}

function evictBlueprintsIfNeeded(): void {
  if (blueprintCache.size <= MAX_CREATURE_BLUEPRINTS) return;
  for (const [k, entry] of blueprintCache.entries()) {
    if (blueprintCache.size <= MAX_CREATURE_BLUEPRINTS) break;
    if (entry.refCount <= 0) {
      blueprintCache.delete(k);
      entry.disposeResources();
    }
  }
}

export function clearAllCreatureCaches(): void {
  for (const entry of blueprintCache.values()) {
    if (entry.refCount <= 0) entry.disposeResources();
  }
  blueprintCache.clear();
  for (const entry of textureCache.values()) {
    if (entry.refCount <= 0) entry.textures.dispose();
  }
  textureCache.clear();
}
