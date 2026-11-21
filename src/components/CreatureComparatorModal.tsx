import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { ArrowLeftRight, GitMerge, Pin, Shuffle, Upload, X } from 'lucide-react';
import { ARCHETYPE_PROFILES } from '../engine/archetypes';
import { AssembledCreature, assembleCreature } from '../engine/creatureAssembler';
import { getRarityClassification, hybridizeGenomes } from '../engine/genomeMutation';
import { applyCreaturePose, POSE_PRESETS } from '../engine/poses';
import { CreatureGenome } from '../engine/types';

interface CreatureComparatorModalProps {
  open: boolean;
  currentGenome: CreatureGenome;
  specimenA: CreatureGenome;
  specimenB: CreatureGenome;
  onUpdateA: (g: CreatureGenome) => void;
  onUpdateB: (g: CreatureGenome) => void;
  onSwap: () => void;
  onRandomizeB: () => void;
  onLoadToViewport: (g: CreatureGenome) => void;
  onClose: () => void;
}

function detectSoftwareGl(): boolean {
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

export const CreatureComparatorModal: React.FC<CreatureComparatorModalProps> = ({
  open,
  currentGenome,
  specimenA,
  specimenB,
  onUpdateA,
  onUpdateB,
  onSwap,
  onRandomizeB,
  onLoadToViewport,
  onClose,
}) => {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const yawRef = useRef<number>(0.48);
  const pitchRef = useRef<number>(0.24);
  const draggingRef = useRef<{ x: number; y: number } | null>(null);

  const [syncTurn, setSyncTurn] = useState(true);
  const syncTurnRef = useRef(true);
  syncTurnRef.current = syncTurn;

  const [statsPair, setStatsPair] = useState<{
    a: AssembledCreature['stats'] | null;
    b: AssembledCreature['stats'] | null;
  }>({ a: null, b: null });

  useEffect(() => {
    if (!open) return;
    const container = mountRef.current;
    if (!container) return;

    const isSoftwareGl = detectSoftwareGl();
    const width = container.clientWidth || 920;
    const height = container.clientHeight || 340;

    const renderer = new THREE.WebGLRenderer({
      antialias: !isSoftwareGl,
      alpha: false,
      powerPreference: 'high-performance',
    });
    renderer.setPixelRatio(isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 1.5));
    renderer.setSize(width, height);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.1;
    renderer.setScissorTest(true);
    renderer.domElement.style.display = 'block';
    renderer.domElement.style.width = '100%';
    renderer.domElement.style.height = '100%';
    container.appendChild(renderer.domElement);

    const pmrem = new THREE.PMREMGenerator(renderer);
    const room = new RoomEnvironment();
    const envRT = pmrem.fromScene(room, 0.04);

    const buildHalfScene = (bgHex: string, rimHex: number) => {
      const scene = new THREE.Scene();
      scene.background = new THREE.Color(bgHex);
      scene.environment = envRT.texture;
      scene.add(new THREE.AmbientLight(0x94a3b8, 0.35));
      const key = new THREE.DirectionalLight(0xfff4e6, 2.2);
      key.position.set(3.2, 4.5, 4.0);
      scene.add(key);
      const hemi = new THREE.HemisphereLight(0x93c5fd, 0x1e293b, 0.85);
      scene.add(hemi);
      const rim = new THREE.DirectionalLight(rimHex, 1.45);
      rim.position.set(-3.4, 2.5, -3.5);
      scene.add(rim);

      const grid = new THREE.PolarGridHelper(1.8, 8, 4, 32, 0x1e293b, 0x16202e);
      grid.position.y = 0.002;
      scene.add(grid);

      const cam = new THREE.PerspectiveCamera(40, Math.max(1, width * 0.5) / Math.max(1, height), 0.05, 60);
      return { scene, cam };
    };

    const left = buildHalfScene('#0a1019', 0x2dd4bf);
    const right = buildHalfScene('#0d101b', 0x38bdf8);

    const normA = { ...specimenA, sizePreset: 'medium' as const };
    const normB = { ...specimenB, sizePreset: 'medium' as const };
    const builtA = assembleCreature(normA, 2, isSoftwareGl, 'medium', true);
    const builtB = assembleCreature(normB, 2, isSoftwareGl, 'medium', true);

    left.scene.add(builtA.group);
    right.scene.add(builtB.group);
    setStatsPair({ a: builtA.stats, b: builtB.stats });

    const centerA = new THREE.Vector3();
    const sizeA = new THREE.Vector3();
    builtA.bounds.getCenter(centerA);
    builtA.bounds.getSize(sizeA);

    const centerB = new THREE.Vector3();
    const sizeB = new THREE.Vector3();
    builtB.bounds.getCenter(centerB);
    builtB.bounds.getSize(sizeB);

    const sharedRadius = Math.max(sizeA.length(), sizeB.length(), 1.1) * 0.52;

    const handleResize = () => {
      const w = container.clientWidth || 920;
      const h = container.clientHeight || 340;
      renderer.setSize(w, h);
    };
    window.addEventListener('resize', handleResize);

    const clock = new THREE.Clock();
    let frameId = 0;
    let disposed = false;

    const afterDraw = (cb: () => void) => {
      const gl = renderer.getContext() as WebGL2RenderingContext;
      if (!gl.fenceSync) {
        frameId = window.setTimeout(cb, 80);
        return;
      }
      const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
      gl.flush();
      const poll = () => {
        if (disposed) return;
        const st = sync && gl.getSyncParameter(sync, gl.SYNC_STATUS);
        if (st === gl.UNSIGNALED) {
          frameId = window.setTimeout(poll, 5);
        } else {
          if (sync) gl.deleteSync(sync);
          frameId = window.setTimeout(cb, 80);
        }
      };
      frameId = window.setTimeout(poll, 5);
    };

    const tick = () => {
      if (disposed) return;
      const delta = Math.min(0.1, clock.getDelta());
      const elapsed = clock.getElapsedTime();

      if (syncTurnRef.current && !draggingRef.current) {
        yawRef.current += delta * 0.38;
      }

      const dist = sharedRadius * 2.45;
      const cy = Math.cos(pitchRef.current) * dist;
      const sy = Math.sin(pitchRef.current) * dist;
      const cx = Math.sin(yawRef.current) * cy;
      const cz = Math.cos(yawRef.current) * cy;

      left.cam.position.set(centerA.x + cx, centerA.y + sy, centerA.z + cz);
      left.cam.lookAt(centerA);

      right.cam.position.set(centerB.x + cx, centerB.y + sy, centerB.z + cz);
      right.cam.lookAt(centerB);

      builtA.materials.updateTime(elapsed);
      builtB.materials.updateTime(elapsed);
      applyCreaturePose(
        builtA.group,
        specimenA.pose ?? 'neutral',
        specimenA.animationMode === 'paused' ? 0 : elapsed * (specimenA.animationSpeed ?? 1),
        delta,
        false,
        specimenA.animationMode ?? 'auto',
        specimenA.archetype,
        builtA.subMorphotype
      );
      applyCreaturePose(
        builtB.group,
        specimenB.pose ?? 'neutral',
        specimenB.animationMode === 'paused' ? 0 : elapsed * (specimenB.animationSpeed ?? 1),
        delta,
        false,
        specimenB.animationMode ?? 'auto',
        specimenB.archetype,
        builtB.subMorphotype
      );

      const w = container.clientWidth || 920;
      const h = container.clientHeight || 340;
      const halfW = Math.floor(w * 0.5);

      left.cam.aspect = Math.max(1, halfW) / Math.max(1, h);
      left.cam.updateProjectionMatrix();
      renderer.setViewport(0, 0, halfW, h);
      renderer.setScissor(0, 0, halfW, h);
      renderer.render(left.scene, left.cam);

      const rightW = w - halfW;
      right.cam.aspect = Math.max(1, rightW) / Math.max(1, h);
      right.cam.updateProjectionMatrix();
      renderer.setViewport(halfW, 0, rightW, h);
      renderer.setScissor(halfW, 0, rightW, h);
      renderer.render(right.scene, right.cam);

      if (isSoftwareGl) {
        afterDraw(tick);
      } else {
        frameId = requestAnimationFrame(tick);
      }
    };

    tick();

    return () => {
      disposed = true;
      cancelAnimationFrame(frameId);
      clearTimeout(frameId);
      window.removeEventListener('resize', handleResize);
      builtA.dispose();
      builtB.dispose();
      envRT.dispose();
      room.dispose();
      pmrem.dispose();
      renderer.renderLists.dispose();
      renderer.dispose();
      if (renderer.domElement.parentNode === container) {
        container.removeChild(renderer.domElement);
      }
    };
  }, [open, specimenA, specimenB]);

  if (!open) return null;

  const profileA = ARCHETYPE_PROFILES[specimenA.archetype];
  const profileB = ARCHETYPE_PROFILES[specimenB.archetype];
  const rarA = getRarityClassification(specimenA.rarity ?? 0.15);
  const rarB = getRarityClassification(specimenB.rarity ?? 0.15);

  const metricRows: Array<{
    label: string;
    aVal: string;
    bVal: string;
    pctA?: number;
    pctB?: number;
  }> = [
    {
      label: 'Arquetipo y Plan',
      aVal: `${profileA.name} · ${statsPair.a?.subMorphotypeName ?? '—'}`,
      bVal: `${profileB.name} · ${statsPair.b?.subMorphotypeName ?? '—'}`,
    },
    {
      label: 'Extremidades',
      aVal: statsPair.a?.limbSummary ?? '—',
      bVal: statsPair.b?.limbSummary ?? '—',
    },
    {
      label: 'Simetría / Pose',
      aVal: `${specimenA.symmetry} · ${POSE_PRESETS[specimenA.pose ?? 'neutral'].label}`,
      bVal: `${specimenB.symmetry} · ${POSE_PRESETS[specimenB.pose ?? 'neutral'].label}`,
    },
    {
      label: 'Rareza / Anomalía',
      aVal: `${rarA.label} (${Math.round((specimenA.rarity ?? 0) * 100)}%)`,
      bVal: `${rarB.label} (${Math.round((specimenB.rarity ?? 0) * 100)}%)`,
      pctA: (specimenA.rarity ?? 0) * 100,
      pctB: (specimenB.rarity ?? 0) * 100,
    },
    {
      label: 'Vértices / Triángulos',
      aVal: statsPair.a
        ? `${statsPair.a.vertices.toLocaleString('es-ES')} v · ${statsPair.a.triangles.toLocaleString('es-ES')} t`
        : '—',
      bVal: statsPair.b
        ? `${statsPair.b.vertices.toLocaleString('es-ES')} v · ${statsPair.b.triangles.toLocaleString('es-ES')} t`
        : '—',
    },
    {
      label: 'Grosor Corporal',
      aVal: `${specimenA.thickness.toFixed(2)}×`,
      bVal: `${specimenB.thickness.toFixed(2)}×`,
      pctA: ((specimenA.thickness - 0.5) / 1.1) * 100,
      pctB: ((specimenB.thickness - 0.5) / 1.1) * 100,
    },
    {
      label: 'Longitud Axial',
      aVal: `${specimenA.length.toFixed(2)}×`,
      bVal: `${specimenB.length.toFixed(2)}×`,
      pctA: ((specimenA.length - 0.6) / 1.1) * 100,
      pctB: ((specimenB.length - 0.6) / 1.1) * 100,
    },
    {
      label: 'Complejidad Extremidades',
      aVal: `${Math.round(specimenA.limbComplexity * 100)}%`,
      bVal: `${Math.round(specimenB.limbComplexity * 100)}%`,
      pctA: specimenA.limbComplexity * 100,
      pctB: specimenB.limbComplexity * 100,
    },
  ];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/82 p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Comparador de Criaturas"
    >
      <div className="w-full max-w-6xl max-h-[92vh] flex flex-col rounded-xl bg-[#0b1018] border border-white/12 shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 border-b border-white/10">
          <div>
            <h2 className="font-display text-base font-semibold text-slate-100">
              Comparador Morfológico de Criaturas
            </h2>
            <p className="text-xs text-slate-400">
              Inspección 3D sincronizada lado a lado. Arrastra sobre el visor para rotar ambos especímenes simultáneamente.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setSyncTurn((s) => !s)}
              className={`px-2.5 py-1.5 rounded-md text-xs font-medium border transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                syncTurn
                  ? 'bg-teal-500/20 text-teal-300 border-teal-400/40'
                  : 'bg-[#131924] text-slate-300 border-white/10'
              }`}
            >
              Giro Auto: {syncTurn ? 'ON' : 'OFF'}
            </button>
            <button
              type="button"
              onClick={onSwap}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium bg-[#131924] hover:bg-white/10 text-slate-200 border border-white/10 whitespace-nowrap shrink-0 cursor-pointer"
            >
              <ArrowLeftRight className="w-3.5 h-3.5 text-teal-400" />
              <span>Intercambiar A ↔ B</span>
            </button>
            <button
              type="button"
              onClick={() => {
                const hybrid = hybridizeGenomes(specimenA, specimenB);
                onLoadToViewport(hybrid);
                onClose();
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold bg-teal-500 text-slate-950 hover:bg-teal-400 whitespace-nowrap shrink-0 cursor-pointer"
            >
              <GitMerge className="w-3.5 h-3.5" />
              <span>Hibridar A × B al Visor</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label="Cerrar comparador"
              className="p-1.5 rounded-md text-slate-400 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Split-screen 3D Viewport */}
        <div className="relative h-72 sm:h-80 w-full border-b border-white/10 select-none">
          <div
            ref={mountRef}
            onPointerDown={(e) => {
              draggingRef.current = { x: e.clientX, y: e.clientY };
            }}
            onPointerMove={(e) => {
              if (!draggingRef.current) return;
              const dx = e.clientX - draggingRef.current.x;
              const dy = e.clientY - draggingRef.current.y;
              draggingRef.current = { x: e.clientX, y: e.clientY };
              yawRef.current -= dx * 0.01;
              pitchRef.current = THREE.MathUtils.clamp(pitchRef.current + dy * 0.008, -0.2, 1.05);
            }}
            onPointerUp={() => {
              draggingRef.current = null;
            }}
            onPointerLeave={() => {
              draggingRef.current = null;
            }}
            className="w-full h-full cursor-grab active:cursor-grabbing"
          />
          <div className="pointer-events-none absolute inset-y-0 left-1/2 w-px bg-white/15" />

          {/* Left Slot Controls (A) */}
          <div className="absolute top-3 left-4 right-[52%] flex flex-wrap items-center justify-between gap-2 pointer-events-none">
            <div className="text-xs font-medium text-slate-100">
              Espécimen A <span className="text-slate-400 font-mono-tabular">· #{specimenA.seed}</span>
            </div>
            <div className="flex items-center gap-1.5 pointer-events-auto">
              <button
                type="button"
                onClick={() => onUpdateA(currentGenome)}
                className="flex items-center gap-1 px-2 py-1 rounded text-[11px] font-medium bg-[#0e1522]/95 hover:bg-[#162033] text-slate-200 border border-white/12 whitespace-nowrap cursor-pointer"
              >
                <Pin className="w-3 h-3 text-teal-400" />
                <span>Fijar actual</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  onLoadToViewport(specimenA);
                  onClose();
                }}
                className="flex items-center gap-1 px-2 py-1 rounded text-[11px] font-medium bg-[#0e1522]/95 hover:bg-[#162033] text-teal-300 border border-teal-400/30 whitespace-nowrap cursor-pointer"
              >
                <Upload className="w-3 h-3" />
                <span>Cargar</span>
              </button>
            </div>
          </div>

          {/* Right Slot Controls (B) */}
          <div className="absolute top-3 left-[52%] right-4 flex flex-wrap items-center justify-between gap-2 pointer-events-none">
            <div className="text-xs font-medium text-slate-100">
              Espécimen B <span className="text-slate-400 font-mono-tabular">· #{specimenB.seed}</span>
            </div>
            <div className="flex items-center gap-1.5 pointer-events-auto">
              <button
                type="button"
                onClick={() => onUpdateB(currentGenome)}
                className="flex items-center gap-1 px-2 py-1 rounded text-[11px] font-medium bg-[#0e1522]/95 hover:bg-[#162033] text-slate-200 border border-white/12 whitespace-nowrap cursor-pointer"
              >
                <Pin className="w-3 h-3 text-sky-400" />
                <span>Fijar actual</span>
              </button>
              <button
                type="button"
                onClick={onRandomizeB}
                className="flex items-center gap-1 px-2 py-1 rounded text-[11px] font-medium bg-[#0e1522]/95 hover:bg-[#162033] text-slate-200 border border-white/12 whitespace-nowrap cursor-pointer"
              >
                <Shuffle className="w-3 h-3 text-sky-400" />
                <span>Nuevo B</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  onLoadToViewport(specimenB);
                  onClose();
                }}
                className="flex items-center gap-1 px-2 py-1 rounded text-[11px] font-medium bg-[#0e1522]/95 hover:bg-[#162033] text-sky-300 border border-sky-400/30 whitespace-nowrap cursor-pointer"
              >
                <Upload className="w-3 h-3" />
                <span>Cargar</span>
              </button>
            </div>
          </div>
        </div>

        {/* Comparative Telemetry Matrix */}
        <div className="flex-1 overflow-y-auto px-5 py-3">
          <div className="divide-y divide-white/8 text-xs">
            {metricRows.map((row) => (
              <div
                key={row.label}
                className="grid grid-cols-1 md:grid-cols-12 gap-2 py-2 items-center"
              >
                <div className="md:col-span-5 text-left md:text-right font-mono-tabular text-slate-200 space-y-1">
                  <div>{row.aVal}</div>
                  {row.pctA !== undefined && (
                    <div className="h-1 w-full bg-white/8 rounded overflow-hidden flex justify-end">
                      <div
                        className="h-full bg-teal-400"
                        style={{ width: `${Math.max(4, Math.min(100, row.pctA))}%` }}
                      />
                    </div>
                  )}
                </div>

                <div className="md:col-span-2 text-center text-[11px] text-slate-400 font-medium">
                  {row.label}
                </div>

                <div className="md:col-span-5 text-left font-mono-tabular text-slate-200 space-y-1">
                  <div>{row.bVal}</div>
                  {row.pctB !== undefined && (
                    <div className="h-1 w-full bg-white/8 rounded overflow-hidden">
                      <div
                        className="h-full bg-sky-400"
                        style={{ width: `${Math.max(4, Math.min(100, row.pctB))}%` }}
                      />
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
