import * as THREE from 'three';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
import { OBJExporter } from 'three/examples/jsm/exporters/OBJExporter.js';
import { CreatureGenome, ExportReport } from './types';

function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.style.display = 'none';
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 250);
}

function sanitizeIdentifier(raw: string, fallback: string): string {
  const cleaned = (raw || fallback).replace(/[^a-zA-Z0-9_-]/g, '_');
  return cleaned.length > 0 ? cleaned : fallback;
}

interface ClonedExportScene {
  root: THREE.Group;
  meshCount: number;
  materialCount: number;
  embeddedMapsCount: number;
}

/**
 * Expands InstancedMesh nodes into standard Mesh nodes and skips invisible debug helpers
 * (e.g. SlotsVisualizer) so both glTF 2.0 and legacy Wavefront OBJ/MTL exports are clean
 * across all DCC tools (Blender, Maya, Three.js Editor).
 */
function buildExportableHierarchy(source: THREE.Object3D): ClonedExportScene {
  const exportGroup = new THREE.Group();
  exportGroup.name = sanitizeIdentifier(source.name, 'Xenomorphia_Creature');
  source.updateMatrixWorld(true);

  const mat4 = new THREE.Matrix4();
  const pos = new THREE.Vector3();
  const quat = new THREE.Quaternion();
  const scl = new THREE.Vector3();

  const uniqueMaterials = new Set<THREE.Material>();
  const uniqueTextures = new Set<THREE.Texture>();
  let meshCount = 0;

  const trackMaterial = (mat: THREE.Material | THREE.Material[]) => {
    const list = Array.isArray(mat) ? mat : [mat];
    list.forEach((m) => {
      if (!m) return;
      uniqueMaterials.add(m);
      const phys = m as THREE.MeshPhysicalMaterial;
      if (phys.map) uniqueTextures.add(phys.map);
      if (phys.normalMap) uniqueTextures.add(phys.normalMap);
      if (phys.roughnessMap) uniqueTextures.add(phys.roughnessMap);
      if (phys.aoMap) uniqueTextures.add(phys.aoMap);
      if (phys.emissiveMap) uniqueTextures.add(phys.emissiveMap);
    });
  };

  const visit = (node: THREE.Object3D) => {
    if (!node.visible || node.name === 'SlotsVisualizer') return;

    if ((node as THREE.InstancedMesh).isInstancedMesh) {
      const inst = node as THREE.InstancedMesh;
      const instGroup = new THREE.Group();
      instGroup.name = sanitizeIdentifier(inst.name, 'InstancedDetail');
      trackMaterial(inst.material);

      for (let i = 0; i < inst.count; i++) {
        inst.getMatrixAt(i, mat4);
        mat4.premultiply(inst.matrixWorld);
        mat4.decompose(pos, quat, scl);
        const m = new THREE.Mesh(inst.geometry, inst.material);
        m.name = `${instGroup.name}_${i}`;
        m.position.copy(pos);
        m.quaternion.copy(quat);
        m.scale.copy(scl);
        instGroup.add(m);
        meshCount++;
      }
      exportGroup.add(instGroup);
      return;
    }

    if ((node as THREE.Mesh).isMesh) {
      const mesh = node as THREE.Mesh;
      mesh.matrixWorld.decompose(pos, quat, scl);
      const cloned = new THREE.Mesh(mesh.geometry, mesh.material);
      cloned.name = sanitizeIdentifier(mesh.name, `Part_${meshCount}`);
      cloned.position.copy(pos);
      cloned.quaternion.copy(quat);
      cloned.scale.copy(scl);
      trackMaterial(mesh.material);
      exportGroup.add(cloned);
      meshCount++;
    }

    for (const child of node.children) {
      visit(child);
    }
  };

  visit(source);
  exportGroup.updateMatrixWorld(true);

  return {
    root: exportGroup,
    meshCount,
    materialCount: uniqueMaterials.size,
    embeddedMapsCount: uniqueTextures.size,
  };
}

/**
 * Primary Export (Prioritized): glTF 2.0 (.glb binary or .gltf JSON) preserving full PBR
 * material extensions (clearcoat, sheen, iridescence, transmission, IOR) and Canvas 2D maps
 * (Albedo, Tangent-Space Normal, Roughness, AO, Emissive, Eye Iris).
 */
export async function exportCreatureGLTF(
  creatureGroup: THREE.Group,
  genome: CreatureGenome,
  binary = true
): Promise<ExportReport> {
  const exporter = new GLTFExporter();
  const { root, meshCount, materialCount, embeddedMapsCount } = buildExportableHierarchy(creatureGroup);

  root.userData = {
    generator: 'Xenomorphia Procedural 3D',
    archetype: genome.archetype,
    seed: genome.seed,
    symmetry: genome.symmetry,
    sizePreset: genome.sizePreset,
  };

  const result = await exporter.parseAsync(root, {
    binary,
    onlyVisible: true,
    embedImages: true,
  });

  if (result instanceof ArrayBuffer) {
    const filename = `xenomorphia_${genome.archetype}_${genome.seed}.glb`;
    const blob = new Blob([result], { type: 'model/gltf-binary' });
    triggerDownload(blob, filename);
    return {
      format: 'glb',
      filename,
      byteSize: blob.size,
      meshCount,
      materialCount,
      embeddedMapsCount,
    };
  }

  const filename = `xenomorphia_${genome.archetype}_${genome.seed}.gltf`;
  const json = JSON.stringify(result, null, 2);
  const blob = new Blob([json], { type: 'model/gltf+json' });
  triggerDownload(blob, filename);
  return {
    format: 'gltf',
    filename,
    byteSize: blob.size,
    meshCount,
    materialCount,
    embeddedMapsCount,
  };
}

/**
 * Legacy Export: Wavefront OBJ geometry + companion MTL material library.
 * Note: OBJ/MTL does not support full PBR extensions (SSS, Clearcoat, Iridescence, Transmission);
 * use glTF 2.0 (.glb) whenever full PBR fidelity is required.
 */
export function exportCreatureOBJAndMTL(
  creatureGroup: THREE.Group,
  genome: CreatureGenome
): ExportReport {
  const { root, meshCount } = buildExportableHierarchy(creatureGroup);

  const matMap = new Map<string, THREE.MeshPhysicalMaterial>();
  let matCounter = 0;

  root.traverse((obj) => {
    if ((obj as THREE.Mesh).isMesh) {
      const mesh = obj as THREE.Mesh;
      const mat = mesh.material as THREE.MeshPhysicalMaterial;
      if (mat && !Array.isArray(mat)) {
        const safeName = sanitizeIdentifier(mat.name, `bio_mat_${++matCounter}`);
        mat.name = safeName;
        matMap.set(safeName, mat);
      }
    }
  });

  const baseName = `xenomorphia_${genome.archetype}_${genome.seed}`;
  const objFilename = `${baseName}.obj`;
  const mtlFilename = `${baseName}.mtl`;

  const objExporter = new OBJExporter();
  const rawObj = objExporter.parse(root);
  const objHeader = [
    `# Xenomorphia Procedural Creature Export (Legacy Wavefront OBJ)`,
    `# Archetype: ${genome.archetype} | Seed: ${genome.seed} | Symmetry: ${genome.symmetry}`,
    `# Recommended format for full PBR & embedded maps: glTF 2.0 (.glb)`,
    `mtllib ${mtlFilename}`,
    '',
  ].join('\n');
  const objPayload = `${objHeader}${rawObj}`;

  const mtlLines: string[] = [
    `# Xenomorphia Procedural Creature Material Library (Legacy MTL)`,
    `# Archetype: ${genome.archetype} | Seed: ${genome.seed}`,
    '',
  ];

  matMap.forEach((mat, name) => {
    const col = mat.color || new THREE.Color(0xcccccc);
    const em = mat.emissive || new THREE.Color(0x000000);
    const emScale = mat.emissiveIntensity ?? 1.0;
    const rough = mat.roughness ?? 0.5;
    const shininess = Math.max(8, Math.round((1 - rough) * 128));
    const spec = 0.22 + (1 - rough) * 0.55;
    const opacity = mat.opacity ?? 1.0;
    const ior = mat.ior ?? 1.45;

    mtlLines.push(`newmtl ${name}`);
    mtlLines.push(`Ka ${(col.r * 0.18).toFixed(4)} ${(col.g * 0.18).toFixed(4)} ${(col.b * 0.18).toFixed(4)}`);
    mtlLines.push(`Kd ${col.r.toFixed(4)} ${col.g.toFixed(4)} ${col.b.toFixed(4)}`);
    mtlLines.push(`Ks ${spec.toFixed(4)} ${spec.toFixed(4)} ${spec.toFixed(4)}`);
    mtlLines.push(
      `Ke ${(em.r * emScale).toFixed(4)} ${(em.g * emScale).toFixed(4)} ${(em.b * emScale).toFixed(4)}`
    );
    mtlLines.push(`Ns ${shininess}`);
    mtlLines.push(`Ni ${ior.toFixed(3)}`);
    mtlLines.push(`d ${opacity.toFixed(3)}`);
    if (opacity < 0.99) {
      mtlLines.push(`Tr ${(1 - opacity).toFixed(3)}`);
    }
    mtlLines.push(`illum 2`);
    mtlLines.push('');
  });

  const objBlob = new Blob([objPayload], { type: 'text/plain;charset=utf-8' });
  const mtlBlob = new Blob([mtlLines.join('\n')], { type: 'text/plain;charset=utf-8' });

  triggerDownload(objBlob, objFilename);
  setTimeout(() => {
    triggerDownload(mtlBlob, mtlFilename);
  }, 150);

  return {
    format: 'obj',
    filename: `${objFilename} + .mtl`,
    byteSize: objBlob.size + mtlBlob.size,
    meshCount,
    materialCount: matMap.size,
    embeddedMapsCount: 0,
  };
}
