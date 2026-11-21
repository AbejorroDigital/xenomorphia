import * as THREE from 'three';
import { ENGINE_CONSTANTS } from './constants';
import { ProceduralNoise, SeededPRNG } from './prng';
import { ArchetypeProfile, PbrTexturePreviews, TexturePatternId } from './types';

export interface ProceduralTextureSet {
  albedoMap: THREE.CanvasTexture;
  normalMap: THREE.CanvasTexture;
  roughnessMap: THREE.CanvasTexture;
  aoMap: THREE.CanvasTexture;
  emissiveMap: THREE.CanvasTexture;
  irisMap: THREE.CanvasTexture;
  previews: PbrTexturePreviews;
  dispose: () => void;
}

function shiftHexColor(hex: string, hueDelta: number, satScale: number, lightScale = 1): THREE.Color {
  const c = new THREE.Color(hex);
  const hsl = { h: 0, s: 0, l: 0 };
  c.getHSL(hsl);
  hsl.h = (hsl.h + hueDelta + 1.0) % 1.0;
  hsl.s = Math.max(0, Math.min(1, hsl.s * satScale));
  hsl.l = Math.max(0.03, Math.min(0.95, hsl.l * lightScale));
  c.setHSL(hsl.h, hsl.s, hsl.l);
  return c;
}

function canvasToPreviewUrl(source: HTMLCanvasElement, previewSize: number): string {
  const thumb = document.createElement('canvas');
  thumb.width = previewSize;
  thumb.height = previewSize;
  const ctx = thumb.getContext('2d');
  if (!ctx) return '';
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'medium';
  ctx.drawImage(source, 0, 0, previewSize, previewSize);
  return thumb.toDataURL('image/png');
}

/**
 * Generates coherent procedural PBR texture maps (Albedo, Tangent-Space Normal, Roughness, AO, Emissive, Iris)
 * using Canvas 2D + deterministic Perlin FBM, domain warping, Worley cellular noise, and Sobel normal derivation.
 */
export function generateCreatureTextures(
  profile: ArchetypeProfile,
  seed: number,
  hueShift: number,
  satScale: number,
  maxAnisotropy: number,
  textureResolution: number = ENGINE_CONSTANTS.TEXTURE_RESOLUTION
): ProceduralTextureSet {
  const size = textureResolution;
  const noise = new ProceduralNoise(seed ^ 0x4a7c15);
  const rng = new SeededPRNG(seed ^ 0x9b3e21);

  const cPrimary = shiftHexColor(profile.palette.primaryHex, hueShift, satScale, 1.0);
  const cSecondary = shiftHexColor(profile.palette.secondaryHex, hueShift, satScale, 1.0);
  const cBelly = shiftHexColor(profile.palette.bellyHex, hueShift * 0.5, satScale * 0.9, 1.0);
  const cAccent = shiftHexColor(profile.palette.accentHex, hueShift, satScale, 1.05);
  const cEmissive = shiftHexColor(profile.palette.emissiveHex, hueShift * 0.5, Math.min(1.15, satScale), 1.05);

  const albedoCanvas = document.createElement('canvas');
  albedoCanvas.width = size;
  albedoCanvas.height = size;
  const albedoCtx = albedoCanvas.getContext('2d')!;
  const albedoImg = albedoCtx.createImageData(size, size);

  const roughCanvas = document.createElement('canvas');
  roughCanvas.width = size;
  roughCanvas.height = size;
  const roughCtx = roughCanvas.getContext('2d')!;
  const roughImg = roughCtx.createImageData(size, size);

  const aoCanvas = document.createElement('canvas');
  aoCanvas.width = size;
  aoCanvas.height = size;
  const aoCtx = aoCanvas.getContext('2d')!;
  const aoImg = aoCtx.createImageData(size, size);

  const emissiveCanvas = document.createElement('canvas');
  emissiveCanvas.width = size;
  emissiveCanvas.height = size;
  const emissiveCtx = emissiveCanvas.getContext('2d')!;
  const emissiveImg = emissiveCtx.createImageData(size, size);

  const heightField = new Float32Array(size * size);
  const pattern: TexturePatternId = profile.texturePattern;
  const baseRough = profile.roughness;
  const warpAmp = ENGINE_CONSTANTS.DOMAIN_WARP_AMPLITUDE;
  const biolumStrength = profile.bioluminescence;

  const tmpColor = new THREE.Color();

  for (let y = 0; y < size; y++) {
    const v = y / size;
    // Countershading gradient (darker dorsal, lighter ventral)
    const dorsalMask = Math.pow(Math.sin(v * Math.PI), 0.75);

    for (let x = 0; x < size; x++) {
      const u = x / size;
      const pIdx = y * size + x;
      const rgbaIdx = pIdx * 4;

      // Tileable FBM domain warping so dermal scales, veins, and pores flow organically
      const warpU = (noise.tileableFbm2D(u + 0.17, v + 0.31, 4, 2) - 0.5) * warpAmp;
      const warpV = (noise.tileableFbm2D(u + 0.73, v + 0.59, 4, 2) - 0.5) * warpAmp;
      const wu = (u + warpU + 1.0) % 1.0;
      const wv = (v + warpV + 1.0) % 1.0;

      const fbm = noise.tileableFbm2D(wu, wv, 5, 4);
      const micro = noise.tileableFbm2D(wu, wv, 18, 2);

      let height = 0.5;
      let rough = baseRough;
      let ao = 1.0;
      let glowMask = 0.0;

      if (pattern === 'reptile_scales') {
        const [d1, , edge] = noise.tileableWorley2D(wu, wv + (Math.floor(wu * 14) % 2) * 0.03, 16, 18, 0.45);
        const scaleDome = Math.max(0, 1.0 - d1 * 1.45);
        const rim = Math.min(1, edge * 4.5);
        height = scaleDome * 0.75 + micro * 0.15;
        ao = 0.48 + 0.52 * rim;
        rough = Math.max(0.12, Math.min(0.9, baseRough + (1 - rim) * 0.28 - scaleDome * 0.12));
        tmpColor.copy(cSecondary).lerp(cPrimary, rim * 0.8 + fbm * 0.25);
        if (fbm > 0.62) tmpColor.lerp(cAccent, (fbm - 0.62) * 1.8);
        glowMask = Math.max(0, 1.0 - rim) * Math.max(0, fbm - 0.52) * 1.4;
      } else if (pattern === 'amphibian_pores') {
        const [d1, , edge] = noise.tileableWorley2D(wu, wv, 10, 10, 0.9);
        const spot = Math.max(0, 1.0 - d1 * 2.1);
        const pore = Math.sin(wu * Math.PI * 48 + micro * 4) * Math.sin(wv * Math.PI * 48) * 0.08;
        height = 0.5 + fbm * 0.22 - spot * 0.12 + pore;
        ao = 0.78 + 0.22 * Math.min(1, edge * 3);
        rough = Math.max(0.06, baseRough - spot * 0.1 + micro * 0.08);
        tmpColor.copy(cPrimary).lerp(cSecondary, fbm * 0.65);
        if (spot > 0.45) tmpColor.lerp(cAccent, (spot - 0.45) * 1.5);
        glowMask = Math.pow(Math.max(0, spot - 0.32), 1.3) * 1.45;
      } else if (pattern === 'mammal_fur') {
        const strand = noise.tileableFbm2D((wu * 3.5) % 1.0, (wv * 0.45) % 1.0, 16, 3);
        const tuft = noise.tileableFbm2D((wu * 1.2) % 1.0, (wv * 1.2) % 1.0, 6, 3);
        height = strand * 0.65 + tuft * 0.35;
        ao = 0.55 + 0.45 * strand;
        rough = Math.min(0.95, baseRough + (1 - strand) * 0.18);
        tmpColor.copy(cSecondary).lerp(cPrimary, strand * 0.75 + tuft * 0.25);
        if (tuft > 0.68) tmpColor.lerp(cAccent, (tuft - 0.68) * 1.2);
        glowMask = Math.max(0, tuft - 0.72) * 1.2;
      } else if (pattern === 'fish_iridescent') {
        const [d1, , edge] = noise.tileableWorley2D(wu, wv, 20, 14, 0.3);
        const scaleWave = Math.max(0, 1.0 - d1 * 1.6);
        height = scaleWave * 0.4 + fbm * 0.15;
        ao = 0.72 + 0.28 * Math.min(1, edge * 4.0);
        rough = Math.max(0.08, baseRough - scaleWave * 0.12);
        const stripe = Math.sin(wv * Math.PI * 8 + fbm * 3.5) * 0.5 + 0.5;
        tmpColor.copy(cPrimary).lerp(cSecondary, stripe * 0.55);
        tmpColor.lerp(cAccent, scaleWave * 0.35);
        // Lateral-line photophore nodes along mid-flank band
        const lateralBand = Math.exp(-Math.pow((wv - 0.5) * 7.5, 2));
        const photophore = Math.pow(Math.max(0, Math.sin(wu * Math.PI * 24)), 6);
        glowMask = lateralBand * photophore * 1.1 + Math.max(0, scaleWave - 0.65) * 0.45;
      } else if (pattern === 'avian_plumage') {
        const barb = noise.tileableFbm2D((wu * 2.2) % 1.0, (wv * 0.55) % 1.0, 14, 3);
        const [, , edge] = noise.tileableWorley2D(wu, wv, 10, 16, 0.35);
        const featherMask = Math.min(1, edge * 3.8);
        height = barb * 0.55 + featherMask * 0.35;
        ao = 0.62 + 0.38 * featherMask;
        rough = Math.min(0.9, baseRough + (1 - featherMask) * 0.2);
        tmpColor.copy(cSecondary).lerp(cPrimary, barb * 0.6 + featherMask * 0.4);
        if (fbm > 0.64) tmpColor.lerp(cAccent, (fbm - 0.64) * 1.4);
        glowMask = featherMask * Math.max(0, fbm - 0.62) * 1.5;
      } else if (pattern === 'insect_chitin') {
        const plateBand = Math.abs(Math.sin(wv * Math.PI * 6.0));
        const [, , edge] = noise.tileableWorley2D(wu, wv, 14, 14, 0.65);
        const microPit = micro * 0.18;
        height = plateBand * 0.55 + Math.min(1, edge * 3) * 0.25 + microPit;
        ao = 0.45 + 0.55 * Math.pow(plateBand, 0.45);
        rough = Math.max(0.1, baseRough + (1 - plateBand) * 0.32);
        tmpColor.copy(cSecondary).lerp(cPrimary, plateBand * 0.8 + fbm * 0.2);
        if (plateBand < 0.24) tmpColor.lerp(cAccent, 0.55);
        glowMask = plateBand < 0.18 ? (0.18 - plateBand) * 5.0 * (0.4 + 0.6 * fbm) : 0.0;
      } else if (pattern === 'mollusk_slime') {
        const [d1] = noise.tileableWorley2D(wu, wv, 9, 9, 0.95);
        const chromatophore = Math.max(0, 1.0 - d1 * 2.3);
        const ring = Math.exp(-Math.pow((d1 - 0.22) * 14.0, 2));
        height = 0.5 + fbm * 0.3 + chromatophore * 0.2;
        ao = 0.82 + 0.18 * fbm;
        rough = Math.max(0.04, baseRough + fbm * 0.08 - chromatophore * 0.05);
        tmpColor.copy(cPrimary).lerp(cSecondary, fbm * 0.6);
        tmpColor.lerp(cAccent, Math.pow(chromatophore, 1.4) * 0.9);
        glowMask = Math.min(1.0, ring * 0.9 + Math.pow(chromatophore, 2.0) * 0.55);
      } else {
        // alien_non_euclidean
        const [, , edge] = noise.tileableWorley2D(wu, wv, 12, 12, 0.88);
        const vein = Math.exp(-edge * 9.0);
        const interference = Math.sin((wu * 12 + fbm * 3) * Math.PI) * Math.cos((wv * 12 - fbm * 3) * Math.PI);
        height = 0.5 + interference * 0.22 + vein * 0.35;
        ao = 0.52 + 0.48 * (1.0 - vein * 0.65);
        rough = Math.max(0.08, baseRough + interference * 0.12 - vein * 0.1);
        tmpColor.copy(cSecondary).lerp(cPrimary, 0.5 + interference * 0.4);
        tmpColor.lerp(cAccent, vein * 0.88);
        glowMask = Math.min(1.0, vein * 1.15);
      }

      // Blend ventral countershading smoothly
      tmpColor.lerp(cBelly, (1.0 - dorsalMask) * 0.45);

      heightField[pIdx] = height;
      albedoImg.data[rgbaIdx] = Math.round(Math.min(1, Math.max(0, tmpColor.r)) * 255);
      albedoImg.data[rgbaIdx + 1] = Math.round(Math.min(1, Math.max(0, tmpColor.g)) * 255);
      albedoImg.data[rgbaIdx + 2] = Math.round(Math.min(1, Math.max(0, tmpColor.b)) * 255);
      albedoImg.data[rgbaIdx + 3] = 255;

      const rByte = Math.round(Math.min(1, Math.max(0.04, rough)) * 255);
      roughImg.data[rgbaIdx] = rByte;
      roughImg.data[rgbaIdx + 1] = rByte;
      roughImg.data[rgbaIdx + 2] = rByte;
      roughImg.data[rgbaIdx + 3] = 255;

      const aoByte = Math.round(Math.min(1, Math.max(0.15, ao)) * 255);
      aoImg.data[rgbaIdx] = aoByte;
      aoImg.data[rgbaIdx + 1] = aoByte;
      aoImg.data[rgbaIdx + 2] = aoByte;
      aoImg.data[rgbaIdx + 3] = 255;

      const emissiveAmt = Math.min(1, Math.max(0, glowMask * (0.2 + biolumStrength * 0.95)));
      emissiveImg.data[rgbaIdx] = Math.round(cEmissive.r * emissiveAmt * 255);
      emissiveImg.data[rgbaIdx + 1] = Math.round(cEmissive.g * emissiveAmt * 255);
      emissiveImg.data[rgbaIdx + 2] = Math.round(cEmissive.b * emissiveAmt * 255);
      emissiveImg.data[rgbaIdx + 3] = 255;
    }
  }

  albedoCtx.putImageData(albedoImg, 0, 0);
  roughCtx.putImageData(roughImg, 0, 0);
  aoCtx.putImageData(aoImg, 0, 0);
  emissiveCtx.putImageData(emissiveImg, 0, 0);

  // Tangent-Space Normal Map via Sobel operator on the tileable heightField
  const normalCanvas = document.createElement('canvas');
  normalCanvas.width = size;
  normalCanvas.height = size;
  const normalCtx = normalCanvas.getContext('2d')!;
  const normalImg = normalCtx.createImageData(size, size);
  const strength = pattern === 'mollusk_slime' || pattern === 'amphibian_pores' ? 2.4 : 4.2;

  const sampleH = (sx: number, sy: number) => {
    const wx = ((sx % size) + size) % size;
    const wy = ((sy % size) + size) % size;
    return heightField[wy * size + wx];
  };

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const tl = sampleH(x - 1, y - 1);
      const t = sampleH(x, y - 1);
      const tr = sampleH(x + 1, y - 1);
      const l = sampleH(x - 1, y);
      const r = sampleH(x + 1, y);
      const bl = sampleH(x - 1, y + 1);
      const b = sampleH(x, y + 1);
      const br = sampleH(x + 1, y + 1);

      const dX = (tr + 2 * r + br - (tl + 2 * l + bl)) * strength;
      const dY = (bl + 2 * b + br - (tl + 2 * t + tr)) * strength;
      const dZ = 1.0;
      const invLen = 1 / Math.sqrt(dX * dX + dY * dY + dZ * dZ);

      const idx = (y * size + x) * 4;
      normalImg.data[idx] = Math.round((-dX * invLen * 0.5 + 0.5) * 255);
      normalImg.data[idx + 1] = Math.round((-dY * invLen * 0.5 + 0.5) * 255);
      normalImg.data[idx + 2] = Math.round((dZ * invLen * 0.5 + 0.5) * 255);
      normalImg.data[idx + 3] = 255;
    }
  }
  normalCtx.putImageData(normalImg, 0, 0);

  // Procedural Eye Iris Texture
  const irisSize = ENGINE_CONSTANTS.IRIS_TEXTURE_RESOLUTION;
  const irisCanvas = document.createElement('canvas');
  irisCanvas.width = irisSize;
  irisCanvas.height = irisSize;
  const irisCtx = irisCanvas.getContext('2d')!;
  const cx = irisSize / 2;
  const cy = irisSize / 2;

  irisCtx.fillStyle = '#e2e8f0';
  irisCtx.fillRect(0, 0, irisSize, irisSize);

  const irisColor = shiftHexColor(profile.palette.irisHex, hueShift * 0.5, 1.0, 1.0);
  const irisHex = `#${irisColor.getHexString()}`;
  const grad = irisCtx.createRadialGradient(cx, cy, irisSize * 0.06, cx, cy, irisSize * 0.44);
  grad.addColorStop(0, irisHex);
  grad.addColorStop(0.65, irisHex);
  grad.addColorStop(1, '#090d14');
  irisCtx.fillStyle = grad;
  irisCtx.beginPath();
  irisCtx.arc(cx, cy, irisSize * 0.44, 0, Math.PI * 2);
  irisCtx.fill();

  // Radial iris fibers
  for (let i = 0; i < 96; i++) {
    const a = (i / 96) * Math.PI * 2 + rng.range(-0.02, 0.02);
    irisCtx.strokeStyle = i % 2 === 0 ? 'rgba(255,255,255,0.28)' : 'rgba(10,12,18,0.35)';
    irisCtx.lineWidth = rng.range(0.8, 2.2);
    irisCtx.beginPath();
    irisCtx.moveTo(cx + Math.cos(a) * irisSize * 0.14, cy + Math.sin(a) * irisSize * 0.14);
    irisCtx.lineTo(cx + Math.cos(a) * irisSize * 0.42, cy + Math.sin(a) * irisSize * 0.42);
    irisCtx.stroke();
  }

  // Pupil shape by eyeStyle
  irisCtx.fillStyle = '#030407';
  irisCtx.beginPath();
  if (profile.eyeStyle === 'slit') {
    irisCtx.ellipse(cx, cy, irisSize * 0.055, irisSize * 0.28, 0, 0, Math.PI * 2);
  } else if (profile.eyeStyle === 'bulbous') {
    irisCtx.ellipse(cx, cy, irisSize * 0.22, irisSize * 0.11, 0, 0, Math.PI * 2);
  } else if (profile.eyeStyle === 'xenomorphic') {
    irisCtx.arc(cx, cy, irisSize * 0.18, 0, Math.PI * 2);
    irisCtx.ellipse(cx, cy, irisSize * 0.06, irisSize * 0.32, Math.PI * 0.25, 0, Math.PI * 2);
  } else {
    irisCtx.arc(cx, cy, irisSize * 0.17, 0, Math.PI * 2);
  }
  irisCtx.fill();

  const configureMap = (canvas: HTMLCanvasElement, isColor: boolean): THREE.CanvasTexture => {
    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.colorSpace = isColor ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    tex.anisotropy = Math.max(1, maxAnisotropy);
    tex.needsUpdate = true;
    return tex;
  };

  const albedoMap = configureMap(albedoCanvas, true);
  const normalMap = configureMap(normalCanvas, false);
  const roughnessMap = configureMap(roughCanvas, false);
  const aoMap = configureMap(aoCanvas, false);
  const emissiveMap = configureMap(emissiveCanvas, true);

  const irisMap = new THREE.CanvasTexture(irisCanvas);
  irisMap.colorSpace = THREE.SRGBColorSpace;
  irisMap.anisotropy = Math.max(1, maxAnisotropy);
  irisMap.needsUpdate = true;

  const previewSize = ENGINE_CONSTANTS.PREVIEW_TEXTURE_RESOLUTION;
  const previews: PbrTexturePreviews = {
    albedo: canvasToPreviewUrl(albedoCanvas, previewSize),
    normal: canvasToPreviewUrl(normalCanvas, previewSize),
    roughness: canvasToPreviewUrl(roughCanvas, previewSize),
    ao: canvasToPreviewUrl(aoCanvas, previewSize),
    emissive: canvasToPreviewUrl(emissiveCanvas, previewSize),
    iris: canvasToPreviewUrl(irisCanvas, previewSize),
  };

  return {
    albedoMap,
    normalMap,
    roughnessMap,
    aoMap,
    emissiveMap,
    irisMap,
    previews,
    dispose: () => {
      albedoMap.dispose();
      normalMap.dispose();
      roughnessMap.dispose();
      aoMap.dispose();
      emissiveMap.dispose();
      irisMap.dispose();
    },
  };
}
