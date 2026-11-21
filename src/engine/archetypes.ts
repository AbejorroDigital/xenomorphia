import { getRarityClassification } from './genomeMutation';
import { SeededPRNG } from './prng';
import {
  getSubMorphotypesForArchetype,
  lerpSubMorphotypes,
  selectSubMorphotype,
} from './subMorphotypes';
import {
  ArchetypeId,
  ArchetypeProfile,
  CreatureGenome,
  SubMorphotype,
  SymmetryMode,
} from './types';

export const ARCHETYPE_PROFILES: Record<ArchetypeId, ArchetypeProfile> = {
  anfibio: {
    id: 'anfibio',
    name: 'Anfibio',
    scientificTag: 'Batrachia Xenomorpha',
    description: 'Piel húmeda con capa mucosa, branquias externas, anuros saltadores y ápodos.',
    defaultSymmetry: 'bilateral',
    limbStance: 'plantigrade',
    eyeStyle: 'bulbous',
    texturePattern: 'amphibian_pores',
    palette: {
      primaryHex: '#2a6f5e',
      secondaryHex: '#173836',
      bellyHex: '#9ac8b4',
      accentHex: '#e2a83c',
      emissiveHex: '#34d399',
      irisHex: '#f59e0b',
      sssTintHex: '#4ade80',
    },
    torsoAspect: [1.22, 0.78, 1.32],
    spineCurvature: 0.18,
    neckLengthRatio: 0.28,
    headSizeRatio: 0.56,
    limbPairCount: 2,
    hasWings: false,
    wingStyle: 'none',
    hasFins: true,
    hasTail: true,
    tailType: 'caudal_fin',
    hasAntennae: false,
    hasMandibles: false,
    hasBeak: false,
    hasBifidTongue: false,
    hasTentacles: false,
    hasDorsalCrest: true,
    roughness: 0.24,
    metalness: 0.02,
    clearcoat: 0.92,
    clearcoatRoughness: 0.08,
    sheen: 0.0,
    sheenRoughness: 0.8,
    anisotropy: 0.0,
    iridescence: 0.12,
    sssStrength: 0.45,
    bioluminescence: 0.25,
  },
  mamifero: {
    id: 'mamifero',
    name: 'Mamífero',
    scientificTag: 'Therapsida Exotica',
    description: 'Pelaje sedoso con alta diversidad morfológica: cuadrúpedos, bípedos, cetáceos y voladores.',
    defaultSymmetry: 'bilateral',
    limbStance: 'digitigrade',
    eyeStyle: 'vertebrate',
    texturePattern: 'mammal_fur',
    palette: {
      primaryHex: '#6b5344',
      secondaryHex: '#34261f',
      bellyHex: '#cbb8a9',
      accentHex: '#b4653f',
      emissiveHex: '#f59e0b',
      irisHex: '#fbbf24',
      sssTintHex: '#fca5a5',
    },
    torsoAspect: [0.86, 0.94, 1.48],
    spineCurvature: 0.34,
    neckLengthRatio: 0.44,
    headSizeRatio: 0.48,
    limbPairCount: 2,
    hasWings: false,
    wingStyle: 'none',
    hasFins: false,
    hasTail: true,
    tailType: 'prehensile',
    hasAntennae: false,
    hasMandibles: false,
    hasBeak: false,
    hasBifidTongue: false,
    hasTentacles: false,
    hasDorsalCrest: false,
    roughness: 0.78,
    metalness: 0.0,
    clearcoat: 0.0,
    clearcoatRoughness: 0.5,
    sheen: 0.92,
    sheenRoughness: 0.45,
    anisotropy: 0.15,
    iridescence: 0.0,
    sssStrength: 0.22,
    bioluminescence: 0.0,
  },
  reptil: {
    id: 'reptil',
    name: 'Reptil',
    scientificTag: 'Sauropsida Draconis',
    description: 'Escamas anisotrópicas desde ofidios ápodos hasta quelonios acorazados y terópodos bípedos.',
    defaultSymmetry: 'bilateral',
    limbStance: 'plantigrade',
    eyeStyle: 'slit',
    texturePattern: 'reptile_scales',
    palette: {
      primaryHex: '#4f6232',
      secondaryHex: '#253118',
      bellyHex: '#b5a87a',
      accentHex: '#9f4a29',
      emissiveHex: '#f97316',
      irisHex: '#eab308',
      sssTintHex: '#84cc16',
    },
    torsoAspect: [0.84, 0.76, 1.72],
    spineCurvature: 0.26,
    neckLengthRatio: 0.52,
    headSizeRatio: 0.44,
    limbPairCount: 2,
    hasWings: false,
    wingStyle: 'none',
    hasFins: false,
    hasTail: true,
    tailType: 'prehensile',
    hasAntennae: false,
    hasMandibles: false,
    hasBeak: false,
    hasBifidTongue: true,
    hasTentacles: false,
    hasDorsalCrest: true,
    roughness: 0.36,
    metalness: 0.08,
    clearcoat: 0.35,
    clearcoatRoughness: 0.28,
    sheen: 0.0,
    sheenRoughness: 0.6,
    anisotropy: 0.85,
    iridescence: 0.18,
    sssStrength: 0.18,
    bioluminescence: 0.08,
  },
  pez: {
    id: 'pez',
    name: 'Pez',
    scientificTag: 'Ichthys Pelagica',
    description: 'Morfologías marinas desde rayas deprimidas y peces globo hasta anguilas y abisales.',
    defaultSymmetry: 'bilateral',
    limbStance: 'hydrostatic',
    eyeStyle: 'vertebrate',
    texturePattern: 'fish_iridescent',
    palette: {
      primaryHex: '#21678c',
      secondaryHex: '#0f2b44',
      bellyHex: '#cbd9e6',
      accentHex: '#38bdf8',
      emissiveHex: '#22d3ee',
      irisHex: '#38bdf8',
      sssTintHex: '#67e8f9',
    },
    torsoAspect: [0.68, 0.96, 1.65],
    spineCurvature: 0.12,
    neckLengthRatio: 0.15,
    headSizeRatio: 0.52,
    limbPairCount: 1,
    hasWings: false,
    wingStyle: 'none',
    hasFins: true,
    hasTail: true,
    tailType: 'caudal_fin',
    hasAntennae: false,
    hasMandibles: false,
    hasBeak: false,
    hasBifidTongue: false,
    hasTentacles: false,
    hasDorsalCrest: true,
    roughness: 0.22,
    metalness: 0.24,
    clearcoat: 0.88,
    clearcoatRoughness: 0.12,
    sheen: 0.0,
    sheenRoughness: 0.5,
    anisotropy: 0.65,
    iridescence: 0.78,
    sssStrength: 0.42,
    bioluminescence: 0.45,
  },
  ave: {
    id: 'ave',
    name: 'Ave',
    scientificTag: 'Avialae Aetheris',
    description: 'Plumaje instanciado y topologías desde colibríes hasta pingüinos nadadores y ratites.',
    defaultSymmetry: 'bilateral',
    limbStance: 'digitigrade',
    eyeStyle: 'vertebrate',
    texturePattern: 'avian_plumage',
    palette: {
      primaryHex: '#374761',
      secondaryHex: '#1b2434',
      bellyHex: '#d7dce3',
      accentHex: '#d97706',
      emissiveHex: '#60a5fa',
      irisHex: '#fb923c',
      sssTintHex: '#fda4af',
    },
    torsoAspect: [0.78, 1.04, 1.28],
    spineCurvature: 0.42,
    neckLengthRatio: 0.56,
    headSizeRatio: 0.42,
    limbPairCount: 1,
    hasWings: true,
    wingStyle: 'feathered',
    hasFins: false,
    hasTail: true,
    tailType: 'caudal_fin',
    hasAntennae: false,
    hasMandibles: false,
    hasBeak: true,
    hasBifidTongue: false,
    hasTentacles: false,
    hasDorsalCrest: false,
    roughness: 0.68,
    metalness: 0.04,
    clearcoat: 0.05,
    clearcoatRoughness: 0.4,
    sheen: 0.88,
    sheenRoughness: 0.35,
    anisotropy: 0.55,
    iridescence: 0.25,
    sssStrength: 0.18,
    bioluminescence: 0.0,
  },
  insecto: {
    id: 'insecto',
    name: 'Insecto',
    scientificTag: 'Arthropoda Chitinosa',
    description: 'Exoesqueleto quitinoso en 12 planes corporales: mantis, escarabajos, escorpiones y miriápodos.',
    defaultSymmetry: 'bilateral',
    limbStance: 'insectoid',
    eyeStyle: 'compound',
    texturePattern: 'insect_chitin',
    palette: {
      primaryHex: '#4b2d3c',
      secondaryHex: '#20131a',
      bellyHex: '#84594a',
      accentHex: '#d97706',
      emissiveHex: '#a3e635',
      irisHex: '#bef264',
      sssTintHex: '#f59e0b',
    },
    torsoAspect: [0.76, 0.72, 1.56],
    spineCurvature: 0.2,
    neckLengthRatio: 0.22,
    headSizeRatio: 0.44,
    limbPairCount: 3,
    hasWings: true,
    wingStyle: 'membranous',
    hasFins: false,
    hasTail: true,
    tailType: 'abdomen',
    hasAntennae: true,
    hasMandibles: true,
    hasBeak: false,
    hasBifidTongue: false,
    hasTentacles: false,
    hasDorsalCrest: false,
    roughness: 0.28,
    metalness: 0.38,
    clearcoat: 0.82,
    clearcoatRoughness: 0.14,
    sheen: 0.0,
    sheenRoughness: 0.5,
    anisotropy: 0.42,
    iridescence: 0.68,
    sssStrength: 0.15,
    bioluminescence: 0.35,
  },
  molusco: {
    id: 'molusco',
    name: 'Molusco',
    scientificTag: 'Cephalopoda Abyssalis',
    description: 'Desde pulpos octopódicos y nautilus espiralados hasta bivalvos, decápodos y estrellas pentarradiales.',
    defaultSymmetry: 'radial8',
    limbStance: 'hydrostatic',
    eyeStyle: 'bulbous',
    texturePattern: 'mollusk_slime',
    palette: {
      primaryHex: '#7d3b5f',
      secondaryHex: '#351629',
      bellyHex: '#d9a4bd',
      accentHex: '#2dd4bf',
      emissiveHex: '#2dd4bf',
      irisHex: '#f43f5e',
      sssTintHex: '#f472b6',
    },
    torsoAspect: [1.05, 1.24, 1.05],
    spineCurvature: 0.08,
    neckLengthRatio: 0.18,
    headSizeRatio: 0.64,
    limbPairCount: 0,
    hasWings: false,
    wingStyle: 'none',
    hasFins: true,
    hasTail: false,
    tailType: 'none',
    hasAntennae: false,
    hasMandibles: false,
    hasBeak: true,
    hasBifidTongue: false,
    hasTentacles: true,
    hasDorsalCrest: false,
    roughness: 0.16,
    metalness: 0.02,
    clearcoat: 1.0,
    clearcoatRoughness: 0.05,
    sheen: 0.0,
    sheenRoughness: 0.5,
    anisotropy: 0.0,
    iridescence: 0.32,
    sssStrength: 0.78,
    bioluminescence: 0.62,
  },
  alien: {
    id: 'alien',
    name: 'Alien Original',
    scientificTag: 'Xenos Hyperbolica',
    description: 'Topologías no-euclidianas: acechadores biomecánicos, trípodes, serafines cuatrialados e hidras.',
    defaultSymmetry: 'bilateral',
    limbStance: 'digitigrade',
    eyeStyle: 'xenomorphic',
    texturePattern: 'alien_non_euclidean',
    palette: {
      primaryHex: '#2b3a67',
      secondaryHex: '#11162b',
      bellyHex: '#7e93c9',
      accentHex: '#14b8a6',
      emissiveHex: '#2dd4bf',
      irisHex: '#38bdf8',
      sssTintHex: '#818cf8',
    },
    torsoAspect: [0.95, 1.12, 1.44],
    spineCurvature: 0.38,
    neckLengthRatio: 0.45,
    headSizeRatio: 0.5,
    limbPairCount: 2,
    hasWings: true,
    wingStyle: 'membranous',
    hasFins: false,
    hasTail: true,
    tailType: 'prehensile',
    hasAntennae: true,
    hasMandibles: true,
    hasBeak: false,
    hasBifidTongue: false,
    hasTentacles: true,
    hasDorsalCrest: true,
    roughness: 0.24,
    metalness: 0.32,
    clearcoat: 0.78,
    clearcoatRoughness: 0.12,
    sheen: 0.2,
    sheenRoughness: 0.4,
    anisotropy: 0.55,
    iridescence: 1.0,
    sssStrength: 0.58,
    bioluminescence: 0.85,
  },
};

export const ARCHETYPE_LIST: ArchetypeProfile[] = Object.values(ARCHETYPE_PROFILES);

export interface ResolvedGenes {
  profile: ArchetypeProfile;
  subMorphotype: SubMorphotype;
  baseSubMorphotype: SubMorphotype;
  hybridPartner?: SubMorphotype;
  effectiveSymmetry: SymmetryMode;
  rarityLabel: string;
  hueShift: number;
  saturationScale: number;
  torsoWidth: number;
  torsoHeight: number;
  torsoLength: number;
  spineArch: number;
  headScale: number;
  neckLength: number;
  limbLength: number;
  limbRadius: number;
  tailLength: number;
  tentacleCount: number;
  tentacleLengthScale: number;
  eyeCount: number;
  wingSpan: number;
  crestHeight: number;
  asymmetryJitter: number;
}

/**
 * Generates deterministic gene variations from seed + base archetype + SubMorphotype
 * (including smooth morphological hybridization via morphVariation).
 */
export function resolveCreatureGenes(genome: CreatureGenome): ResolvedGenes {
  const baseProfile = ARCHETYPE_PROFILES[genome.archetype];
  const rng = new SeededPRNG(genome.seed);
  const texRng = new SeededPRNG(genome.textureSeed ?? genome.seed);
  const rarity = Math.max(0, Math.min(1, genome.rarity ?? 0.15));
  const pe = genome.partEdits;

  const baseSub = selectSubMorphotype(genome.seed, genome.archetype, genome.subMorphotypeId);
  const candidates = getSubMorphotypesForArchetype(genome.archetype).filter((s) => s.id !== baseSub.id);

  let hybridPartner: SubMorphotype | undefined;
  let subMorphotype = baseSub;
  if (genome.morphVariation > 0.02 && candidates.length > 0) {
    const partnerRng = new SeededPRNG(genome.seed ^ 0x9e3779b9);
    hybridPartner = partnerRng.pick(candidates);
    subMorphotype = lerpSubMorphotypes(baseSub, hybridPartner, genome.morphVariation * 0.85);
  }

  // Clone subMorphotype so partEdits and rarity anomalies never mutate global definitions
  const resolvedSub: SubMorphotype = {
    ...subMorphotype,
    limbConfiguration: {
      forelimbs: { ...subMorphotype.limbConfiguration.forelimbs },
      hindlimbs: { ...subMorphotype.limbConfiguration.hindlimbs },
      extraPairs: subMorphotype.limbConfiguration.extraPairs,
    },
    specialFeatures: [...subMorphotype.specialFeatures],
  };

  // Apply explicit part-editor overrides
  if (!pe.limbsEnabled) {
    resolvedSub.limbConfiguration.forelimbs.count = 0;
    resolvedSub.limbConfiguration.forelimbs.type = 'none';
    resolvedSub.limbConfiguration.hindlimbs.count = 0;
    resolvedSub.limbConfiguration.hindlimbs.type = 'none';
  }
  if (pe.wingOverride !== 'auto') {
    resolvedSub.wingPresence = pe.wingOverride;
  } else if (rarity > 0.78 && resolvedSub.wingPresence === 'none' && rng.chance((rarity - 0.7) * 1.8)) {
    resolvedSub.wingPresence = 'membranous';
    if (!resolvedSub.specialFeatures.includes('anomalous_wings')) {
      resolvedSub.specialFeatures.push('anomalous_wings');
    }
  }

  if (pe.tailOverride !== 'auto') {
    resolvedSub.tailType = pe.tailOverride;
    resolvedSub.tailPresence = pe.tailOverride !== 'none';
  }
  if (pe.shellOverride !== 'auto') {
    resolvedSub.shellType = pe.shellOverride;
  }
  if (pe.crestOverride === 'on') {
    resolvedSub.hasDorsalCrest = true;
  } else if (pe.crestOverride === 'off') {
    resolvedSub.hasDorsalCrest = false;
  } else if (rarity > 0.56) {
    resolvedSub.hasDorsalCrest = true;
  }

  if (pe.eyeCountOverride !== 'auto') {
    resolvedSub.eyeCount = pe.eyeCountOverride;
  } else if (rarity > 0.62 && resolvedSub.eyeCount > 0) {
    const bonusPairs = rarity > 0.85 ? 2 : 1;
    resolvedSub.eyeCount = Math.min(8, resolvedSub.eyeCount + bonusPairs * 2);
  }

  if (pe.tentacleCountOverride !== 'auto') {
    resolvedSub.tentacleCount = pe.tentacleCountOverride;
    resolvedSub.hasTentacles = pe.tentacleCountOverride > 0;
  } else if (rarity > 0.72) {
    const extraTent = rarity > 0.88 ? 4 : 2;
    resolvedSub.hasTentacles = true;
    resolvedSub.tentacleCount = Math.max(resolvedSub.tentacleCount, extraTent);
  }

  // Respect sub-morphotype symmetry in auto mode unless user explicitly picks another symmetry
  const effectiveSymmetry: SymmetryMode =
    genome.subMorphotypeId === 'auto' && genome.symmetry === baseProfile.defaultSymmetry
      ? resolvedSub.symmetry
      : genome.symmetry;

  // Build modulated ArchetypeProfile reflecting the active SubMorphotype + Rarity shader boosts
  const profile: ArchetypeProfile = {
    ...baseProfile,
    limbStance: resolvedSub.limbStanceOverride ?? baseProfile.limbStance,
    eyeStyle: resolvedSub.eyeStyleOverride ?? baseProfile.eyeStyle,
    torsoAspect: resolvedSub.torsoAspect,
    spineCurvature: resolvedSub.spineCurvature,
    neckLengthRatio: resolvedSub.neckRatio,
    headSizeRatio: resolvedSub.headScaleRatio,
    hasWings: resolvedSub.wingPresence !== 'none',
    wingStyle:
      resolvedSub.wingPresence === 'feathered'
        ? 'feathered'
        : resolvedSub.wingPresence === 'none'
          ? 'none'
          : 'membranous',
    hasFins: resolvedSub.hasFins,
    hasTail: resolvedSub.tailPresence && resolvedSub.tailType !== 'none',
    tailType:
      resolvedSub.tailType === 'caudal_fin' || resolvedSub.tailType === 'fluke_horizontal'
        ? 'caudal_fin'
        : resolvedSub.tailType === 'abdomen' || resolvedSub.tailType === 'stinger'
          ? 'abdomen'
          : resolvedSub.tailType === 'none'
            ? 'none'
            : 'prehensile',
    hasAntennae: resolvedSub.hasAntennae,
    hasMandibles: resolvedSub.hasMandibles,
    hasBeak: resolvedSub.hasBeak,
    hasBifidTongue: resolvedSub.hasBifidTongue,
    hasTentacles: resolvedSub.hasTentacles,
    hasDorsalCrest: resolvedSub.hasDorsalCrest,
    iridescence: Math.min(1.0, baseProfile.iridescence + rarity * 0.48),
    bioluminescence: Math.min(1.0, baseProfile.bioluminescence + rarity * 0.58),
    sssStrength: Math.min(1.0, baseProfile.sssStrength + rarity * 0.25),
  };

  // Derive color shift deterministically from textureSeed (preserved when colors are locked)
  const hueRange = 0.08 + rarity * 0.24;
  const hueShift = texRng.range(-hueRange, hueRange);
  const saturationScale = texRng.range(0.85, 1.18 + rarity * 0.18);

  const [bw, bh, bl] = resolvedSub.torsoAspect;
  const morphJitter = 0.06 + genome.morphVariation * 0.12 + rarity * 0.08;
  const torsoWidth = bw * genome.thickness * pe.torsoWidthScale * rng.range(1 - morphJitter, 1 + morphJitter);
  const torsoHeight = bh * genome.thickness * pe.torsoHeightScale * rng.range(1 - morphJitter, 1 + morphJitter);
  const torsoLength = bl * genome.length * pe.torsoLengthScale * rng.range(1 - morphJitter * 0.8, 1 + morphJitter * 0.8);

  const spineArch = resolvedSub.spineCurvature * pe.spineArchScale * rng.range(0.82, 1.22);
  const headScale =
    resolvedSub.headScaleRatio * pe.headScale * rng.range(0.9, 1.14) * (0.85 + genome.thickness * 0.15);
  const neckLength = resolvedSub.neckRatio * pe.neckScale * genome.length * rng.range(0.86, 1.18);

  const limbLength =
    (0.75 + genome.limbComplexity * 0.55) *
    (0.68 + genome.length * 0.32) *
    pe.limbLengthScale *
    rng.range(0.92, 1.12);
  const limbRadius = 0.085 * genome.thickness * pe.limbThicknessScale * rng.range(0.88, 1.14);
  const tailLength =
    resolvedSub.tailPresence && resolvedSub.tailType !== 'none'
      ? (0.75 + genome.length * 0.55) *
        resolvedSub.tailLengthScale *
        pe.tailLengthScale *
        rng.range(0.88, 1.16)
      : 0;

  const radialAxes =
    effectiveSymmetry === 'radial8'
      ? 8
      : effectiveSymmetry === 'radial6'
        ? 6
        : effectiveSymmetry === 'radial5'
          ? 5
          : effectiveSymmetry === 'radial4'
            ? 4
            : 2;

  const tentacleCount = resolvedSub.hasTentacles
    ? pe.tentacleCountOverride !== 'auto'
      ? pe.tentacleCountOverride
      : Math.max(
          resolvedSub.tentacleCount || 4,
          effectiveSymmetry.startsWith('radial') ? radialAxes : resolvedSub.tentacleCount
        )
    : 0;

  const eyeCount = resolvedSub.eyeCount;

  const wingSpan =
    resolvedSub.wingPresence !== 'none'
      ? (0.9 + genome.limbComplexity * 0.65) *
        resolvedSub.wingSpanScale *
        pe.wingSpanScale *
        rng.range(0.9, 1.12)
      : 0;

  const crestHeight = resolvedSub.hasDorsalCrest
    ? (0.09 + genome.detailDensity * 0.14 + rarity * 0.08) * rng.range(0.88, 1.22)
    : 0;

  const asymmetryJitter =
    effectiveSymmetry === 'asymmetric'
      ? Math.max(0.32, genome.asymmetry)
      : genome.asymmetry + (rarity > 0.7 ? (rarity - 0.7) * 0.35 : 0);

  return {
    profile,
    subMorphotype: resolvedSub,
    baseSubMorphotype: baseSub,
    hybridPartner,
    effectiveSymmetry,
    rarityLabel: getRarityClassification(rarity).label,
    hueShift,
    saturationScale,
    torsoWidth,
    torsoHeight,
    torsoLength,
    spineArch,
    headScale,
    neckLength,
    limbLength,
    limbRadius,
    tailLength,
    tentacleCount,
    tentacleLengthScale: pe.tentacleLengthScale,
    eyeCount,
    wingSpan,
    crestHeight,
    asymmetryJitter,
  };
}
