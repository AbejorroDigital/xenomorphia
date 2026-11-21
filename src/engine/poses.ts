import * as THREE from 'three';
import { AnimationModeId, ArchetypeId, PosePresetId, SubMorphotype } from './types';

export interface PosePresetMeta {
  id: PosePresetId;
  label: string;
  description: string;
  bodyPitch: number;
  bodyLift: number;
  breathAmp: number;
  breathSpeed: number;
}

export interface AnimationModeMeta {
  id: AnimationModeId;
  label: string;
  description: string;
}

export const ANIMATION_MODES: Record<AnimationModeId, AnimationModeMeta> = {
  auto: {
    id: 'auto',
    label: 'Auto',
    description: 'Selecciona el ciclo biológico según la pose, hábitat y sub-morfotipo',
  },
  idle: {
    id: 'idle',
    label: 'Respirar',
    description: 'Respiración pectoral orgánica, parpadeo ocular y balanceo suave',
  },
  walk: {
    id: 'walk',
    label: 'Caminar',
    description: 'Marcha diagonal cuadrúpeda o trípode hexápoda con balanceo pélvico',
  },
  run: {
    id: 'run',
    label: 'Correr',
    description: 'Zancada veloz de galope o carrera con contrabalanceo caudal',
  },
  swim: {
    id: 'swim',
    label: 'Nadar',
    description: 'Onda sinusoidal anguiliforme de cuerpo completo y batida de aletas',
  },
  fly: {
    id: 'fly',
    label: 'Volar',
    description: 'Aleteo asimétrico potente, sustentación aérea y alabeo dinámico',
  },
  stalk: {
    id: 'stalk',
    label: 'Acechar',
    description: 'Paso sigiloso agazapado con escaneo craneal y tensión muscular',
  },
  paused: {
    id: 'paused',
    label: 'Pausa',
    description: 'Congela la animación procedural manteniendo exacta la pose actual',
  },
};

export const ANIMATION_MODE_LIST: AnimationModeMeta[] = [
  ANIMATION_MODES.auto,
  ANIMATION_MODES.idle,
  ANIMATION_MODES.walk,
  ANIMATION_MODES.run,
  ANIMATION_MODES.swim,
  ANIMATION_MODES.fly,
  ANIMATION_MODES.stalk,
  ANIMATION_MODES.paused,
];

export const POSE_PRESETS: Record<PosePresetId, PosePresetMeta> = {
  neutral: {
    id: 'neutral',
    label: 'Reposo',
    description: 'Postura anatómica equilibrada con respiración orgánica suave',
    bodyPitch: 0.0,
    bodyLift: 0.0,
    breathAmp: 0.014,
    breathSpeed: 2.1,
  },
  alert: {
    id: 'alert',
    label: 'Alerta',
    description: 'Torso inclinado al acecho, cabeza vigilante y cola elevada en tensión',
    bodyPitch: 0.14,
    bodyLift: -0.02,
    breathAmp: 0.02,
    breathSpeed: 3.1,
  },
  roar: {
    id: 'roar',
    label: 'Rugido',
    description: 'Tórax alzado en amenaza, extremidades abiertas y alas desplegadas',
    bodyPitch: -0.24,
    bodyLift: 0.05,
    breathAmp: 0.028,
    breathSpeed: 2.6,
  },
  sprint: {
    id: 'sprint',
    label: 'Carrera',
    description: 'Inclinación aerodinámica hacia delante y zancada asimétrica dinámica',
    bodyPitch: 0.22,
    bodyLift: 0.03,
    breathAmp: 0.022,
    breathSpeed: 4.8,
  },
  flight: {
    id: 'flight',
    label: 'Vuelo / Nado',
    description: 'Suspensión aérea o pelágica con aleteo y ondulación de apéndices',
    bodyPitch: -0.08,
    bodyLift: 0.22,
    breathAmp: 0.018,
    breathSpeed: 3.4,
  },
  curled: {
    id: 'curled',
    label: 'Defensiva',
    description: 'Cuerpo recogido hacia el centro protegiendo cráneo y extremidades',
    bodyPitch: 0.26,
    bodyLift: -0.05,
    breathAmp: 0.01,
    breathSpeed: 1.5,
  },
};

export const POSE_PRESET_LIST: PosePresetMeta[] = [
  POSE_PRESETS.neutral,
  POSE_PRESETS.alert,
  POSE_PRESETS.roar,
  POSE_PRESETS.sprint,
  POSE_PRESETS.flight,
  POSE_PRESETS.curled,
];

/**
 * Resolves 'auto' procedural animation mode based on current pose, archetype, and sub-morphotype.
 */
export function resolveEffectiveAnimationMode(
  requested: AnimationModeId,
  poseId: PosePresetId,
  archetype?: ArchetypeId,
  subMorphotype?: SubMorphotype
): Exclude<AnimationModeId, 'auto'> {
  if (requested !== 'auto') return requested;
  if (poseId === 'sprint') return 'run';
  if (poseId === 'curled') return 'idle';
  if (poseId === 'flight') {
    if (archetype === 'pez' || archetype === 'molusco') return 'swim';
    if (subMorphotype && subMorphotype.wingPresence === 'none' && subMorphotype.hasFins) {
      return 'swim';
    }
    return 'fly';
  }
  if (poseId === 'alert') return 'stalk';
  if (archetype === 'pez' || archetype === 'molusco') return 'swim';
  if (subMorphotype?.hasFins && subMorphotype.limbConfiguration.hindlimbs.count === 0) return 'swim';
  return 'idle';
}

/**
 * Smoothly applies articulated joint rotations and full procedural locomotion cycles
 * around each part's SDF socket pivot, keeping geometry watertight at socket origins
 * while supporting live transitions, pausing, and export baking.
 */
export function applyCreaturePose(
  creatureRoot: THREE.Group,
  poseId: PosePresetId,
  elapsed: number,
  delta: number,
  immediate = false,
  animMode: AnimationModeId = 'auto',
  archetype?: ArchetypeId,
  subMorphotype?: SubMorphotype
): void {
  const pose = POSE_PRESETS[poseId] ?? POSE_PRESETS.neutral;
  const mode = resolveEffectiveAnimationMode(animMode, poseId, archetype, subMorphotype);
  const dampRate = immediate ? 100 : 8.0;
  const step = (cur: number, target: number) =>
    immediate ? target : THREE.MathUtils.damp(cur, target, dampRate, delta);

  const anatomy = creatureRoot.getObjectByName('AnatomyRoot');
  if (anatomy) {
    const baseScale = (anatomy.userData.baseScale as number | undefined) ?? anatomy.scale.x;
    const baseX = (anatomy.userData.basePosX as number | undefined) ?? anatomy.position.x;
    const baseY = (anatomy.userData.basePosY as number | undefined) ?? anatomy.position.y;
    const baseZ = (anatomy.userData.basePosZ as number | undefined) ?? anatomy.position.z;
    anatomy.userData.baseScale = baseScale;
    anatomy.userData.basePosX = baseX;
    anatomy.userData.basePosY = baseY;
    anatomy.userData.basePosZ = baseZ;

    const breathFreq =
      mode === 'run' ? 5.6 : mode === 'walk' ? 3.2 : mode === 'fly' ? 3.8 : pose.breathSpeed;
    const breathAmp =
      mode === 'paused'
        ? 0.0
        : mode === 'run'
          ? pose.breathAmp * 1.45
          : pose.breathAmp;

    const breath = 1.0 + Math.sin(elapsed * breathFreq) * breathAmp;
    const radialCounterBreath = 1.0 - Math.sin(elapsed * breathFreq) * breathAmp * 0.35;

    let bodyPitch = pose.bodyPitch;
    let bodyYaw = 0;
    let bodyRoll = 0;
    let liftY = pose.bodyLift;
    let swayX = 0;
    let swayZ = 0;

    if (mode === 'idle') {
      bodyYaw = poseId === 'alert' ? Math.sin(elapsed * 1.2) * 0.09 : Math.sin(elapsed * 0.75) * 0.035;
      bodyRoll = Math.sin(elapsed * 0.9) * 0.015;
    } else if (mode === 'walk') {
      const t = elapsed * 3.4;
      liftY += Math.abs(Math.sin(t)) * 0.045;
      bodyPitch += Math.sin(t * 2.0) * 0.035;
      bodyRoll = Math.sin(t) * 0.055;
      bodyYaw = Math.cos(t) * 0.045;
      swayX = Math.sin(t) * 0.025;
    } else if (mode === 'run') {
      const t = elapsed * 6.8;
      liftY += Math.abs(Math.sin(t)) * 0.095;
      bodyPitch += 0.08 + Math.sin(t * 2.0 - 0.5) * 0.085;
      bodyRoll = Math.sin(t) * 0.045;
      swayZ = Math.cos(t * 2.0) * 0.035;
    } else if (mode === 'swim') {
      const t = elapsed * 3.6;
      liftY += 0.14 + Math.sin(t * 0.65) * 0.055;
      bodyYaw = Math.sin(t) * 0.14;
      bodyRoll = Math.cos(t) * 0.09;
      bodyPitch += Math.sin(t * 0.65 - 0.4) * 0.05;
      swayX = -Math.sin(t) * 0.045;
    } else if (mode === 'fly') {
      const t = elapsed * 4.8;
      liftY += Math.max(0.18, pose.bodyLift) + Math.sin(t - 0.8) * 0.085;
      bodyPitch += -0.06 + Math.sin(t) * 0.06;
      bodyRoll = Math.sin(t * 0.5) * 0.08;
    } else if (mode === 'stalk') {
      const t = elapsed * 1.85;
      // Stealth step-pause envelope
      const stealthStep = Math.tanh(Math.sin(t) * 2.4);
      liftY += -0.045 + Math.abs(stealthStep) * 0.018;
      bodyPitch += 0.16;
      bodyRoll = stealthStep * 0.04;
      bodyYaw = Math.sin(elapsed * 0.8) * 0.07;
    }

    anatomy.scale.set(baseScale * radialCounterBreath, baseScale * breath, baseScale);
    anatomy.rotation.x = step(anatomy.rotation.x, bodyPitch);
    anatomy.rotation.y = step(anatomy.rotation.y, bodyYaw);
    anatomy.rotation.z = step(anatomy.rotation.z, bodyRoll);
    anatomy.position.x = step(anatomy.position.x, baseX + swayX * baseScale);
    anatomy.position.y = step(anatomy.position.y, baseY + liftY * baseScale);
    anatomy.position.z = step(anatomy.position.z, baseZ + swayZ * baseScale);
  }

  creatureRoot.traverse((obj) => {
    const role = obj.userData.partRole as string | undefined;
    if (!role || !obj.name.startsWith('JointPivot_')) return;

    const side = (obj.userData.partSide as number | undefined) ?? 1;
    const idx = (obj.userData.partIndex as number | undefined) ?? 0;
    const s = side === 0 ? 1 : side;
    const phase = idx * 1.15 + (s > 0 ? 0 : Math.PI);

    // Pose baseline angles
    let px = 0;
    let py = 0;
    let pz = 0;

    if (role === 'head' || role === 'eye') {
      if (poseId === 'alert') px = -0.2;
      else if (poseId === 'roar') px = -0.36;
      else if (poseId === 'sprint') px = -0.16;
      else if (poseId === 'flight') px = -0.14;
      else if (poseId === 'curled') px = 0.4;
    } else if (role === 'forelimb') {
      if (poseId === 'alert') {
        px = -0.22;
        pz = s * 0.12;
      } else if (poseId === 'roar') {
        px = -0.74;
        py = s * 0.28;
        pz = s * 0.54;
      } else if (poseId === 'sprint') {
        px = -0.14;
      } else if (poseId === 'flight') {
        px = 0.42;
        pz = -s * 0.22;
      } else if (poseId === 'curled') {
        px = 0.56;
        pz = -s * 0.34;
      }
    } else if (role === 'hindlimb') {
      if (poseId === 'alert') {
        px = 0.16;
        pz = s * 0.08;
      } else if (poseId === 'roar') {
        px = 0.15;
        pz = s * 0.22;
      } else if (poseId === 'flight') {
        px = 0.58;
        pz = -s * 0.18;
      } else if (poseId === 'curled') {
        px = -0.5;
        pz = -s * 0.26;
      }
    } else if (role === 'wing') {
      if (poseId === 'alert') {
        pz = s * 0.2;
        py = -s * 0.14;
      } else if (poseId === 'roar') {
        pz = s * 0.45;
        py = s * 0.24;
      } else if (poseId === 'sprint') {
        pz = -s * 0.22;
        py = -s * 0.28;
      } else if (poseId === 'curled') {
        pz = -s * 0.56;
        py = -s * 0.4;
      }
    } else if (role === 'tail') {
      if (poseId === 'alert') px = 0.34;
      else if (poseId === 'roar') px = 0.42;
      else if (poseId === 'sprint') px = 0.12;
      else if (poseId === 'flight') px = 0.08;
      else if (poseId === 'curled') {
        px = -0.52;
        py = 0.4;
      }
    } else if (role === 'tentacle') {
      if (poseId === 'roar') {
        px = -0.4;
        pz = s * 0.32;
      } else if (poseId === 'curled') {
        px = -0.5;
        pz = -s * 0.28;
      }
    }

    // Dynamic procedural locomotion offsets layered cleanly over the pose baseline
    let ax = 0;
    let ay = 0;
    let az = 0;

    if (mode === 'idle') {
      if (role === 'head') {
        ax = Math.sin(elapsed * 1.4) * 0.04;
        ay =
          poseId === 'alert'
            ? Math.sin(elapsed * 1.65) * 0.16
            : poseId === 'roar'
              ? Math.sin(elapsed * 7.2) * 0.035
              : Math.sin(elapsed * 0.85) * 0.06;
      } else if (role === 'eye') {
        // Subtle organic ocular tracking saccades
        const saccade = Math.sin(elapsed * 1.9 + idx * 0.7) * 0.05;
        ay = saccade;
      } else if (role === 'forelimb') {
        ax = Math.sin(elapsed * 1.5 + idx) * 0.035;
      } else if (role === 'wing') {
        az = s * Math.sin(elapsed * 1.7 + idx * 0.4) * (poseId === 'roar' ? 0.08 : 0.045);
      } else if (role === 'tail') {
        ay = Math.sin(elapsed * 1.6) * (poseId === 'roar' ? 0.2 : 0.1);
        ax = Math.cos(elapsed * 1.1) * 0.04;
      } else if (role === 'tentacle') {
        ax = Math.sin(elapsed * 2.1 + phase) * 0.14;
        az = Math.cos(elapsed * 1.75 + phase) * 0.12;
      } else if (role === 'crest') {
        ax = Math.sin(elapsed * 2.2) * 0.03;
      }
    } else if (mode === 'walk') {
      const t = elapsed * 3.4;
      // Diagonal tetrapod / alternating insect tripod phase
      const diagPhase = (s > 0 ? 0 : Math.PI) + (idx % 2) * Math.PI;
      if (role === 'head') {
        ax = -Math.sin(t * 2.0) * 0.06;
        ay = Math.sin(t) * 0.05;
      } else if (role === 'forelimb') {
        const swing = Math.sin(t + diagPhase);
        const lift = Math.max(0, Math.cos(t + diagPhase));
        ax = swing * 0.34;
        az = s * lift * 0.1;
      } else if (role === 'hindlimb') {
        const hindPhase = diagPhase + Math.PI;
        const swing = Math.sin(t + hindPhase);
        const lift = Math.max(0, Math.cos(t + hindPhase));
        ax = swing * 0.36;
        az = s * lift * 0.08;
      } else if (role === 'wing') {
        az = s * (0.08 + Math.sin(t * 2.0) * 0.07);
      } else if (role === 'tail') {
        ay = Math.sin(t - 0.7) * 0.22;
        ax = Math.sin(t * 2.0) * 0.05;
      } else if (role === 'tentacle') {
        ax = Math.sin(t + phase) * 0.18;
        az = Math.cos(t * 0.9 + phase) * 0.12;
      }
    } else if (mode === 'run') {
      const t = elapsed * 6.8;
      const diagPhase = (s > 0 ? 0 : Math.PI) + (idx % 2) * Math.PI;
      if (role === 'head') {
        ax = -0.14 - Math.sin(t * 2.0) * 0.08;
      } else if (role === 'forelimb') {
        ax = Math.sin(t + diagPhase) * 0.54 - 0.1;
        az = s * Math.max(0, Math.cos(t + diagPhase)) * 0.16;
      } else if (role === 'hindlimb') {
        ax = Math.sin(t + diagPhase + Math.PI * 0.82) * 0.58;
        az = s * Math.max(0, Math.cos(t + diagPhase + Math.PI * 0.82)) * 0.14;
      } else if (role === 'wing') {
        az = s * (0.14 + Math.sin(t * 1.5) * 0.12);
        ay = -s * 0.22;
      } else if (role === 'tail') {
        ay = Math.sin(t - 0.5) * 0.32;
        ax = Math.cos(t * 2.0) * 0.12;
      } else if (role === 'tentacle') {
        ax = 0.28 + Math.sin(t * 0.9 + phase) * 0.22;
        ay = Math.cos(t * 0.8 + phase) * 0.14;
      }
    } else if (mode === 'swim') {
      const t = elapsed * 3.6;
      if (role === 'head') {
        ay = Math.sin(t + 0.55) * 0.12;
      } else if (role === 'forelimb') {
        // Sculling pectoral sweep
        ax = 0.28 + Math.sin(t + idx * 0.6) * 0.22;
        ay = -s * (0.24 + Math.cos(t + idx * 0.6) * 0.28);
        az = -s * (0.12 + Math.sin(t + idx * 0.6) * 0.18);
      } else if (role === 'hindlimb') {
        ax = 0.45 + Math.sin(t + Math.PI * 0.5) * 0.18;
        az = -s * 0.14;
      } else if (role === 'wing') {
        // Manta / aquatic gliding stroke
        az = s * Math.sin(t * 0.85) * 0.38;
        ax = 0.15 + Math.cos(t * 0.85) * 0.12;
      } else if (role === 'tail') {
        ay = Math.sin(t - 1.15) * 0.48;
        az = Math.cos(t - 1.15) * 0.09;
      } else if (role === 'tentacle') {
        ax = 0.42 + Math.sin(t * 1.15 + phase) * 0.28;
        ay = Math.cos(t * 1.05 + phase) * 0.22;
      }
    } else if (mode === 'fly') {
      const t = elapsed * 4.8;
      if (role === 'head') {
        ax = -0.12 + Math.sin(t) * 0.04;
      } else if (role === 'wing') {
        // Asymmetric power downstroke + feathering pitch
        const flap = Math.sin(t + idx * 0.45) + 0.26 * Math.sin(t * 2.0 + idx * 0.45);
        az = s * (0.14 + flap * 0.48);
        ax = 0.1 + Math.cos(t + idx * 0.45) * 0.18;
        ay = -s * Math.sin(t + idx * 0.45) * 0.14;
      } else if (role === 'forelimb') {
        ax = 0.34 + Math.sin(t * 0.5) * 0.08;
        az = -s * 0.16;
      } else if (role === 'hindlimb') {
        ax = 0.54 + Math.sin(t * 0.5 + 0.4) * 0.08;
        az = -s * 0.14;
      } else if (role === 'tail') {
        ax = 0.06 + Math.sin(t - 0.6) * 0.14;
        ay = Math.sin(t * 0.5) * 0.2;
      } else if (role === 'tentacle') {
        ax = 0.38 + Math.sin(t * 0.85 + phase) * 0.24;
        az = Math.cos(t * 0.75 + phase) * 0.18;
      }
    } else if (mode === 'stalk') {
      const t = elapsed * 1.85;
      const diagPhase = (s > 0 ? 0 : Math.PI) + (idx % 2) * Math.PI;
      const stealthStep = Math.tanh(Math.sin(t + diagPhase) * 2.4);
      if (role === 'head') {
        ax = -0.26;
        ay = Math.sin(elapsed * 1.1) * 0.18;
      } else if (role === 'forelimb') {
        ax = -0.15 + stealthStep * 0.26;
        az = s * 0.14;
      } else if (role === 'hindlimb') {
        ax = 0.12 - stealthStep * 0.24;
        az = s * 0.1;
      } else if (role === 'wing') {
        az = -s * 0.28;
        ay = -s * 0.25;
      } else if (role === 'tail') {
        ax = 0.22;
        ay = Math.sin(elapsed * 4.5) * 0.08 + Math.sin(t) * 0.12;
      } else if (role === 'tentacle') {
        ax = Math.sin(t + phase) * 0.12;
        az = Math.cos(t + phase) * 0.1;
      }
    }

    obj.rotation.x = step(obj.rotation.x, px + ax);
    obj.rotation.y = step(obj.rotation.y, py + ay);
    obj.rotation.z = step(obj.rotation.z, pz + az);
  });
}
