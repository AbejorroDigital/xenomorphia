import React from 'react';
import { CheckCircle2, RefreshCw, X } from 'lucide-react';
import { ARCHETYPE_PROFILES } from '../engine/archetypes';
import { ArchetypeExplorationResult, ExplorerSpecimen } from '../engine/explorerRenderer';
import { BodyAxis } from '../engine/types';

interface ArchetypeExplorerModalProps {
  open: boolean;
  loading: boolean;
  result: ArchetypeExplorationResult | null;
  onClose: () => void;
  onRegenerate: () => void;
  onSelectSpecimen: (specimen: ExplorerSpecimen) => void;
}

const AXIS_LABELS: Record<BodyAxis, string> = {
  horizontal: 'Horizontal',
  vertical: 'Vertical',
  curved: 'Curvado',
  coiled: 'Serpentino',
};

export const ArchetypeExplorerModal: React.FC<ArchetypeExplorerModalProps> = ({
  open,
  loading,
  result,
  onClose,
  onRegenerate,
  onSelectSpecimen,
}) => {
  if (!open) return null;

  const profile = result ? ARCHETYPE_PROFILES[result.archetype] : null;
  const report = result?.diversityReport;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Explorador de Sub-Morfotipos"
    >
      <div className="w-full max-w-6xl max-h-[90vh] flex flex-col rounded-xl bg-[#0b1018] border border-white/12 shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5 border-b border-white/10">
          <div>
            <h2 className="font-display text-base font-semibold text-slate-100">
              Explorar Arquetipo: {profile?.name ?? '—'}
            </h2>
            <p className="text-xs text-slate-400">
              10 topologías estructurales generadas en estudio 3D. Haz clic en cualquier espécimen para cargarlo en el visor principal.
            </p>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              disabled={loading}
              onClick={onRegenerate}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium bg-teal-500 text-slate-950 hover:bg-teal-400 disabled:opacity-50 transition-colors cursor-pointer whitespace-nowrap"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              <span>Generar 10 Nuevas Variantes</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label="Cerrar galería"
              className="p-1.5 rounded-md text-slate-400 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* 50-Seed Diversity Audit Strip */}
        {report && (
          <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-2.5 bg-[#0f1622] border-b border-white/8 text-xs">
            <div className="flex items-center gap-2 text-teal-300 font-medium">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>
                Auditoría de Diversidad ({report.sampleCount} seeds):{' '}
                {report.passesValidation ? 'Validación Estructural Aprobada' : 'Revisión Requerida'}
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-3 text-[11px] font-mono-tabular text-slate-300">
              <span>
                Sub-morfotipos únicos: <strong className="text-white">{report.uniqueSubMorphotypes}/{report.totalAvailableSubMorphotypes}</strong>
              </span>
              <span aria-hidden="true">·</span>
              <span>
                Rango extremidades: <strong className="text-white">{report.minLimbs}–{report.maxLimbs}</strong>
              </span>
              <span aria-hidden="true">·</span>
              <span>
                Ratio cuerpo/extremidad: <strong className="text-white">{report.minBodyLimbRatio}–{report.maxBodyLimbRatio}</strong>
              </span>
              <span aria-hidden="true">·</span>
              <span>
                Especializaciones: <strong className="text-white">{report.specializedCount}/{report.sampleCount}</strong>
              </span>
            </div>
          </div>
        )}

        {/* 10-Specimen Grid */}
        <div className="flex-1 overflow-y-auto p-5">
          {loading && !result ? (
            <div className="py-20 text-center text-sm text-slate-400">
              Renderizando 10 topologías 3D del arquetipo...
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3.5">
              {result?.specimens.map((spec) => (
                <button
                  key={`${spec.subMorphotypeId}-${spec.index}`}
                  type="button"
                  onClick={() => onSelectSpecimen(spec)}
                  className="group text-left rounded-lg bg-[#111824] border border-white/10 hover:border-teal-400/60 overflow-hidden transition-colors cursor-pointer flex flex-col"
                >
                  <div className="relative aspect-[4/3] w-full bg-[#0a0f17] overflow-hidden">
                    <img
                      src={spec.thumbnailUrl}
                      alt={spec.subMorphotypeName}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                    />
                    <span className="absolute top-1.5 right-1.5 text-[10px] font-mono-tabular text-slate-300 bg-black/65 px-1.5 py-0.5 rounded">
                      #{spec.seed}
                    </span>
                  </div>
                  <div className="p-2.5 space-y-1 flex-1 flex flex-col justify-between">
                    <div>
                      <div className="text-xs font-semibold text-slate-100 group-hover:text-teal-300 transition-colors truncate">
                        {spec.subMorphotypeName}
                      </div>
                      <div className="text-[10px] text-slate-400 truncate">{spec.exampleTaxa}</div>
                    </div>
                    <div className="pt-1 border-t border-white/6 text-[10px] text-slate-300 space-y-0.5">
                      <div className="truncate">
                        Eje: <span className="text-slate-200">{AXIS_LABELS[spec.bodyAxis]}</span> · {spec.symmetry}
                      </div>
                      <div className="truncate text-teal-300/90">{spec.limbSummary}</div>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
