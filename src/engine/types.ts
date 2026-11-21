import type * as THREE from 'three';

export type ArchetypeId =
  | 'anfibio'
  | 'mamifero'
  | 'reptil'
  | 'pez'
  | 'ave'
  | 'insecto'
  | 'molusco'
  | 'alien';

export type SymmetryMode = 'bilateral' | 'radial4' | 'radial5' | 'radial6' | 'radial8' | 'asymmetric';

export type BodyAxis = 'horizontal' | 'vertical' | 'curved' | 'coiled';

export type HeadPosition = 'top' | 'front' | 'lateral' | 'embedded';

export type TailType =
  | 'prehensile'
  | 'whip'
  | 'caudal_fin'
  | 'fluke_horizontal'
  | 'abdomen'
  | 'stinger'
  | 'club'
  | 'short'
  | 'none';

export type WingPresence = 'none' | 'membranous' | 'feathered' | 'elytra' | 'four_wings' | 'patagium';

export type ShellType =
  | 'none'
  | 'turtle_carapace'
  | 'spiral_shell'
  | 'bivalve'
  | 'armored_plates'
  | 'dorsal_plates';

export type LimbCategory =
  | 'arm'
  | 'leg'
  | 'jumping_leg'
  | 'raptorial'
  | 'chela'
  | 'digging'
  | 'flipper'
  | 'reduced'
  | 'none';

export interface LimbGroupConfig {
  count: number;
  type: LimbCategory;
  articulation: string;
  lengthScale: number;
}

export interface SubMorphotype {
  id: string;
  name: string;
  archetype: ArchetypeId;
  exampleTaxa: string;
  description: string;
  weight: number;
  symmetry: SymmetryMode;
  bodyAxis: BodyAxis;
  torsoAspect: [number, number, number];
  limbConfiguration: {
    forelimbs: LimbGroupConfig;
    hindlimbs: LimbGroupConfig;
    extraPairs?: number;
  };
  spineSegments: number;
  spineCurvature: number;
  neckRatio: number;
  headScaleRatio: number;
  headPosition: HeadPosition;
  tailPresence: boolean;
  tailType: TailType;
  tailLengthScale: number;
  wingPresence: WingPresence;
  wingSpanScale: number;
  hasFins: boolean;
  hasTentacles: boolean;
  tentacleCount: number;
  hasAntennae: boolean;
  hasMandibles: boolean;
  hasBeak: boolean;
  hasBifidTongue: boolean;
  hasDorsalCrest: boolean;
  shellType: ShellType;
  eyeCount: number;
  eyeScaleBias: number;
  eyeStyleOverride?: EyeStyle;
  limbStanceOverride?: LimbStance;
  specialFeatures: string[];
}

export type SizePresetId = 'micro' | 'small' | 'medium' | 'colossal';

export type QualityLevel = 'low' | 'medium' | 'high' | 'ultra';

export type PosePresetId = 'neutral' | 'alert' | 'roar' | 'sprint' | 'flight' | 'curled';

export type AnimationModeId =
  | 'auto'
  | 'idle'
  | 'walk'
  | 'run'
  | 'swim'
  | 'fly'
  | 'stalk'
  | 'paused';

export type EditablePartId =
  | 'torso'
  | 'head'
  | 'limbs'
  | 'wings'
  | 'tail'
  | 'tentacles'
  | 'shell';

export type MutationLockKey = 'archetype' | 'torso' | 'head' | 'limbs' | 'details' | 'colors';

export type PartialMutationLocks = Record<MutationLockKey, boolean>;

export interface PartEditsConfig {
  torsoWidthScale: number;
  torsoHeightScale: number;
  torsoLengthScale: number;
  spineArchScale: number;
  headScale: number;
  neckScale: number;
  eyeCountOverride: number | 'auto';
  crestOverride: 'auto' | 'on' | 'off';
  limbsEnabled: boolean;
  limbLengthScale: number;
  limbThicknessScale: number;
  wingOverride: WingPresence | 'auto';
  wingSpanScale: number;
  tailOverride: TailType | 'auto';
  tailLengthScale: number;
  tentacleCountOverride: number | 'auto';
  tentacleLengthScale: number;
  shellOverride: ShellType | 'auto';
}

export interface QualityPresetConfig {
  id: QualityLevel;
  label: string;
  sdfResolution: number;
  subdivisionLevel: number;
  textureResolution: number;
  maxSurfaceDetails: number;
  particleMultiplier: number;
  propMultiplier: number;
  pixelRatioMax: number;
  shadowsEnabled: boolean;
  shadowMapSize: number;
  ssaoAllowed: boolean;
  bloomAllowed: boolean;
  postFxAllowed: boolean;
  maxDynamicFillLights: number;
  lodEnabled: boolean;
}

export type EnvironmentPresetId = 'obsidian' | 'abyssal' | 'xenosphere' | 'neutral';

export type NarrativeSceneId =
  | 'laboratorio'
  | 'fosa_abisal'
  | 'exotica'
  | 'estudio'
  | 'selva'
  | 'desierto'
  | 'glaciar'
  | 'templo';

export type NarrativeParticleType =
  | 'lab_steam'
  | 'marine_snow'
  | 'spores'
  | 'studio_dust'
  | 'jungle_spores'
  | 'sand_wind'
  | 'snow'
  | 'embers'
  | 'none';

export interface NarrativeScenePreset {
  id: NarrativeSceneId;
  name: string;
  shortName: string;
  tag: string;
  description: string;
  hdriBase: EnvironmentPresetId;
  previewGradient: [string, string];
  accentHex: string;
  environment: {
    skyZenith: string;
    skyHorizon: string;
    skyGround: string;
    fogColor: string;
    fogDensity: number;
    hdriIntensity: number;
  };
  lighting: {
    ambientColor: string;
    ambientIntensity: number;
    hemiSky: string;
    hemiGround: string;
    hemiIntensity: number;
    keyColor: string;
    keyIntensity: number;
    keyPosition: [number, number, number];
    rimColor: string;
    rimIntensity: number;
    rimPosition: [number, number, number];
    fillLights: Array<{
      color: string;
      intensity: number;
      position: [number, number, number];
      distance: number;
    }>;
    godRays: boolean;
    godRayColor: string;
    godRayIntensity: number;
  };
  particles: {
    type: NarrativeParticleType;
    count: number;
    size: number;
    color: string;
    secondaryColor: string;
    opacity: number;
    speed: number;
    turbulence: number;
  };
  ground: {
    style:
      | 'lab_platform'
      | 'abyssal_sand'
      | 'alien_basalt'
      | 'studio_cove'
      | 'jungle_moss'
      | 'desert_dunes'
      | 'antarctic_ice'
      | 'ruined_stone';
    color: string;
    secondaryColor: string;
    roughness: number;
    metalness: number;
    displacementScale: number;
  };
  postProcessing: {
    bloomStrength: number;
    bloomThreshold: number;
    bloomRadius: number;
    chromaticAberration: number;
    vignette: number;
    colorGrading: {
      shadows: string;
      midtones: string;
      highlights: string;
      intensity: number;
    };
  };
  creatureCoherence: {
    emissiveBoost: number;
    envMapMultiplier: number;
    wetClearcoatBoost: number;
  };
  recommendedArchetypes: ArchetypeId[];
}

export type LimbStance = 'digitigrade' | 'plantigrade' | 'insectoid' | 'hydrostatic';

export type EyeStyle = 'vertebrate' | 'slit' | 'compound' | 'bulbous' | 'xenomorphic';

export type TexturePatternId =
  | 'amphibian_pores'
  | 'mammal_fur'
  | 'reptile_scales'
  | 'fish_iridescent'
  | 'avian_plumage'
  | 'insect_chitin'
  | 'mollusk_slime'
  | 'alien_non_euclidean';

export interface CreatureGenome {
  seed: number;
  textureSeed?: number;
  archetype: ArchetypeId;
  subMorphotypeId: 'auto' | string;
  morphVariation: number; // 0.0 (pure sub-morphotype) - 1.0 (hybrid/extreme structural mutations)
  rarity: number; // 0.0 (canonical) - 1.0 (rare xenomorphic anomaly)
  pose: PosePresetId;
  animationMode: AnimationModeId;
  animationSpeed: number;
  symmetry: SymmetryMode;
  sizePreset: SizePresetId;
  // Parametric sliders (normalized 0.0 - 1.0 or semantic ranges)
  thickness: number; // 0.5 - 1.6
  length: number; // 0.6 - 1.7
  asymmetry: number; // 0.0 - 0.85
  detailDensity: number; // 0.0 - 1.0 (fur/scales/feathers/spines)
  eyeScale: number; // 0.4 - 1.8
  limbComplexity: number; // 0.2 - 1.0
  displacementAmp: number; // 0.0 - 0.18
  partEdits: PartEditsConfig;
  locks: PartialMutationLocks;
}

export interface SceneRenderSettings {
  environment: EnvironmentPresetId;
  narrativeScene: NarrativeSceneId;
  qualityLevel: QualityLevel;
  autoMatchScene: boolean;
  propDensity: number; // 0.0 - 1.0
  atmosphereIntensity: number; // 0.0 - 1.0
  enableParticles: boolean;
  chromaticAberration: boolean;
  vignette: boolean;
  enableAmbientAudio: boolean;
  useHdriBackground: boolean;
  enableSSAO: boolean;
  enableBloom: boolean;
  bloomStrength: number;
  exposure: number;
  transparentScreenshot: boolean;
  autoRotate: boolean;
  showSlots: boolean;
  isolateTorso: boolean;
  wireframe: boolean;
}

export interface ArchetypePalette {
  primaryHex: string;
  secondaryHex: string;
  bellyHex: string;
  accentHex: string;
  emissiveHex: string;
  irisHex: string;
  sssTintHex: string;
}

export interface ArchetypeProfile {
  id: ArchetypeId;
  name: string;
  scientificTag: string;
  description: string;
  defaultSymmetry: SymmetryMode;
  limbStance: LimbStance;
  eyeStyle: EyeStyle;
  texturePattern: TexturePatternId;
  palette: ArchetypePalette;
  // Morphological defaults (modulated by SubMorphotype)
  torsoAspect: [number, number, number];
  spineCurvature: number;
  neckLengthRatio: number;
  headSizeRatio: number;
  limbPairCount: number;
  hasWings: boolean;
  wingStyle: 'membranous' | 'feathered' | 'none';
  hasFins: boolean;
  hasTail: boolean;
  tailType: 'prehensile' | 'caudal_fin' | 'abdomen' | 'none';
  hasAntennae: boolean;
  hasMandibles: boolean;
  hasBeak: boolean;
  hasBifidTongue: boolean;
  hasTentacles: boolean;
  hasDorsalCrest: boolean;
  // PBR material parameters
  roughness: number;
  metalness: number;
  clearcoat: number;
  clearcoatRoughness: number;
  sheen: number;
  sheenRoughness: number;
  anisotropy: number;
  iridescence: number;
  sssStrength: number;
  bioluminescence: number;
}

export interface AnatomicalSlot {
  id: string;
  kind:
    | 'head'
    | 'eye'
    | 'ear_antenna'
    | 'jaw'
    | 'arm'
    | 'leg'
    | 'wing'
    | 'fin'
    | 'tail'
    | 'tentacle'
    | 'crest'
    | 'shell';
  position: THREE.Vector3;
  normal: THREE.Vector3;
  tangent: THREE.Vector3;
  side: -1 | 0 | 1;
  index: number;
  limbRole?: LimbCategory;
  limbLengthScale?: number;
  articulation?: string;
}

export interface PbrTexturePreviews {
  albedo: string;
  normal: string;
  roughness: string;
  ao: string;
  emissive: string;
  iris: string;
}

export interface CreatureBuildStats {
  vertices: number;
  triangles: number;
  partsCount: number;
  slotCount: number;
  subdivisionLevel: number;
  generationMs: number;
  cacheHit?: boolean;
  lodLevels?: number;
  rarityLabel?: string;
  pose?: PosePresetId;
  subMorphotypeId: string;
  subMorphotypeName: string;
  hybridPartnerName?: string;
  bodyAxis: BodyAxis;
  limbSummary: string;
  specialFeatures: string[];
  texturePreviews?: PbrTexturePreviews;
}

export type ExportFormat = 'glb' | 'gltf' | 'obj';

export interface ExportReport {
  format: ExportFormat;
  filename: string;
  byteSize: number;
  meshCount: number;
  materialCount: number;
  embeddedMapsCount: number;
}

export interface TurntableReport {
  filename: string;
  mimeType: string;
  byteSize: number;
  durationSec: number;
  revolutions: number;
  width: number;
  height: number;
}

export interface ArchetypeDiversityReport {
  sampleCount: number;
  uniqueSubMorphotypes: number;
  totalAvailableSubMorphotypes: number;
  minLimbs: number;
  maxLimbs: number;
  minBodyLimbRatio: number;
  maxBodyLimbRatio: number;
  uniqueSymmetries: SymmetryMode[];
  specializedCount: number;
  passesValidation: boolean;
}
