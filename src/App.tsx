import { useCallback, useEffect, useRef, useState } from 'react';
import GUI from 'lil-gui';
import { ARCHETYPE_PROFILES } from './engine/archetypes';
import { ENGINE_CONSTANTS, SIZE_PRESETS } from './engine/constants';
import {
  ArchetypeExplorationResult,
  ExplorerSpecimen,
  renderArchetypeExplorerGallery,
} from './engine/explorerRenderer';
import {
  DEFAULT_MUTATION_LOCKS,
  DEFAULT_PART_EDITS,
  getRarityClassification,
  mutateCreatureGenome,
} from './engine/genomeMutation';
import { ANIMATION_MODE_LIST, POSE_PRESET_LIST } from './engine/poses';
import { CreatureSceneManager } from './engine/sceneManager';
import { NARRATIVE_SCENES, NARRATIVE_SCENE_LIST, selectSceneForCreature } from './engine/scenePresets';
import { getSubMorphotypesForArchetype } from './engine/subMorphotypes';
import {
  AnimationModeId,
  ArchetypeId,
  CreatureBuildStats,
  CreatureGenome,
  EditablePartId,
  ExportReport,
  NarrativeSceneId,
  PosePresetId,
  QualityLevel,
  SceneRenderSettings,
  SizePresetId,
  SymmetryMode,
  TurntableReport,
} from './engine/types';
import {
  buildShareableCreatureUrl,
  parseSharedCreatureFromWindowUrl,
  parseSharedCreatureInput,
} from './engine/urlShare';
import { ArchetypeExplorerModal } from './components/ArchetypeExplorerModal';
import { ControlDock } from './components/ControlDock';
import { CreatureComparatorModal } from './components/CreatureComparatorModal';

const BASE_DEFAULT_GENOME: CreatureGenome = {
  seed: ENGINE_CONSTANTS.DEFAULT_SEED,
  textureSeed: ENGINE_CONSTANTS.DEFAULT_SEED,
  archetype: 'alien',
  subMorphotypeId: 'auto',
  morphVariation: 0.15,
  rarity: 0.18,
  pose: 'neutral',
  animationMode: 'auto',
  animationSpeed: 1.0,
  symmetry: 'bilateral',
  sizePreset: 'medium',
  thickness: 1.0,
  length: 1.05,
  asymmetry: 0.12,
  detailDensity: 0.65,
  eyeScale: 1.05,
  limbComplexity: 0.72,
  displacementAmp: 0.045,
  partEdits: { ...DEFAULT_PART_EDITS },
  locks: { ...DEFAULT_MUTATION_LOCKS },
};

const INITIAL_SHARED = parseSharedCreatureFromWindowUrl(BASE_DEFAULT_GENOME);
const INITIAL_GENOME: CreatureGenome = INITIAL_SHARED?.genome ?? BASE_DEFAULT_GENOME;

const INITIAL_SCENE_ID: NarrativeSceneId =
  INITIAL_SHARED?.narrativeScene ?? selectSceneForCreature(INITIAL_GENOME.archetype, INITIAL_GENOME.seed);

const INITIAL_RENDER_SETTINGS: SceneRenderSettings = {
  qualityLevel: 'high',
  environment: NARRATIVE_SCENES[INITIAL_SCENE_ID].hdriBase,
  narrativeScene: INITIAL_SCENE_ID,
  autoMatchScene: INITIAL_SHARED?.autoMatchScene ?? true,
  propDensity: 0.8,
  atmosphereIntensity: 0.85,
  enableParticles: true,
  chromaticAberration: true,
  vignette: true,
  enableAmbientAudio: false,
  useHdriBackground: false,
  enableSSAO: true,
  enableBloom: true,
  bloomStrength: NARRATIVE_SCENES[INITIAL_SCENE_ID].postProcessing.bloomStrength,
  exposure: ENGINE_CONSTANTS.TONE_MAPPING_EXPOSURE,
  transparentScreenshot: false,
  autoRotate: false,
  showSlots: false,
  isolateTorso: false,
  wireframe: false,
};

export default function App() {
  const canvasMountRef = useRef<HTMLDivElement | null>(null);
  const managerRef = useRef<CreatureSceneManager | null>(null);
  const guiRef = useRef<GUI | null>(null);

  const [genome, setGenome] = useState<CreatureGenome>(INITIAL_GENOME);
  const [renderSettings, setRenderSettings] = useState<SceneRenderSettings>(INITIAL_RENDER_SETTINGS);
  const [stats, setStats] = useState<CreatureBuildStats | null>(null);
  const [collapsed, setCollapsed] = useState(false);
  const [lilGuiOpen, setLilGuiOpen] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [lastExport, setLastExport] = useState<ExportReport | null>(null);
  const [isRecordingTurntable, setIsRecordingTurntable] = useState(false);
  const [turntableProgress, setTurntableProgress] = useState(0);
  const [turntableError, setTurntableError] = useState<string | null>(null);
  const [lastTurntable, setLastTurntable] = useState<TurntableReport | null>(null);
  const [shareFeedback, setShareFeedback] = useState<{ url: string; copied: boolean } | null>(null);
  const [contextLost, setContextLost] = useState(false);

  // Part editor 3D click sync & Comparator modal state
  const [requestedPartFocus, setRequestedPartFocus] = useState<{
    part: EditablePartId;
    seq: number;
  } | null>(null);
  const [comparatorOpen, setComparatorOpen] = useState(false);
  const [comparatorA, setComparatorA] = useState<CreatureGenome>(INITIAL_GENOME);
  const [comparatorB, setComparatorB] = useState<CreatureGenome>(() =>
    mutateCreatureGenome(INITIAL_GENOME, false)
  );

  // Archetype 10-specimen exploration modal state
  const [explorerOpen, setExplorerOpen] = useState(false);
  const [explorerLoading, setExplorerLoading] = useState(false);
  const [explorerResult, setExplorerResult] = useState<ArchetypeExplorationResult | null>(null);

  useEffect(() => {
    const mount = canvasMountRef.current;
    if (!mount) return;

    const manager = new CreatureSceneManager(mount, INITIAL_GENOME, INITIAL_RENDER_SETTINGS, {
      onStats: (s) => setStats(s),
      onContextLost: (lost) => setContextLost(lost),
      onSelectPart: (part) => {
        setCollapsed(false);
        setRequestedPartFocus((prev) => ({ part, seq: (prev?.seq ?? 0) + 1 }));
      },
    });
    managerRef.current = manager;

    return () => {
      manager.dispose();
      managerRef.current = null;
    };
  }, []);

  useEffect(() => {
    managerRef.current?.rebuildCreature(genome, false);
  }, [genome]);

  useEffect(() => {
    if (!renderSettings.autoMatchScene) return;
    const matched = selectSceneForCreature(genome.archetype, genome.seed);
    if (matched !== renderSettings.narrativeScene) {
      const preset = NARRATIVE_SCENES[matched];
      setRenderSettings((prev) => ({
        ...prev,
        narrativeScene: matched,
        environment: preset.hdriBase,
        bloomStrength: preset.postProcessing.bloomStrength,
      }));
    }
  }, [genome.archetype, genome.seed, renderSettings.autoMatchScene, renderSettings.narrativeScene]);

  useEffect(() => {
    managerRef.current?.updateRenderSettings(renderSettings);
  }, [renderSettings]);

  useEffect(() => {
    managerRef.current?.setGalleryMode(explorerOpen || comparatorOpen);
  }, [explorerOpen, comparatorOpen]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (
        (e.key === 'h' || e.key === 'H') &&
        document.activeElement?.tagName !== 'INPUT' &&
        document.activeElement?.tagName !== 'SELECT'
      ) {
        setCollapsed((prev) => !prev);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  useEffect(() => {
    if (!lilGuiOpen) {
      guiRef.current?.destroy();
      guiRef.current = null;
      return;
    }

    const gui = new GUI({ title: 'Inspector Bio-Procedural' });
    guiRef.current = gui;

    const subIds = ['auto', ...getSubMorphotypesForArchetype(genome.archetype).map((s) => s.id)];

    const proxy = {
      seed: genome.seed,
      archetype: genome.archetype,
      subMorphotypeId: genome.subMorphotypeId,
      morphVariation: genome.morphVariation,
      rarity: genome.rarity,
      pose: genome.pose,
      animationMode: genome.animationMode,
      animationSpeed: genome.animationSpeed,
      symmetry: genome.symmetry,
      sizePreset: genome.sizePreset,
      thickness: genome.thickness,
      length: genome.length,
      asymmetry: genome.asymmetry,
      detailDensity: genome.detailDensity,
      eyeScale: genome.eyeScale,
      limbComplexity: genome.limbComplexity,
      displacementAmp: genome.displacementAmp,
      qualityLevel: renderSettings.qualityLevel,
      narrativeScene: renderSettings.narrativeScene,
      autoMatchScene: renderSettings.autoMatchScene,
      propDensity: renderSettings.propDensity,
      atmosphereIntensity: renderSettings.atmosphereIntensity,
      enableParticles: renderSettings.enableParticles,
      chromaticAberration: renderSettings.chromaticAberration,
      vignette: renderSettings.vignette,
      enableAmbientAudio: renderSettings.enableAmbientAudio,
      useHdriBackground: renderSettings.useHdriBackground,
      enableSSAO: renderSettings.enableSSAO,
      enableBloom: renderSettings.enableBloom,
      bloomStrength: renderSettings.bloomStrength,
      exposure: renderSettings.exposure,
      autoRotate: renderSettings.autoRotate,
      showSlots: renderSettings.showSlots,
      isolateTorso: renderSettings.isolateTorso,
      wireframe: renderSettings.wireframe,
    };

    const gFolder = gui.addFolder('Genoma');
    gFolder.add(proxy, 'seed', 1, ENGINE_CONSTANTS.MAX_SEED, 1).name('Seed').onFinishChange((v: number) => {
      const nextSeed = Math.round(v);
      setGenome((prev) => ({
        ...prev,
        seed: nextSeed,
        textureSeed: prev.locks.colors ? (prev.textureSeed ?? prev.seed) : nextSeed,
      }));
    });
    gFolder
      .add(proxy, 'archetype', Object.keys(ARCHETYPE_PROFILES))
      .name('Arquetipo')
      .onChange((v: ArchetypeId) => {
        setGenome((prev) => ({
          ...prev,
          archetype: v,
          subMorphotypeId: 'auto',
          symmetry: ARCHETYPE_PROFILES[v].defaultSymmetry,
        }));
      });
    gFolder
      .add(proxy, 'subMorphotypeId', subIds)
      .name('Sub-Morfotipo')
      .onChange((v: string) => setGenome((prev) => ({ ...prev, subMorphotypeId: v })));
    gFolder
      .add(proxy, 'morphVariation', 0, 1, 0.02)
      .name('Variación Morf.')
      .onChange((v: number) => setGenome((prev) => ({ ...prev, morphVariation: v })));
    gFolder
      .add(proxy, 'rarity', 0, 1, 0.02)
      .name('Rareza / Anomalía')
      .onChange((v: number) => setGenome((prev) => ({ ...prev, rarity: v })));
    gFolder
      .add(proxy, 'pose', POSE_PRESET_LIST.map((p) => p.id))
      .name('Pose')
      .onChange((v: PosePresetId) => setGenome((prev) => ({ ...prev, pose: v })));
    gFolder
      .add(proxy, 'animationMode', ANIMATION_MODE_LIST.map((a) => a.id))
      .name('Animación')
      .onChange((v: AnimationModeId) => setGenome((prev) => ({ ...prev, animationMode: v })));
    gFolder
      .add(proxy, 'animationSpeed', 0.25, 2.5, 0.05)
      .name('Velocidad Anim.')
      .onChange((v: number) => setGenome((prev) => ({ ...prev, animationSpeed: v })));
    gFolder
      .add(proxy, 'symmetry', ['bilateral', 'radial4', 'radial5', 'radial6', 'radial8', 'asymmetric'])
      .name('Simetría')
      .onChange((v: SymmetryMode) => setGenome((prev) => ({ ...prev, symmetry: v })));
    gFolder
      .add(proxy, 'sizePreset', Object.keys(SIZE_PRESETS))
      .name('Tamaño')
      .onChange((v: SizePresetId) => setGenome((prev) => ({ ...prev, sizePreset: v })));

    const mFolder = gui.addFolder('Morfología');
    mFolder.add(proxy, 'thickness', 0.55, 1.55, 0.02).name('Grosor').onChange((v: number) => setGenome((p) => ({ ...p, thickness: v })));
    mFolder.add(proxy, 'length', 0.65, 1.65, 0.02).name('Longitud').onChange((v: number) => setGenome((p) => ({ ...p, length: v })));
    mFolder.add(proxy, 'asymmetry', 0, 0.85, 0.02).name('Asimetría').onChange((v: number) => setGenome((p) => ({ ...p, asymmetry: v })));
    mFolder.add(proxy, 'detailDensity', 0, 1, 0.05).name('Pelo / Escamas').onChange((v: number) => setGenome((p) => ({ ...p, detailDensity: v })));
    mFolder.add(proxy, 'eyeScale', 0.45, 1.75, 0.05).name('Tamaño Ojos').onChange((v: number) => setGenome((p) => ({ ...p, eyeScale: v })));
    mFolder.add(proxy, 'limbComplexity', 0.2, 1.0, 0.05).name('Extremidades').onChange((v: number) => setGenome((p) => ({ ...p, limbComplexity: v })));
    mFolder.add(proxy, 'displacementAmp', 0, 0.14, 0.005).name('Ruido 3D').onChange((v: number) => setGenome((p) => ({ ...p, displacementAmp: v })));

    const sFolder = gui.addFolder('Escena');
    sFolder
      .add(proxy, 'qualityLevel', ['low', 'medium', 'high', 'ultra'])
      .name('Calidad Gráfica')
      .onChange((v: QualityLevel) => setRenderSettings((p) => ({ ...p, qualityLevel: v })));
    sFolder
      .add(proxy, 'narrativeScene', NARRATIVE_SCENE_LIST.map((s) => s.id))
      .name('Escena Narrativa')
      .onChange((v: NarrativeSceneId) => {
        const preset = NARRATIVE_SCENES[v];
        setRenderSettings((p) => ({
          ...p,
          narrativeScene: v,
          autoMatchScene: false,
          environment: preset.hdriBase,
          bloomStrength: preset.postProcessing.bloomStrength,
        }));
      });
    sFolder.add(proxy, 'autoMatchScene').name('Auto-Match').onChange((v: boolean) => setRenderSettings((p) => ({ ...p, autoMatchScene: v })));
    sFolder.add(proxy, 'propDensity', 0, 1, 0.05).name('Densidad Props').onChange((v: number) => setRenderSettings((p) => ({ ...p, propDensity: v })));
    sFolder.add(proxy, 'atmosphereIntensity', 0, 1, 0.05).name('Atmósfera').onChange((v: number) => setRenderSettings((p) => ({ ...p, atmosphereIntensity: v })));
    sFolder.add(proxy, 'enableParticles').name('Partículas').onChange((v: boolean) => setRenderSettings((p) => ({ ...p, enableParticles: v })));
    sFolder.add(proxy, 'chromaticAberration').name('Aberración Crom.').onChange((v: boolean) => setRenderSettings((p) => ({ ...p, chromaticAberration: v })));
    sFolder.add(proxy, 'vignette').name('Viñeta').onChange((v: boolean) => setRenderSettings((p) => ({ ...p, vignette: v })));
    sFolder.add(proxy, 'enableAmbientAudio').name('Audio Ambiental').onChange((v: boolean) => setRenderSettings((p) => ({ ...p, enableAmbientAudio: v })));
    sFolder.add(proxy, 'useHdriBackground').name('Fondo HDRI 360°').onChange((v: boolean) => setRenderSettings((p) => ({ ...p, useHdriBackground: v })));
    sFolder.add(proxy, 'exposure', 0.7, 1.6, 0.02).name('Exposición ACES').onChange((v: number) => setRenderSettings((p) => ({ ...p, exposure: v })));
    sFolder.add(proxy, 'enableSSAO').name('SSAO').onChange((v: boolean) => setRenderSettings((p) => ({ ...p, enableSSAO: v })));
    sFolder.add(proxy, 'enableBloom').name('Bloom').onChange((v: boolean) => setRenderSettings((p) => ({ ...p, enableBloom: v })));
    sFolder.add(proxy, 'bloomStrength', 0.0, 0.85, 0.02).name('Intensidad Bloom').onChange((v: number) => setRenderSettings((p) => ({ ...p, bloomStrength: v })));
    sFolder.add(proxy, 'autoRotate').name('Auto-Rotar').onChange((v: boolean) => setRenderSettings((p) => ({ ...p, autoRotate: v })));
    sFolder.add(proxy, 'showSlots').name('Mostrar Slots').onChange((v: boolean) => setRenderSettings((p) => ({ ...p, showSlots: v })));
    sFolder.add(proxy, 'isolateTorso').name('Aislar Torso').onChange((v: boolean) => setRenderSettings((p) => ({ ...p, isolateTorso: v })));
    sFolder.add(proxy, 'wireframe').name('Wireframe').onChange((v: boolean) => setRenderSettings((p) => ({ ...p, wireframe: v })));

    return () => {
      gui.destroy();
      guiRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lilGuiOpen, genome.archetype]);

  const handleUpdateGenome = useCallback((patch: Partial<CreatureGenome>) => {
    setGenome((prev) => ({ ...prev, ...patch }));
  }, []);

  const handleUpdateRenderSettings = useCallback((patch: Partial<SceneRenderSettings>) => {
    setRenderSettings((prev) => ({ ...prev, ...patch }));
  }, []);

  const handleSelectNarrativeScene = useCallback((sceneId: NarrativeSceneId, manual = true) => {
    const preset = NARRATIVE_SCENES[sceneId];
    setRenderSettings((prev) => ({
      ...prev,
      narrativeScene: sceneId,
      autoMatchScene: manual ? false : prev.autoMatchScene,
      environment: preset.hdriBase,
      bloomStrength: preset.postProcessing.bloomStrength,
    }));
  }, []);

  const handleRandomizeScene = useCallback(() => {
    setRenderSettings((prev) => {
      const others = NARRATIVE_SCENE_LIST.filter((s) => s.id !== prev.narrativeScene);
      const picked = others[Math.floor(Math.random() * others.length)] ?? NARRATIVE_SCENE_LIST[0];
      return {
        ...prev,
        narrativeScene: picked.id,
        autoMatchScene: false,
        environment: picked.hdriBase,
        bloomStrength: picked.postProcessing.bloomStrength,
      };
    });
  }, []);

  const handleRandomize = useCallback(() => {
    setGenome((prev) => mutateCreatureGenome(prev, true));
  }, []);

  const handleOpenComparator = useCallback(() => {
    setComparatorA(genome);
    setComparatorB((prevB) =>
      prevB.seed === genome.seed && prevB.archetype === genome.archetype
        ? mutateCreatureGenome(genome, false)
        : prevB
    );
    setComparatorOpen(true);
  }, [genome]);

  const handleLoadFromComparator = useCallback((loaded: CreatureGenome) => {
    setGenome(loaded);
    setComparatorOpen(false);
  }, []);

  const handleReset = useCallback(() => {
    setGenome(INITIAL_GENOME);
    setRenderSettings(INITIAL_RENDER_SETTINGS);
    managerRef.current?.focusCameraOnCreature(false);
  }, []);

  const handleFocusCamera = useCallback(() => {
    managerRef.current?.focusCameraOnCreature(false);
  }, []);

  const runExplorerBatch = useCallback(
    (seedOffset = 0) => {
      setExplorerOpen(true);
      setExplorerLoading(true);
      window.setTimeout(() => {
        try {
          const result = renderArchetypeExplorerGallery(genome.archetype, {
            ...genome,
            seed: (genome.seed + seedOffset) % ENGINE_CONSTANTS.MAX_SEED,
          });
          setExplorerResult(result);
        } finally {
          setExplorerLoading(false);
        }
      }, 40);
    },
    [genome]
  );

  const handleOpenExplorer = useCallback(() => {
    runExplorerBatch(0);
  }, [runExplorerBatch]);

  const handleRegenerateExplorer = useCallback(() => {
    runExplorerBatch(Math.floor(1000 + Math.random() * 90000));
  }, [runExplorerBatch]);

  const handleSelectExplorerSpecimen = useCallback((spec: ExplorerSpecimen) => {
    setGenome(spec.genome);
    setExplorerOpen(false);
  }, []);

  const handleScreenshot = useCallback(() => {
    if (!managerRef.current) return;
    const dataUrl = managerRef.current.captureScreenshot(renderSettings.transparentScreenshot);
    const a = document.createElement('a');
    a.href = dataUrl;
    a.download = `xenomorphia_${genome.archetype}_${genome.seed}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }, [genome.archetype, genome.seed, renderSettings.transparentScreenshot]);

  const handleExportGLB = useCallback(async () => {
    if (!managerRef.current || isExporting) return;
    setIsExporting(true);
    try {
      const report = await managerRef.current.exportGLTF(true);
      if (report) setLastExport(report);
    } finally {
      setIsExporting(false);
    }
  }, [isExporting]);

  const handleExportGLTF = useCallback(async () => {
    if (!managerRef.current || isExporting) return;
    setIsExporting(true);
    try {
      const report = await managerRef.current.exportGLTF(false);
      if (report) setLastExport(report);
    } finally {
      setIsExporting(false);
    }
  }, [isExporting]);

  const handleExportOBJ = useCallback(() => {
    const report = managerRef.current?.exportOBJAndMTL();
    if (report) setLastExport(report);
  }, []);

  const handleStartTurntable = useCallback(
    (opts: { durationSec: number; revolutions: number; animateCreature: boolean }) => {
      if (!managerRef.current || isRecordingTurntable) return;
      setTurntableError(null);
      setTurntableProgress(0);
      const started = managerRef.current.startTurntableRecording(
        {
          durationSec: opts.durationSec,
          fps: 30,
          revolutions: opts.revolutions,
          animateCreature: opts.animateCreature,
        },
        {
          onProgress: (pct) => setTurntableProgress(pct),
          onComplete: (report) => {
            setIsRecordingTurntable(false);
            setTurntableProgress(1);
            setLastTurntable(report);
          },
          onError: (msg) => {
            setIsRecordingTurntable(false);
            setTurntableError(msg);
          },
        }
      );
      if (started) {
        setIsRecordingTurntable(true);
      }
    },
    [isRecordingTurntable]
  );

  const handleStopTurntable = useCallback(() => {
    managerRef.current?.stopTurntableRecording(true);
    setIsRecordingTurntable(false);
    setTurntableProgress(0);
  }, []);

  const handleShareUrl = useCallback(async () => {
    const url = buildShareableCreatureUrl(
      genome,
      renderSettings.narrativeScene,
      renderSettings.autoMatchScene
    );
    try {
      window.history.replaceState(null, '', url);
    } catch {
      // Ignore in strict sandboxed iframes
    }

    let copied = false;
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(url);
        copied = true;
      }
    } catch {
      copied = false;
    }

    setShareFeedback({ url, copied });
    window.setTimeout(() => {
      setShareFeedback((prev) => (prev?.url === url ? null : prev));
    }, 6000);
  }, [genome, renderSettings.autoMatchScene, renderSettings.narrativeScene]);

  const handleImportShareUrl = useCallback((rawInput: string): boolean => {
    const parsed = parseSharedCreatureInput(rawInput, BASE_DEFAULT_GENOME);
    if (!parsed) return false;
    setGenome(parsed.genome);
    if (parsed.narrativeScene) {
      const preset = NARRATIVE_SCENES[parsed.narrativeScene];
      setRenderSettings((prev) => ({
        ...prev,
        narrativeScene: parsed.narrativeScene!,
        autoMatchScene: parsed.autoMatchScene ?? false,
        environment: preset.hdriBase,
        bloomStrength: preset.postProcessing.bloomStrength,
      }));
    }
    managerRef.current?.focusCameraOnCreature(false);
    return true;
  }, []);

  const activeProfile = ARCHETYPE_PROFILES[genome.archetype];
  const activeSize = SIZE_PRESETS[genome.sizePreset];
  const activeScene = NARRATIVE_SCENES[renderSettings.narrativeScene];

  return (
    <div className="relative w-screen h-screen overflow-hidden bg-[#090c10]">
      {/* Dedicated WebGL Mount Container */}
      <div ref={canvasMountRef} className="absolute inset-0 w-full h-full" />

      {/* Minimal Top-Left Studio Title & Unboxed Specimen Readout */}
      <header className="fixed top-4 left-5 z-10 pointer-events-none select-none">
        <h1 className="font-display text-lg font-semibold tracking-tight text-slate-100 leading-tight">
          Xenomorphia
        </h1>
        <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-slate-400">
          <span className="text-teal-300 font-medium">{activeProfile.name}</span>
          {stats?.subMorphotypeName && (
            <>
              <span aria-hidden="true">·</span>
              <span className="text-slate-200">{stats.subMorphotypeName}</span>
            </>
          )}
          <span aria-hidden="true">·</span>
          <span style={{ color: activeScene.accentHex }}>{activeScene.name}</span>
          <span aria-hidden="true">·</span>
          <span className="font-mono-tabular">Seed {genome.seed}</span>
          <span aria-hidden="true">·</span>
          <span className="font-mono-tabular">{activeSize.units} u</span>
          <span aria-hidden="true">·</span>
          <span style={{ color: getRarityClassification(genome.rarity).color }}>
            {getRarityClassification(genome.rarity).label}
          </span>
        </div>
      </header>

      {/* WebGL Context Lost Fallback */}
      {contextLost && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-[#090c10]/90 text-center p-6">
          <div className="max-w-sm space-y-2 border border-white/10 rounded-xl p-6 bg-[#0d121a]">
            <p className="text-sm font-medium text-slate-100">Contexto WebGL suspendido</p>
            <p className="text-xs text-slate-400">
              El navegador liberó temporalmente la GPU. Recarga la vista si no se restaura automáticamente.
            </p>
          </div>
        </div>
      )}

      {/* 10-Specimen Archetype Exploration Gallery Modal */}
      <ArchetypeExplorerModal
        open={explorerOpen}
        loading={explorerLoading}
        result={explorerResult}
        onClose={() => setExplorerOpen(false)}
        onRegenerate={handleRegenerateExplorer}
        onSelectSpecimen={handleSelectExplorerSpecimen}
      />

      {/* Side-by-Side 3D Creature Comparator Modal */}
      <CreatureComparatorModal
        open={comparatorOpen}
        currentGenome={genome}
        specimenA={comparatorA}
        specimenB={comparatorB}
        onUpdateA={setComparatorA}
        onUpdateB={setComparatorB}
        onSwap={() => {
          setComparatorA(comparatorB);
          setComparatorB(comparatorA);
        }}
        onRandomizeB={() => setComparatorB(mutateCreatureGenome(comparatorA, false))}
        onLoadToViewport={handleLoadFromComparator}
        onClose={() => setComparatorOpen(false)}
      />

      {/* Collapsible Bottom Control Dock */}
      <ControlDock
        genome={genome}
        renderSettings={renderSettings}
        stats={stats}
        collapsed={collapsed}
        lilGuiOpen={lilGuiOpen}
        isExporting={isExporting}
        lastExport={lastExport}
        isRecordingTurntable={isRecordingTurntable}
        turntableProgress={turntableProgress}
        turntableError={turntableError}
        lastTurntable={lastTurntable}
        shareFeedback={shareFeedback}
        requestedPartFocus={requestedPartFocus}
        onToggleCollapse={() => setCollapsed((c) => !c)}
        onToggleLilGui={() => setLilGuiOpen((o) => !o)}
        onOpenExplorer={handleOpenExplorer}
        onOpenComparator={handleOpenComparator}
        onUpdateGenome={handleUpdateGenome}
        onUpdateRenderSettings={handleUpdateRenderSettings}
        onSelectNarrativeScene={handleSelectNarrativeScene}
        onRandomizeScene={handleRandomizeScene}
        onRandomize={handleRandomize}
        onReset={handleReset}
        onFocusCamera={handleFocusCamera}
        onScreenshot={handleScreenshot}
        onExportGLB={handleExportGLB}
        onExportGLTF={handleExportGLTF}
        onExportOBJ={handleExportOBJ}
        onStartTurntable={handleStartTurntable}
        onStopTurntable={handleStopTurntable}
        onShareUrl={handleShareUrl}
        onImportShareUrl={handleImportShareUrl}
      />
    </div>
  );
}
