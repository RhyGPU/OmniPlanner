/**
 * Web Audio Synthesizer & Sound Player (Pulse v4.2)
 *
 * Implements offline synthesis for built-in alarm presets
 * and handles base64-decoded custom audio file playback.
 */

let activeAudioCtx: AudioContext | null = null;
let activeSources: any[] = [];
let chimeIntervalId: any = null;
let volumeFadeIntervalId: any = null;
let currentVolume = 0.01;

function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const clean = base64.includes(',') ? base64.split(',')[1] : base64;
  const binaryString = window.atob(clean);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes.buffer;
}

// ---------------------------------------------------------------------------
// Tone Presets Synthesis
// ---------------------------------------------------------------------------

function playTone(ctx: AudioContext, freq: number, start: number, duration: number, volume: number, type: OscillatorType = 'sine') {
  try {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    
    osc.type = type;
    osc.frequency.setValueAtTime(freq, start);
    
    gain.gain.setValueAtTime(volume, start);
    gain.gain.exponentialRampToValueAtTime(0.001, start + duration);
    
    osc.connect(gain);
    gain.connect(ctx.destination);
    
    osc.start(start);
    osc.stop(start + duration);
    activeSources.push({ osc, gain });
  } catch (_) {}
}

const presetSynthesizers: Record<string, (ctx: AudioContext, volume: number) => void> = {
  chime: (ctx, vol) => {
    const now = ctx.currentTime;
    playTone(ctx, 880, now, 0.25, vol); // A5
    playTone(ctx, 1320, now + 0.12, 0.35, vol); // E6
  },
  beep: (ctx, vol) => {
    const now = ctx.currentTime;
    // Classic double-beep
    playTone(ctx, 2000, now, 0.08, vol, 'square');
    playTone(ctx, 2000, now + 0.15, 0.08, vol, 'square');
  },
  pulse: (ctx, vol) => {
    const now = ctx.currentTime;
    // Resonant pulse frequency sweep
    try {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(100, now);
      osc.frequency.exponentialRampToValueAtTime(800, now + 0.4);
      
      gain.gain.setValueAtTime(vol, now);
      gain.gain.linearRampToValueAtTime(0.01, now + 0.4);
      
      osc.connect(gain);
      gain.connect(ctx.destination);
      
      osc.start(now);
      osc.stop(now + 0.4);
      activeSources.push({ osc, gain });
    } catch (_) {}
  },
  gentle: (ctx, vol) => {
    const now = ctx.currentTime;
    // Ambient major-7th arpeggio (C Maj 7)
    playTone(ctx, 261.63, now, 1.2, vol * 0.8, 'triangle'); // C4
    playTone(ctx, 329.63, now + 0.15, 1.2, vol * 0.8, 'triangle'); // E4
    playTone(ctx, 392.00, now + 0.30, 1.2, vol * 0.8, 'triangle'); // G4
    playTone(ctx, 493.88, now + 0.45, 1.5, vol * 1.0, 'sine'); // B4
  }
};

// ---------------------------------------------------------------------------
// Main Controls
// ---------------------------------------------------------------------------

export async function playAlarmSound(
  preset: 'chime' | 'beep' | 'pulse' | 'gentle' | 'custom',
  customDataUrl?: string,
  fadeInDurationSec: number = 0
): Promise<void> {
  // Stop any active alarms first
  stopAlarmSound();

  try {
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioCtx) return;
    activeAudioCtx = new AudioCtx();
  } catch (err) {
    console.error('Failed to create AudioContext:', err);
    return;
  }

  const ctx = activeAudioCtx;
  currentVolume = 0.01;
  const targetVolume = preset === 'beep' || preset === 'pulse' ? 0.08 : 0.15;

  // Handle Fade-In Volume Escalation
  if (fadeInDurationSec > 0) {
    const startMs = Date.now();
    volumeFadeIntervalId = setInterval(() => {
      const elapsedSec = (Date.now() - startMs) / 1000;
      if (elapsedSec >= fadeInDurationSec) {
        currentVolume = targetVolume;
        clearInterval(volumeFadeIntervalId);
      } else {
        // Interpolate volume linearly
        currentVolume = 0.01 + (targetVolume - 0.01) * (elapsedSec / fadeInDurationSec);
      }
    }, 150);
  } else {
    currentVolume = targetVolume;
  }

  // Playing Custom User MP3/WAV Audio File
  if (preset === 'custom' && customDataUrl) {
    try {
      const buffer = base64ToArrayBuffer(customDataUrl);
      const audioBuffer = await ctx.decodeAudioData(buffer);
      
      const source = ctx.createBufferSource();
      source.buffer = audioBuffer;
      source.loop = true;

      const gainNode = ctx.createGain();
      gainNode.gain.setValueAtTime(currentVolume, ctx.currentTime);
      source.connect(gainNode);
      gainNode.connect(ctx.destination);

      source.start(0);
      activeSources.push(source);

      // Dynamically adjust custom audio volume during fade-in
      if (fadeInDurationSec > 0) {
        const updateVolInterval = setInterval(() => {
          if (!activeAudioCtx) {
            clearInterval(updateVolInterval);
            return;
          }
          try {
            gainNode.gain.setValueAtTime(currentVolume, ctx.currentTime);
            if (currentVolume >= targetVolume) {
              clearInterval(updateVolInterval);
            }
          } catch (_) {
            clearInterval(updateVolInterval);
          }
        }, 200);
      }
    } catch (err) {
      console.error('Failed to play custom alarm sound, falling back to rising chime:', err);
      // Fallback
      playPresetLoop('chime', ctx);
    }
  } else {
    // Play built-in synthesizer loop
    const activePreset = preset === 'custom' ? 'chime' : preset;
    playPresetLoop(activePreset, ctx);
  }
}

function playPresetLoop(preset: string, ctx: AudioContext) {
  const synth = presetSynthesizers[preset] || presetSynthesizers.chime;
  
  // Play immediately
  synth(ctx, currentVolume);
  
  // Set interval loop
  const intervalMs = preset === 'gentle' ? 3200 : preset === 'pulse' ? 1200 : 2000;
  chimeIntervalId = setInterval(() => {
    if (activeAudioCtx) {
      synth(activeAudioCtx, currentVolume);
    }
  }, intervalMs);
}

export function stopAlarmSound(): void {
  if (chimeIntervalId) {
    clearInterval(chimeIntervalId);
    chimeIntervalId = null;
  }
  if (volumeFadeIntervalId) {
    clearInterval(volumeFadeIntervalId);
    volumeFadeIntervalId = null;
  }

  for (const src of activeSources) {
    try {
      if (src.osc) src.osc.stop();
      if (src.stop) src.stop();
    } catch (_) {}
  }
  activeSources = [];

  if (activeAudioCtx) {
    activeAudioCtx.close().catch(() => {});
    activeAudioCtx = null;
  }
}
