import * as THREE from 'three';
import { QUALITY_PRESETS } from './constants';
import { SeededPRNG } from './prng';
import { ArchetypeId, NarrativeSceneId, NarrativeScenePreset, QualityLevel } from './types';

export interface BuiltNarrativeEnvironment {
  group: THREE.Group;
  sceneId: NarrativeSceneId;
  godRaysGroup: THREE.Group | null;
  particlesPoints: THREE.Points | null;
  update: (elapsed: number, delta: number, atmosphereIntensity: number) => void;
  dispose: () => void;
}

function createSoftParticleTexture(): THREE.CanvasTexture {
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const grad = ctx.createRadialGradient(size / 2, size / 2, 1, size / 2, size / 2, size / 2);
  grad.addColorStop(0, 'rgba(255,255,255,1.0)');
  grad.addColorStop(0.35, 'rgba(255,255,255,0.65)');
  grad.addColorStop(1, 'rgba(255,255,255,0.0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(canvas);
  tex.needsUpdate = true;
  return tex;
}

function createLabPlatformTexture(accentHex: string): { map: THREE.CanvasTexture; emissive: THREE.CanvasTexture } {
  const size = 512;
  const cColor = document.createElement('canvas');
  cColor.width = size;
  cColor.height = size;
  const ctx = cColor.getContext('2d')!;

  const cEmissive = document.createElement('canvas');
  cEmissive.width = size;
  cEmissive.height = size;
  const eCtx = cEmissive.getContext('2d')!;

  ctx.fillStyle = '#18222d';
  ctx.fillRect(0, 0, size, size);
  eCtx.fillStyle = '#000000';
  eCtx.fillRect(0, 0, size, size);

  const cx = size / 2;
  const cy = size / 2;

  // Radial brushed metal panels
  ctx.strokeStyle = '#2b3948';
  ctx.lineWidth = 2;
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(a) * 60, cy + Math.sin(a) * 60);
    ctx.lineTo(cx + Math.cos(a) * 245, cy + Math.sin(a) * 245);
    ctx.stroke();
  }

  // Concentric calibration rings
  [85, 145, 210, 240].forEach((r, idx) => {
    ctx.strokeStyle = idx === 2 ? '#33485c' : '#243240';
    ctx.lineWidth = idx === 3 ? 5 : 2;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.stroke();

    if (idx === 1 || idx === 3) {
      eCtx.strokeStyle = idx === 3 ? accentHex : '#0ea5e9';
      eCtx.lineWidth = idx === 3 ? 4 : 2;
      eCtx.setLineDash(idx === 1 ? [14, 10] : [26, 8]);
      eCtx.beginPath();
      eCtx.arc(cx, cy, r, 0, Math.PI * 2);
      eCtx.stroke();
    }
  });
  eCtx.setLineDash([]);

  // Corner degree ticks
  eCtx.strokeStyle = accentHex;
  eCtx.lineWidth = 2;
  for (let i = 0; i < 36; i++) {
    const a = (i / 36) * Math.PI * 2;
    const r1 = 194;
    const r2 = i % 3 === 0 ? 206 : 200;
    eCtx.beginPath();
    eCtx.moveTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1);
    eCtx.lineTo(cx + Math.cos(a) * r2, cy + Math.sin(a) * r2);
    eCtx.stroke();
  }

  const map = new THREE.CanvasTexture(cColor);
  map.colorSpace = THREE.SRGBColorSpace;
  const emissive = new THREE.CanvasTexture(cEmissive);
  emissive.colorSpace = THREE.SRGBColorSpace;
  return { map, emissive };
}

function createLabScreenTexture(seed: number, archetype: ArchetypeId): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 160;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#04121d';
  ctx.fillRect(0, 0, 256, 160);
  ctx.strokeStyle = '#0891b2';
  ctx.lineWidth = 2;
  ctx.strokeRect(4, 4, 248, 152);

  // Grid lines
  ctx.strokeStyle = 'rgba(34, 211, 238, 0.16)';
  ctx.lineWidth = 1;
  for (let x = 24; x < 248; x += 24) {
    ctx.beginPath();
    ctx.moveTo(x, 8);
    ctx.lineTo(x, 152);
    ctx.stroke();
  }
  for (let y = 24; y < 152; y += 24) {
    ctx.beginPath();
    ctx.moveTo(8, y);
    ctx.lineTo(248, y);
    ctx.stroke();
  }

  // Bio-telemetry waveform
  ctx.strokeStyle = '#22d3ee';
  ctx.lineWidth = 2.2;
  ctx.beginPath();
  for (let x = 14; x <= 242; x += 4) {
    const t = (x - 14) / 228;
    const y =
      76 +
      Math.sin(t * 22 + seed) * 18 * Math.sin(t * Math.PI) +
      Math.cos(t * 47) * 6;
    if (x === 14) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.stroke();

  // Telemetry text
  ctx.fillStyle = '#67e8f9';
  ctx.font = 'bold 12px monospace';
  ctx.fillText(`SPECIMEN // ${archetype.toUpperCase()}`, 14, 24);
  ctx.fillStyle = '#fbbf24';
  ctx.font = '11px monospace';
  ctx.fillText(`BIO-SIG: ${(seed % 899) + 100} THz   CONTAINMENT: OK`, 14, 142);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function createStudioTurntableTexture(): THREE.CanvasTexture {
  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#1e232c';
  ctx.fillRect(0, 0, size, size);

  const cx = size / 2;
  const cy = size / 2;
  ctx.strokeStyle = 'rgba(203, 213, 225, 0.25)';
  ctx.lineWidth = 2;
  [120, 190, 242].forEach((r) => {
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.stroke();
  });

  ctx.strokeStyle = 'rgba(203, 213, 225, 0.35)';
  for (let i = 0; i < 72; i++) {
    const a = (i / 72) * Math.PI * 2;
    const len = i % 6 === 0 ? 14 : 6;
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(a) * (242 - len), cy + Math.sin(a) * (242 - len));
    ctx.lineTo(cx + Math.cos(a) * 242, cy + Math.sin(a) * 242);
    ctx.stroke();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function createTempleRuneTexture(accentHex: string): { map: THREE.CanvasTexture; emissive: THREE.CanvasTexture } {
  const size = 512;
  const cColor = document.createElement('canvas');
  cColor.width = size;
  cColor.height = size;
  const ctx = cColor.getContext('2d')!;

  const cEmissive = document.createElement('canvas');
  cEmissive.width = size;
  cEmissive.height = size;
  const eCtx = cEmissive.getContext('2d')!;

  ctx.fillStyle = '#2b2623';
  ctx.fillRect(0, 0, size, size);
  eCtx.fillStyle = '#000000';
  eCtx.fillRect(0, 0, size, size);

  const cx = size / 2;
  const cy = size / 2;

  // Stone block seams
  ctx.strokeStyle = '#181512';
  ctx.lineWidth = 3;
  [110, 175, 240].forEach((r) => {
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.stroke();
  });

  // Glowing ancient glyph circles
  eCtx.strokeStyle = accentHex;
  eCtx.lineWidth = 3;
  [135, 165, 218].forEach((r, idx) => {
    eCtx.setLineDash(idx === 1 ? [12, 16] : []);
    eCtx.beginPath();
    eCtx.arc(cx, cy, r, 0, Math.PI * 2);
    eCtx.stroke();
  });
  eCtx.setLineDash([]);

  // Radial rune symbols
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    const rx = cx + Math.cos(a) * 150;
    const ry = cy + Math.sin(a) * 150;
    eCtx.save();
    eCtx.translate(rx, ry);
    eCtx.rotate(a + Math.PI / 2);
    eCtx.beginPath();
    eCtx.moveTo(-5, -8);
    eCtx.lineTo(0, 8);
    eCtx.lineTo(5, -8);
    eCtx.moveTo(-6, 0);
    eCtx.lineTo(6, 0);
    eCtx.stroke();
    eCtx.restore();
  }

  const map = new THREE.CanvasTexture(cColor);
  map.colorSpace = THREE.SRGBColorSpace;
  const emissive = new THREE.CanvasTexture(cEmissive);
  emissive.colorSpace = THREE.SRGBColorSpace;
  return { map, emissive };
}

function buildSkyDome(preset: NarrativeScenePreset, timeUniform: { value: number }): THREE.Mesh {
  const geo = new THREE.SphereGeometry(52, 40, 28);
  const modeMap: Record<NarrativeSceneId, number> = {
    laboratorio: 0,
    fosa_abisal: 1,
    exotica: 2,
    estudio: 3,
    selva: 4,
    desierto: 5,
    glaciar: 6,
    templo: 7,
  };

  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      uZenith: { value: new THREE.Color(preset.environment.skyZenith) },
      uHorizon: { value: new THREE.Color(preset.environment.skyHorizon) },
      uGround: { value: new THREE.Color(preset.environment.skyGround) },
      uAccent: { value: new THREE.Color(preset.accentHex) },
      uTime: timeUniform,
      uMode: { value: modeMap[preset.id] },
    },
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main() {
        vDir = normalize(position);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uZenith;
      uniform vec3 uHorizon;
      uniform vec3 uGround;
      uniform vec3 uAccent;
      uniform float uTime;
      uniform int uMode;
      varying vec3 vDir;

      float hash21(vec2 p) {
        p = fract(p * vec2(123.34, 456.21));
        p += dot(p, p + 45.32);
        return fract(p.x * p.y);
      }

      float noise2(vec2 p) {
        vec2 i = floor(p);
        vec2 f = fract(p);
        vec2 u = f * f * (3.0 - 2.0 * f);
        return mix(
          mix(hash21(i), hash21(i + vec2(1.0, 0.0)), u.x),
          mix(hash21(i + vec2(0.0, 1.0)), hash21(i + vec2(1.0, 1.0)), u.x),
          u.y
        );
      }

      void main() {
        vec3 d = normalize(vDir);
        float h = d.y;
        vec3 base = h >= 0.0
          ? mix(uHorizon, uZenith, pow(h, 0.62))
          : mix(uHorizon, uGround, pow(-h, 0.72));

        vec2 sph = vec2(atan(d.z, d.x), asin(clamp(d.y, -1.0, 1.0)));

        // Mode 1: Abyssal water ceiling shimmer
        if (uMode == 1 && h > 0.05) {
          float ripple = noise2(d.xz * 7.5 + vec2(uTime * 0.25, -uTime * 0.18));
          float crest = smoothstep(0.55, 0.95, ripple) * smoothstep(0.15, 0.9, h);
          base += uAccent * crest * 0.28;
        }

        // Mode 2: Exotic Nebula + twin suns
        if (uMode == 2 && h > -0.1) {
          float neb = noise2(sph * 3.5 + uTime * 0.03) * 0.6 + noise2(sph * 7.2 - uTime * 0.02) * 0.4;
          base += mix(vec3(0.45, 0.08, 0.65), uAccent, neb) * smoothstep(0.35, 0.9, neb) * smoothstep(-0.05, 0.45, h) * 0.42;
          vec3 sunA = normalize(vec3(0.55, 0.48, -0.68));
          vec3 sunB = normalize(vec3(-0.35, 0.62, -0.70));
          float diskA = smoothstep(0.992, 0.997, dot(d, sunA));
          float diskB = smoothstep(0.996, 0.999, dot(d, sunB));
          base += vec3(1.0, 0.72, 0.95) * diskA * 1.4 + vec3(0.4, 0.9, 1.0) * diskB * 1.2;
        }

        // Mode 5: Desert dusty sun glare
        if (uMode == 5 && h > -0.05) {
          vec3 sunD = normalize(vec3(0.65, 0.26, -0.71));
          float halo = pow(max(0.0, dot(d, sunD)), 8.0);
          float dust = noise2(vec2(sph.x * 5.0 + uTime * 0.18, sph.y * 8.0));
          base += vec3(1.0, 0.55, 0.22) * halo * 0.45 + vec3(0.35, 0.16, 0.06) * dust * (1.0 - abs(h)) * 0.35;
        }

        // Mode 6: Antarctic Aurora Boreal
        if (uMode == 6 && h > 0.04) {
          float wave1 = sin(sph.x * 4.0 + uTime * 0.35 + noise2(sph * 3.0) * 2.5);
          float ribbon = smoothstep(0.3, 0.98, 1.0 - abs(d.y - 0.38 - wave1 * 0.14) * 5.0);
          float curtain = noise2(vec2(sph.x * 9.0 + uTime * 0.15, d.y * 4.0));
          vec3 auroraCol = mix(vec3(0.1, 0.95, 0.65), vec3(0.35, 0.6, 1.0), curtain);
          base += auroraCol * ribbon * curtain * 0.75;
        }

        // Stars for exotic, polar, temple
        if ((uMode == 2 || uMode == 6 || uMode == 7) && h > 0.08) {
          float st = hash21(floor(sph * 110.0));
          float star = smoothstep(0.992, 0.9995, st) * smoothstep(0.08, 0.35, h);
          float twinkle = 0.65 + 0.35 * sin(uTime * 2.5 + st * 80.0);
          base += vec3(0.85, 0.95, 1.0) * star * twinkle * 0.9;
        }

        // Mode 0: Lab grid ceiling subtle accent
        if (uMode == 0 && h > 0.1) {
          float g = smoothstep(0.95, 0.99, abs(sin(d.x * 16.0)) * abs(sin(d.z * 16.0)));
          base += uAccent * g * 0.08 * h;
        }

        gl_FragColor = vec4(base, 1.0);
      }
    `,
  });

  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = 'NarrativeSkyDome';
  mesh.renderOrder = -10;
  return mesh;
}

function buildGroundPlatform(
  preset: NarrativeScenePreset,
  seed: number,
  archetype: ArchetypeId,
  propDensity: number,
  timeUniform: { value: number },
  disposables: Array<{ dispose: () => void }>
): THREE.Group {
  const groundGroup = new THREE.Group();
  groundGroup.name = 'NarrativeGround';
  const rng = new SeededPRNG(seed ^ 0x5f3759df);
  const rand = () => rng.next();

  // Outer terrain plane
  const outerGeo = new THREE.CircleGeometry(36, 72, 0, Math.PI * 2);
  outerGeo.rotateX(-Math.PI / 2);
  disposables.push(outerGeo);

  if (preset.ground.displacementScale > 0) {
    // Subdivide/displace vertices using multi-frequency sine FBM while keeping central r < 1.35 flat
    const segGeo = new THREE.PlaneGeometry(42, 42, 68, 68);
    segGeo.rotateX(-Math.PI / 2);
    const pos = segGeo.attributes.position as THREE.BufferAttribute;
    const phase = rand() * 10;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const z = pos.getZ(i);
      const r = Math.hypot(x, z);
      const centerMask = THREE.MathUtils.smoothstep(r, 1.25, 3.6);
      const dune =
        Math.sin(x * 0.45 + z * 0.3 + phase) * 0.55 +
        Math.cos(x * 0.9 - z * 0.65) * 0.28 +
        Math.sin(r * 1.15) * 0.17;
      const y = dune * preset.ground.displacementScale * centerMask - (1 - centerMask) * 0.005;
      pos.setY(i, y);
    }
    segGeo.computeVertexNormals();
    disposables.push(segGeo);

    const terrainMat = new THREE.MeshStandardMaterial({
      color: preset.ground.color,
      roughness: preset.ground.roughness,
      metalness: preset.ground.metalness,
    });
    disposables.push(terrainMat);

    // Abyssal animated caustics overlay
    if (preset.ground.style === 'abyssal_sand') {
      terrainMat.onBeforeCompile = (shader) => {
        shader.uniforms.uTime = timeUniform;
        shader.uniforms.uCausticColor = { value: new THREE.Color('#2dd4bf') };
        shader.vertexShader = shader.vertexShader
          .replace('#include <common>', '#include <common>\nvarying vec3 vWorldP;')
          .replace('#include <begin_vertex>', '#include <begin_vertex>\nvWorldP = (modelMatrix * vec4(transformed, 1.0)).xyz;');
        shader.fragmentShader = shader.fragmentShader
          .replace('#include <common>', '#include <common>\nuniform float uTime;\nuniform vec3 uCausticColor;\nvarying vec3 vWorldP;')
          .replace(
            '#include <emissivemap_fragment>',
            `#include <emissivemap_fragment>
            float c1 = sin(vWorldP.x * 3.1 + uTime * 1.1 + sin(vWorldP.z * 2.4 - uTime * 0.7));
            float c2 = cos(vWorldP.z * 3.4 - uTime * 0.9 + cos(vWorldP.x * 2.2 + uTime * 0.8));
            float caust = pow(max(0.0, 1.0 - abs(c1 + c2) * 0.75), 3.0);
            float radialFade = exp(-dot(vWorldP.xz, vWorldP.xz) * 0.045);
            totalEmissiveRadiance += uCausticColor * caust * radialFade * 0.48;`
          );
      };
    }

    const terrainMesh = new THREE.Mesh(segGeo, terrainMat);
    terrainMesh.receiveShadow = true;
    terrainMesh.position.y = -0.01;
    groundGroup.add(terrainMesh);

    // Jungle reflective puddle patches
    if (preset.ground.style === 'jungle_moss') {
      const puddleGeo = new THREE.CircleGeometry(1.15, 32);
      puddleGeo.rotateX(-Math.PI / 2);
      const puddleMat = new THREE.MeshPhysicalMaterial({
        color: '#0c231a',
        roughness: 0.05,
        metalness: 0.1,
        clearcoat: 1.0,
        clearcoatRoughness: 0.04,
      });
      disposables.push(puddleGeo, puddleMat);
      const p1 = new THREE.Mesh(puddleGeo, puddleMat);
      p1.position.set(1.5, 0.005, 1.1);
      p1.scale.set(0.95, 1, 0.7);
      p1.receiveShadow = true;
      groundGroup.add(p1);
    }

    // Antarctic ice cracks highlight disc
    if (preset.ground.style === 'antarctic_ice') {
      const icePadGeo = new THREE.CylinderGeometry(1.5, 1.65, 0.08, 28);
      const icePadMat = new THREE.MeshPhysicalMaterial({
        color: '#93c5fd',
        roughness: 0.12,
        metalness: 0.05,
        clearcoat: 1.0,
        clearcoatRoughness: 0.08,
        transmission: 0.2,
        ior: 1.31,
      });
      disposables.push(icePadGeo, icePadMat);
      const icePad = new THREE.Mesh(icePadGeo, icePadMat);
      icePad.position.y = -0.045;
      icePad.receiveShadow = true;
      groundGroup.add(icePad);
    }
  } else {
    // Flat architectural ground + detailed focal dais
    const floorMat = new THREE.MeshStandardMaterial({
      color: preset.ground.color,
      roughness: preset.ground.roughness,
      metalness: preset.ground.metalness,
    });
    disposables.push(floorMat);
    const floor = new THREE.Mesh(outerGeo, floorMat);
    floor.receiveShadow = true;
    floor.position.y = -0.01;
    groundGroup.add(floor);

    if (preset.ground.style === 'lab_platform') {
      const { map, emissive } = createLabPlatformTexture(preset.accentHex);
      disposables.push(map, emissive);
      const daisGeo = new THREE.CylinderGeometry(1.65, 1.82, 0.07, 48);
      const daisMat = new THREE.MeshStandardMaterial({
        map,
        emissiveMap: emissive,
        emissive: new THREE.Color('#ffffff'),
        emissiveIntensity: 0.85,
        roughness: 0.32,
        metalness: 0.72,
      });
      disposables.push(daisGeo, daisMat);
      const dais = new THREE.Mesh(daisGeo, daisMat);
      dais.position.y = -0.036;
      dais.receiveShadow = true;
      groundGroup.add(dais);

      // Subtle containment force-ring / open-top liquid basin for aquatic creatures
      const isAquatic = archetype === 'pez' || archetype === 'molusco' || archetype === 'anfibio';
      if (isAquatic && propDensity > 0.25) {
        const glassGeo = new THREE.CylinderGeometry(1.62, 1.62, 1.45, 48, 1, true);
        const glassMat = new THREE.MeshPhysicalMaterial({
          color: '#67e8f9',
          roughness: 0.08,
          metalness: 0.05,
          transparent: true,
          opacity: 0.14,
          side: THREE.DoubleSide,
          depthWrite: false,
        });
        const ringGeo = new THREE.TorusGeometry(1.62, 0.025, 10, 52);
        ringGeo.rotateX(Math.PI / 2);
        const ringMat = new THREE.MeshStandardMaterial({
          color: '#334155',
          emissive: preset.accentHex,
          emissiveIntensity: 0.65,
          metalness: 0.8,
          roughness: 0.2,
        });
        disposables.push(glassGeo, glassMat, ringGeo, ringMat);
        const glass = new THREE.Mesh(glassGeo, glassMat);
        glass.position.y = 0.72;
        const topRing = new THREE.Mesh(ringGeo, ringMat);
        topRing.position.y = 1.45;
        groundGroup.add(glass, topRing);
      }
    } else if (preset.ground.style === 'studio_cove') {
      const turnTex = createStudioTurntableTexture();
      disposables.push(turnTex);
      const daisGeo = new THREE.CylinderGeometry(1.6, 1.72, 0.04, 48);
      const daisMat = new THREE.MeshStandardMaterial({
        map: turnTex,
        roughness: 0.42,
        metalness: 0.18,
      });
      disposables.push(daisGeo, daisMat);
      const dais = new THREE.Mesh(daisGeo, daisMat);
      dais.position.y = -0.021;
      dais.receiveShadow = true;
      groundGroup.add(dais);
    } else if (preset.ground.style === 'ruined_stone') {
      const { map, emissive } = createTempleRuneTexture(preset.accentHex);
      disposables.push(map, emissive);
      const altarGeo = new THREE.CylinderGeometry(1.72, 1.92, 0.09, 32);
      const altarMat = new THREE.MeshStandardMaterial({
        map,
        emissiveMap: emissive,
        emissive: new THREE.Color('#ffffff'),
        emissiveIntensity: 0.9,
        roughness: 0.82,
        metalness: 0.08,
      });
      disposables.push(altarGeo, altarMat);
      const altar = new THREE.Mesh(altarGeo, altarMat);
      altar.position.y = -0.046;
      altar.receiveShadow = true;
      groundGroup.add(altar);
    }
  }

  return groundGroup;
}

function buildGodRays(preset: NarrativeScenePreset, disposables: Array<{ dispose: () => void }>): THREE.Group | null {
  if (!preset.lighting.godRays || preset.lighting.godRayIntensity <= 0) return null;
  const group = new THREE.Group();
  group.name = 'NarrativeGodRays';

  const coneGeo = new THREE.CylinderGeometry(0.45, 2.1, 7.5, 20, 1, true);
  const rayMat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    uniforms: {
      uColor: { value: new THREE.Color(preset.lighting.godRayColor) },
      uIntensity: { value: preset.lighting.godRayIntensity },
    },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      varying vec3 vNormalV;
      varying vec3 vViewDir;
      void main() {
        vUv = uv;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vNormalV = normalize(normalMatrix * normal);
        vViewDir = normalize(-mv.xyz);
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor;
      uniform float uIntensity;
      varying vec2 vUv;
      varying vec3 vNormalV;
      varying vec3 vViewDir;
      void main() {
        float edge = pow(abs(dot(normalize(vNormalV), normalize(vViewDir))), 2.2);
        float verticalFade = smoothstep(0.0, 0.35, vUv.y) * smoothstep(1.0, 0.15, vUv.y);
        float alpha = edge * verticalFade * uIntensity;
        gl_FragColor = vec4(uColor, alpha);
      }
    `,
  });
  disposables.push(coneGeo, rayMat);

  const offsets: [number, number, number, number][] = [
    [-2.4, 3.6, -2.6, 0.25],
    [2.1, 3.8, -2.9, -0.22],
    [0.2, 4.1, -3.5, 0.1],
  ];
  offsets.forEach(([x, y, z, tilt]) => {
    const beam = new THREE.Mesh(coneGeo, rayMat);
    beam.position.set(x, y, z);
    beam.rotation.z = tilt;
    beam.rotation.x = 0.18;
    group.add(beam);
  });

  return group;
}

function buildParticles(
  preset: NarrativeScenePreset,
  seed: number,
  particleMultiplier: number,
  isSoftwareGl: boolean,
  disposables: Array<{ dispose: () => void }>
): { points: THREE.Points; velocities: Float32Array; phases: Float32Array } | null {
  if (preset.particles.type === 'none' || preset.particles.count <= 0) return null;

  const rng = new SeededPRNG(seed ^ 0x9e3779b9);
  const rand = () => rng.next();
  const scaledCount = Math.max(24, Math.round(preset.particles.count * particleMultiplier));
  const count = isSoftwareGl ? Math.min(80, scaledCount) : scaledCount;
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const velocities = new Float32Array(count * 3);
  const phases = new Float32Array(count);

  const c1 = new THREE.Color(preset.particles.color);
  const c2 = new THREE.Color(preset.particles.secondaryColor);
  const tmpColor = new THREE.Color();

  for (let i = 0; i < count; i++) {
    const r = 0.6 + rand() * 5.2;
    const theta = rand() * Math.PI * 2;
    positions[i * 3] = Math.cos(theta) * r;
    positions[i * 3 + 1] = 0.08 + rand() * 4.2;
    positions[i * 3 + 2] = Math.sin(theta) * r;

    tmpColor.copy(c1).lerp(c2, rand());
    colors[i * 3] = tmpColor.r;
    colors[i * 3 + 1] = tmpColor.g;
    colors[i * 3 + 2] = tmpColor.b;

    phases[i] = rand() * Math.PI * 2;
    const spd = preset.particles.speed;
    switch (preset.particles.type) {
      case 'sand_wind':
        velocities[i * 3] = spd * (0.8 + rand() * 0.6);
        velocities[i * 3 + 1] = (rand() - 0.5) * 0.08;
        velocities[i * 3 + 2] = spd * 0.25;
        break;
      case 'snow':
      case 'marine_snow':
        velocities[i * 3] = (rand() - 0.5) * 0.12;
        velocities[i * 3 + 1] = -spd * (0.6 + rand() * 0.6);
        velocities[i * 3 + 2] = (rand() - 0.5) * 0.12;
        break;
      case 'embers':
      case 'lab_steam':
        velocities[i * 3] = (rand() - 0.5) * 0.08;
        velocities[i * 3 + 1] = spd * (0.6 + rand() * 0.7);
        velocities[i * 3 + 2] = (rand() - 0.5) * 0.08;
        break;
      default:
        velocities[i * 3] = (rand() - 0.5) * 0.12;
        velocities[i * 3 + 1] = (rand() - 0.5) * spd * 0.5;
        velocities[i * 3 + 2] = (rand() - 0.5) * 0.12;
        break;
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  const sprite = createSoftParticleTexture();
  const mat = new THREE.PointsMaterial({
    size: preset.particles.size,
    map: sprite,
    vertexColors: true,
    transparent: true,
    opacity: preset.particles.opacity,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    sizeAttenuation: true,
  });
  disposables.push(geo, sprite, mat);

  const points = new THREE.Points(geo, mat);
  points.name = 'NarrativeParticles';
  points.frustumCulled = false;
  return { points, velocities, phases };
}

function buildSceneProps(
  preset: NarrativeScenePreset,
  seed: number,
  archetype: ArchetypeId,
  propDensity: number,
  disposables: Array<{ dispose: () => void }>
): {
  propsGroup: THREE.Group;
  lod1Landmarks: THREE.Group;
  animatedItems: Array<{ obj: THREE.Object3D; mode: string; phase: number; basePos: THREE.Vector3 }>;
} {
  const propsGroup = new THREE.Group();
  propsGroup.name = 'NarrativeProps';
  const lod1Landmarks = new THREE.Group();
  lod1Landmarks.name = 'NarrativePropsLOD1';
  const animatedItems: Array<{ obj: THREE.Object3D; mode: string; phase: number; basePos: THREE.Vector3 }> = [];

  if (propDensity <= 0.02) {
    return { propsGroup, lod1Landmarks, animatedItems };
  }

  const rng = new SeededPRNG(seed ^ 0x13579bdf);
  const rand = () => rng.next();
  const countScale = propDensity;
  const dummy = new THREE.Object3D();

  // Helper: place outside center clearance (radius >= 2.15, bias slightly behind so camera view stays unobstructed)
  const samplePerimeter = (minR: number, maxR: number, backBias = false): [number, number] => {
    const r = minR + rand() * (maxR - minR);
    let angle = rand() * Math.PI * 2;
    if (backBias && Math.sin(angle) > 0.35 && rand() < 0.72) {
      angle = -angle;
    }
    return [Math.cos(angle) * r, Math.sin(angle) * r];
  };

  switch (preset.id) {
    case 'laboratorio': {
      // Diagnostic monitor consoles + perimeter containment pylons
      const metalMat = new THREE.MeshStandardMaterial({
        color: '#26313f',
        roughness: 0.35,
        metalness: 0.78,
      });
      const screenTex = createLabScreenTexture(seed, archetype);
      const screenMat = new THREE.MeshStandardMaterial({
        map: screenTex,
        emissiveMap: screenTex,
        emissive: new THREE.Color('#ffffff'),
        emissiveIntensity: 0.85,
        roughness: 0.2,
      });
      const standGeo = new THREE.BoxGeometry(0.14, 1.05, 0.14);
      const baseGeo = new THREE.CylinderGeometry(0.22, 0.28, 0.08, 12);
      const frameGeo = new THREE.BoxGeometry(0.72, 0.48, 0.05);
      const faceGeo = new THREE.PlaneGeometry(0.64, 0.4);
      disposables.push(metalMat, screenTex, screenMat, standGeo, baseGeo, frameGeo, faceGeo);

      const monitorCount = Math.max(1, Math.round(3 * countScale));
      for (let i = 0; i < monitorCount; i++) {
        const angle = -Math.PI * 0.78 + (i / Math.max(1, monitorCount - 1 || 1)) * Math.PI * 0.56 - 0.15;
        const r = 2.45;
        const consoleGrp = new THREE.Group();
        const base = new THREE.Mesh(baseGeo, metalMat);
        base.position.y = 0.04;
        const stand = new THREE.Mesh(standGeo, metalMat);
        stand.position.y = 0.55;
        const frame = new THREE.Mesh(frameGeo, metalMat);
        frame.position.set(0, 1.12, 0.04);
        frame.rotation.x = -0.22;
        const face = new THREE.Mesh(faceGeo, screenMat);
        face.position.set(0, 1.12, 0.072);
        face.rotation.x = -0.22;
        consoleGrp.add(base, stand, frame, face);
        consoleGrp.position.set(Math.cos(angle) * r, 0, Math.sin(angle) * r);
        consoleGrp.lookAt(0, 0.9, 0);
        propsGroup.add(consoleGrp);
      }

      // Perimeter scanner pylons (InstancedMesh)
      const pylonCount = Math.max(2, Math.round(6 * countScale));
      const pylonGeo = new THREE.CylinderGeometry(0.07, 0.11, 1.9, 8);
      const pylonInst = new THREE.InstancedMesh(pylonGeo, metalMat, pylonCount);
      const capGeo = new THREE.TorusGeometry(0.1, 0.025, 8, 16);
      capGeo.rotateX(Math.PI / 2);
      const capMat = new THREE.MeshStandardMaterial({
        color: '#22d3ee',
        emissive: '#22d3ee',
        emissiveIntensity: 1.4,
      });
      const capInst = new THREE.InstancedMesh(capGeo, capMat, pylonCount);
      disposables.push(pylonGeo, capGeo, capMat);

      for (let i = 0; i < pylonCount; i++) {
        const a = (i / pylonCount) * Math.PI * 2 + 0.35;
        const x = Math.cos(a) * 3.1;
        const z = Math.sin(a) * 3.1;
        dummy.position.set(x, 0.95, z);
        dummy.rotation.set(0, a, 0);
        dummy.scale.setScalar(1);
        dummy.updateMatrix();
        pylonInst.setMatrixAt(i, dummy.matrix);
        dummy.position.set(x, 1.85, z);
        dummy.updateMatrix();
        capInst.setMatrixAt(i, dummy.matrix);
      }
      pylonInst.computeBoundingSphere();
      capInst.computeBoundingSphere();
      disposables.push(pylonInst, capInst);
      propsGroup.add(pylonInst, capInst);

      const pylonLod1 = new THREE.InstancedMesh(pylonGeo, metalMat, pylonCount);
      pylonLod1.instanceMatrix.array.set(pylonInst.instanceMatrix.array);
      pylonLod1.instanceMatrix.needsUpdate = true;
      pylonLod1.computeBoundingSphere();
      disposables.push(pylonLod1);
      lod1Landmarks.add(pylonLod1);
      break;
    }

    case 'fosa_abisal': {
      // Wet rocky spires + bioluminescent branching coral clusters + instanced kelp
      const rockCount = Math.max(3, Math.round(10 * countScale));
      const rockGeo = new THREE.DodecahedronGeometry(0.42, 1);
      const rPos = rockGeo.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < rPos.count; i++) {
        const vy = rPos.getY(i);
        rPos.setY(i, vy * (vy > 0 ? 1.85 : 0.7));
        rPos.setX(i, rPos.getX(i) * (0.85 + 0.25 * Math.sin(vy * 4.0)));
      }
      rockGeo.computeVertexNormals();
      const rockMat = new THREE.MeshPhysicalMaterial({
        color: '#0f2234',
        roughness: 0.32,
        clearcoat: 0.85,
        clearcoatRoughness: 0.15,
      });
      const rockInst = new THREE.InstancedMesh(rockGeo, rockMat, rockCount);
      disposables.push(rockGeo, rockMat, rockInst);
      for (let i = 0; i < rockCount; i++) {
        const [x, z] = samplePerimeter(2.3, 5.2, true);
        dummy.position.set(x, 0.12, z);
        dummy.rotation.set(rand() * 0.2, rand() * Math.PI * 2, rand() * 0.2);
        dummy.scale.set(0.8 + rand() * 1.1, 0.9 + rand() * 1.9, 0.8 + rand() * 1.1);
        dummy.updateMatrix();
        rockInst.setMatrixAt(i, dummy.matrix);
      }
      rockInst.computeBoundingSphere();
      propsGroup.add(rockInst);

      const rockLod1 = new THREE.InstancedMesh(rockGeo, rockMat, rockCount);
      rockLod1.instanceMatrix.array.set(rockInst.instanceMatrix.array);
      rockLod1.instanceMatrix.needsUpdate = true;
      rockLod1.computeBoundingSphere();
      disposables.push(rockLod1);
      lod1Landmarks.add(rockLod1);

      // Bioluminescent coral branches (InstancedMesh)
      const coralCount = Math.max(4, Math.round(14 * countScale));
      const coralGeo = new THREE.ConeGeometry(0.08, 0.72, 7);
      coralGeo.translate(0, 0.36, 0);
      const coralMat = new THREE.MeshStandardMaterial({
        color: '#14b8a6',
        emissive: '#00f5d4',
        emissiveIntensity: 1.5,
        roughness: 0.3,
      });
      const coralInst = new THREE.InstancedMesh(coralGeo, coralMat, coralCount * 2);
      disposables.push(coralGeo, coralMat, coralInst);
      const cA = new THREE.Color('#00f5d4');
      const cB = new THREE.Color('#ec4899');
      const cC = new THREE.Color('#38bdf8');
      for (let i = 0; i < coralCount; i++) {
        const [x, z] = samplePerimeter(1.9, 4.2, false);
        const col = i % 3 === 0 ? cB : i % 2 === 0 ? cC : cA;
        for (let b = 0; b < 2; b++) {
          const idx = i * 2 + b;
          dummy.position.set(x + (b - 0.5) * 0.14, 0, z + (b - 0.5) * 0.12);
          dummy.rotation.set((rand() - 0.5) * 0.55, rand() * Math.PI * 2, (rand() - 0.5) * 0.55);
          dummy.scale.setScalar(0.55 + rand() * 0.75);
          dummy.updateMatrix();
          coralInst.setMatrixAt(idx, dummy.matrix);
          coralInst.setColorAt(idx, col);
        }
      }
      if (coralInst.instanceColor) coralInst.instanceColor.needsUpdate = true;
      coralInst.computeBoundingSphere();
      propsGroup.add(coralInst);

      // Swaying kelp ribbons (InstancedMesh)
      const kelpCount = Math.max(3, Math.round(10 * countScale));
      const kelpCurve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(0, 0, 0),
        new THREE.Vector3(0.08, 0.7, 0.04),
        new THREE.Vector3(-0.07, 1.45, -0.05),
        new THREE.Vector3(0.06, 2.15, 0.03),
      ]);
      const kelpGeo = new THREE.TubeGeometry(kelpCurve, 12, 0.032, 6, false);
      const kelpMat = new THREE.MeshStandardMaterial({
        color: '#0d4a43',
        emissive: '#0f766e',
        emissiveIntensity: 0.35,
        roughness: 0.45,
      });
      const kelpInst = new THREE.InstancedMesh(kelpGeo, kelpMat, kelpCount);
      disposables.push(kelpGeo, kelpMat, kelpInst);
      for (let i = 0; i < kelpCount; i++) {
        const [x, z] = samplePerimeter(2.3, 4.6, true);
        dummy.position.set(x, -0.05, z);
        dummy.rotation.set(0, rand() * Math.PI * 2, 0);
        dummy.scale.setScalar(0.7 + rand() * 0.8);
        dummy.updateMatrix();
        kelpInst.setMatrixAt(i, dummy.matrix);
      }
      kelpInst.computeBoundingSphere();
      propsGroup.add(kelpInst);
      animatedItems.push({ obj: kelpInst, mode: 'sway', phase: 0.4, basePos: kelpInst.position.clone() });
      break;
    }

    case 'exotica': {
      // Instanced crystal spires (grounded + floating) + instanced alien mushrooms
      const crystalCount = Math.max(4, Math.round(12 * countScale));
      const crystalGeo = new THREE.CylinderGeometry(0.02, 0.22, 1.35, 6);
      const crystalMat = new THREE.MeshPhysicalMaterial({
        color: '#a855f7',
        emissive: '#d946ef',
        emissiveIntensity: 0.9,
        roughness: 0.12,
        metalness: 0.2,
        clearcoat: 1.0,
        iridescence: 0.85,
      });
      const groundCrystalCount = Math.max(2, Math.ceil((crystalCount * 2) / 3));
      const floatCrystalCount = Math.max(1, crystalCount - groundCrystalCount);
      const groundCrystalInst = new THREE.InstancedMesh(crystalGeo, crystalMat, groundCrystalCount);
      const floatCrystalInst = new THREE.InstancedMesh(crystalGeo, crystalMat, floatCrystalCount);
      disposables.push(crystalGeo, crystalMat, groundCrystalInst, floatCrystalInst);

      for (let i = 0; i < groundCrystalCount; i++) {
        const [x, z] = samplePerimeter(2.2, 4.8, true);
        dummy.position.set(x, 0.45, z);
        dummy.rotation.set((rand() - 0.5) * 0.4, rand() * Math.PI, (rand() - 0.5) * 0.4);
        dummy.scale.setScalar(0.65 + rand() * 0.85);
        dummy.updateMatrix();
        groundCrystalInst.setMatrixAt(i, dummy.matrix);
      }
      for (let i = 0; i < floatCrystalCount; i++) {
        const [x, z] = samplePerimeter(2.3, 4.6, true);
        dummy.position.set(x, 1.2 + rand() * 1.1, z);
        dummy.rotation.set((rand() - 0.5) * 0.4, rand() * Math.PI, (rand() - 0.5) * 0.4);
        dummy.scale.setScalar(0.65 + rand() * 0.75);
        dummy.updateMatrix();
        floatCrystalInst.setMatrixAt(i, dummy.matrix);
      }
      groundCrystalInst.computeBoundingSphere();
      floatCrystalInst.computeBoundingSphere();
      propsGroup.add(groundCrystalInst, floatCrystalInst);
      animatedItems.push({ obj: floatCrystalInst, mode: 'float', phase: 0.2, basePos: floatCrystalInst.position.clone() });

      const crystalLod1 = new THREE.InstancedMesh(crystalGeo, crystalMat, groundCrystalCount);
      crystalLod1.instanceMatrix.array.set(groundCrystalInst.instanceMatrix.array);
      crystalLod1.instanceMatrix.needsUpdate = true;
      crystalLod1.computeBoundingSphere();
      disposables.push(crystalLod1);
      lod1Landmarks.add(crystalLod1);

      // Instanced alien mushrooms (stalk + curved dome cap)
      const mushCount = Math.max(3, Math.round(9 * countScale));
      const stemCurve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(0, 0, 0),
        new THREE.Vector3(0.06, 0.35, 0.03),
        new THREE.Vector3(-0.02, 0.72, 0),
      ]);
      const stemGeo = new THREE.TubeGeometry(stemCurve, 10, 0.045, 8, false);
      const capGeo = new THREE.SphereGeometry(0.28, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.55);
      capGeo.translate(-0.02, 0.7, 0);
      const stemMat = new THREE.MeshStandardMaterial({ color: '#3b0764', roughness: 0.6 });
      const capMat = new THREE.MeshStandardMaterial({
        color: '#22d3ee',
        emissive: '#06b6d4',
        emissiveIntensity: 1.2,
        roughness: 0.28,
      });
      const stemInst = new THREE.InstancedMesh(stemGeo, stemMat, mushCount);
      const capInst = new THREE.InstancedMesh(capGeo, capMat, mushCount);
      disposables.push(stemGeo, capGeo, stemMat, capMat, stemInst, capInst);

      for (let i = 0; i < mushCount; i++) {
        const [x, z] = samplePerimeter(1.95, 4.0, false);
        const s = 0.55 + rand() * 0.75;
        dummy.position.set(x, 0, z);
        dummy.rotation.set(0, rand() * Math.PI * 2, 0);
        dummy.scale.setScalar(s);
        dummy.updateMatrix();
        stemInst.setMatrixAt(i, dummy.matrix);
        capInst.setMatrixAt(i, dummy.matrix);
      }
      stemInst.computeBoundingSphere();
      capInst.computeBoundingSphere();
      propsGroup.add(stemInst, capInst);
      break;
    }

    case 'estudio': {
      // Two rear studio softbox stands framing the backdrop cleanly
      const standMat = new THREE.MeshStandardMaterial({ color: '#111827', roughness: 0.5, metalness: 0.7 });
      const diffuserMat = new THREE.MeshStandardMaterial({
        color: '#ffffff',
        emissive: '#e2e8f0',
        emissiveIntensity: 0.9,
        roughness: 0.4,
      });
      const poleGeo = new THREE.CylinderGeometry(0.025, 0.035, 2.5, 10);
      const boxGeo = new THREE.BoxGeometry(0.85, 0.62, 0.14);
      const faceGeo = new THREE.PlaneGeometry(0.76, 0.54);
      disposables.push(standMat, diffuserMat, poleGeo, boxGeo, faceGeo);

      const positions: [number, number][] = [
        [-2.8, -2.7],
        [2.9, -2.6],
      ];
      positions.slice(0, propDensity < 0.35 ? 1 : 2).forEach(([x, z]) => {
        const rig = new THREE.Group();
        const pole = new THREE.Mesh(poleGeo, standMat);
        pole.position.y = 1.25;
        const box = new THREE.Mesh(boxGeo, standMat);
        box.position.set(0, 2.3, 0);
        const face = new THREE.Mesh(faceGeo, diffuserMat);
        face.position.set(0, 2.3, 0.075);
        rig.add(pole, box, face);
        rig.position.set(x, 0, z);
        rig.lookAt(0, 1.0, 0);
        propsGroup.add(rig);
      });
      break;
    }

    case 'selva': {
      // Instanced multi-frond tropical ferns + mossy boulders + instanced hanging canopy vines
      const fernCount = Math.max(4, Math.round(14 * countScale));
      const frondGeo = new THREE.ConeGeometry(0.16, 0.95, 5);
      frondGeo.scale(1.0, 1.0, 0.22);
      frondGeo.translate(0, 0.45, 0);
      const fernMat = new THREE.MeshStandardMaterial({ color: '#15803d', roughness: 0.58, side: THREE.DoubleSide });
      const fernInst = new THREE.InstancedMesh(frondGeo, fernMat, fernCount * 5);
      disposables.push(frondGeo, fernMat, fernInst);

      const f1 = new THREE.Color('#16a34a');
      const f2 = new THREE.Color('#4d7c0f');
      for (let i = 0; i < fernCount; i++) {
        const [x, z] = samplePerimeter(1.9, 4.4, false);
        const baseScale = 0.65 + rand() * 0.75;
        for (let f = 0; f < 5; f++) {
          const idx = i * 5 + f;
          const a = (f / 5) * Math.PI * 2 + rand() * 0.3;
          dummy.position.set(x, 0, z);
          dummy.rotation.set(0.68 + rand() * 0.2, a, 0);
          dummy.scale.setScalar(baseScale);
          dummy.updateMatrix();
          fernInst.setMatrixAt(idx, dummy.matrix);
          fernInst.setColorAt(idx, f % 2 === 0 ? f1 : f2);
        }
      }
      if (fernInst.instanceColor) fernInst.instanceColor.needsUpdate = true;
      fernInst.computeBoundingSphere();
      propsGroup.add(fernInst);

      // Mossy boulders
      const rockGeo = new THREE.IcosahedronGeometry(0.45, 1);
      const rockMat = new THREE.MeshStandardMaterial({ color: '#1f2e22', roughness: 0.85 });
      const rockCount = Math.max(2, Math.round(6 * countScale));
      const rockInst = new THREE.InstancedMesh(rockGeo, rockMat, rockCount);
      disposables.push(rockGeo, rockMat, rockInst);
      for (let i = 0; i < rockCount; i++) {
        const [x, z] = samplePerimeter(2.3, 4.8, true);
        dummy.position.set(x, 0.14, z);
        dummy.rotation.set(rand(), rand(), rand());
        dummy.scale.set(1.2, 0.72, 1.0);
        dummy.updateMatrix();
        rockInst.setMatrixAt(i, dummy.matrix);
      }
      rockInst.computeBoundingSphere();
      propsGroup.add(rockInst);

      const rockLod1 = new THREE.InstancedMesh(rockGeo, rockMat, rockCount);
      rockLod1.instanceMatrix.array.set(rockInst.instanceMatrix.array);
      rockLod1.instanceMatrix.needsUpdate = true;
      rockLod1.computeBoundingSphere();
      disposables.push(rockLod1);
      lod1Landmarks.add(rockLod1);

      // Instanced hanging vines framing the upper edge
      const vineCount = Math.max(2, Math.round(6 * countScale));
      const vineCurve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(0, 4.2, 0),
        new THREE.Vector3(0.14, 3.0, 0.08),
        new THREE.Vector3(-0.1, 1.9, -0.04),
        new THREE.Vector3(0.05, 1.15, 0.04),
      ]);
      const vineGeo = new THREE.TubeGeometry(vineCurve, 12, 0.028, 6, false);
      const vineMat = new THREE.MeshStandardMaterial({ color: '#14532d', roughness: 0.72 });
      const vineInst = new THREE.InstancedMesh(vineGeo, vineMat, vineCount);
      disposables.push(vineGeo, vineMat, vineInst);
      for (let i = 0; i < vineCount; i++) {
        const [x, z] = samplePerimeter(2.6, 4.4, true);
        dummy.position.set(x, 0, z);
        dummy.rotation.set(0, rand() * Math.PI * 2, 0);
        dummy.scale.setScalar(1.0);
        dummy.updateMatrix();
        vineInst.setMatrixAt(i, dummy.matrix);
      }
      vineInst.computeBoundingSphere();
      propsGroup.add(vineInst);
      animatedItems.push({ obj: vineInst, mode: 'sway', phase: 0.8, basePos: vineInst.position.clone() });
      break;
    }

    case 'desierto': {
      // Instanced giant curved fossil ribcage + weathered sandstone pillars
      const boneMat = new THREE.MeshStandardMaterial({ color: '#d6c7b2', roughness: 0.88, metalness: 0.02 });
      const ribCurve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(0, -0.1, 0),
        new THREE.Vector3(0.25, 0.85, 0),
        new THREE.Vector3(0.1, 1.65, 0.1),
        new THREE.Vector3(-0.35, 1.95, 0.2),
      ]);
      const ribGeo = new THREE.TubeGeometry(ribCurve, 14, 0.075, 7, false);
      const ribPairs = Math.max(2, Math.round(5 * countScale));
      const ribInst = new THREE.InstancedMesh(ribGeo, boneMat, ribPairs);
      disposables.push(boneMat, ribGeo, ribInst);

      for (let i = 0; i < ribPairs; i++) {
        dummy.position.set(-1.9 + i * 0.52, 0, -2.55 - Math.sin(i * 0.5) * 0.4);
        dummy.rotation.set(0, -0.3 + i * 0.12, 0);
        dummy.scale.setScalar(0.85 + (ribPairs - i) * 0.08);
        dummy.updateMatrix();
        ribInst.setMatrixAt(i, dummy.matrix);
      }
      ribInst.computeBoundingSphere();
      propsGroup.add(ribInst);

      // Sandstone pillars
      const stoneCount = Math.max(2, Math.round(7 * countScale));
      const stoneGeo = new THREE.CylinderGeometry(0.22, 0.42, 1.8, 7);
      const stoneMat = new THREE.MeshStandardMaterial({ color: '#7c3f23', roughness: 0.92 });
      const stoneInst = new THREE.InstancedMesh(stoneGeo, stoneMat, stoneCount);
      disposables.push(stoneGeo, stoneMat, stoneInst);
      for (let i = 0; i < stoneCount; i++) {
        const [x, z] = samplePerimeter(2.4, 5.2, true);
        dummy.position.set(x, 0.75, z);
        dummy.rotation.set((rand() - 0.5) * 0.15, rand() * Math.PI, (rand() - 0.5) * 0.15);
        dummy.scale.set(0.8 + rand() * 0.8, 0.7 + rand() * 1.2, 0.8 + rand() * 0.8);
        dummy.updateMatrix();
        stoneInst.setMatrixAt(i, dummy.matrix);
      }
      stoneInst.computeBoundingSphere();
      propsGroup.add(stoneInst);

      const stoneLod1 = new THREE.InstancedMesh(stoneGeo, stoneMat, stoneCount);
      stoneLod1.instanceMatrix.array.set(stoneInst.instanceMatrix.array);
      stoneLod1.instanceMatrix.needsUpdate = true;
      stoneLod1.computeBoundingSphere();
      disposables.push(stoneLod1);
      lod1Landmarks.add(stoneLod1);
      break;
    }

    case 'glaciar': {
      // Faceted crystalline ice stalagmites & frozen ridges
      const iceCount = Math.max(4, Math.round(14 * countScale));
      const shardGeo = new THREE.ConeGeometry(0.28, 1.8, 5);
      shardGeo.translate(0, 0.85, 0);
      const iceMat = new THREE.MeshPhysicalMaterial({
        color: '#bae6fd',
        roughness: 0.08,
        metalness: 0.05,
        clearcoat: 1.0,
        clearcoatRoughness: 0.05,
        transmission: 0.35,
        ior: 1.31,
      });
      const iceInst = new THREE.InstancedMesh(shardGeo, iceMat, iceCount);
      disposables.push(shardGeo, iceMat, iceInst);
      for (let i = 0; i < iceCount; i++) {
        const [x, z] = samplePerimeter(2.15, 5.0, true);
        dummy.position.set(x, -0.05, z);
        dummy.rotation.set((rand() - 0.5) * 0.38, rand() * Math.PI * 2, (rand() - 0.5) * 0.38);
        dummy.scale.set(0.65 + rand() * 0.9, 0.7 + rand() * 1.5, 0.65 + rand() * 0.9);
        dummy.updateMatrix();
        iceInst.setMatrixAt(i, dummy.matrix);
      }
      iceInst.computeBoundingSphere();
      propsGroup.add(iceInst);

      const iceLod1 = new THREE.InstancedMesh(shardGeo, iceMat, iceCount);
      iceLod1.instanceMatrix.array.set(iceInst.instanceMatrix.array);
      iceLod1.instanceMatrix.needsUpdate = true;
      iceLod1.computeBoundingSphere();
      disposables.push(iceLod1);
      lod1Landmarks.add(iceLod1);
      break;
    }

    case 'templo': {
      // Instanced ancient fluted columns + glowing torch braziers
      const colCount = Math.max(3, Math.round(6 * countScale));
      const stoneMat = new THREE.MeshStandardMaterial({ color: '#3b3532', roughness: 0.86, metalness: 0.06 });
      const shaftGeo = new THREE.CylinderGeometry(0.18, 0.22, 2.3, 12);
      const plinthGeo = new THREE.BoxGeometry(0.55, 0.2, 0.55);
      const capGeo = new THREE.BoxGeometry(0.52, 0.16, 0.52);
      const brazierBowlGeo = new THREE.CylinderGeometry(0.2, 0.1, 0.18, 10);
      const flameGeo = new THREE.OctahedronGeometry(0.12, 1);
      const flameMat = new THREE.MeshStandardMaterial({
        color: '#fbbf24',
        emissive: '#f97316',
        emissiveIntensity: 2.2,
      });

      const shaftInst = new THREE.InstancedMesh(shaftGeo, stoneMat, colCount);
      const plinthInst = new THREE.InstancedMesh(plinthGeo, stoneMat, colCount);
      const intactIndices: number[] = [];
      for (let i = 0; i < colCount; i++) {
        if (i % 3 !== 1) intactIndices.push(i);
      }
      const capInst = new THREE.InstancedMesh(capGeo, stoneMat, Math.max(1, intactIndices.length));
      disposables.push(
        stoneMat,
        shaftGeo,
        plinthGeo,
        capGeo,
        brazierBowlGeo,
        flameGeo,
        flameMat,
        shaftInst,
        plinthInst,
        capInst
      );

      let capCursor = 0;
      for (let i = 0; i < colCount; i++) {
        const a = -Math.PI * 0.88 + (i / Math.max(1, colCount - 1)) * Math.PI * 0.76 - 0.1;
        const r = 2.85 + (i % 2) * 0.35;
        const cx = Math.cos(a) * r;
        const cz = Math.sin(a) * r;
        const broken = i % 3 === 1;

        dummy.position.set(cx, 0.1, cz);
        dummy.rotation.set(0, a, broken ? 0.08 : 0);
        dummy.scale.setScalar(1);
        dummy.updateMatrix();
        plinthInst.setMatrixAt(i, dummy.matrix);

        dummy.position.set(cx, broken ? 0.75 : 1.25, cz);
        dummy.rotation.set(0, a, broken ? 0.08 : 0);
        dummy.scale.set(1, broken ? 0.58 : 1.0, 1);
        dummy.updateMatrix();
        shaftInst.setMatrixAt(i, dummy.matrix);

        if (!broken && capCursor < capInst.count) {
          dummy.position.set(cx, 2.45, cz);
          dummy.rotation.set(0, a, 0);
          dummy.scale.setScalar(1);
          dummy.updateMatrix();
          capInst.setMatrixAt(capCursor++, dummy.matrix);
        }
      }
      plinthInst.computeBoundingSphere();
      shaftInst.computeBoundingSphere();
      capInst.computeBoundingSphere();
      propsGroup.add(plinthInst, shaftInst, capInst);

      const shaftLod1 = new THREE.InstancedMesh(shaftGeo, stoneMat, colCount);
      shaftLod1.instanceMatrix.array.set(shaftInst.instanceMatrix.array);
      shaftLod1.instanceMatrix.needsUpdate = true;
      shaftLod1.computeBoundingSphere();
      disposables.push(shaftLod1);
      lod1Landmarks.add(shaftLod1);

      // 4 glowing perimeter braziers
      const brazierAngles = [-2.4, -0.75, 0.75, 2.4];
      brazierAngles.slice(0, Math.max(2, Math.round(4 * countScale))).forEach((a, idx) => {
        const r = 2.18;
        const bGrp = new THREE.Group();
        const ped = new THREE.Mesh(plinthGeo, stoneMat);
        ped.position.y = 0.1;
        ped.scale.set(0.6, 2.2, 0.6);
        const bowl = new THREE.Mesh(brazierBowlGeo, stoneMat);
        bowl.position.y = 0.36;
        const flame = new THREE.Mesh(flameGeo, flameMat);
        flame.position.y = 0.5;
        bGrp.add(ped, bowl, flame);
        bGrp.position.set(Math.cos(a) * r, 0, Math.sin(a) * r);
        propsGroup.add(bGrp);
        animatedItems.push({ obj: flame, mode: 'flicker', phase: idx * 1.7, basePos: flame.position.clone() });
      });
      break;
    }
  }

  return { propsGroup, lod1Landmarks, animatedItems };
}

export function buildNarrativeEnvironment(
  preset: NarrativeScenePreset,
  seed: number,
  archetype: ArchetypeId,
  units: number,
  propDensity: number,
  enableParticles: boolean,
  isSoftwareGl: boolean,
  qualityLevel: QualityLevel = 'high'
): BuiltNarrativeEnvironment {
  const quality = QUALITY_PRESETS[qualityLevel];
  const effectivePropDensity = propDensity * quality.propMultiplier;

  const root = new THREE.Group();
  root.name = 'NarrativeEnvironmentRoot';

  const disposables: Array<{ dispose: () => void }> = [];
  const timeUniform = { value: 0 };

  // Sky dome remains fixed at world scale around camera
  const skyDome = buildSkyDome(preset, timeUniform);
  disposables.push(skyDome.geometry, skyDome.material as THREE.Material);
  root.add(skyDome);

  // Scaled stage group matches creature size preset (base authoring scale = 1.5u medium creature)
  const stageScale = Math.max(0.06, units / 1.5);
  const stageGroup = new THREE.Group();
  stageGroup.name = 'NarrativeStageScaled';
  stageGroup.scale.setScalar(stageScale);
  root.add(stageGroup);

  const ground = buildGroundPlatform(preset, seed, archetype, effectivePropDensity, timeUniform, disposables);
  stageGroup.add(ground);

  const { propsGroup, lod1Landmarks, animatedItems } = buildSceneProps(
    preset,
    seed,
    archetype,
    effectivePropDensity,
    disposables
  );

  if (quality.lodEnabled) {
    const propsLod = new THREE.LOD();
    propsLod.name = 'PropsLOD';
    propsLod.addLevel(propsGroup, 0);
    propsLod.addLevel(lod1Landmarks, 8.5 * stageScale);
    propsLod.addLevel(new THREE.Group(), 19.0 * stageScale);
    stageGroup.add(propsLod);
  } else {
    stageGroup.add(propsGroup);
  }

  const godRaysGroup = buildGodRays(preset, disposables);
  if (godRaysGroup) {
    stageGroup.add(godRaysGroup);
  }

  const particleBundle = enableParticles
    ? buildParticles(preset, seed, quality.particleMultiplier, isSoftwareGl, disposables)
    : null;
  if (particleBundle) {
    stageGroup.add(particleBundle.points);
  }

  // Strictly enforce maxDynamicFillLights budget for the chosen quality tier
  const fillLights: THREE.PointLight[] = [];
  const allowedFillLights = preset.lighting.fillLights.slice(0, quality.maxDynamicFillLights);
  allowedFillLights.forEach((fl) => {
    const pt = new THREE.PointLight(
      fl.color,
      fl.intensity * stageScale,
      fl.distance * stageScale,
      1.6
    );
    pt.position.set(fl.position[0] * stageScale, fl.position[1] * stageScale, fl.position[2] * stageScale);
    pt.userData.baseIntensity = fl.intensity * stageScale;
    root.add(pt);
    fillLights.push(pt);
  });

  const update = (elapsed: number, delta: number, atmosphereIntensity: number) => {
    timeUniform.value = elapsed;

    // Update animated props (kelp sway, floating crystals, flickering flames)
    for (let i = 0; i < animatedItems.length; i++) {
      const item = animatedItems[i];
      if (item.mode === 'sway') {
        item.obj.rotation.z = Math.sin(elapsed * 1.15 + item.phase) * 0.05;
        item.obj.rotation.x = Math.cos(elapsed * 0.85 + item.phase) * 0.035;
      } else if (item.mode === 'float') {
        item.obj.position.y = item.basePos.y + Math.sin(elapsed * 1.1 + item.phase) * 0.14;
      } else if (item.mode === 'flicker') {
        const s = 0.85 + Math.sin(elapsed * 9.5 + item.phase) * 0.22 + Math.cos(elapsed * 14.3) * 0.1;
        item.obj.scale.set(0.95, s * 1.25, 0.95);
        item.obj.rotation.y = elapsed * 2.5;
      }
    }

    // Update volumetric god-ray intensity
    if (godRaysGroup) {
      const firstChild = godRaysGroup.children[0] as THREE.Mesh | undefined;
      const mat = firstChild?.material as THREE.ShaderMaterial | undefined;
      if (mat?.uniforms?.uIntensity) {
        mat.uniforms.uIntensity.value = preset.lighting.godRayIntensity * atmosphereIntensity;
      }
      godRaysGroup.visible = atmosphereIntensity > 0.04;
    }

    // Scale fill light intensity with atmosphereIntensity
    for (let i = 0; i < fillLights.length; i++) {
      const fl = fillLights[i];
      fl.intensity = (fl.userData.baseIntensity as number) * (0.35 + 0.65 * atmosphereIntensity);
    }

    // Update GPU-friendly particle buffer in-place (zero allocations)
    if (particleBundle) {
      const mat = particleBundle.points.material as THREE.PointsMaterial;
      mat.opacity = preset.particles.opacity * (0.25 + 0.75 * atmosphereIntensity);
      const posAttr = particleBundle.points.geometry.getAttribute('position') as THREE.BufferAttribute;
      const arr = posAttr.array as Float32Array;
      const vels = particleBundle.velocities;
      const phases = particleBundle.phases;
      const turb = preset.particles.turbulence;
      const count = phases.length;

      for (let i = 0; i < count; i++) {
        const ix = i * 3;
        const ph = phases[i];
        arr[ix] += (vels[ix] + Math.sin(elapsed * 1.3 + ph) * turb * 0.25) * delta;
        arr[ix + 1] += (vels[ix + 1] + Math.cos(elapsed * 0.9 + ph) * turb * 0.12) * delta;
        arr[ix + 2] += (vels[ix + 2] + Math.cos(elapsed * 1.1 + ph) * turb * 0.25) * delta;

        // Wrap particles cleanly inside volume
        if (arr[ix + 1] < 0.05) arr[ix + 1] = 4.2;
        if (arr[ix + 1] > 4.25) arr[ix + 1] = 0.08;
        if (arr[ix] > 5.5) arr[ix] = -5.5;
        if (arr[ix] < -5.5) arr[ix] = 5.5;
        if (arr[ix + 2] > 5.5) arr[ix + 2] = -5.5;
        if (arr[ix + 2] < -5.5) arr[ix + 2] = 5.5;
      }
      posAttr.needsUpdate = true;
    }
  };

  const dispose = () => {
    const unique = new Set(disposables);
    unique.forEach((d) => d.dispose());
  };

  return {
    group: root,
    sceneId: preset.id,
    godRaysGroup,
    particlesPoints: particleBundle?.points ?? null,
    update,
    dispose,
  };
}
