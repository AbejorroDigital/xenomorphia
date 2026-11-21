import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { ARCHETYPE_PROFILES } from './archetypes';
import { assembleCreature } from './creatureAssembler';
import { evaluateArchetypeDiversity, getSubMorphotypesForArchetype } from './subMorphotypes';
import {
  ArchetypeDiversityReport,
  ArchetypeId,
  BodyAxis,
  CreatureGenome,
  SymmetryMode,
} from './types';

export interface ExplorerSpecimen {
  index: number;
  seed: number;
  subMorphotypeId: string;
  subMorphotypeName: string;
  exampleTaxa: string;
  bodyAxis: BodyAxis;
  symmetry: SymmetryMode;
  limbSummary: string;
  triangles: number;
  thumbnailUrl: string;
  genome: CreatureGenome;
}

export interface ArchetypeExplorationResult {
  archetype: ArchetypeId;
  specimens: ExplorerSpecimen[];
  diversityReport: ArchetypeDiversityReport;
}

/**
 * Renders 10 distinct specimens of the active archetype using a single lightweight offscreen
 * WebGLRenderer + RoomEnvironment PMREM, then immediately disposes all GPU resources.
 * Ensures the 10-card gallery never exceeds browser WebGL context limits.
 */
export function renderArchetypeExplorerGallery(
  archetype: ArchetypeId,
  baseGenome: CreatureGenome
): ArchetypeExplorationResult {
  const width = 192;
  const height = 144;
  const subtypes = getSubMorphotypesForArchetype(archetype);
  const profile = ARCHETYPE_PROFILES[archetype];

  const renderer = new THREE.WebGLRenderer({
    antialias: false,
    alpha: true,
    preserveDrawingBuffer: true,
    powerPreference: 'default',
  });
  renderer.setPixelRatio(1);
  renderer.setSize(width, height, false);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.12;
  renderer.shadowMap.enabled = false;

  const pmrem = new THREE.PMREMGenerator(renderer);
  const room = new RoomEnvironment();
  const envRT = pmrem.fromScene(room, 0.04);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#0c121b');
  scene.environment = envRT.texture;

  const keyLight = new THREE.DirectionalLight(0xfff4e6, 2.1);
  keyLight.position.set(3.2, 4.4, 3.8);
  scene.add(keyLight);

  const hemiLight = new THREE.HemisphereLight(0x93c5fd, 0x1e293b, 0.85);
  scene.add(hemiLight);

  const rimLight = new THREE.DirectionalLight(0x38bdf8, 1.35);
  rimLight.position.set(-3.2, 2.5, -3.5);
  scene.add(rimLight);

  const camera = new THREE.PerspectiveCamera(40, width / height, 0.05, 50);

  const specimens: ExplorerSpecimen[] = [];
  const boxSize = new THREE.Vector3();
  const boxCenter = new THREE.Vector3();

  try {
    for (let i = 0; i < 10; i++) {
      // Showcase each distinct sub-morphotype first, then hybrid variations
      const sub = subtypes[i % subtypes.length];
      const seed = (baseGenome.seed + i * 14713 + 313) % 9999999;
      const specGenome: CreatureGenome = {
        ...baseGenome,
        seed,
        textureSeed: seed,
        archetype,
        subMorphotypeId: sub.id,
        morphVariation: i >= subtypes.length ? 0.48 : 0.08,
        symmetry: sub.symmetry,
        sizePreset: 'medium',
        detailDensity: Math.min(0.32, baseGenome.detailDensity),
        pose: 'neutral',
        animationMode: 'paused',
        animationSpeed: 1,
      };

      const assembled = assembleCreature(specGenome, 1, true, 'low', true);
      scene.add(assembled.group);

      assembled.bounds.getSize(boxSize);
      assembled.bounds.getCenter(boxCenter);
      const radius = Math.max(0.5, boxSize.length() * 0.52);

      // Vary framing angle slightly to emphasize 3D silhouette differences
      const angle = 0.55 + (i % 3) * 0.14;
      camera.position.set(
        boxCenter.x + Math.sin(angle) * radius * 2.25,
        boxCenter.y + radius * 0.58,
        boxCenter.z + Math.cos(angle) * radius * 2.25
      );
      camera.lookAt(boxCenter);

      renderer.render(scene, camera);
      const thumbnailUrl = renderer.domElement.toDataURL('image/png');

      specimens.push({
        index: i,
        seed,
        subMorphotypeId: sub.id,
        subMorphotypeName: sub.name,
        exampleTaxa: sub.exampleTaxa,
        bodyAxis: assembled.stats.bodyAxis,
        symmetry: sub.symmetry,
        limbSummary: assembled.stats.limbSummary,
        triangles: assembled.stats.triangles,
        thumbnailUrl,
        genome: {
          ...specGenome,
          detailDensity: baseGenome.detailDensity,
          sizePreset: baseGenome.sizePreset,
          symmetry: profile.defaultSymmetry,
        },
      });

      scene.remove(assembled.group);
      assembled.dispose();
      renderer.renderLists.dispose();
    }
  } finally {
    envRT.dispose();
    room.dispose();
    pmrem.dispose();
    renderer.dispose();
  }

  const diversityReport = evaluateArchetypeDiversity(archetype, baseGenome.seed, 50);

  return {
    archetype,
    specimens,
    diversityReport,
  };
}
