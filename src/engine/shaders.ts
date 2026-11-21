import * as THREE from 'three';
import { ProceduralTextureSet } from './textures';
import { ArchetypeProfile } from './types';

export interface CreatureMaterialSuite {
  skinMaterial: THREE.MeshPhysicalMaterial;
  carapaceMaterial: THREE.MeshPhysicalMaterial;
  membraneMaterial: THREE.MeshPhysicalMaterial;
  corneaMaterial: THREE.MeshPhysicalMaterial;
  irisMaterial: THREE.MeshPhysicalMaterial;
  biolumMaterial: THREE.MeshPhysicalMaterial;
  detailMaterial: THREE.MeshPhysicalMaterial;
  updateTime: (time: number) => void;
  dispose: () => void;
}

/**
 * Injects custom GLSL shaders into MeshPhysicalMaterial via onBeforeCompile:
 * 1. Procedural fragment-shader normal perturbation (screen-space derivatives on 3D bio-heightfield)
 * 2. Parallax / relief depth shading for dermal scales, chitin, and pores
 * 3. Simplified Subsurface Scattering (SSS) wrap + backlit translucency
 * 4. View-angle thin-film spectral iridescence + bioluminescent vein pulse
 * Preserves full Three.js PBR lighting, IBL reflections, and GLTFExporter compatibility.
 */
function applyBioShaderExtension(
  material: THREE.MeshPhysicalMaterial,
  options: {
    sssColor: THREE.Color;
    sssStrength: number;
    iridescenceStrength: number;
    bioluminescence: number;
    emissiveColor: THREE.Color;
    microBumpScale: number;
    parallaxDepth: number;
    patternFreq: number;
    isMembrane?: boolean;
  },
  timeUniform: { value: number }
): void {
  material.customProgramCacheKey = () =>
    `bio_${options.sssStrength.toFixed(2)}_${options.iridescenceStrength.toFixed(2)}_${options.patternFreq.toFixed(1)}_${options.isMembrane ? 1 : 0}`;

  material.onBeforeCompile = (shader) => {
    shader.uniforms.uBioTime = timeUniform;
    shader.uniforms.uSssColor = { value: options.sssColor };
    shader.uniforms.uSssStrength = { value: options.sssStrength };
    shader.uniforms.uIridescence = { value: options.iridescenceStrength };
    shader.uniforms.uBiolum = { value: options.bioluminescence };
    shader.uniforms.uBioGlowColor = { value: options.emissiveColor };
    shader.uniforms.uMicroBump = { value: options.microBumpScale };
    shader.uniforms.uParallaxDepth = { value: options.parallaxDepth };
    shader.uniforms.uPatternFreq = { value: options.patternFreq };

    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
        varying vec3 vBioLocalPos;`
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        vBioLocalPos = position;`
      );

    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        uniform float uBioTime;
        uniform vec3 uSssColor;
        uniform float uSssStrength;
        uniform float uIridescence;
        uniform float uBiolum;
        uniform vec3 uBioGlowColor;
        uniform float uMicroBump;
        uniform float uParallaxDepth;
        uniform float uPatternFreq;
        varying vec3 vBioLocalPos;

        vec3 bioSpectralPalette(float t) {
          vec3 a = vec3(0.5, 0.5, 0.5);
          vec3 b = vec3(0.5, 0.5, 0.5);
          vec3 c = vec3(1.0, 1.0, 1.0);
          vec3 d = vec3(0.05, 0.33, 0.67);
          return a + b * cos(6.28318 * (c * t + d));
        }

        // Procedural 3D cellular / dermal micro-heightfield evaluated in fragment shader
        float bioProceduralHeight(vec3 p, float freq) {
          vec3 q = p * freq;
          float cellA = sin(q.x) * sin(q.y) + sin(q.y) * sin(q.z) + sin(q.z) * sin(q.x);
          float cellB = cos(q.x * 2.1 + 1.3) * cos(q.z * 2.1 - 0.7);
          return clamp(0.5 + 0.22 * cellA + 0.14 * cellB, 0.0, 1.0);
        }

        // Mikkelsen unparametrized surface-gradient bump perturbation (fragment-shader procedural normal)
        vec3 bioPerturbNormal(vec3 surfPos, vec3 surfNorm, float heightVal, float bumpScale) {
          vec3 dPosX = dFdx(surfPos);
          vec3 dPosY = dFdy(surfPos);
          float dHdx = dFdx(heightVal);
          float dHdy = dFdy(heightVal);
          vec3 r1 = cross(dPosY, surfNorm);
          vec3 r2 = cross(surfNorm, dPosX);
          float det = dot(dPosX, r1);
          if (abs(det) < 1e-6) return surfNorm;
          vec3 surfGrad = sign(det) * (dHdx * r1 + dHdy * r2);
          return normalize(abs(det) * surfNorm - bumpScale * surfGrad);
        }`
      )
      .replace(
        '#include <normal_fragment_maps>',
        `#include <normal_fragment_maps>
        // Procedural fragment-shader normal map & parallax relief depth
        float bioBaseH = bioProceduralHeight(vBioLocalPos, uPatternFreq);
        if (uMicroBump > 0.001) {
          normal = bioPerturbNormal(-vViewPosition, normal, bioBaseH, uMicroBump);
        }`
      )
      .replace(
        '#include <dithering_fragment>',
        `
        vec3 bioViewDir = normalize(vViewPosition);
        float bioNdotV = clamp(abs(dot(normalize(normal), bioViewDir)), 0.0, 1.0);
        float bioFresnel = pow(1.0 - bioNdotV, 2.6);

        // Two-step Parallax Relief Occlusion shading for skin/scale depth
        if (uParallaxDepth > 0.001) {
          float h0 = bioProceduralHeight(vBioLocalPos, uPatternFreq);
          vec3 pStep = vBioLocalPos - bioViewDir * (1.0 - h0) * uParallaxDepth;
          float h1 = bioProceduralHeight(pStep, uPatternFreq);
          float reliefMask = mix(0.8, 1.12, clamp(h1, 0.0, 1.0));
          gl_FragColor.rgb *= mix(1.0, reliefMask, 0.55 + 0.45 * bioNdotV);
        }

        // Simplified Subsurface Scattering (SSS) wrap + backlit translucency
        vec3 sssContrib = uSssColor * uSssStrength * (0.28 + 0.72 * bioFresnel);
        gl_FragColor.rgb += sssContrib * diffuseColor.rgb * 0.65;

        // Custom GLSL Thin-Film Iridescence based on view angle + organic position
        if (uIridescence > 0.02) {
          float phase = bioNdotV * 2.2 + dot(vBioLocalPos, vec3(0.7, 1.1, 0.5)) * 0.45;
          vec3 irid = bioSpectralPalette(phase);
          gl_FragColor.rgb = mix(gl_FragColor.rgb, gl_FragColor.rgb + irid * 0.42, bioFresnel * uIridescence);
        }

        // Subtle organic bioluminescence vein shimmer
        if (uBiolum > 0.05) {
          float pulse = 0.65 + 0.35 * sin(uBioTime * 1.8 + vBioLocalPos.z * 4.0);
          float veinMask = smoothstep(0.65, 0.98, sin(vBioLocalPos.x * 11.0 + vBioLocalPos.y * 9.0) * 0.5 + 0.5);
          gl_FragColor.rgb += uBioGlowColor * veinMask * uBiolum * pulse * 0.38;
        }

        #include <dithering_fragment>
        `
      );
  };
}

/**
 * Constructs the complete MeshPhysicalMaterial PBR suite for a creature archetype.
 */
export function createCreatureMaterialSuite(
  profile: ArchetypeProfile,
  textures: ProceduralTextureSet,
  hueShift: number,
  isSoftwareGl: boolean
): CreatureMaterialSuite {
  const timeUniform = { value: 0 };

  const primaryColor = new THREE.Color(profile.palette.primaryHex).offsetHSL(hueShift, 0, 0);
  const accentColor = new THREE.Color(profile.palette.accentHex).offsetHSL(hueShift, 0, 0);
  const emissiveColor = new THREE.Color(profile.palette.emissiveHex).offsetHSL(hueShift * 0.5, 0, 0);
  const sssColor = new THREE.Color(profile.palette.sssTintHex).offsetHSL(hueShift * 0.4, 0, 0);

  const patternFreq =
    profile.id === 'reptil' || profile.id === 'pez'
      ? 26.0
      : profile.id === 'insecto'
        ? 18.0
        : profile.id === 'alien'
          ? 14.0
          : 20.0;

  const microBumpScale =
    profile.id === 'molusco' || profile.id === 'anfibio'
      ? 0.014
      : profile.id === 'reptil' || profile.id === 'insecto'
        ? 0.036
        : 0.024;

  // 1. Primary Organic Skin / Exoskeleton Material
  const skinMaterial = new THREE.MeshPhysicalMaterial({
    color: 0xffffff,
    map: textures.albedoMap,
    normalMap: textures.normalMap,
    normalScale: new THREE.Vector2(1.15, 1.15),
    roughnessMap: textures.roughnessMap,
    roughness: 1.0, // Driven by roughnessMap
    metalness: profile.metalness,
    aoMap: textures.aoMap,
    aoMapIntensity: 0.75,
    emissive: profile.bioluminescence > 0.02 ? emissiveColor : new THREE.Color(0x000000),
    emissiveMap: textures.emissiveMap,
    emissiveIntensity: profile.bioluminescence > 0.02 ? 0.55 + profile.bioluminescence * 0.85 : 0.0,
    clearcoat: profile.clearcoat,
    clearcoatRoughness: profile.clearcoatRoughness,
    sheen: profile.sheen,
    sheenRoughness: profile.sheenRoughness,
    sheenColor: accentColor.clone().lerp(new THREE.Color(0xffffff), 0.35),
    anisotropy: profile.anisotropy,
    iridescence: profile.iridescence * 0.65,
    iridescenceIOR: 1.38,
    iridescenceThicknessRange: [140, 480],
    envMapIntensity: 1.1,
  });
  applyBioShaderExtension(
    skinMaterial,
    {
      sssColor,
      sssStrength: profile.sssStrength,
      iridescenceStrength: profile.iridescence,
      bioluminescence: profile.bioluminescence,
      emissiveColor,
      microBumpScale,
      parallaxDepth: 0.032,
      patternFreq,
    },
    timeUniform
  );

  // 2. Carapace / Claws / Horns / Beak Material (higher contrast roughness & lower saturation)
  const carapaceMaterial = new THREE.MeshPhysicalMaterial({
    color: primaryColor.clone().multiplyScalar(0.55).lerp(accentColor, 0.35),
    normalMap: textures.normalMap,
    normalScale: new THREE.Vector2(0.55, 0.55),
    roughness: Math.max(0.14, profile.roughness * 0.68),
    metalness: Math.min(0.65, profile.metalness + 0.25),
    clearcoat: Math.max(0.4, profile.clearcoat),
    clearcoatRoughness: 0.16,
    anisotropy: 0.5,
    envMapIntensity: 1.2,
  });

  // 3. Translucent Membrane Material (Wings / Fins) with strong SSS
  const membraneMaterial = new THREE.MeshPhysicalMaterial({
    color: accentColor.clone().lerp(primaryColor, 0.5),
    normalMap: textures.normalMap,
    normalScale: new THREE.Vector2(0.4, 0.4),
    roughness: 0.28,
    metalness: 0.04,
    clearcoat: 0.45,
    clearcoatRoughness: 0.18,
    sheen: profile.wingStyle === 'feathered' ? 0.7 : 0.0,
    side: THREE.DoubleSide,
    transparent: true,
    opacity: profile.wingStyle === 'feathered' ? 0.98 : 0.78,
    transmission: !isSoftwareGl && profile.wingStyle !== 'feathered' ? 0.35 : 0.0,
    thickness: 0.35,
    ior: 1.36,
    attenuationColor: sssColor,
  });
  applyBioShaderExtension(
    membraneMaterial,
    {
      sssColor,
      sssStrength: Math.min(1.0, profile.sssStrength + 0.35),
      iridescenceStrength: profile.iridescence * 0.75,
      bioluminescence: profile.bioluminescence * 0.5,
      emissiveColor,
      microBumpScale: 0.012,
      parallaxDepth: 0.015,
      patternFreq: 16.0,
      isMembrane: true,
    },
    timeUniform
  );

  // 4. Glossy Eye Cornea Dome (Optical glass/lens fallback on software GL)
  const corneaMaterial = new THREE.MeshPhysicalMaterial({
    color: 0xffffff,
    roughness: 0.03,
    metalness: 0.0,
    clearcoat: 1.0,
    clearcoatRoughness: 0.02,
    ior: 1.48,
    transmission: isSoftwareGl ? 0.0 : 0.92,
    transparent: true,
    opacity: isSoftwareGl ? 0.28 : 1.0,
    thickness: 0.2,
    depthWrite: false,
    envMapIntensity: 1.5,
  });

  // 5. Eye Iris + Sclera Material
  const irisMaterial = new THREE.MeshPhysicalMaterial({
    color: 0xffffff,
    map: textures.irisMap,
    roughness: 0.28,
    metalness: 0.05,
    clearcoat: 0.4,
    emissive: emissiveColor.clone().multiplyScalar(profile.bioluminescence * 0.25),
    emissiveIntensity: 0.65,
  });

  // 6. Bioluminescent Sensory / Accent Nodes
  const biolumMaterial = new THREE.MeshPhysicalMaterial({
    color: accentColor,
    roughness: 0.18,
    metalness: 0.05,
    clearcoat: 0.9,
    emissive: emissiveColor,
    emissiveIntensity: Math.max(0.35, profile.bioluminescence * 1.45),
    iridescence: profile.iridescence,
  });

  // 7. Instanced Surface Detail Material (Scales / Fur Tufts / Feathers / Osteoderms)
  const detailMaterial = new THREE.MeshPhysicalMaterial({
    color: primaryColor.clone().lerp(accentColor, 0.25),
    roughness: Math.min(0.88, profile.roughness + 0.08),
    metalness: profile.metalness,
    clearcoat: profile.clearcoat * 0.75,
    sheen: profile.sheen,
    sheenColor: accentColor,
    anisotropy: profile.anisotropy,
    side: THREE.DoubleSide,
  });

  // Assign semantic names without spaces for glTF 2.0 and Wavefront OBJ/MTL exports
  skinMaterial.name = 'bio_skin';
  carapaceMaterial.name = 'bio_carapace';
  membraneMaterial.name = 'bio_membrane';
  corneaMaterial.name = 'bio_cornea';
  irisMaterial.name = 'bio_iris';
  biolumMaterial.name = 'bio_bioluminescent';
  detailMaterial.name = 'bio_surface_detail';

  const allMaterials = [
    skinMaterial,
    carapaceMaterial,
    membraneMaterial,
    corneaMaterial,
    irisMaterial,
    biolumMaterial,
    detailMaterial,
  ];

  return {
    skinMaterial,
    carapaceMaterial,
    membraneMaterial,
    corneaMaterial,
    irisMaterial,
    biolumMaterial,
    detailMaterial,
    updateTime: (time: number) => {
      timeUniform.value = time;
    },
    dispose: () => {
      allMaterials.forEach((m) => m.dispose());
    },
  };
}
