import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { SSAOPass } from 'three/examples/jsm/postprocessing/SSAOPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { ProceduralAmbientAudio } from './ambientAudio';
import { ENGINE_CONSTANTS, ENVIRONMENT_PRESETS, QUALITY_PRESETS, SIZE_PRESETS } from './constants';
import { AssembledCreature, assembleCreature } from './creatureAssembler';
import { buildCreatureCacheKey, clearAllCreatureCaches } from './creatureCache';
import { exportCreatureGLTF, exportCreatureOBJAndMTL } from './exporters';
import { BuiltNarrativeEnvironment, buildNarrativeEnvironment } from './narrativePropsBuilder';
import { applyCreaturePose } from './poses';
import { NARRATIVE_SCENES } from './scenePresets';
import {
  CreatureBuildStats,
  CreatureGenome,
  EditablePartId,
  EnvironmentPresetId,
  ExportReport,
  NarrativeScenePreset,
  QualityPresetConfig,
  SceneRenderSettings,
  TurntableReport,
} from './types';

function detectSoftwareWebGL(): boolean {
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
    if (!gl) return true;
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
    const gpu = String(gl.getParameter(param) || '');
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
  } catch {
    return false;
  }
}

function createContactShadowTexture(): THREE.CanvasTexture {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const grad = ctx.createRadialGradient(size / 2, size / 2, size * 0.05, size / 2, size / 2, size * 0.48);
  grad.addColorStop(0, 'rgba(0, 0, 0, 0.72)');
  grad.addColorStop(0.55, 'rgba(0, 0, 0, 0.25)');
  grad.addColorStop(1, 'rgba(0, 0, 0, 0.0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(canvas);
  tex.needsUpdate = true;
  return tex;
}

const NarrativePostShader = {
  uniforms: {
    tDiffuse: { value: null },
    uChromatic: { value: 0.0015 },
    uVignette: { value: 0.32 },
    uShadowTint: { value: new THREE.Color(0x001122) },
    uHighlightTint: { value: new THREE.Color(0xffffff) },
    uGradeIntensity: { value: 0.2 },
    uTransitionFade: { value: 1.0 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uChromatic;
    uniform float uVignette;
    uniform vec3 uShadowTint;
    uniform vec3 uHighlightTint;
    uniform float uGradeIntensity;
    uniform float uTransitionFade;
    varying vec2 vUv;

    void main() {
      vec2 centered = vUv - 0.5;
      float dist = length(centered);
      vec2 offset = centered * uChromatic * dist * 2.2;

      float r = texture2D(tDiffuse, vUv + offset).r;
      float g = texture2D(tDiffuse, vUv).g;
      float b = texture2D(tDiffuse, vUv - offset).b;
      float a = texture2D(tDiffuse, vUv).a;
      vec3 col = vec3(r, g, b);

      // Subtle shadow / highlight color grading
      float luma = dot(col, vec3(0.2126, 0.7152, 0.0722));
      vec3 shadowMix = mix(col, col * (0.65 + uShadowTint * 1.35), (1.0 - smoothstep(0.0, 0.45, luma)) * uGradeIntensity);
      vec3 graded = mix(shadowMix, shadowMix * (0.85 + uHighlightTint * 0.35), smoothstep(0.45, 1.0, luma) * uGradeIntensity);

      // Smooth vignette
      float vig = 1.0 - smoothstep(0.32, 0.92, dist) * uVignette;
      graded *= vig * uTransitionFade;

      gl_FragColor = vec4(graded, a);
    }
  `,
};

/**
 * Generates an interchangeable prefiltered HDRI PMREM environment map per narrative preset.
 */
function buildNarrativeHdriPMREM(
  renderer: THREE.WebGLRenderer,
  preset: NarrativeScenePreset
): THREE.WebGLRenderTarget {
  const baseEnv = ENVIRONMENT_PRESETS[preset.hdriBase as EnvironmentPresetId] ?? ENVIRONMENT_PRESETS.obsidian;
  const pmrem = new THREE.PMREMGenerator(renderer);
  pmrem.compileEquirectangularShader();

  const envScene = new THREE.Scene();
  const room = new RoomEnvironment();
  envScene.add(room);

  const domeGeo = new THREE.IcosahedronGeometry(28, 3);
  const domeMat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    uniforms: {
      uZenith: { value: new THREE.Color(preset.environment.skyZenith) },
      uHorizon: { value: new THREE.Color(preset.environment.skyHorizon) },
      uGround: { value: new THREE.Color(preset.environment.skyGround) },
    },
    vertexShader: `
      varying vec3 vWorldPos;
      void main() {
        vWorldPos = position;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform vec3 uZenith;
      uniform vec3 uHorizon;
      uniform vec3 uGround;
      varying vec3 vWorldPos;
      void main() {
        float h = normalize(vWorldPos).y;
        vec3 col = h >= 0.0
          ? mix(uHorizon, uZenith, pow(h, 0.65))
          : mix(uHorizon, uGround, pow(-h, 0.75));
        gl_FragColor = vec4(col * 1.45, 1.0);
      }
    `,
  });
  const domeMesh = new THREE.Mesh(domeGeo, domeMat);
  envScene.add(domeMesh);

  const keyPanelGeo = new THREE.PlaneGeometry(10, 7);
  const keyPanelMat = new THREE.MeshBasicMaterial({
    color: new THREE.Color(preset.lighting.keyColor).lerp(new THREE.Color(baseEnv.hdriSoftboxPrimary), 0.35).multiplyScalar(3.0),
    side: THREE.DoubleSide,
  });
  const keyPanel = new THREE.Mesh(keyPanelGeo, keyPanelMat);
  keyPanel.position.set(11, 10, 12);
  keyPanel.lookAt(0, 0, 0);
  envScene.add(keyPanel);

  const rimPanelGeo = new THREE.PlaneGeometry(12, 5);
  const rimPanelMat = new THREE.MeshBasicMaterial({
    color: new THREE.Color(preset.lighting.rimColor).multiplyScalar(2.6),
    side: THREE.DoubleSide,
  });
  const rimPanel = new THREE.Mesh(rimPanelGeo, rimPanelMat);
  rimPanel.position.set(-12, 6, -13);
  rimPanel.lookAt(0, 0, 0);
  envScene.add(rimPanel);

  const rt = pmrem.fromScene(envScene, 0.04);

  domeGeo.dispose();
  domeMat.dispose();
  keyPanelGeo.dispose();
  keyPanelMat.dispose();
  rimPanelGeo.dispose();
  rimPanelMat.dispose();
  room.dispose();
  pmrem.dispose();

  return rt;
}

export class CreatureSceneManager {
  private container: HTMLElement;
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private controls: OrbitControls;
  private isSoftwareGl: boolean;

  private ambientLight: THREE.AmbientLight;
  private keyLight: THREE.DirectionalLight;
  private hemiLight: THREE.HemisphereLight;
  private rimLight: THREE.DirectionalLight;
  private contactShadowMesh: THREE.Mesh;
  private envRT: THREE.WebGLRenderTarget;
  private narrativeEnv: BuiltNarrativeEnvironment | null = null;
  private ambientAudio = new ProceduralAmbientAudio();

  private composer: EffectComposer | null = null;
  private ssaoPass: SSAOPass | null = null;
  private bloomPass: UnrealBloomPass | null = null;
  private narrativePostPass: ShaderPass | null = null;

  private currentCreature: AssembledCreature | null = null;
  private currentGenome: CreatureGenome;
  private renderSettings: SceneRenderSettings;

  private clock = new THREE.Clock();
  private animPhaseTime = 0;
  private frameId = 0;
  private disposed = false;
  private galleryMode = false;

  // Turntable video recording state
  private turntableRec: {
    recorder: MediaRecorder;
    stream: MediaStream;
    chunks: Blob[];
    mimeType: string;
    durationSec: number;
    revolutions: number;
    animateCreature: boolean;
    startMs: number;
    startTheta: number;
    radiusXZ: number;
    camY: number;
    savedCamPos: THREE.Vector3;
    savedTarget: THREE.Vector3;
    savedAutoRotate: boolean;
    cancelled: boolean;
    onProgress: (pct: number, remainingSec: number) => void;
    onComplete: (report: TurntableReport) => void;
    onError: (msg: string) => void;
  } | null = null;

  // Smooth damped camera transition targets
  private desiredCamPos = new THREE.Vector3();
  private desiredTarget = new THREE.Vector3();
  private isTransitioningCam = false;

  // Smooth scene fade transition state
  private transitionAlpha = 1.0;
  private transitionPhase: 'idle' | 'fading_out' | 'fading_in' = 'idle';
  private pendingSceneRebuild = false;

  // Reusable math objects (zero GC in loop)
  private readonly _boxSize = new THREE.Vector3();
  private readonly _boxCenter = new THREE.Vector3();
  private readonly _raycaster = new THREE.Raycaster();
  private readonly _pointerNdc = new THREE.Vector2();
  private pointerDownXY: [number, number] | null = null;

  private onStatsCallback?: (stats: CreatureBuildStats) => void;
  private onContextLostCallback?: (lost: boolean) => void;
  private onSelectPartCallback?: (part: EditablePartId) => void;

  constructor(
    container: HTMLElement,
    initialGenome: CreatureGenome,
    initialSettings: SceneRenderSettings,
    callbacks?: {
      onStats?: (stats: CreatureBuildStats) => void;
      onContextLost?: (lost: boolean) => void;
      onSelectPart?: (part: EditablePartId) => void;
    }
  ) {
    this.container = container;
    this.currentGenome = initialGenome;
    this.renderSettings = initialSettings;
    this.onStatsCallback = callbacks?.onStats;
    this.onContextLostCallback = callbacks?.onContextLost;
    this.onSelectPartCallback = callbacks?.onSelectPart;

    this.isSoftwareGl = detectSoftwareWebGL();
    const initialQuality = QUALITY_PRESETS[initialSettings.qualityLevel ?? 'high'];

    this.renderer = new THREE.WebGLRenderer({
      antialias: !this.isSoftwareGl,
      alpha: true,
      powerPreference: 'high-performance',
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = initialSettings.exposure;
    this.renderer.setPixelRatio(
      this.isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, initialQuality.pixelRatioMax)
    );
    this.renderer.setSize(container.clientWidth || window.innerWidth, container.clientHeight || window.innerHeight);
    this.renderer.shadowMap.enabled = !this.isSoftwareGl && initialQuality.shadowsEnabled;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.domElement.style.display = 'block';
    this.renderer.domElement.style.width = '100%';
    this.renderer.domElement.style.height = '100%';

    container.appendChild(this.renderer.domElement);

    this.renderer.domElement.addEventListener('webglcontextlost', this.handleContextLost);
    this.renderer.domElement.addEventListener('webglcontextrestored', this.handleContextRestored);
    this.renderer.domElement.addEventListener('pointerdown', this.handlePointerDown);
    this.renderer.domElement.addEventListener('pointerup', this.handlePointerUp);

    this.scene = new THREE.Scene();

    const initialPreset = NARRATIVE_SCENES[initialSettings.narrativeScene];
    this.envRT = buildNarrativeHdriPMREM(this.renderer, initialPreset);
    this.scene.environment = this.envRT.texture;

    const width = container.clientWidth || window.innerWidth;
    const height = container.clientHeight || window.innerHeight;
    this.camera = new THREE.PerspectiveCamera(
      ENGINE_CONSTANTS.CAMERA_FOV_DEG,
      width / Math.max(1, height),
      0.01,
      200
    );

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = !this.isSoftwareGl;
    this.controls.dampingFactor = ENGINE_CONSTANTS.ORBIT_DAMPING_FACTOR;
    this.controls.maxPolarAngle = Math.PI * 0.495;
    this.controls.autoRotate = !this.isSoftwareGl && initialSettings.autoRotate;
    this.controls.autoRotateSpeed = 0.85;
    this.controls.addEventListener('start', () => {
      this.isTransitioningCam = false;
    });

    // Atmospheric + 3-Point Studio Lighting Rig
    this.ambientLight = new THREE.AmbientLight(initialPreset.lighting.ambientColor, initialPreset.lighting.ambientIntensity);
    this.scene.add(this.ambientLight);

    this.keyLight = new THREE.DirectionalLight(initialPreset.lighting.keyColor, initialPreset.lighting.keyIntensity);
    this.keyLight.position.set(...initialPreset.lighting.keyPosition);
    this.keyLight.castShadow = !this.isSoftwareGl && initialQuality.shadowsEnabled;
    this.keyLight.shadow.mapSize.set(initialQuality.shadowMapSize, initialQuality.shadowMapSize);
    this.keyLight.shadow.bias = ENGINE_CONSTANTS.SHADOW_BIAS;
    this.keyLight.shadow.normalBias = ENGINE_CONSTANTS.SHADOW_NORMAL_BIAS;
    this.scene.add(this.keyLight);
    this.scene.add(this.keyLight.target);

    this.hemiLight = new THREE.HemisphereLight(
      initialPreset.lighting.hemiSky,
      initialPreset.lighting.hemiGround,
      initialPreset.lighting.hemiIntensity
    );
    this.scene.add(this.hemiLight);

    this.rimLight = new THREE.DirectionalLight(initialPreset.lighting.rimColor, initialPreset.lighting.rimIntensity);
    this.rimLight.position.set(...initialPreset.lighting.rimPosition);
    this.scene.add(this.rimLight);

    const shadowPlaneGeo = new THREE.PlaneGeometry(2.6, 2.6);
    shadowPlaneGeo.rotateX(-Math.PI / 2);
    const shadowPlaneMat = new THREE.MeshBasicMaterial({
      map: createContactShadowTexture(),
      transparent: true,
      opacity: 0.65,
      depthWrite: false,
    });
    this.contactShadowMesh = new THREE.Mesh(shadowPlaneGeo, shadowPlaneMat);
    this.contactShadowMesh.position.y = 0.004;
    this.scene.add(this.contactShadowMesh);

    if (!this.isSoftwareGl) {
      this.initPostProcessing(width, height);
    }

    this.applyNarrativeScene(true);
    this.rebuildCreature(initialGenome, true);

    window.addEventListener('resize', this.handleResize);
    this.tick();
  }

  private initPostProcessing(width: number, height: number): void {
    this.composer = new EffectComposer(this.renderer);
    const renderPass = new RenderPass(this.scene, this.camera);
    this.composer.addPass(renderPass);

    this.ssaoPass = new SSAOPass(this.scene, this.camera, width, height);
    this.ssaoPass.kernelRadius = ENGINE_CONSTANTS.SSAO_KERNEL_RADIUS;
    this.ssaoPass.minDistance = ENGINE_CONSTANTS.SSAO_MIN_DISTANCE;
    this.ssaoPass.maxDistance = ENGINE_CONSTANTS.SSAO_MAX_DISTANCE;
    this.ssaoPass.enabled = this.renderSettings.enableSSAO;
    this.composer.addPass(this.ssaoPass);

    this.bloomPass = new UnrealBloomPass(
      new THREE.Vector2(width, height),
      this.renderSettings.bloomStrength,
      ENGINE_CONSTANTS.BLOOM_RADIUS,
      ENGINE_CONSTANTS.BLOOM_THRESHOLD
    );
    this.bloomPass.enabled = this.renderSettings.enableBloom;
    this.composer.addPass(this.bloomPass);

    this.narrativePostPass = new ShaderPass(NarrativePostShader);
    this.composer.addPass(this.narrativePostPass);

    const outputPass = new OutputPass();
    this.composer.addPass(outputPass);
  }

  private handleContextLost = (e: Event) => {
    e.preventDefault();
    cancelAnimationFrame(this.frameId);
    clearTimeout(this.frameId);
    this.onContextLostCallback?.(true);
  };

  private handleContextRestored = () => {
    this.onContextLostCallback?.(false);
    this.tick();
  };

  private handlePointerDown = (e: PointerEvent) => {
    this.pointerDownXY = [e.clientX, e.clientY];
  };

  private handlePointerUp = (e: PointerEvent) => {
    if (!this.pointerDownXY || !this.currentCreature || !this.onSelectPartCallback) return;
    const dx = e.clientX - this.pointerDownXY[0];
    const dy = e.clientY - this.pointerDownXY[1];
    this.pointerDownXY = null;
    if (dx * dx + dy * dy > 25) return; // Ignore orbit drags

    const rect = this.renderer.domElement.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;
    this._pointerNdc.set(
      ((e.clientX - rect.left) / rect.width) * 2 - 1,
      -((e.clientY - rect.top) / rect.height) * 2 + 1
    );
    this._raycaster.setFromCamera(this._pointerNdc, this.camera);
    const hits = this._raycaster.intersectObject(this.currentCreature.exportGroup, true);
    if (hits.length > 0) {
      let cur: THREE.Object3D | null = hits[0].object;
      while (cur) {
        const cat = cur.userData.partCategory as EditablePartId | undefined;
        if (cat) {
          this.onSelectPartCallback(cat);
          break;
        }
        cur = cur.parent;
      }
    }
  };

  private handleResize = () => {
    if (this.disposed) return;
    const width = this.container.clientWidth || window.innerWidth;
    const height = this.container.clientHeight || window.innerHeight;
    const quality = QUALITY_PRESETS[this.renderSettings.qualityLevel ?? 'high'];
    this.renderer.setPixelRatio(this.isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, quality.pixelRatioMax));
    this.camera.aspect = width / Math.max(1, height);
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
    if (this.composer) {
      this.composer.setSize(width, height);
    }
    if (this.ssaoPass) {
      this.ssaoPass.setSize(width, height);
    }
    if (this.bloomPass) {
      this.bloomPass.setSize(width, height);
    }
  };

  private syncPostProcessingState(): void {
    const quality = QUALITY_PRESETS[this.renderSettings.qualityLevel ?? 'high'];
    const allowPost = !this.isSoftwareGl && !this.galleryMode && quality.postFxAllowed;
    if (this.ssaoPass) {
      this.ssaoPass.enabled = allowPost && quality.ssaoAllowed && this.renderSettings.enableSSAO;
    }
    if (this.bloomPass) {
      this.bloomPass.enabled = allowPost && quality.bloomAllowed && this.renderSettings.enableBloom;
      this.bloomPass.strength = this.renderSettings.bloomStrength;
    }
  }

  private applyQualitySettings(quality: QualityPresetConfig): void {
    const width = this.container.clientWidth || window.innerWidth;
    const height = this.container.clientHeight || window.innerHeight;

    this.renderer.setPixelRatio(
      this.isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, quality.pixelRatioMax)
    );
    this.renderer.setSize(width, height);
    if (this.composer) {
      this.composer.setSize(width, height);
    }
    if (this.ssaoPass) {
      this.ssaoPass.setSize(width, height);
    }
    if (this.bloomPass) {
      this.bloomPass.setSize(width, height);
    }

    const shadowsOn = !this.isSoftwareGl && quality.shadowsEnabled;
    this.renderer.shadowMap.enabled = shadowsOn;
    this.keyLight.castShadow = shadowsOn;

    if (this.keyLight.shadow.mapSize.x !== quality.shadowMapSize) {
      this.keyLight.shadow.map?.dispose();
      this.keyLight.shadow.map = null;
      this.keyLight.shadow.mapSize.set(quality.shadowMapSize, quality.shadowMapSize);
    }

    this.syncPostProcessingState();
  }

  public setGalleryMode(active: boolean): void {
    if (this.galleryMode === active) return;
    this.galleryMode = active;
    this.syncPostProcessingState();

    if (active) {
      cancelAnimationFrame(this.frameId);
      clearTimeout(this.frameId);
    } else if (!this.disposed) {
      this.clock.getDelta();
      this.tick();
    }
  }

  private applyNarrativeScene(regenerateHdri: boolean): void {
    const preset = NARRATIVE_SCENES[this.renderSettings.narrativeScene];
    const units = SIZE_PRESETS[this.currentGenome.sizePreset].units;
    const stageScale = Math.max(0.06, units / 1.5);
    const atmo = this.renderSettings.atmosphereIntensity;
    const qualityLevel = this.renderSettings.qualityLevel ?? 'high';

    if (regenerateHdri) {
      this.envRT.dispose();
      this.envRT = buildNarrativeHdriPMREM(this.renderer, preset);
      this.scene.environment = this.envRT.texture;
    }

    if (this.renderSettings.useHdriBackground) {
      this.scene.background = this.envRT.texture;
      this.scene.backgroundBlurriness = 0.18;
      this.scene.backgroundIntensity = 0.85;
    } else {
      this.scene.background = null;
    }

    // Rebuild procedural sky + ground + props + particles + god rays, freeing GPU resources
    if (this.narrativeEnv) {
      this.scene.remove(this.narrativeEnv.group);
      this.narrativeEnv.dispose();
      this.narrativeEnv = null;
      this.renderer.renderLists.dispose();
    }

    this.narrativeEnv = buildNarrativeEnvironment(
      preset,
      this.currentGenome.seed,
      this.currentGenome.archetype,
      units,
      this.renderSettings.propDensity,
      this.renderSettings.enableParticles,
      this.isSoftwareGl,
      qualityLevel
    );
    this.scene.add(this.narrativeEnv.group);

    // Hide sky dome if user chose HDRI 360° background
    const skyDome = this.narrativeEnv.group.getObjectByName('NarrativeSkyDome');
    if (skyDome) {
      skyDome.visible = !this.renderSettings.useHdriBackground;
    }

    // Fog scaled cleanly by creature size and atmosphere slider
    const scaledFog = (preset.environment.fogDensity * (0.25 + 0.75 * atmo)) / Math.max(1, units * 0.45);
    this.scene.fog = new THREE.FogExp2(preset.environment.fogColor, scaledFog);

    // Sync lighting rig
    this.ambientLight.color.set(preset.lighting.ambientColor);
    this.ambientLight.intensity = preset.lighting.ambientIntensity * (0.7 + 0.4 * atmo);

    this.hemiLight.color.set(preset.lighting.hemiSky);
    this.hemiLight.groundColor.set(preset.lighting.hemiGround);
    this.hemiLight.intensity = preset.lighting.hemiIntensity;

    this.keyLight.color.set(preset.lighting.keyColor);
    this.keyLight.intensity = preset.lighting.keyIntensity;
    this.keyLight.position.set(
      preset.lighting.keyPosition[0] * stageScale,
      preset.lighting.keyPosition[1] * stageScale,
      preset.lighting.keyPosition[2] * stageScale
    );

    this.rimLight.color.set(preset.lighting.rimColor);
    this.rimLight.intensity = preset.lighting.rimIntensity;
    this.rimLight.position.set(
      preset.lighting.rimPosition[0] * stageScale,
      preset.lighting.rimPosition[1] * stageScale,
      preset.lighting.rimPosition[2] * stageScale
    );

    this.syncPostProcessingState();
    if (this.bloomPass) {
      this.bloomPass.threshold = preset.postProcessing.bloomThreshold;
      this.bloomPass.radius = preset.postProcessing.bloomRadius;
    }

    if (this.narrativePostPass) {
      const u = this.narrativePostPass.uniforms;
      u.uChromatic.value = this.renderSettings.chromaticAberration
        ? preset.postProcessing.chromaticAberration * (0.3 + 0.7 * atmo)
        : 0.0;
      u.uVignette.value = this.renderSettings.vignette
        ? preset.postProcessing.vignette * (0.35 + 0.65 * atmo)
        : 0.0;
      u.uShadowTint.value.set(preset.postProcessing.colorGrading.shadows);
      u.uHighlightTint.value.set(preset.postProcessing.colorGrading.highlights);
      u.uGradeIntensity.value = preset.postProcessing.colorGrading.intensity * atmo;
    }

    // Apply creature-environment coherence (e.g., boost bioluminescence in abyssal trench)
    this.applyCreatureCoherence(preset);
  }

  private applyCreatureCoherence(preset: NarrativeScenePreset): void {
    if (!this.currentCreature) return;
    const atmo = this.renderSettings.atmosphereIntensity;
    const coh = preset.creatureCoherence;
    const mats = this.currentCreature.materials;

    const targetMats = [mats.skinMaterial, mats.biolumMaterial, mats.irisMaterial, mats.membraneMaterial];
    targetMats.forEach((m) => {
      if (m.userData.baseEmissiveIntensity === undefined) {
        m.userData.baseEmissiveIntensity = m.emissiveIntensity;
        m.userData.baseEnvMapIntensity = m.envMapIntensity ?? 1.0;
        m.userData.baseClearcoat = m.clearcoat ?? 0.0;
      }
      const boost = 1.0 + (coh.emissiveBoost - 1.0) * atmo;
      m.emissiveIntensity = (m.userData.baseEmissiveIntensity as number) * boost;
      m.envMapIntensity =
        (m.userData.baseEnvMapIntensity as number) * (1.0 + (coh.envMapMultiplier - 1.0) * atmo);
      m.clearcoat = THREE.MathUtils.clamp(
        (m.userData.baseClearcoat as number) + coh.wetClearcoatBoost * atmo,
        0.0,
        1.0
      );
    });
  }

  public updateRenderSettings(next: SceneRenderSettings): void {
    const qualityChanged = next.qualityLevel !== this.renderSettings.qualityLevel;
    const sceneChanged = next.narrativeScene !== this.renderSettings.narrativeScene;
    const bgModeChanged = next.useHdriBackground !== this.renderSettings.useHdriBackground;
    const propOrParticlesChanged =
      next.propDensity !== this.renderSettings.propDensity ||
      next.enableParticles !== this.renderSettings.enableParticles;
    const atmoOrPostChanged =
      next.atmosphereIntensity !== this.renderSettings.atmosphereIntensity ||
      next.chromaticAberration !== this.renderSettings.chromaticAberration ||
      next.vignette !== this.renderSettings.vignette;

    this.renderSettings = next;

    this.ambientAudio.setState(next.narrativeScene, next.enableAmbientAudio);

    if (qualityChanged) {
      this.applyQualitySettings(QUALITY_PRESETS[next.qualityLevel ?? 'high']);
      this.rebuildCreature(this.currentGenome, false);
    }

    if (sceneChanged) {
      if (!this.isSoftwareGl && this.narrativePostPass && QUALITY_PRESETS[next.qualityLevel ?? 'high'].postFxAllowed) {
        this.transitionPhase = 'fading_out';
        this.pendingSceneRebuild = true;
      } else {
        this.applyNarrativeScene(true);
      }
    } else if (bgModeChanged || propOrParticlesChanged || qualityChanged) {
      this.applyNarrativeScene(false);
    } else if (atmoOrPostChanged) {
      const preset = NARRATIVE_SCENES[next.narrativeScene];
      const units = SIZE_PRESETS[this.currentGenome.sizePreset].units;
      const atmo = next.atmosphereIntensity;
      const scaledFog = (preset.environment.fogDensity * (0.25 + 0.75 * atmo)) / Math.max(1, units * 0.45);
      if (this.scene.fog instanceof THREE.FogExp2) {
        this.scene.fog.density = scaledFog;
      }
      this.ambientLight.intensity = preset.lighting.ambientIntensity * (0.7 + 0.4 * atmo);
      if (this.narrativePostPass) {
        const u = this.narrativePostPass.uniforms;
        u.uChromatic.value = next.chromaticAberration
          ? preset.postProcessing.chromaticAberration * (0.3 + 0.7 * atmo)
          : 0.0;
        u.uVignette.value = next.vignette ? preset.postProcessing.vignette * (0.35 + 0.65 * atmo) : 0.0;
        u.uGradeIntensity.value = preset.postProcessing.colorGrading.intensity * atmo;
      }
      this.applyCreatureCoherence(preset);
    }

    this.renderer.toneMappingExposure = next.exposure;
    this.syncPostProcessingState();
    this.controls.autoRotate = !this.isSoftwareGl && next.autoRotate;
    this.applyInspectionVisibility();
  }

  private applyInspectionVisibility(): void {
    if (!this.currentCreature) return;
    const parts = this.currentCreature.group.getObjectByName('PartsGroup');
    const slots = this.currentCreature.group.getObjectByName('SlotsVisualizer');
    if (parts) parts.visible = !this.renderSettings.isolateTorso;
    if (slots) slots.visible = this.renderSettings.showSlots;

    const wf = this.renderSettings.wireframe;
    const mats = this.currentCreature.materials;
    mats.skinMaterial.wireframe = wf;
    mats.carapaceMaterial.wireframe = wf;
    mats.membraneMaterial.wireframe = wf;
    mats.detailMaterial.wireframe = wf;
  }

  public rebuildCreature(genome: CreatureGenome, snapCamera = false): void {
    const qualityLevel = this.renderSettings.qualityLevel ?? 'high';
    const nextCacheKey = buildCreatureCacheKey(genome, qualityLevel);
    const prevCacheKey = buildCreatureCacheKey(this.currentGenome, qualityLevel);

    // If only pose or mutation locks changed, skip geometry rebuild so poses transition smoothly
    if (
      !snapCamera &&
      this.currentCreature &&
      nextCacheKey === prevCacheKey &&
      genome.sizePreset === this.currentGenome.sizePreset
    ) {
      this.currentGenome = genome;
      return;
    }

    const sizeChanged = genome.sizePreset !== this.currentGenome.sizePreset || snapCamera;
    const archetypeOrSeedChanged =
      genome.archetype !== this.currentGenome.archetype || genome.seed !== this.currentGenome.seed;
    this.currentGenome = genome;

    if (this.currentCreature) {
      this.scene.remove(this.currentCreature.group);
      this.currentCreature.dispose();
      this.currentCreature = null;
      this.renderer.renderLists.dispose();
    }

    const maxAniso = this.renderer.capabilities.getMaxAnisotropy();
    const assembled = assembleCreature(
      genome,
      maxAniso,
      this.isSoftwareGl,
      this.renderSettings.qualityLevel ?? 'high'
    );
    this.currentCreature = assembled;
    this.scene.add(assembled.group);

    assembled.bounds.getSize(this._boxSize);
    assembled.bounds.getCenter(this._boxCenter);
    const units = SIZE_PRESETS[genome.sizePreset].units;

    const shadowDiameter = Math.max(this._boxSize.x, this._boxSize.z, units * 0.65) * 1.45;
    this.contactShadowMesh.scale.set(shadowDiameter * 0.5, 1, shadowDiameter * 0.5);

    const d = units * 1.35;
    this.keyLight.target.position.copy(this._boxCenter);
    this.keyLight.shadow.camera.left = -d;
    this.keyLight.shadow.camera.right = d;
    this.keyLight.shadow.camera.top = d;
    this.keyLight.shadow.camera.bottom = -d;
    this.keyLight.shadow.camera.near = units * 0.2;
    this.keyLight.shadow.camera.far = units * 14;
    this.keyLight.shadow.camera.updateProjectionMatrix();

    const sizeCfg = SIZE_PRESETS[genome.sizePreset];
    this.controls.minDistance = sizeCfg.minDistance;
    this.controls.maxDistance = sizeCfg.maxDistance;
    this.camera.near = Math.max(0.005, sizeCfg.units * 0.02);
    this.camera.far = Math.max(70, sizeCfg.units * 45);
    this.camera.updateProjectionMatrix();

    if (this.ssaoPass) {
      const scaleFactor = sizeCfg.units / 1.5;
      this.ssaoPass.kernelRadius = ENGINE_CONSTANTS.SSAO_KERNEL_RADIUS * scaleFactor;
      this.ssaoPass.minDistance = ENGINE_CONSTANTS.SSAO_MIN_DISTANCE * scaleFactor;
      this.ssaoPass.maxDistance = ENGINE_CONSTANTS.SSAO_MAX_DISTANCE * scaleFactor;
    }

    if (sizeChanged || archetypeOrSeedChanged) {
      this.applyNarrativeScene(false);
    } else {
      this.applyCreatureCoherence(NARRATIVE_SCENES[this.renderSettings.narrativeScene]);
    }

    if (sizeChanged) {
      this.focusCameraOnCreature(snapCamera);
    }

    if (!this.isSoftwareGl) {
      this.renderer.compile(this.scene, this.camera);
    }

    this.applyInspectionVisibility();
    this.onStatsCallback?.(assembled.stats);
  }

  public focusCameraOnCreature(immediate = false): void {
    const sizeCfg = SIZE_PRESETS[this.currentGenome.sizePreset];
    const dist = sizeCfg.cameraDistance;
    const centerY = this.currentCreature ? this._boxCenter.y : sizeCfg.units * 0.4;

    this.desiredTarget.set(0, centerY, 0);
    this.desiredCamPos.set(dist * 0.68, centerY + dist * 0.34, dist * 0.85);

    if (immediate) {
      this.camera.position.copy(this.desiredCamPos);
      this.controls.target.copy(this.desiredTarget);
      this.controls.update();
      this.isTransitioningCam = false;
    } else {
      this.isTransitioningCam = true;
    }
  }

  public captureScreenshot(transparent: boolean): string {
    const prevBg = this.scene.background;
    const prevFog = this.scene.fog;
    const prevEnvVis = this.narrativeEnv?.group.visible ?? true;
    const prevShadowVis = this.contactShadowMesh.visible;

    if (transparent) {
      this.scene.background = null;
      this.scene.fog = null;
      if (this.narrativeEnv) this.narrativeEnv.group.visible = false;
      this.contactShadowMesh.visible = false;
      this.renderer.setClearColor(0x000000, 0);
      this.renderer.clear();
      this.renderer.render(this.scene, this.camera);
    } else {
      if (this.composer && !this.isSoftwareGl) {
        this.composer.render();
      } else {
        this.renderer.render(this.scene, this.camera);
      }
    }

    const dataUrl = this.renderer.domElement.toDataURL('image/png');

    if (transparent) {
      this.scene.background = prevBg;
      this.scene.fog = prevFog;
      if (this.narrativeEnv) this.narrativeEnv.group.visible = prevEnvVis;
      this.contactShadowMesh.visible = prevShadowVis;
    }

    return dataUrl;
  }

  public async exportGLTF(binary = true): Promise<ExportReport | null> {
    if (!this.currentCreature) return null;
    this.currentCreature.group.updateMatrixWorld(true);
    return exportCreatureGLTF(this.currentCreature.exportGroup, this.currentGenome, binary);
  }

  public exportOBJAndMTL(): ExportReport | null {
    if (!this.currentCreature) return null;
    this.currentCreature.group.updateMatrixWorld(true);
    return exportCreatureOBJAndMTL(this.currentCreature.exportGroup, this.currentGenome);
  }

  public startTurntableRecording(
    options: {
      durationSec: number;
      fps: number;
      revolutions: number;
      animateCreature: boolean;
    },
    callbacks: {
      onProgress: (pct: number, remainingSec: number) => void;
      onComplete: (report: TurntableReport) => void;
      onError: (msg: string) => void;
    }
  ): boolean {
    if (this.turntableRec) return false;
    const canvas = this.renderer.domElement as HTMLCanvasElement & {
      captureStream?: (fps?: number) => MediaStream;
    };
    if (typeof MediaRecorder === 'undefined' || typeof canvas.captureStream !== 'function') {
      callbacks.onError('El navegador actual no soporta captura MediaRecorder sobre WebGL.');
      return false;
    }

    const mimeCandidates = [
      'video/webm;codecs=vp9',
      'video/webm;codecs=vp8',
      'video/webm',
      'video/mp4',
    ];
    const chosenMime =
      mimeCandidates.find((m) => {
        try {
          return MediaRecorder.isTypeSupported(m);
        } catch {
          return false;
        }
      }) ?? '';

    try {
      const stream = canvas.captureStream(options.fps);
      const recorder = chosenMime
        ? new MediaRecorder(stream, { mimeType: chosenMime, videoBitsPerSecond: 6_000_000 })
        : new MediaRecorder(stream, { videoBitsPerSecond: 6_000_000 });

      const chunks: Blob[] = [];
      const savedCamPos = this.camera.position.clone();
      const savedTarget = this.controls.target.clone();
      const savedAutoRotate = this.controls.autoRotate;

      // Focus cleanly around creature center while preserving user distance & pitch
      const target = new THREE.Vector3(0, this.currentCreature ? this._boxCenter.y : savedTarget.y, 0);
      this.controls.target.copy(target);
      const dx = savedCamPos.x - target.x;
      const dz = savedCamPos.z - target.z;
      const radiusXZ = Math.max(0.25, Math.hypot(dx, dz));
      const startTheta = Math.atan2(dx, dz);

      this.isTransitioningCam = false;
      this.controls.enabled = false;
      this.controls.autoRotate = false;

      const recState = {
        recorder,
        stream,
        chunks,
        mimeType: recorder.mimeType || chosenMime || 'video/webm',
        durationSec: Math.max(2, options.durationSec),
        revolutions: Math.max(1, options.revolutions),
        animateCreature: options.animateCreature,
        startMs: performance.now(),
        startTheta,
        radiusXZ,
        camY: savedCamPos.y,
        savedCamPos,
        savedTarget,
        savedAutoRotate,
        cancelled: false,
        onProgress: callbacks.onProgress,
        onComplete: callbacks.onComplete,
        onError: callbacks.onError,
      };
      this.turntableRec = recState;

      recorder.ondataavailable = (ev) => {
        if (ev.data && ev.data.size > 0) {
          recState.chunks.push(ev.data);
        }
      };

      recorder.onerror = () => {
        this.cleanupTurntableState();
        recState.onError('Error interno durante la codificación del vídeo turntable.');
      };

      recorder.onstop = () => {
        const wasCancelled = recState.cancelled;
        const mime = recState.mimeType;
        const blob = new Blob(recState.chunks, { type: mime });
        this.cleanupTurntableState();

        if (wasCancelled) return;
        if (blob.size === 0) {
          recState.onError('El archivo de vídeo resultó vacío.');
          return;
        }

        const ext = mime.includes('mp4') ? 'mp4' : 'webm';
        const filename = `xenomorphia_turntable_${this.currentGenome.archetype}_${this.currentGenome.seed}.${ext}`;
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.setTimeout(() => URL.revokeObjectURL(url), 1500);

        recState.onComplete({
          filename,
          mimeType: mime,
          byteSize: blob.size,
          durationSec: recState.durationSec,
          revolutions: recState.revolutions,
          width: this.renderer.domElement.width,
          height: this.renderer.domElement.height,
        });
      };

      recorder.start(250);
      return true;
    } catch (err) {
      this.cleanupTurntableState();
      callbacks.onError(
        err instanceof Error ? err.message : 'No se pudo iniciar la grabación de vídeo.'
      );
      return false;
    }
  }

  public stopTurntableRecording(cancel = false): void {
    const rec = this.turntableRec;
    if (!rec) return;
    rec.cancelled = cancel;
    if (rec.recorder.state !== 'inactive') {
      rec.recorder.stop();
    } else {
      this.cleanupTurntableState();
    }
  }

  private cleanupTurntableState(): void {
    const rec = this.turntableRec;
    if (!rec) return;
    rec.stream.getTracks().forEach((t) => t.stop());
    this.camera.position.copy(rec.savedCamPos);
    this.controls.target.copy(rec.savedTarget);
    this.controls.enabled = true;
    this.controls.autoRotate = !this.isSoftwareGl && rec.savedAutoRotate;
    this.controls.update();
    this.turntableRec = null;
  }

  private afterDraw(cb: () => void): void {
    const gl = this.renderer.getContext() as WebGL2RenderingContext;
    if (!gl.fenceSync) {
      this.frameId = window.setTimeout(cb, 80);
      return;
    }
    const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
    gl.flush();
    const poll = () => {
      if (this.disposed) return;
      const state = sync && gl.getSyncParameter(sync, gl.SYNC_STATUS);
      if (state === gl.UNSIGNALED) {
        this.frameId = window.setTimeout(poll, 5);
      } else {
        if (sync) gl.deleteSync(sync);
        this.frameId = window.setTimeout(cb, 80);
      }
    };
    this.frameId = window.setTimeout(poll, 5);
  }

  private tick = (): void => {
    if (this.disposed || this.galleryMode) return;
    const delta = Math.min(0.1, this.clock.getDelta());
    const elapsed = this.clock.getElapsedTime();

    // Smooth fade transition between narrative scenes
    if (this.transitionPhase === 'fading_out') {
      this.transitionAlpha = Math.max(0.05, this.transitionAlpha - delta * 6.5);
      if (this.transitionAlpha <= 0.06 && this.pendingSceneRebuild) {
        this.pendingSceneRebuild = false;
        this.applyNarrativeScene(true);
        this.transitionPhase = 'fading_in';
      }
    } else if (this.transitionPhase === 'fading_in') {
      this.transitionAlpha = Math.min(1.0, this.transitionAlpha + delta * 5.2);
      if (this.transitionAlpha >= 0.999) {
        this.transitionAlpha = 1.0;
        this.transitionPhase = 'idle';
      }
    }

    if (this.narrativePostPass) {
      this.narrativePostPass.uniforms.uTransitionFade.value = this.transitionAlpha;
    }

    // Deterministic 360° camera orbit during Turntable Video Recording
    if (this.turntableRec) {
      const rec = this.turntableRec;
      const recElapsed = (performance.now() - rec.startMs) / 1000;
      const tNorm = Math.min(1, recElapsed / rec.durationSec);
      const theta = rec.startTheta + tNorm * rec.revolutions * Math.PI * 2;
      this.camera.position.set(
        this.controls.target.x + Math.sin(theta) * rec.radiusXZ,
        rec.camY,
        this.controls.target.z + Math.cos(theta) * rec.radiusXZ
      );
      this.camera.lookAt(this.controls.target);
      rec.onProgress(tNorm, Math.max(0, rec.durationSec - recElapsed));

      if (recElapsed >= rec.durationSec && rec.recorder.state === 'recording') {
        rec.recorder.stop();
      }
    } else if (this.isTransitioningCam) {
      // Smooth camera preset transitions
      const lam = ENGINE_CONSTANTS.CAMERA_DAMP_LAMBDA;
      this.camera.position.x = THREE.MathUtils.damp(this.camera.position.x, this.desiredCamPos.x, lam, delta);
      this.camera.position.y = THREE.MathUtils.damp(this.camera.position.y, this.desiredCamPos.y, lam, delta);
      this.camera.position.z = THREE.MathUtils.damp(this.camera.position.z, this.desiredCamPos.z, lam, delta);
      this.controls.target.x = THREE.MathUtils.damp(this.controls.target.x, this.desiredTarget.x, lam, delta);
      this.controls.target.y = THREE.MathUtils.damp(this.controls.target.y, this.desiredTarget.y, lam, delta);
      this.controls.target.z = THREE.MathUtils.damp(this.controls.target.z, this.desiredTarget.z, lam, delta);

      if (this.camera.position.distanceTo(this.desiredCamPos) < 0.004) {
        this.camera.position.copy(this.desiredCamPos);
        this.controls.target.copy(this.desiredTarget);
        this.isTransitioningCam = false;
      }
    }

    // Advance procedural biological phase clock unless paused (or frozen for turntable sculpture)
    const animMode = this.currentGenome.animationMode ?? 'auto';
    const animSpeed = this.currentGenome.animationSpeed ?? 1.0;
    const freezeTurntable = Boolean(this.turntableRec && !this.turntableRec.animateCreature);
    if (animMode !== 'paused' && !freezeTurntable) {
      this.animPhaseTime += delta * animSpeed;
    }

    // Subtle living biological breathing, shader pulse, and full procedural locomotion
    if (this.currentCreature) {
      this.currentCreature.materials.updateTime(this.animPhaseTime);
      applyCreaturePose(
        this.currentCreature.group,
        this.currentGenome.pose ?? 'neutral',
        this.animPhaseTime,
        delta,
        false,
        animMode,
        this.currentGenome.archetype,
        this.currentCreature.subMorphotype
      );
    }

    // Animate scene environment (sky aurora/caustics, particles, props, god-rays)
    if (this.narrativeEnv) {
      this.narrativeEnv.update(elapsed, delta, this.renderSettings.atmosphereIntensity);
    }

    if (!this.turntableRec) {
      this.controls.update();
    }

    const quality = QUALITY_PRESETS[this.renderSettings.qualityLevel ?? 'high'];
    const useComposer =
      Boolean(this.composer) && !this.isSoftwareGl && !this.galleryMode && quality.postFxAllowed;
    if (useComposer && this.composer) {
      this.composer.render();
    } else {
      this.renderer.render(this.scene, this.camera);
    }

    if (this.isSoftwareGl) {
      this.afterDraw(this.tick);
    } else {
      this.frameId = requestAnimationFrame(this.tick);
    }
  };

  public dispose(): void {
    this.disposed = true;
    if (this.turntableRec) {
      this.stopTurntableRecording(true);
    }
    cancelAnimationFrame(this.frameId);
    clearTimeout(this.frameId);
    window.removeEventListener('resize', this.handleResize);
    this.renderer.domElement.removeEventListener('webglcontextlost', this.handleContextLost);
    this.renderer.domElement.removeEventListener('webglcontextrestored', this.handleContextRestored);
    this.renderer.domElement.removeEventListener('pointerdown', this.handlePointerDown);
    this.renderer.domElement.removeEventListener('pointerup', this.handlePointerUp);

    this.ambientAudio.dispose();

    if (this.currentCreature) {
      this.currentCreature.dispose();
    }
    if (this.narrativeEnv) {
      this.narrativeEnv.dispose();
    }
    this.envRT.dispose();

    this.contactShadowMesh.geometry.dispose();
    const shadowMat = this.contactShadowMesh.material as THREE.MeshBasicMaterial;
    shadowMat.map?.dispose();
    shadowMat.dispose();

    this.controls.dispose();
    this.composer?.dispose();
    clearAllCreatureCaches();
    this.renderer.renderLists.dispose();
    this.renderer.dispose();
    if (this.renderer.domElement.parentNode === this.container) {
      this.container.removeChild(this.renderer.domElement);
    }
  }
}
