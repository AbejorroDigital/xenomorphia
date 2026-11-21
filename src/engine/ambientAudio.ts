import { NarrativeSceneId } from './types';

/**
 * 100% procedural Web Audio API ambient soundscape synthesizer for narrative scenes.
 * Zero external audio assets; only activates on explicit user gesture/toggle.
 */
export class ProceduralAmbientAudio {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private stopCurrentNodes: (() => void) | null = null;
  private activeScene: NarrativeSceneId | null = null;
  private enabled = false;

  public setState(sceneId: NarrativeSceneId, enabled: boolean): void {
    if (this.enabled === enabled && this.activeScene === sceneId) return;
    this.enabled = enabled;
    this.activeScene = sceneId;

    if (!enabled) {
      this.stopSound();
      return;
    }

    this.startSound(sceneId);
  }

  private ensureContext(): AudioContext | null {
    if (typeof window === 'undefined') return null;
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return null;

    if (!this.ctx) {
      this.ctx = new AudioCtx();
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.value = 0.14;
      this.masterGain.connect(this.ctx.destination);
    }
    if (this.ctx.state === 'suspended') {
      void this.ctx.resume();
    }
    return this.ctx;
  }

  private stopSound(): void {
    if (this.stopCurrentNodes) {
      this.stopCurrentNodes();
      this.stopCurrentNodes = null;
    }
  }

  private startSound(sceneId: NarrativeSceneId): void {
    this.stopSound();
    const ctx = this.ensureContext();
    if (!ctx || !this.masterGain) return;

    const nodesToStop: Array<{ stop?: () => void; disconnect: () => void }> = [];

    // Create 2-second seamless filtered noise buffer for wind/water/rumble
    const bufferSize = ctx.sampleRate * 2;
    const noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    let lastOut = 0;
    for (let i = 0; i < bufferSize; i++) {
      const white = Math.random() * 2 - 1;
      data[i] = (lastOut + 0.04 * white) / 1.04;
      lastOut = data[i];
      data[i] *= 2.4;
    }

    const noiseSrc = ctx.createBufferSource();
    noiseSrc.buffer = noiseBuffer;
    noiseSrc.loop = true;

    const filter = ctx.createBiquadFilter();
    const noiseGain = ctx.createGain();

    const osc1 = ctx.createOscillator();
    const oscGain = ctx.createGain();

    switch (sceneId) {
      case 'laboratorio':
        filter.type = 'lowpass';
        filter.frequency.value = 180;
        noiseGain.gain.value = 0.28;
        osc1.type = 'sine';
        osc1.frequency.value = 60;
        oscGain.gain.value = 0.16;
        break;
      case 'fosa_abisal':
        filter.type = 'lowpass';
        filter.frequency.value = 260;
        noiseGain.gain.value = 0.45;
        osc1.type = 'sine';
        osc1.frequency.value = 48;
        oscGain.gain.value = 0.22;
        break;
      case 'exotica':
        filter.type = 'bandpass';
        filter.frequency.value = 420;
        filter.Q.value = 1.8;
        noiseGain.gain.value = 0.25;
        osc1.type = 'triangle';
        osc1.frequency.value = 110;
        oscGain.gain.value = 0.14;
        break;
      case 'selva':
        filter.type = 'bandpass';
        filter.frequency.value = 780;
        filter.Q.value = 0.8;
        noiseGain.gain.value = 0.32;
        osc1.type = 'sine';
        osc1.frequency.value = 146;
        oscGain.gain.value = 0.05;
        break;
      case 'desierto':
        filter.type = 'bandpass';
        filter.frequency.value = 520;
        filter.Q.value = 1.4;
        noiseGain.gain.value = 0.48;
        osc1.type = 'sine';
        osc1.frequency.value = 72;
        oscGain.gain.value = 0.08;
        break;
      case 'glaciar':
        filter.type = 'highpass';
        filter.frequency.value = 380;
        noiseGain.gain.value = 0.26;
        osc1.type = 'sine';
        osc1.frequency.value = 196;
        oscGain.gain.value = 0.07;
        break;
      case 'templo':
        filter.type = 'lowpass';
        filter.frequency.value = 220;
        noiseGain.gain.value = 0.3;
        osc1.type = 'sine';
        osc1.frequency.value = 82.4;
        oscGain.gain.value = 0.18;
        break;
      case 'estudio':
      default:
        filter.type = 'lowpass';
        filter.frequency.value = 120;
        noiseGain.gain.value = 0.08;
        osc1.type = 'sine';
        osc1.frequency.value = 55;
        oscGain.gain.value = 0.02;
        break;
    }

    noiseSrc.connect(filter);
    filter.connect(noiseGain);
    noiseGain.connect(this.masterGain);

    osc1.connect(oscGain);
    oscGain.connect(this.masterGain);

    noiseSrc.start();
    osc1.start();

    nodesToStop.push(noiseSrc, filter, noiseGain, osc1, oscGain);
    this.stopCurrentNodes = () => {
      nodesToStop.forEach((n) => {
        try {
          n.stop?.();
        } catch {
          // ignore already stopped
        }
        try {
          n.disconnect();
        } catch {
          // ignore
        }
      });
    };
  }

  public dispose(): void {
    this.stopSound();
    if (this.ctx) {
      void this.ctx.close();
      this.ctx = null;
      this.masterGain = null;
    }
  }
}
