import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { buildNarrativeEnvironment } from './narrativePropsBuilder';
import { NARRATIVE_SCENE_LIST } from './scenePresets';
import { NarrativeSceneId } from './types';

let cachedThumbnails: Record<NarrativeSceneId, string> | null = null;

/**
 * Generates and caches 240x150 3D environment thumbnails for all 8 narrative scenes
 * using a single disposable offscreen WebGLRenderer (no creature mesh, avoiding clutter).
 */
export function renderAllSceneThumbnails(): Record<NarrativeSceneId, string> {
  if (cachedThumbnails) return cachedThumbnails;

  const width = 160;
  const height = 100;
  const renderer = new THREE.WebGLRenderer({
    antialias: false,
    alpha: false,
    powerPreference: 'default',
    preserveDrawingBuffer: true,
  });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;
  renderer.setPixelRatio(1);
  renderer.setSize(width, height, false);

  const pmrem = new THREE.PMREMGenerator(renderer);
  const room = new RoomEnvironment();
  const envRT = pmrem.fromScene(room, 0.04);

  const result = {} as Record<NarrativeSceneId, string>;

  try {
    const camera = new THREE.PerspectiveCamera(44, width / height, 0.1, 100);
    camera.position.set(2.4, 1.85, 3.8);
    camera.lookAt(0, 0.65, 0);

    for (const preset of NARRATIVE_SCENE_LIST) {
      const scene = new THREE.Scene();
      scene.environment = envRT.texture;
      scene.fog = new THREE.FogExp2(preset.environment.fogColor, preset.environment.fogDensity);

      const hemi = new THREE.HemisphereLight(
        preset.lighting.hemiSky,
        preset.lighting.hemiGround,
        preset.lighting.hemiIntensity * 1.1
      );
      const key = new THREE.DirectionalLight(preset.lighting.keyColor, preset.lighting.keyIntensity);
      key.position.set(...preset.lighting.keyPosition);
      scene.add(hemi, key);

      const env = buildNarrativeEnvironment(preset, 48291, 'alien', 1.5, 0.8, true, true, 'low');
      env.update(1.4, 0.016, 1.0);
      scene.add(env.group);

      renderer.render(scene, camera);
      result[preset.id] = renderer.domElement.toDataURL('image/png');

      scene.remove(env.group);
      env.dispose();
      renderer.renderLists.dispose();
    }

    cachedThumbnails = result;
  } finally {
    envRT.dispose();
    room.dispose();
    pmrem.dispose();
    renderer.dispose();
  }

  return result;
}
