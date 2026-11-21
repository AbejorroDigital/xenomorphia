import React, { useEffect, useState } from 'react';
import {
  Camera,
  Check,
  ChevronDown,
  ChevronUp,
  Columns2,
  Download,
  Film,
  Focus,
  Grid,
  Link2,
  Lock,
  Play,
  RotateCcw,
  Share2,
  Shuffle,
  Sliders,
  Sparkles,
  Square,
  Unlock,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { ARCHETYPE_LIST, ARCHETYPE_PROFILES } from '../engine/archetypes';
import { ENGINE_CONSTANTS, QUALITY_LEVEL_LIST, QUALITY_PRESETS, SIZE_PRESETS } from '../engine/constants';
import {
  DEFAULT_MUTATION_LOCKS,
  DEFAULT_PART_EDITS,
  getRarityClassification,
  hasActiveMutationLocks,
  LOCK_DOMAIN_META,
} from '../engine/genomeMutation';
import {
  ANIMATION_MODES,
  ANIMATION_MODE_LIST,
  POSE_PRESETS,
  POSE_PRESET_LIST,
} from '../engine/poses';
import { NARRATIVE_SCENES, NARRATIVE_SCENE_LIST } from '../engine/scenePresets';
import { renderAllSceneThumbnails } from '../engine/sceneThumbnailRenderer';
import { getSubMorphotypesForArchetype, selectSubMorphotype } from '../engine/subMorphotypes';
import {
  AnimationModeId,
  ArchetypeId,
  BodyAxis,
  CreatureBuildStats,
  CreatureGenome,
  EditablePartId,
  ExportReport,
  MutationLockKey,
  NarrativeSceneId,
  PartEditsConfig,
  PosePresetId,
  SceneRenderSettings,
  ShellType,
  SizePresetId,
  SubMorphotype,
  SymmetryMode,
  TailType,
  TurntableReport,
  WingPresence,
} from '../engine/types';

type DockTab = 'genoma' | 'partes' | 'morfologia' | 'texturas' | 'escena' | 'exportar';

interface ControlDockProps {
  genome: CreatureGenome;
  renderSettings: SceneRenderSettings;
  stats: CreatureBuildStats | null;
  collapsed: boolean;
  lilGuiOpen: boolean;
  isExporting: boolean;
  lastExport: ExportReport | null;
  isRecordingTurntable: boolean;
  turntableProgress: number;
  turntableError: string | null;
  lastTurntable: TurntableReport | null;
  shareFeedback: { url: string; copied: boolean } | null;
  requestedPartFocus: { part: EditablePartId; seq: number } | null;
  onToggleCollapse: () => void;
  onToggleLilGui: () => void;
  onOpenExplorer: () => void;
  onOpenComparator: () => void;
  onUpdateGenome: (patch: Partial<CreatureGenome>) => void;
  onUpdateRenderSettings: (patch: Partial<SceneRenderSettings>) => void;
  onSelectNarrativeScene: (sceneId: NarrativeSceneId, manual?: boolean) => void;
  onRandomizeScene: () => void;
  onRandomize: () => void;
  onReset: () => void;
  onFocusCamera: () => void;
  onScreenshot: () => void;
  onExportGLB: () => void;
  onExportGLTF: () => void;
  onExportOBJ: () => void;
  onStartTurntable: (opts: { durationSec: number; revolutions: number; animateCreature: boolean }) => void;
  onStopTurntable: () => void;
  onShareUrl: () => void;
  onImportShareUrl: (raw: string) => boolean;
}

const SYMMETRY_OPTIONS: { id: SymmetryMode; label: string }[] = [
  { id: 'bilateral', label: 'Bilateral' },
  { id: 'radial4', label: 'Radial 4' },
  { id: 'radial5', label: 'Radial 5' },
  { id: 'radial6', label: 'Radial 6' },
  { id: 'radial8', label: 'Radial 8' },
  { id: 'asymmetric', label: 'Asimétrica' },
];

const AXIS_LABELS: Record<BodyAxis, string> = {
  horizontal: 'Horizontal',
  vertical: 'Vertical',
  curved: 'Curvado',
  coiled: 'Serpentino',
};

/**
 * Clean inline SVG topological silhouette preview representing the active SubMorphotype's
 * body axis, radial vs bilateral symmetry, limbs/tentacles, wings, and shell.
 */
const SubMorphotypeSilhouette: React.FC<{ sub: SubMorphotype }> = ({ sub }) => {
  const isRadial = sub.symmetry.startsWith('radial');
  const isVertical = sub.bodyAxis === 'vertical' && !isRadial;
  const isCoiled = sub.bodyAxis === 'coiled' && !isRadial;
  const totalLimbs =
    sub.limbConfiguration.forelimbs.count + sub.limbConfiguration.hindlimbs.count;

  return (
    <svg
      viewBox="0 0 64 48"
      className="w-16 h-12 shrink-0 rounded-md bg-[#0b1018] border border-white/10 text-teal-400"
      aria-hidden="true"
    >
      {isRadial ? (
        <g stroke="currentColor" strokeWidth="1.6" fill="none">
          <ellipse cx="32" cy="18" rx="11" ry="9" fill="currentColor" fillOpacity="0.16" />
          {Array.from({
            length: Math.min(8, Math.max(4, sub.tentacleCount || totalLimbs || 6)),
          }).map((_, i, arr) => {
            const a = ((i / (arr.length - 1)) - 0.5) * 2.2;
            const x2 = 32 + Math.sin(a) * 20;
            const y2 = 43 - Math.abs(a) * 3;
            return <path key={i} d={`M 32 26 Q ${32 + Math.sin(a) * 10} 34, ${x2} ${y2}`} />;
          })}
        </g>
      ) : isVertical ? (
        <g stroke="currentColor" strokeWidth="1.8" fill="none">
          <circle cx="32" cy="10" r="4.5" fill="currentColor" fillOpacity="0.2" />
          <ellipse cx="32" cy="23" rx="6.5" ry="9.5" fill="currentColor" fillOpacity="0.16" />
          {sub.limbConfiguration.forelimbs.count > 0 && (
            <>
              <path d="M 26 17 L 17 27" />
              <path d="M 38 17 L 47 27" />
            </>
          )}
          {sub.limbConfiguration.hindlimbs.count > 0 && (
            <>
              <path d="M 28 32 L 24 44" />
              <path d="M 36 32 L 40 44" />
            </>
          )}
          {sub.wingPresence !== 'none' && (
            <>
              <path d="M 26 18 Q 10 10 8 24 Q 18 24 26 22" fill="currentColor" fillOpacity="0.12" />
              <path d="M 38 18 Q 54 10 56 24 Q 46 24 38 22" fill="currentColor" fillOpacity="0.12" />
            </>
          )}
        </g>
      ) : isCoiled ? (
        <g stroke="currentColor" strokeWidth="2.2" fill="none" strokeLinecap="round">
          <path d="M 10 30 Q 18 16 28 28 T 48 22 L 55 20" />
          <circle cx="55" cy="20" r="3.2" fill="currentColor" fillOpacity="0.3" />
          {totalLimbs > 2 &&
            [16, 24, 32, 40].map((x) => (
              <g key={x} strokeWidth="1.2">
                <path d={`M ${x} 25 L ${x - 2} 34`} />
                <path d={`M ${x + 2} 25 L ${x + 4} 34`} />
              </g>
            ))}
        </g>
      ) : (
        <g stroke="currentColor" strokeWidth="1.7" fill="none">
          <ellipse cx="31" cy="24" rx="14" ry="7" fill="currentColor" fillOpacity="0.16" />
          <circle cx="48" cy="20" r="4" fill="currentColor" fillOpacity="0.22" />
          {sub.shellType !== 'none' && (
            <path d="M 19 20 Q 31 8 43 20" strokeWidth="2" fill="currentColor" fillOpacity="0.22" />
          )}
          {sub.wingPresence !== 'none' && (
            <path d="M 28 19 Q 22 6 12 10 Q 18 18 28 21" fill="currentColor" fillOpacity="0.14" />
          )}
          {sub.tailPresence && <path d="M 17 24 Q 8 24 6 17" />}
          {sub.limbConfiguration.forelimbs.count > 0 && <path d="M 38 29 L 41 42" />}
          {sub.limbConfiguration.hindlimbs.count > 0 && <path d="M 23 29 L 20 42" />}
        </g>
      )}
    </svg>
  );
};

const EDITABLE_PARTS_META: Array<{ id: EditablePartId; label: string; lockKey: MutationLockKey }> = [
  { id: 'torso', label: 'Torso', lockKey: 'torso' },
  { id: 'head', label: 'Cabeza y Ojos', lockKey: 'head' },
  { id: 'limbs', label: 'Extremidades', lockKey: 'limbs' },
  { id: 'wings', label: 'Alas', lockKey: 'limbs' },
  { id: 'tail', label: 'Cola', lockKey: 'limbs' },
  { id: 'tentacles', label: 'Tentáculos', lockKey: 'limbs' },
  { id: 'shell', label: 'Caparazón', lockKey: 'torso' },
];

export const ControlDock: React.FC<ControlDockProps> = ({
  genome,
  renderSettings,
  stats,
  collapsed,
  lilGuiOpen,
  isExporting,
  lastExport,
  isRecordingTurntable,
  turntableProgress,
  turntableError,
  lastTurntable,
  shareFeedback,
  requestedPartFocus,
  onToggleCollapse,
  onToggleLilGui,
  onOpenExplorer,
  onOpenComparator,
  onUpdateGenome,
  onUpdateRenderSettings,
  onSelectNarrativeScene,
  onRandomizeScene,
  onRandomize,
  onReset,
  onFocusCamera,
  onScreenshot,
  onExportGLB,
  onExportGLTF,
  onExportOBJ,
  onStartTurntable,
  onStopTurntable,
  onShareUrl,
  onImportShareUrl,
}) => {
  const [activeTab, setActiveTab] = useState<DockTab>('genoma');
  const [selectedPart, setSelectedPart] = useState<EditablePartId>('torso');
  const [seedInput, setSeedInput] = useState<string>(String(genome.seed));
  const [hoveredSceneId, setHoveredSceneId] = useState<NarrativeSceneId | null>(null);
  const [sceneThumbs, setSceneThumbs] = useState<Record<NarrativeSceneId, string> | null>(null);
  const [turntableDuration, setTurntableDuration] = useState<number>(6);
  const [turntableRevs, setTurntableRevs] = useState<number>(1);
  const [turntableAnimate, setTurntableAnimate] = useState<boolean>(true);
  const [importUrlInput, setImportUrlInput] = useState<string>('');
  const [importError, setImportError] = useState<string | null>(null);

  useEffect(() => {
    setSeedInput(String(genome.seed));
  }, [genome.seed]);

  useEffect(() => {
    if (!requestedPartFocus) return;
    setSelectedPart(requestedPartFocus.part);
    setActiveTab('partes');
  }, [requestedPartFocus]);

  useEffect(() => {
    if (activeTab !== 'escena' || sceneThumbs) return;
    const id = window.setTimeout(() => {
      try {
        const thumbs = renderAllSceneThumbnails();
        setSceneThumbs(thumbs);
      } catch {
        // Gradient fallbacks remain visible if offscreen WebGL is unavailable
      }
    }, 30);
    return () => window.clearTimeout(id);
  }, [activeTab, sceneThumbs]);

  const commitSeed = () => {
    const parsed = parseInt(seedInput.replace(/\D/g, ''), 10);
    if (!Number.isNaN(parsed) && parsed >= ENGINE_CONSTANTS.MIN_SEED) {
      const clamped = Math.min(ENGINE_CONSTANTS.MAX_SEED, parsed);
      onUpdateGenome({
        seed: clamped,
        textureSeed: genome.locks.colors ? (genome.textureSeed ?? genome.seed) : clamped,
      });
    } else {
      setSeedInput(String(genome.seed));
    }
  };

  const updatePartEdits = (patch: Partial<PartEditsConfig>) => {
    onUpdateGenome({
      partEdits: {
        ...genome.partEdits,
        ...patch,
      },
    });
  };

  const toggleLock = (key: MutationLockKey) => {
    onUpdateGenome({
      locks: {
        ...genome.locks,
        [key]: !genome.locks[key],
      },
    });
  };

  const archetypeSubs = getSubMorphotypesForArchetype(genome.archetype);
  const activeSub = selectSubMorphotype(genome.seed, genome.archetype, genome.subMorphotypeId);
  const activeLocksCount = Object.values(genome.locks).filter(Boolean).length;
  const locksActive = hasActiveMutationLocks(genome.locks);
  const rarityInfo = getRarityClassification(genome.rarity ?? 0.15);

  return (
    <div
      className="fixed bottom-4 left-1/2 -translate-x-1/2 z-20 flex flex-col items-center pointer-events-none"
      style={{ width: 'min(940px, 96vw)' }}
    >
      {/* Collapse / Expand Handle */}
      <button
        type="button"
        onClick={onToggleCollapse}
        aria-expanded={!collapsed}
        className="pointer-events-auto mb-1.5 flex items-center gap-2 px-3.5 py-1.5 rounded-t-lg text-xs font-medium text-slate-200 bg-[#0c1017]/95 border border-white/10 hover:border-teal-400/50 hover:text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer"
      >
        {collapsed ? (
          <ChevronUp className="w-3.5 h-3.5 text-teal-400" />
        ) : (
          <ChevronDown className="w-3.5 h-3.5 text-teal-400" />
        )}
        <span>{collapsed ? 'Mostrar Controles (H)' : 'Ocultar Controles (H)'}</span>
      </button>

      {/* Main Unified Control Dock */}
      {!collapsed && (
        <div className="pointer-events-auto w-full rounded-xl bg-[#0b0f16]/95 border border-white/10 shadow-2xl overflow-hidden">
          {/* Dock Header: Tabs + Primary Quick Actions */}
          <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 border-b border-white/8">
            <div className="flex items-center gap-1" role="tablist">
              {(
                [
                  { id: 'genoma', label: 'Genoma' },
                  { id: 'partes', label: 'Partes y Poses' },
                  { id: 'morfologia', label: 'Morfología' },
                  { id: 'texturas', label: 'Texturas' },
                  { id: 'escena', label: 'Escena' },
                  { id: 'exportar', label: 'Exportar' },
                ] as { id: DockTab; label: string }[]
              ).map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  role="tab"
                  aria-selected={activeTab === tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    activeTab === tab.id
                      ? 'bg-teal-500/18 text-teal-300 border border-teal-400/35'
                      : 'text-slate-400 hover:text-slate-200 border border-transparent'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-1.5 shrink-0">
              <button
                type="button"
                onClick={onOpenExplorer}
                title="Explorar 10 sub-morfotipos del arquetipo en galería 3D"
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium text-teal-300 bg-teal-500/12 hover:bg-teal-500/22 border border-teal-400/30 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                <Grid className="w-3.5 h-3.5" />
                <span>Explorar (10)</span>
              </button>
              <button
                type="button"
                onClick={onOpenComparator}
                title="Comparar 2 criaturas lado a lado en 3D"
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium text-sky-300 bg-sky-500/12 hover:bg-sky-500/22 border border-sky-400/30 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                <Columns2 className="w-3.5 h-3.5" />
                <span>Comparar</span>
              </button>
              <button
                type="button"
                onClick={onRandomize}
                title={
                  locksActive
                    ? 'Mutar solo las partes y rasgos desbloqueados'
                    : 'Generar nueva criatura aleatoria'
                }
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium bg-teal-500 text-slate-950 hover:bg-teal-400 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                <Shuffle className="w-3.5 h-3.5" />
                <span>{locksActive ? `Mutar (${activeLocksCount} blq.)` : 'Aleatorio'}</span>
              </button>
              <button
                type="button"
                onClick={onShareUrl}
                title="Copiar enlace único con todo el genoma y hábitat"
                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium border transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  shareFeedback
                    ? 'bg-teal-500/20 text-teal-300 border-teal-400/40'
                    : 'text-slate-200 bg-white/5 hover:bg-white/10 border-white/10'
                }`}
              >
                {shareFeedback ? (
                  <Check className="w-3.5 h-3.5 text-teal-300" />
                ) : (
                  <Share2 className="w-3.5 h-3.5 text-teal-400" />
                )}
                <span className="hidden sm:inline">
                  {shareFeedback ? (shareFeedback.copied ? 'Enlace Copiado' : 'URL Lista') : 'Compartir'}
                </span>
              </button>
              <button
                type="button"
                onClick={onScreenshot}
                title="Capturar imagen PNG"
                className="flex items-center gap-1.5 px-2 py-1.5 rounded-md text-xs font-medium text-slate-200 bg-white/5 hover:bg-white/10 border border-white/10 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                <Camera className="w-3.5 h-3.5 text-teal-400" />
                <span className="hidden md:inline">Captura</span>
              </button>
              <button
                type="button"
                onClick={onReset}
                title="Restablecer parámetros"
                className="flex items-center gap-1.5 px-2 py-1.5 rounded-md text-xs font-medium text-slate-300 bg-white/5 hover:bg-white/10 border border-white/10 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span className="hidden md:inline">Reiniciar</span>
              </button>
            </div>
          </div>

          {/* Tab Body */}
          <div className="p-4">
            {activeTab === 'genoma' && (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {/* Column 1: Seed, Archetype & Rarity/Anomaly */}
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs text-slate-400 mb-1" htmlFor="seed-input">
                      Seed Numérica (Mulberry32)
                    </label>
                    <div className="flex items-center gap-2">
                      <input
                        id="seed-input"
                        type="text"
                        inputMode="numeric"
                        value={seedInput}
                        onChange={(e) => setSeedInput(e.target.value)}
                        onBlur={commitSeed}
                        onKeyDown={(e) => e.key === 'Enter' && commitSeed()}
                        className="w-full px-3 py-1.5 rounded-md bg-[#131924] border border-white/10 text-sm text-slate-100 font-mono-tabular focus:outline-none focus:border-teal-400"
                      />
                      <button
                        type="button"
                        onClick={commitSeed}
                        className="px-3 py-1.5 rounded-md text-xs font-medium bg-white/8 hover:bg-white/14 text-slate-200 border border-white/10 whitespace-nowrap shrink-0 cursor-pointer"
                      >
                        Aplicar
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs text-slate-400 mb-1" htmlFor="archetype-select">
                      Arquetipo Biológico
                    </label>
                    <select
                      id="archetype-select"
                      value={genome.archetype}
                      onChange={(e) => {
                        const nextArch = e.target.value as ArchetypeId;
                        const profile = ARCHETYPE_PROFILES[nextArch];
                        onUpdateGenome({
                          archetype: nextArch,
                          subMorphotypeId: 'auto',
                          symmetry: profile?.defaultSymmetry ?? genome.symmetry,
                        });
                      }}
                      className="w-full px-3 py-1.5 rounded-md bg-[#131924] border border-white/10 text-sm text-slate-100 focus:outline-none focus:border-teal-400 cursor-pointer"
                    >
                      {ARCHETYPE_LIST.map((arch) => (
                        <option key={arch.id} value={arch.id}>
                          {arch.name} ({arch.scientificTag})
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Rarity / Anomaly Slider */}
                  <div className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-slate-300">Rareza / Anomalía</span>
                      <span className="font-mono-tabular" style={{ color: rarityInfo.color }}>
                        {rarityInfo.label} · {Math.round((genome.rarity ?? 0) * 100)}%
                      </span>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={1}
                      step={0.02}
                      value={genome.rarity ?? 0.15}
                      onChange={(e) => onUpdateGenome({ rarity: parseFloat(e.target.value) })}
                      className="w-full studio-slider cursor-pointer"
                    />
                  </div>
                </div>

                {/* Column 2: Sub-Morphotype & Hybridization */}
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs text-slate-400 mb-1" htmlFor="submorph-select">
                      Sub-Morfotipo ({archetypeSubs.length} planes corporales)
                    </label>
                    <div className="flex items-start gap-2.5">
                      <SubMorphotypeSilhouette sub={activeSub} />
                      <div className="flex-1 min-w-0 space-y-1">
                        <select
                          id="submorph-select"
                          value={genome.subMorphotypeId}
                          onChange={(e) => {
                            const val = e.target.value;
                            if (val === 'auto') {
                              onUpdateGenome({
                                subMorphotypeId: 'auto',
                                symmetry: ARCHETYPE_PROFILES[genome.archetype].defaultSymmetry,
                              });
                            } else {
                              const picked = archetypeSubs.find((s) => s.id === val);
                              onUpdateGenome({
                                subMorphotypeId: val,
                                symmetry: picked?.symmetry ?? genome.symmetry,
                              });
                            }
                          }}
                          className="w-full px-2.5 py-1.5 rounded-md bg-[#131924] border border-white/10 text-xs text-slate-100 focus:outline-none focus:border-teal-400 cursor-pointer"
                        >
                          <option value="auto">Automático (según Seed)</option>
                          {archetypeSubs.map((sub) => (
                            <option key={sub.id} value={sub.id}>
                              {sub.name} — {sub.exampleTaxa}
                            </option>
                          ))}
                        </select>
                        <p className="text-[11px] leading-snug text-slate-400 line-clamp-2">
                          {activeSub.description}
                        </p>
                      </div>
                    </div>
                  </div>

                  <SliderField
                    label="Variación Morfológica (Hibridación)"
                    value={genome.morphVariation}
                    min={0}
                    max={1}
                    step={0.02}
                    onChange={(v) => onUpdateGenome({ morphVariation: v })}
                  />

                  {/* Partial Mutation Locks */}
                  <div>
                    <div className="flex items-center justify-between text-xs mb-1">
                      <span className="text-slate-400">Bloqueo / Mutación Parcial</span>
                      {locksActive && (
                        <button
                          type="button"
                          onClick={() => onUpdateGenome({ locks: { ...DEFAULT_MUTATION_LOCKS } })}
                          className="text-[11px] text-teal-300 hover:underline cursor-pointer"
                        >
                          Desbloquear todo
                        </button>
                      )}
                    </div>
                    <div className="grid grid-cols-3 gap-1">
                      {LOCK_DOMAIN_META.map((item) => {
                        const locked = genome.locks[item.key];
                        return (
                          <button
                            key={item.key}
                            type="button"
                            title={item.hint}
                            onClick={() => toggleLock(item.key)}
                            className={`flex items-center gap-1 px-1.5 py-1 rounded text-[10px] font-medium border transition-colors whitespace-nowrap truncate cursor-pointer ${
                              locked
                                ? 'bg-amber-500/18 text-amber-300 border-amber-400/40'
                                : 'bg-[#131924] text-slate-400 border-white/10 hover:text-slate-200'
                            }`}
                          >
                            {locked ? (
                              <Lock className="w-2.5 h-2.5 shrink-0" />
                            ) : (
                              <Unlock className="w-2.5 h-2.5 shrink-0 opacity-65" />
                            )}
                            <span className="truncate">{item.label}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>

                {/* Column 3: Symmetry & Size Presets */}
                <div className="space-y-3">
                  <div>
                    <span className="block text-xs text-slate-400 mb-1">Simetría Anatómica</span>
                    <div className="grid grid-cols-3 gap-1.5">
                      {SYMMETRY_OPTIONS.map((sym) => (
                        <button
                          key={sym.id}
                          type="button"
                          onClick={() => onUpdateGenome({ symmetry: sym.id })}
                          className={`px-2 py-1.5 rounded-md text-[11px] font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                            genome.symmetry === sym.id
                              ? 'bg-teal-500/20 text-teal-300 border border-teal-400/40'
                              : 'bg-[#131924] text-slate-300 border border-white/10 hover:border-white/25'
                          }`}
                        >
                          {sym.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <span className="block text-xs text-slate-400 mb-1">
                      Escala de Espécimen (auto-ajuste)
                    </span>
                    <div className="grid grid-cols-4 gap-1.5">
                      {(Object.keys(SIZE_PRESETS) as SizePresetId[]).map((presetKey) => {
                        const preset = SIZE_PRESETS[presetKey];
                        const active = genome.sizePreset === preset.id;
                        return (
                          <button
                            key={preset.id}
                            type="button"
                            onClick={() => onUpdateGenome({ sizePreset: preset.id })}
                            className={`px-2 py-1.5 rounded-md text-[11px] font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer flex items-center justify-between ${
                              active
                                ? 'bg-teal-500/20 text-teal-300 border border-teal-400/40'
                                : 'bg-[#131924] text-slate-300 border border-white/10 hover:border-white/25'
                            }`}
                          >
                            <span>{preset.label}</span>
                            <span className="font-mono-tabular text-[10px] opacity-80">{preset.units}u</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'partes' && (() => {
              const activeMeta =
                EDITABLE_PARTS_META.find((p) => p.id === selectedPart) ?? EDITABLE_PARTS_META[0];
              const partLocked = genome.locks[activeMeta.lockKey];
              return (
                <div className="space-y-3">
                  {/* Poses Predefinidas + Animación Procedural Bar */}
                  <div className="space-y-2 pb-2.5 border-b border-white/8">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-xs text-slate-400">Pose:</span>
                        <div className="flex flex-wrap items-center gap-1" role="group" aria-label="Poses predefinidas">
                          {POSE_PRESET_LIST.map((p) => {
                            const active = genome.pose === p.id;
                            return (
                              <button
                                key={p.id}
                                type="button"
                                title={p.description}
                                onClick={() => onUpdateGenome({ pose: p.id as PosePresetId })}
                                className={`px-2 py-1 rounded text-[11px] font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                                  active
                                    ? 'bg-teal-500/22 text-teal-300 border border-teal-400/40'
                                    : 'bg-[#131924] text-slate-300 border border-white/10 hover:border-white/25'
                                }`}
                              >
                                {p.label}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                      <span className="text-[11px] text-slate-400">
                        Haz clic sobre el modelo 3D para seleccionar parte
                      </span>
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-xs text-slate-400 flex items-center gap-1">
                          <Play className="w-3 h-3 text-teal-400" />
                          <span>Animación:</span>
                        </span>
                        <div className="flex flex-wrap items-center gap-1" role="group" aria-label="Animación procedural">
                          {ANIMATION_MODE_LIST.map((m) => {
                            const active = (genome.animationMode ?? 'auto') === m.id;
                            return (
                              <button
                                key={m.id}
                                type="button"
                                title={m.description}
                                onClick={() => onUpdateGenome({ animationMode: m.id as AnimationModeId })}
                                className={`px-2 py-1 rounded text-[11px] font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                                  active
                                    ? 'bg-sky-500/22 text-sky-300 border border-sky-400/40'
                                    : 'bg-[#131924] text-slate-300 border border-white/10 hover:border-white/25'
                                }`}
                              >
                                {m.label}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 min-w-[170px]">
                        <span className="text-[11px] text-slate-400 whitespace-nowrap">Velocidad</span>
                        <input
                          type="range"
                          min={0.25}
                          max={2.5}
                          step={0.05}
                          value={genome.animationSpeed ?? 1.0}
                          onChange={(e) => onUpdateGenome({ animationSpeed: parseFloat(e.target.value) })}
                          className="w-24 studio-slider cursor-pointer"
                        />
                        <span className="font-mono-tabular text-[11px] text-teal-300 w-9 text-right">
                          {(genome.animationSpeed ?? 1.0).toFixed(2)}x
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Part Selector Sub-tabs + Lock + Reset */}
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-1">
                      {EDITABLE_PARTS_META.map((p) => (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => setSelectedPart(p.id)}
                          className={`px-2.5 py-1 rounded text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                            selectedPart === p.id
                              ? 'bg-sky-500/20 text-sky-300 border border-sky-400/40'
                              : 'bg-[#131924] text-slate-400 border border-white/10 hover:text-slate-200'
                          }`}
                        >
                          {p.label}
                        </button>
                      ))}
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => toggleLock(activeMeta.lockKey)}
                        className={`flex items-center gap-1 px-2.5 py-1 rounded text-[11px] font-medium border transition-colors whitespace-nowrap cursor-pointer ${
                          partLocked
                            ? 'bg-amber-500/18 text-amber-300 border-amber-400/40'
                            : 'bg-[#131924] text-slate-300 border-white/10 hover:border-white/25'
                        }`}
                      >
                        {partLocked ? <Lock className="w-3 h-3" /> : <Unlock className="w-3 h-3" />}
                        <span>{partLocked ? 'Parte Bloqueada' : 'Bloquear Parte'}</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => onUpdateGenome({ partEdits: { ...DEFAULT_PART_EDITS } })}
                        className="px-2.5 py-1 rounded text-[11px] font-medium bg-[#131924] text-slate-300 border border-white/10 hover:border-white/25 whitespace-nowrap cursor-pointer"
                      >
                        Restablecer Partes
                      </button>
                    </div>
                  </div>

                  {/* Contextual Part Controls */}
                  {selectedPart === 'torso' && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
                      <SliderField
                        label="Anchura Torso"
                        value={genome.partEdits.torsoWidthScale}
                        min={0.6}
                        max={1.6}
                        step={0.02}
                        onChange={(v) => updatePartEdits({ torsoWidthScale: v })}
                      />
                      <SliderField
                        label="Altura Torso"
                        value={genome.partEdits.torsoHeightScale}
                        min={0.6}
                        max={1.6}
                        step={0.02}
                        onChange={(v) => updatePartEdits({ torsoHeightScale: v })}
                      />
                      <SliderField
                        label="Largo Axial Torso"
                        value={genome.partEdits.torsoLengthScale}
                        min={0.6}
                        max={1.6}
                        step={0.02}
                        onChange={(v) => updatePartEdits({ torsoLengthScale: v })}
                      />
                      <SliderField
                        label="Curvatura Espinal"
                        value={genome.partEdits.spineArchScale}
                        min={0}
                        max={2}
                        step={0.05}
                        onChange={(v) => updatePartEdits({ spineArchScale: v })}
                      />
                    </div>
                  )}

                  {selectedPart === 'head' && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 items-end">
                      <SliderField
                        label="Tamaño Cráneo"
                        value={genome.partEdits.headScale}
                        min={0.5}
                        max={1.8}
                        step={0.02}
                        onChange={(v) => updatePartEdits({ headScale: v })}
                      />
                      <SliderField
                        label="Longitud Cuello"
                        value={genome.partEdits.neckScale}
                        min={0.4}
                        max={1.8}
                        step={0.02}
                        onChange={(v) => updatePartEdits({ neckScale: v })}
                      />
                      <div>
                        <label className="block text-xs text-slate-400 mb-1" htmlFor="part-eyes-select">
                          Cantidad de Ojos
                        </label>
                        <select
                          id="part-eyes-select"
                          value={String(genome.partEdits.eyeCountOverride)}
                          onChange={(e) =>
                            updatePartEdits({
                              eyeCountOverride:
                                e.target.value === 'auto' ? 'auto' : parseInt(e.target.value, 10),
                            })
                          }
                          className="w-full px-2.5 py-1.5 rounded-md bg-[#131924] border border-white/10 text-xs text-slate-100 cursor-pointer"
                        >
                          <option value="auto">Automático</option>
                          <option value="0">0 (Ciego)</option>
                          <option value="2">2 Ojos</option>
                          <option value="4">4 Ojos</option>
                          <option value="6">6 Ojos</option>
                          <option value="8">8 Ojos</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs text-slate-400 mb-1" htmlFor="part-crest-select">
                          Cresta Dorsal
                        </label>
                        <select
                          id="part-crest-select"
                          value={genome.partEdits.crestOverride}
                          onChange={(e) =>
                            updatePartEdits({
                              crestOverride: e.target.value as PartEditsConfig['crestOverride'],
                            })
                          }
                          className="w-full px-2.5 py-1.5 rounded-md bg-[#131924] border border-white/10 text-xs text-slate-100 cursor-pointer"
                        >
                          <option value="auto">Automático</option>
                          <option value="on">Activar Cresta</option>
                          <option value="off">Ocultar Cresta</option>
                        </select>
                      </div>
                    </div>
                  )}

                  {selectedPart === 'limbs' && (
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 items-center">
                      <ToggleOption
                        label="Extremidades Activas"
                        checked={genome.partEdits.limbsEnabled}
                        onChange={(checked) => updatePartEdits({ limbsEnabled: checked })}
                      />
                      <SliderField
                        label="Longitud Extremidades"
                        value={genome.partEdits.limbLengthScale}
                        min={0.4}
                        max={1.8}
                        step={0.02}
                        onChange={(v) => updatePartEdits({ limbLengthScale: v })}
                      />
                      <SliderField
                        label="Grosor Extremidades"
                        value={genome.partEdits.limbThicknessScale}
                        min={0.5}
                        max={1.8}
                        step={0.02}
                        onChange={(v) => updatePartEdits({ limbThicknessScale: v })}
                      />
                    </div>
                  )}

                  {selectedPart === 'wings' && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-end">
                      <div>
                        <label className="block text-xs text-slate-400 mb-1" htmlFor="part-wing-select">
                          Tipo de Alas
                        </label>
                        <select
                          id="part-wing-select"
                          value={genome.partEdits.wingOverride}
                          onChange={(e) =>
                            updatePartEdits({ wingOverride: e.target.value as WingPresence | 'auto' })
                          }
                          className="w-full px-2.5 py-1.5 rounded-md bg-[#131924] border border-white/10 text-xs text-slate-100 cursor-pointer"
                        >
                          <option value="auto">Automático (Sub-Morfotipo)</option>
                          <option value="none">Sin Alas</option>
                          <option value="membranous">Membranosas</option>
                          <option value="feathered">Emplumadas</option>
                          <option value="patagium">Patagio (Murciélago/Pterosaurio)</option>
                          <option value="elytra">Élitros Endurecidos</option>
                          <option value="four_wings">4 Alas Independientes</option>
                        </select>
                      </div>
                      <SliderField
                        label="Envergadura Alar"
                        value={genome.partEdits.wingSpanScale}
                        min={0.5}
                        max={1.8}
                        step={0.02}
                        onChange={(v) => updatePartEdits({ wingSpanScale: v })}
                      />
                    </div>
                  )}

                  {selectedPart === 'tail' && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-end">
                      <div>
                        <label className="block text-xs text-slate-400 mb-1" htmlFor="part-tail-select">
                          Morfología de Cola
                        </label>
                        <select
                          id="part-tail-select"
                          value={genome.partEdits.tailOverride}
                          onChange={(e) =>
                            updatePartEdits({ tailOverride: e.target.value as TailType | 'auto' })
                          }
                          className="w-full px-2.5 py-1.5 rounded-md bg-[#131924] border border-white/10 text-xs text-slate-100 cursor-pointer"
                        >
                          <option value="auto">Automático (Sub-Morfotipo)</option>
                          <option value="none">Sin Cola</option>
                          <option value="prehensile">Prensil</option>
                          <option value="whip">Látigo</option>
                          <option value="caudal_fin">Aleta Caudal Vertical</option>
                          <option value="fluke_horizontal">Aleta Horizontal (Cetáceo)</option>
                          <option value="stinger">Aguijón</option>
                          <option value="club">Maza Ósea</option>
                        </select>
                      </div>
                      <SliderField
                        label="Longitud de Cola"
                        value={genome.partEdits.tailLengthScale}
                        min={0.4}
                        max={1.8}
                        step={0.02}
                        onChange={(v) => updatePartEdits({ tailLengthScale: v })}
                      />
                    </div>
                  )}

                  {selectedPart === 'tentacles' && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-end">
                      <div>
                        <label className="block text-xs text-slate-400 mb-1" htmlFor="part-tent-select">
                          Cantidad de Tentáculos
                        </label>
                        <select
                          id="part-tent-select"
                          value={String(genome.partEdits.tentacleCountOverride)}
                          onChange={(e) =>
                            updatePartEdits({
                              tentacleCountOverride:
                                e.target.value === 'auto' ? 'auto' : parseInt(e.target.value, 10),
                            })
                          }
                          className="w-full px-2.5 py-1.5 rounded-md bg-[#131924] border border-white/10 text-xs text-slate-100 cursor-pointer"
                        >
                          <option value="auto">Automático</option>
                          <option value="0">0 (Ninguno)</option>
                          <option value="2">2 Tentáculos</option>
                          <option value="4">4 Tentáculos</option>
                          <option value="6">6 Tentáculos</option>
                          <option value="8">8 Tentáculos</option>
                          <option value="10">10 Tentáculos</option>
                        </select>
                      </div>
                      <SliderField
                        label="Longitud Tentáculos"
                        value={genome.partEdits.tentacleLengthScale}
                        min={0.5}
                        max={1.8}
                        step={0.02}
                        onChange={(v) => updatePartEdits({ tentacleLengthScale: v })}
                      />
                    </div>
                  )}

                  {selectedPart === 'shell' && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-end">
                      <div>
                        <label className="block text-xs text-slate-400 mb-1" htmlFor="part-shell-select">
                          Tipo de Caparazón / Placas
                        </label>
                        <select
                          id="part-shell-select"
                          value={genome.partEdits.shellOverride}
                          onChange={(e) =>
                            updatePartEdits({ shellOverride: e.target.value as ShellType | 'auto' })
                          }
                          className="w-full px-2.5 py-1.5 rounded-md bg-[#131924] border border-white/10 text-xs text-slate-100 cursor-pointer"
                        >
                          <option value="auto">Automático (Sub-Morfotipo)</option>
                          <option value="none">Sin Caparazón</option>
                          <option value="turtle_carapace">Caparazón Queloniano</option>
                          <option value="spiral_shell">Concha Espiral (Nautilus)</option>
                          <option value="bivalve">Valvas Bivalvas</option>
                          <option value="armored_plates">Placas Acorazadas</option>
                          <option value="dorsal_plates">Placas Óseas Dorsales</option>
                        </select>
                      </div>
                      <p className="text-[11px] text-slate-400">
                        Cambia la armadura dorsal o añade un exoesqueleto de placas sobre cualquier arquetipo.
                      </p>
                    </div>
                  )}
                </div>
              );
            })()}

            {activeTab === 'morfologia' && (
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-x-6 gap-y-3">
                <SliderField
                  label="Grosor Corporal"
                  value={genome.thickness}
                  min={0.55}
                  max={1.55}
                  step={0.02}
                  onChange={(v) => onUpdateGenome({ thickness: v })}
                />
                <SliderField
                  label="Longitud Axial"
                  value={genome.length}
                  min={0.65}
                  max={1.65}
                  step={0.02}
                  onChange={(v) => onUpdateGenome({ length: v })}
                />
                <SliderField
                  label="Asimetría"
                  value={genome.asymmetry}
                  min={0}
                  max={0.85}
                  step={0.02}
                  onChange={(v) => onUpdateGenome({ asymmetry: v })}
                />
                <SliderField
                  label="Densidad Pelo / Escamas"
                  value={genome.detailDensity}
                  min={0}
                  max={1}
                  step={0.05}
                  onChange={(v) => onUpdateGenome({ detailDensity: v })}
                />
                <SliderField
                  label="Tamaño de Ojos"
                  value={genome.eyeScale}
                  min={0.45}
                  max={1.75}
                  step={0.05}
                  onChange={(v) => onUpdateGenome({ eyeScale: v })}
                />
                <SliderField
                  label="Complejidad Extremidades"
                  value={genome.limbComplexity}
                  min={0.2}
                  max={1.0}
                  step={0.05}
                  onChange={(v) => onUpdateGenome({ limbComplexity: v })}
                />
              </div>
            )}

            {activeTab === 'texturas' && (
              <div className="space-y-2.5">
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                  <span className="text-slate-300">
                    Mapas PBR Procedurales (Canvas 2D · Perlin FBM + Domain Warping + Worley + Filtro Sobel)
                  </span>
                  <span className="font-mono-tabular text-[11px] text-teal-300">
                    Patrón: {ARCHETYPE_PROFILES[genome.archetype].texturePattern} · {QUALITY_PRESETS[renderSettings.qualityLevel].textureResolution}px
                  </span>
                </div>
                {stats?.texturePreviews ? (
                  <div className="grid grid-cols-3 sm:grid-cols-6 gap-2.5">
                    {(
                      [
                        { key: 'albedo', label: 'Albedo', space: 'sRGB', url: stats.texturePreviews.albedo },
                        { key: 'normal', label: 'Normal (Sobel)', space: 'Linear', url: stats.texturePreviews.normal },
                        { key: 'roughness', label: 'Roughness', space: 'Linear', url: stats.texturePreviews.roughness },
                        { key: 'ao', label: 'AO', space: 'Linear', url: stats.texturePreviews.ao },
                        { key: 'emissive', label: 'Emissive', space: 'sRGB', url: stats.texturePreviews.emissive },
                        { key: 'iris', label: 'Iris Ocular', space: '256px', url: stats.texturePreviews.iris },
                      ] as const
                    ).map((item) => (
                      <div key={item.key} className="space-y-1">
                        <div className="aspect-square w-full overflow-hidden rounded-md border border-white/10 bg-[#080b10]">
                          <img
                            src={item.url}
                            alt={item.label}
                            className="h-full w-full object-cover"
                            referrerPolicy="no-referrer"
                          />
                        </div>
                        <div className="flex items-center justify-between text-[10px] leading-tight">
                          <span className="text-slate-200 truncate">{item.label}</span>
                          <span className="font-mono-tabular text-slate-400">{item.space}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-slate-400">Generando mapas procedurales...</p>
                )}
              </div>
            )}

            {activeTab === 'escena' && (() => {
              const previewPreset = NARRATIVE_SCENES[hoveredSceneId ?? renderSettings.narrativeScene];
              const previewThumb = sceneThumbs?.[previewPreset.id];
              return (
                <div className="space-y-3">
                  {/* Top Bar: Quality Tier, Auto-match, Random Scene, Ambient Audio */}
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs text-slate-300 font-medium">
                        Escenas Narrativas
                      </span>
                      <div
                        className="inline-flex items-center rounded-md bg-[#131924] border border-white/10 p-0.5"
                        role="group"
                        aria-label="Calidad gráfica"
                      >
                        {QUALITY_LEVEL_LIST.map((q) => {
                          const active = renderSettings.qualityLevel === q.id;
                          return (
                            <button
                              key={q.id}
                              type="button"
                              onClick={() => onUpdateRenderSettings({ qualityLevel: q.id })}
                              className={`px-2 py-0.5 rounded text-[11px] font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                                active
                                  ? 'bg-teal-500/25 text-teal-300'
                                  : 'text-slate-400 hover:text-slate-200'
                              }`}
                            >
                              {q.label}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <ToggleOption
                        label="Auto-Match Arquetipo"
                        checked={renderSettings.autoMatchScene}
                        onChange={(checked) =>
                          onUpdateRenderSettings({ autoMatchScene: checked })
                        }
                      />
                      <button
                        type="button"
                        onClick={onRandomizeScene}
                        className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium bg-[#131924] hover:bg-white/10 text-teal-300 border border-teal-400/30 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                      >
                        <Sparkles className="w-3.5 h-3.5" />
                        <span>Escena Aleatoria</span>
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          onUpdateRenderSettings({
                            enableAmbientAudio: !renderSettings.enableAmbientAudio,
                          })
                        }
                        title="Sintetizador ambiental procedural Web Audio"
                        className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium border transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                          renderSettings.enableAmbientAudio
                            ? 'bg-teal-500/20 text-teal-300 border-teal-400/40'
                            : 'bg-[#131924] text-slate-300 border-white/10 hover:border-white/25'
                        }`}
                      >
                        {renderSettings.enableAmbientAudio ? (
                          <Volume2 className="w-3.5 h-3.5" />
                        ) : (
                          <VolumeX className="w-3.5 h-3.5" />
                        )}
                        <span>Audio {renderSettings.enableAmbientAudio ? 'ON' : 'OFF'}</span>
                      </button>
                    </div>
                  </div>

                  {/* Visual Thumbnail Selector Grid + Live Hover Preview */}
                  <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 items-start">
                    <div className="lg:col-span-7 grid grid-cols-2 sm:grid-cols-4 gap-2">
                      {NARRATIVE_SCENE_LIST.map((sc) => {
                        const active = renderSettings.narrativeScene === sc.id;
                        const thumb = sceneThumbs?.[sc.id];
                        return (
                          <button
                            key={sc.id}
                            type="button"
                            onMouseEnter={() => setHoveredSceneId(sc.id)}
                            onMouseLeave={() => setHoveredSceneId(null)}
                            onClick={() => onSelectNarrativeScene(sc.id, true)}
                            className={`group relative overflow-hidden rounded-lg border text-left transition-colors cursor-pointer ${
                              active
                                ? 'border-teal-400 ring-1 ring-teal-400/40'
                                : 'border-white/10 hover:border-white/30'
                            }`}
                          >
                            <div
                              className="aspect-[16/10] w-full relative overflow-hidden"
                              style={{
                                background: `linear-gradient(155deg, ${sc.previewGradient[0]}, ${sc.previewGradient[1]})`,
                              }}
                            >
                              {thumb && (
                                <img
                                  src={thumb}
                                  alt={sc.name}
                                  className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                                />
                              )}
                              <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 via-black/45 to-transparent px-2 py-1">
                                <div className="flex items-center justify-between gap-1">
                                  <span
                                    className={`text-[11px] font-medium truncate ${
                                      active ? 'text-teal-300' : 'text-slate-100'
                                    }`}
                                  >
                                    {sc.shortName}
                                  </span>
                                  <span
                                    className="w-2 h-2 rounded-full shrink-0"
                                    style={{ backgroundColor: sc.accentHex }}
                                  />
                                </div>
                              </div>
                            </div>
                          </button>
                        );
                      })}
                    </div>

                    {/* Active / Hovered Scene Preview Info Card */}
                    <div className="lg:col-span-5 rounded-lg bg-[#111722] border border-white/10 p-2.5 flex gap-3 items-start">
                      <div
                        className="w-28 aspect-[16/10] rounded-md overflow-hidden border border-white/10 shrink-0"
                        style={{
                          background: `linear-gradient(155deg, ${previewPreset.previewGradient[0]}, ${previewPreset.previewGradient[1]})`,
                        }}
                      >
                        {previewThumb && (
                          <img
                            src={previewThumb}
                            alt={previewPreset.name}
                            className="h-full w-full object-cover"
                          />
                        )}
                      </div>
                      <div className="min-w-0 flex-1 space-y-1">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs font-semibold text-slate-100 truncate">
                            {previewPreset.name}
                          </span>
                          <span className="text-[10px] font-mono-tabular text-teal-300 shrink-0">
                            {hoveredSceneId && hoveredSceneId !== renderSettings.narrativeScene
                              ? 'Vista previa'
                              : 'Activa'}
                          </span>
                        </div>
                        <p className="text-[11px] leading-snug text-slate-400 line-clamp-2">
                          {previewPreset.description}
                        </p>
                        <div className="flex flex-wrap items-center gap-2 text-[10px] text-slate-400 font-mono-tabular pt-0.5">
                          <span style={{ color: previewPreset.accentHex }}>{previewPreset.tag}</span>
                          <span aria-hidden="true">·</span>
                          <span>Partículas: {previewPreset.particles.type}</span>
                          {previewPreset.lighting.godRays && (
                            <>
                              <span aria-hidden="true">·</span>
                              <span>Rayos Vol.</span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Atmospheric Sliders & Render Inspection Toggles */}
                  <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-center pt-1">
                    <div className="md:col-span-6 grid grid-cols-2 sm:grid-cols-4 gap-3">
                      <SliderField
                        label="Densidad Props"
                        value={renderSettings.propDensity}
                        min={0}
                        max={1}
                        step={0.05}
                        onChange={(v) => onUpdateRenderSettings({ propDensity: v })}
                      />
                      <SliderField
                        label="Atmósfera"
                        value={renderSettings.atmosphereIntensity}
                        min={0}
                        max={1}
                        step={0.05}
                        onChange={(v) => onUpdateRenderSettings({ atmosphereIntensity: v })}
                      />
                      <SliderField
                        label="Exposición ACES"
                        value={renderSettings.exposure}
                        min={0.7}
                        max={1.6}
                        step={0.02}
                        onChange={(v) => onUpdateRenderSettings({ exposure: v })}
                      />
                      <SliderField
                        label="Bloom Biolum."
                        value={renderSettings.bloomStrength}
                        min={0}
                        max={0.85}
                        step={0.02}
                        onChange={(v) => onUpdateRenderSettings({ bloomStrength: v })}
                      />
                    </div>

                    <div className="md:col-span-6 space-y-2">
                      <div className="flex flex-wrap gap-x-3.5 gap-y-1.5">
                        <ToggleOption
                          label="Partículas"
                          checked={renderSettings.enableParticles}
                          onChange={(checked) =>
                            onUpdateRenderSettings({ enableParticles: checked })
                          }
                        />
                        <ToggleOption
                          label="Aberración Crom."
                          checked={renderSettings.chromaticAberration}
                          onChange={(checked) =>
                            onUpdateRenderSettings({ chromaticAberration: checked })
                          }
                        />
                        <ToggleOption
                          label="Viñeta"
                          checked={renderSettings.vignette}
                          onChange={(checked) => onUpdateRenderSettings({ vignette: checked })}
                        />
                        <ToggleOption
                          label="HDRI 360°"
                          checked={renderSettings.useHdriBackground}
                          onChange={(checked) =>
                            onUpdateRenderSettings({ useHdriBackground: checked })
                          }
                        />
                        <ToggleOption
                          label="SSAO"
                          checked={renderSettings.enableSSAO}
                          onChange={(checked) => onUpdateRenderSettings({ enableSSAO: checked })}
                        />
                        <ToggleOption
                          label="Bloom"
                          checked={renderSettings.enableBloom}
                          onChange={(checked) => onUpdateRenderSettings({ enableBloom: checked })}
                        />
                        <ToggleOption
                          label="Auto-Rotar"
                          checked={renderSettings.autoRotate}
                          onChange={(checked) => onUpdateRenderSettings({ autoRotate: checked })}
                        />
                        <ToggleOption
                          label="Slots"
                          checked={renderSettings.showSlots}
                          onChange={(checked) => onUpdateRenderSettings({ showSlots: checked })}
                        />
                        <ToggleOption
                          label="Aislar Torso"
                          checked={renderSettings.isolateTorso}
                          onChange={(checked) =>
                            onUpdateRenderSettings({ isolateTorso: checked })
                          }
                        />
                        <ToggleOption
                          label="Wireframe"
                          checked={renderSettings.wireframe}
                          onChange={(checked) => onUpdateRenderSettings({ wireframe: checked })}
                        />
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={onFocusCamera}
                          className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium bg-[#131924] hover:bg-white/10 text-slate-200 border border-white/10 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                        >
                          <Focus className="w-3.5 h-3.5 text-teal-400" />
                          <span>Centrar Cámara</span>
                        </button>
                        <button
                          type="button"
                          onClick={onToggleLilGui}
                          className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium border transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                            lilGuiOpen
                              ? 'bg-teal-500/20 text-teal-300 border-teal-400/40'
                              : 'bg-[#131924] text-slate-300 border-white/10 hover:border-white/25'
                          }`}
                        >
                          <Sliders className="w-3.5 h-3.5" />
                          <span>{lilGuiOpen ? 'Cerrar lil-gui' : 'Inspector lil-gui'}</span>
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })()}

            {activeTab === 'exportar' && (
              <div className="space-y-3">
                <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                  <div className="space-y-1">
                    <div className="text-xs font-medium text-slate-200">
                      Exportación 3D (glTF 2.0 Prioritario) y Captura de Estudio
                    </div>
                    <p className="text-xs text-slate-400">
                      GLB/glTF incrusta mapas PBR (Albedo, Normal, Roughness, AO, Emissive), IOR y clearcoat. OBJ+MTL queda como respaldo legacy sin mapas embebidos.
                    </p>
                    <div className="pt-1">
                      <ToggleOption
                        label="Captura PNG con fondo transparente"
                        checked={renderSettings.transparentScreenshot}
                        onChange={(checked) =>
                          onUpdateRenderSettings({ transparentScreenshot: checked })
                        }
                      />
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    <button
                      type="button"
                      disabled={isExporting}
                      onClick={onExportGLB}
                      className="flex items-center gap-2 px-4 py-2 rounded-md text-xs font-semibold bg-teal-500 text-slate-950 hover:bg-teal-400 disabled:opacity-50 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>{isExporting ? 'Exportando...' : 'Exportar GLB (PBR)'}</span>
                    </button>
                    <button
                      type="button"
                      disabled={isExporting}
                      onClick={onExportGLTF}
                      className="flex items-center gap-2 px-3 py-2 rounded-md text-xs font-medium bg-[#131924] text-slate-200 hover:bg-white/10 border border-white/10 disabled:opacity-50 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                    >
                      <Download className="w-3.5 h-3.5 text-teal-400" />
                      <span>glTF (.gltf)</span>
                    </button>
                    <button
                      type="button"
                      onClick={onExportOBJ}
                      className="flex items-center gap-2 px-3 py-2 rounded-md text-xs font-medium bg-[#131924] text-slate-300 hover:bg-white/10 border border-white/10 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                    >
                      <Download className="w-3.5 h-3.5 text-slate-400" />
                      <span>OBJ + MTL (Legacy)</span>
                    </button>
                    <button
                      type="button"
                      onClick={onScreenshot}
                      className="flex items-center gap-2 px-3 py-2 rounded-md text-xs font-medium bg-[#131924] text-slate-200 hover:bg-white/10 border border-white/10 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                    >
                      <Camera className="w-3.5 h-3.5 text-teal-400" />
                      <span>PNG</span>
                    </button>
                  </div>
                </div>

                {lastExport && (
                  <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-1.5 rounded-md bg-[#131924] border border-teal-400/25 text-[11px] font-mono-tabular text-slate-300">
                    <span>
                      Última descarga: <span className="text-teal-300">{lastExport.filename}</span>
                    </span>
                    <span className="text-slate-400">
                      {(lastExport.byteSize / 1024).toFixed(0)} KB · {lastExport.meshCount} mallas · {lastExport.materialCount} materiales · {lastExport.embeddedMapsCount} mapas embebidos
                    </span>
                  </div>
                )}

                {/* Turntable 360° Video & URL Sharing Row */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 pt-2 border-t border-white/8">
                  {/* Turntable Video Recorder */}
                  <div className="rounded-lg bg-[#111722] border border-white/10 p-3 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5 text-xs font-medium text-slate-200">
                        <Film className="w-3.5 h-3.5 text-teal-400" />
                        <span>Turntable en Vídeo 360°</span>
                      </div>
                      <span className="text-[10px] font-mono-tabular text-slate-400">
                        WebM VP9 / MP4 · 6 Mbps
                      </span>
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2 text-[11px]">
                        <label className="text-slate-400" htmlFor="tt-dur">
                          Duración
                        </label>
                        <select
                          id="tt-dur"
                          disabled={isRecordingTurntable}
                          value={turntableDuration}
                          onChange={(e) => setTurntableDuration(parseInt(e.target.value, 10))}
                          className="px-2 py-1 rounded bg-[#131924] border border-white/10 text-slate-100 text-[11px] cursor-pointer"
                        >
                          <option value={4}>4 s</option>
                          <option value={6}>6 s</option>
                          <option value={8}>8 s</option>
                          <option value={10}>10 s</option>
                        </select>
                        <label className="text-slate-400 ml-1" htmlFor="tt-rev">
                          Giros
                        </label>
                        <select
                          id="tt-rev"
                          disabled={isRecordingTurntable}
                          value={turntableRevs}
                          onChange={(e) => setTurntableRevs(parseInt(e.target.value, 10))}
                          className="px-2 py-1 rounded bg-[#131924] border border-white/10 text-slate-100 text-[11px] cursor-pointer"
                        >
                          <option value={1}>1 vuelta</option>
                          <option value={2}>2 vueltas</option>
                        </select>
                      </div>

                      <ToggleOption
                        label="Animar"
                        checked={turntableAnimate}
                        onChange={setTurntableAnimate}
                      />

                      {isRecordingTurntable ? (
                        <button
                          type="button"
                          onClick={onStopTurntable}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium bg-rose-500/20 text-rose-300 border border-rose-400/40 hover:bg-rose-500/30 transition-colors whitespace-nowrap cursor-pointer"
                        >
                          <Square className="w-3 h-3 fill-current" />
                          <span>Cancelar ({Math.round(turntableProgress * 100)}%)</span>
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() =>
                            onStartTurntable({
                              durationSec: turntableDuration,
                              revolutions: turntableRevs,
                              animateCreature: turntableAnimate,
                            })
                          }
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold bg-sky-500 text-slate-950 hover:bg-sky-400 transition-colors whitespace-nowrap cursor-pointer"
                        >
                          <Film className="w-3.5 h-3.5" />
                          <span>Grabar Vídeo 360°</span>
                        </button>
                      )}
                    </div>

                    {isRecordingTurntable && (
                      <div className="h-1.5 w-full rounded-full bg-white/10 overflow-hidden">
                        <div
                          className="h-full bg-sky-400 transition-all duration-100"
                          style={{ width: `${Math.round(turntableProgress * 100)}%` }}
                        />
                      </div>
                    )}

                    {turntableError && (
                      <p className="text-[11px] text-rose-400">{turntableError}</p>
                    )}

                    {lastTurntable && !isRecordingTurntable && (
                      <div className="text-[11px] font-mono-tabular text-slate-300 flex flex-wrap items-center justify-between gap-1">
                        <span className="text-sky-300 truncate">{lastTurntable.filename}</span>
                        <span className="text-slate-400">
                          {(lastTurntable.byteSize / 1024).toFixed(0)} KB · {lastTurntable.width}×{lastTurntable.height} · {lastTurntable.durationSec}s
                        </span>
                      </div>
                    )}
                  </div>

                  {/* URL Genome Share & Import */}
                  <div className="rounded-lg bg-[#111722] border border-white/10 p-3 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5 text-xs font-medium text-slate-200">
                        <Link2 className="w-3.5 h-3.5 text-teal-400" />
                        <span>Compartir Criatura por URL</span>
                      </div>
                      <button
                        type="button"
                        onClick={onShareUrl}
                        className="flex items-center gap-1.5 px-2.5 py-1 rounded text-[11px] font-medium bg-teal-500/20 text-teal-300 border border-teal-400/35 hover:bg-teal-500/30 transition-colors whitespace-nowrap cursor-pointer"
                      >
                        {shareFeedback ? <Check className="w-3 h-3" /> : <Share2 className="w-3 h-3" />}
                        <span>{shareFeedback ? (shareFeedback.copied ? 'Copiado' : 'Generado') : 'Generar y Copiar'}</span>
                      </button>
                    </div>

                    {shareFeedback && (
                      <input
                        type="text"
                        readOnly
                        value={shareFeedback.url}
                        onFocus={(e) => e.currentTarget.select()}
                        aria-label="Enlace compartible de la criatura"
                        className="w-full px-2 py-1 rounded bg-[#0a0e15] border border-teal-400/25 text-[11px] font-mono-tabular text-teal-200 focus:outline-none"
                      />
                    )}

                    <div className="flex items-center gap-1.5">
                      <input
                        type="text"
                        value={importUrlInput}
                        onChange={(e) => {
                          setImportUrlInput(e.target.value);
                          if (importError) setImportError(null);
                        }}
                        placeholder="Pega una URL compartida (?c=...) para cargar espécimen"
                        aria-label="Importar criatura desde enlace"
                        className="flex-1 min-w-0 px-2 py-1 rounded bg-[#131924] border border-white/10 text-[11px] text-slate-200 placeholder:text-slate-500 focus:outline-none focus:border-teal-400"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          const ok = onImportShareUrl(importUrlInput);
                          if (ok) {
                            setImportUrlInput('');
                            setImportError(null);
                          } else {
                            setImportError('Enlace o código de criatura no válido.');
                          }
                        }}
                        className="px-2.5 py-1 rounded text-[11px] font-medium bg-[#131924] hover:bg-white/10 text-slate-200 border border-white/10 whitespace-nowrap cursor-pointer"
                      >
                        Cargar URL
                      </button>
                    </div>
                    {importError && <p className="text-[11px] text-rose-400">{importError}</p>}
                  </div>
                </div>
              </div>
            )}

            {/* Unboxed Topology & Geometry Summary Line */}
            {stats && (
              <div className="mt-3 pt-2.5 border-t border-white/8 space-y-1">
                <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-300">
                  <div className="flex flex-wrap items-center gap-2">
                    <span>
                      Topología: <strong className="text-teal-300">{stats.subMorphotypeName}</strong>
                      {stats.hybridPartnerName && genome.morphVariation > 0.02
                        ? ` × ${stats.hybridPartnerName}`
                        : ''}
                    </span>
                    <span aria-hidden="true">·</span>
                    <span>Eje: {AXIS_LABELS[stats.bodyAxis]}</span>
                    <span aria-hidden="true">·</span>
                    <span>{stats.limbSummary}</span>
                    <span aria-hidden="true">·</span>
                    <span>Pose: {POSE_PRESETS[genome.pose].label}</span>
                    <span aria-hidden="true">·</span>
                    <span>Anim: {ANIMATION_MODES[genome.animationMode ?? 'auto'].label}</span>
                    {stats.rarityLabel && (
                      <>
                        <span aria-hidden="true">·</span>
                        <span style={{ color: getRarityClassification(genome.rarity).color }}>
                          {stats.rarityLabel}
                        </span>
                      </>
                    )}
                  </div>
                  {stats.specialFeatures.length > 0 && (
                    <span className="text-[10px] text-slate-400">
                      Rasgos: {stats.specialFeatures.slice(0, 3).join(', ')}
                    </span>
                  )}
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-400 font-mono-tabular">
                  <div className="flex flex-wrap items-center gap-2">
                    <span>{stats.vertices.toLocaleString('es-ES')} vértices</span>
                    <span aria-hidden="true">·</span>
                    <span>{stats.triangles.toLocaleString('es-ES')} triángulos</span>
                    <span aria-hidden="true">·</span>
                    <span>{stats.partsCount} módulos anatómicos</span>
                    <span aria-hidden="true">·</span>
                    <span>{stats.slotCount} slots SDF</span>
                    <span aria-hidden="true">·</span>
                    <span>Subdivisión Loop Nv.{stats.subdivisionLevel}</span>
                    {stats.lodLevels && stats.lodLevels > 1 && (
                      <>
                        <span aria-hidden="true">·</span>
                        <span>LOD {stats.lodLevels} nv.</span>
                      </>
                    )}
                  </div>
                  <div>
                    Generado en {stats.generationMs} ms{stats.cacheHit ? ' (caché)' : ''}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

interface SliderFieldProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (val: number) => void;
}

const SliderField: React.FC<SliderFieldProps> = ({ label, value, min, max, step, onChange }) => (
  <div className="space-y-1">
    <div className="flex items-center justify-between text-xs">
      <span className="text-slate-300">{label}</span>
      <span className="font-mono-tabular text-teal-300">{value.toFixed(2)}</span>
    </div>
    <input
      type="range"
      min={min}
      max={max}
      step={step}
      value={value}
      onChange={(e) => onChange(parseFloat(e.target.value))}
      className="w-full studio-slider cursor-pointer"
    />
  </div>
);

interface ToggleOptionProps {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}

const ToggleOption: React.FC<ToggleOptionProps> = ({ label, checked, onChange }) => (
  <label className="inline-flex items-center gap-2 text-xs text-slate-300 cursor-pointer select-none">
    <input
      type="checkbox"
      checked={checked}
      onChange={(e) => onChange(e.target.checked)}
      className="w-3.5 h-3.5 accent-teal-400 rounded cursor-pointer"
    />
    <span>{label}</span>
  </label>
);
