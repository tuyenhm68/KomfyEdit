import fs from 'fs'
import path from 'path'

const SAMPLE_RATE = 44100

// Helper to encode 16-bit mono PCM WAV buffer
function createWavBuffer(samples, sampleRate = SAMPLE_RATE) {
  const numChannels = 1
  const bytesPerSample = 2
  const blockAlign = numChannels * bytesPerSample
  const byteRate = sampleRate * blockAlign
  const dataSize = samples.length * bytesPerSample
  const buffer = Buffer.alloc(44 + dataSize)

  buffer.write('RIFF', 0)
  buffer.writeUInt32LE(36 + dataSize, 4)
  buffer.write('WAVE', 8)
  buffer.write('fmt ', 12)
  buffer.writeUInt32LE(16, 16)
  buffer.writeUInt16LE(1, 20)
  buffer.writeUInt16LE(numChannels, 22)
  buffer.writeUInt32LE(sampleRate, 24)
  buffer.writeUInt32LE(byteRate, 28)
  buffer.writeUInt16LE(blockAlign, 32)
  buffer.writeUInt16LE(16, 34)
  buffer.write('data', 36)
  buffer.writeUInt32LE(dataSize, 40)

  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]))
    const val = s < 0 ? s * 0x8000 : s * 0x7FFF
    buffer.writeInt16LE(Math.round(val), 44 + i * 2)
  }

  return buffer
}

// ── DSP Sound Generators ──

function genWhoosh(duration = 0.45, startFreq = 200, peakFreq = 1800, endFreq = 280) {
  const n = Math.floor(SAMPLE_RATE * duration)
  const out = new Float32Array(n)
  let b0 = 0, b1 = 0, b2 = 0

  for (let i = 0; i < n; i++) {
    const t = i / n
    // Frequency envelope (parabolic bell)
    const fEnv = Math.sin(t * Math.PI)
    const currentFreq = startFreq + (peakFreq - startFreq) * fEnv
    const amp = Math.sin(t * Math.PI) ** 1.8

    // Simple 2-pole IIR bandpass filter over white noise
    const white = (Math.random() * 2 - 1)
    const q = 4.0
    const w0 = 2 * Math.PI * currentFreq / SAMPLE_RATE
    const alpha = Math.sin(w0) / (2 * q)

    b0 = alpha * white + (2 * Math.cos(w0)) * b1 - (1 - alpha) * b2
    b2 = b1
    b1 = b0

    out[i] = Math.tanh(b0 * 2.5) * amp * 0.95
  }
  return out
}

function genPop(duration = 0.15) {
  const n = Math.floor(SAMPLE_RATE * duration)
  const out = new Float32Array(n)
  let phase = 0

  for (let i = 0; i < n; i++) {
    const t = i / SAMPLE_RATE
    const prog = i / n
    const freq = 1100 * Math.exp(-prog * 18) + 160
    phase += 2 * Math.PI * freq / SAMPLE_RATE
    const env = Math.exp(-prog * 14) * (1 - Math.exp(-prog * 80))
    out[i] = Math.sin(phase) * env * 0.95
  }
  return out
}

function genDing(duration = 0.85, freq = 2093) {
  const n = Math.floor(SAMPLE_RATE * duration)
  const out = new Float32Array(n)

  for (let i = 0; i < n; i++) {
    const t = i / SAMPLE_RATE
    const env1 = Math.exp(-t * 4.5)
    const env2 = Math.exp(-t * 9.0)
    const s1 = Math.sin(2 * Math.PI * freq * t) * env1
    const s2 = Math.sin(2 * Math.PI * (freq * 2.02) * t) * env2 * 0.4
    const s3 = Math.sin(2 * Math.PI * (freq * 0.5) * t) * env1 * 0.15
    out[i] = (s1 + s2 + s3) * 0.9
  }
  return out
}

function genBellChime(duration = 0.90) {
  const n = Math.floor(SAMPLE_RATE * duration)
  const out = new Float32Array(n)
  const f0 = 1174.66 // D6

  for (let i = 0; i < n; i++) {
    const t = i / SAMPLE_RATE
    const env = Math.exp(-t * 3.8)
    const h1 = Math.sin(2 * Math.PI * f0 * t) * env
    const h2 = Math.sin(2 * Math.PI * (f0 * 1.5) * t) * Math.exp(-t * 5.0) * 0.5
    const h3 = Math.sin(2 * Math.PI * (f0 * 2.76) * t) * Math.exp(-t * 7.0) * 0.25
    out[i] = (h1 + h2 + h3) * 0.85
  }
  return out
}

function genAlert(duration = 0.40) {
  const n = Math.floor(SAMPLE_RATE * duration)
  const out = new Float32Array(n)
  const tMid = duration * 0.45

  for (let i = 0; i < n; i++) {
    const t = i / SAMPLE_RATE
    let freq = t < tMid ? 880 : 660
    let localT = t < tMid ? t : t - tMid
    let env = Math.exp(-localT * 8) * Math.sin(Math.min(1, localT * 100) * Math.PI * 0.5)
    out[i] = Math.sin(2 * Math.PI * freq * t) * env * 0.9
  }
  return out
}

function genSubBoom(duration = 1.20) {
  const n = Math.floor(SAMPLE_RATE * duration)
  const out = new Float32Array(n)
  let phase = 0

  for (let i = 0; i < n; i++) {
    const t = i / SAMPLE_RATE
    const prog = i / n
    const freq = 135 * Math.exp(-prog * 4.2) + 32
    phase += 2 * Math.PI * freq / SAMPLE_RATE
    const env = Math.exp(-prog * 3.0) * Math.sin(Math.min(1, prog * 50) * Math.PI * 0.5)
    // Add subtle punch harmonic
    const s = Math.sin(phase) + Math.sin(phase * 2) * 0.2 * Math.exp(-prog * 12)
    out[i] = Math.tanh(s * 1.2) * env * 0.95
  }
  return out
}

function genMouseClick(duration = 0.08) {
  const n = Math.floor(SAMPLE_RATE * duration)
  const out = new Float32Array(n)
  for (let i = 0; i < n; i++) {
    const t = i / SAMPLE_RATE
    const env1 = Math.exp(-t * 80)
    const env2 = Math.exp(-Math.max(0, t - 0.015) * 90)
    const click1 = (Math.sin(2 * Math.PI * 3200 * t) + (Math.random() * 2 - 1) * 0.4) * env1
    const click2 = (Math.sin(2 * Math.PI * 2400 * t) + (Math.random() * 2 - 1) * 0.3) * env2
    out[i] = (click1 + click2) * 0.85
  }
  return out
}

function genKeyboardType(duration = 0.12) {
  const n = Math.floor(SAMPLE_RATE * duration)
  const out = new Float32Array(n)
  for (let i = 0; i < n; i++) {
    const t = i / SAMPLE_RATE
    const env = Math.exp(-t * 55)
    const click = (Math.sin(2 * Math.PI * 1800 * t) + (Math.random() * 2 - 1) * 0.6) * env
    const thud = Math.sin(2 * Math.PI * 140 * t) * Math.exp(-t * 30) * 0.5
    out[i] = Math.tanh(click + thud) * 0.85
  }
  return out
}

function genCameraShutter(duration = 0.30) {
  const n = Math.floor(SAMPLE_RATE * duration)
  const out = new Float32Array(n)
  for (let i = 0; i < n; i++) {
    const t = i / SAMPLE_RATE
    // First click
    const env1 = Math.exp(-t * 60)
    const c1 = (Math.sin(2 * Math.PI * 2200 * t) + (Math.random() * 2 - 1) * 0.5) * env1
    // Second click (shutter release at 0.08s)
    const t2 = Math.max(0, t - 0.08)
    const env2 = Math.exp(-t2 * 45)
    const c2 = (Math.sin(2 * Math.PI * 1600 * t2) + (Math.random() * 2 - 1) * 0.7) * env2
    out[i] = Math.tanh(c1 * 0.8 + c2 * 0.9) * 0.9
  }
  return out
}

function genSuccess(duration = 0.60) {
  const n = Math.floor(SAMPLE_RATE * duration)
  const out = new Float32Array(n)
  const notes = [1046.50, 1318.51, 1567.98] // C6, E6, G6
  const noteDur = 0.12

  for (let i = 0; i < n; i++) {
    const t = i / SAMPLE_RATE
    let s = 0
    for (let j = 0; j < notes.length; j++) {
      const startT = j * noteDur
      if (t >= startT) {
        const localT = t - startT
        const env = Math.exp(-localT * 6.5)
        s += Math.sin(2 * Math.PI * notes[j] * localT) * env * 0.35
      }
    }
    out[i] = s * 0.9
  }
  return out
}

function genCoin(duration = 0.35) {
  const n = Math.floor(SAMPLE_RATE * duration)
  const out = new Float32Array(n)
  const note1 = 987.77 // B5
  const note2 = 1318.51 // E6
  const tSplit = 0.08

  for (let i = 0; i < n; i++) {
    const t = i / SAMPLE_RATE
    if (t < tSplit) {
      const env = Math.exp(-t * 8)
      out[i] = Math.sin(2 * Math.PI * note1 * t) * env * 0.7
    } else {
      const localT = t - tSplit
      const env = Math.exp(-localT * 7.5)
      out[i] = Math.sin(2 * Math.PI * note2 * localT) * env * 0.85
    }
  }
  return out
}

function genCashRegister(duration = 0.75) {
  const n = Math.floor(SAMPLE_RATE * duration)
  const out = new Float32Array(n)
  for (let i = 0; i < n; i++) {
    const t = i / SAMPLE_RATE
    // Slide mechanical sound
    const slideEnv = Math.sin(Math.min(1, t / 0.15) * Math.PI) * Math.exp(-t * 6)
    const slide = ((Math.random() * 2 - 1) + Math.sin(2 * Math.PI * 450 * t)) * slideEnv * 0.4
    // Cha-ching bell at 0.12s
    let bell = 0
    if (t >= 0.12) {
      const tBell = t - 0.12
      const bEnv = Math.exp(-tBell * 4.0)
      bell = (Math.sin(2 * Math.PI * 2637 * tBell) + Math.sin(2 * Math.PI * 3951 * tBell) * 0.4) * bEnv * 0.7
    }
    out[i] = (slide + bell) * 0.9
  }
  return out
}

function genErrorBuzz(duration = 0.30) {
  const n = Math.floor(SAMPLE_RATE * duration)
  const out = new Float32Array(n)
  for (let i = 0; i < n; i++) {
    const t = i / SAMPLE_RATE
    const env = Math.sin(Math.min(1, t * 50) * Math.PI * 0.5) * (1 - t / duration)
    // Low dissonant buzz (110Hz + 116Hz)
    const s1 = Math.sign(Math.sin(2 * Math.PI * 110 * t))
    const s2 = Math.sign(Math.sin(2 * Math.PI * 116 * t))
    out[i] = (s1 + s2) * 0.4 * env
  }
  return out
}

function genLevelUp(duration = 0.65) {
  const n = Math.floor(SAMPLE_RATE * duration)
  const out = new Float32Array(n)
  const notes = [523.25, 659.25, 783.99, 1046.50] // C5, E5, G5, C6
  const step = 0.10

  for (let i = 0; i < n; i++) {
    const t = i / SAMPLE_RATE
    let s = 0
    for (let j = 0; j < notes.length; j++) {
      const st = j * step
      if (t >= st) {
        const lt = t - st
        const env = Math.exp(-lt * 6.0)
        s += Math.sin(2 * Math.PI * notes[j] * lt) * env * 0.3
      }
    }
    out[i] = s * 0.9
  }
  return out
}

function genThudImpact(duration = 0.40) {
  const n = Math.floor(SAMPLE_RATE * duration)
  const out = new Float32Array(n)
  let phase = 0

  for (let i = 0; i < n; i++) {
    const t = i / SAMPLE_RATE
    const prog = i / n
    const freq = 220 * Math.exp(-prog * 12) + 45
    phase += 2 * Math.PI * freq / SAMPLE_RATE
    const env = Math.exp(-prog * 9) * Math.sin(Math.min(1, prog * 60) * Math.PI * 0.5)
    const noise = (Math.random() * 2 - 1) * Math.exp(-prog * 25) * 0.3
    out[i] = Math.tanh((Math.sin(phase) + noise) * 1.5) * env * 0.95
  }
  return out
}

function genMetalHit(duration = 0.50) {
  const n = Math.floor(SAMPLE_RATE * duration)
  const out = new Float32Array(n)
  for (let i = 0; i < n; i++) {
    const t = i / SAMPLE_RATE
    const env = Math.exp(-t * 9)
    const m1 = Math.sin(2 * Math.PI * 1420 * t) * env
    const m2 = Math.sin(2 * Math.PI * 2150 * t) * Math.exp(-t * 12) * 0.6
    const m3 = Math.sin(2 * Math.PI * 3420 * t) * Math.exp(-t * 16) * 0.4
    const click = (Math.random() * 2 - 1) * Math.exp(-t * 80) * 0.4
    out[i] = (m1 + m2 + m3 + click) * 0.75
  }
  return out
}

function genDramaticRiser(duration = 1.50) {
  const n = Math.floor(SAMPLE_RATE * duration)
  const out = new Float32Array(n)
  let phase = 0
  for (let i = 0; i < n; i++) {
    const t = i / SAMPLE_RATE
    const prog = t / duration
    const freq = 70 + 950 * (prog ** 2.2)
    phase += 2 * Math.PI * freq / SAMPLE_RATE
    const env = (prog ** 1.5) * (1 - Math.exp(-t * 10))
    const s = Math.sin(phase) + (Math.random() * 2 - 1) * 0.2 * prog
    out[i] = Math.tanh(s) * env * 0.95
  }
  return out
}

function genFunnyBoing(duration = 0.45) {
  const n = Math.floor(SAMPLE_RATE * duration)
  const out = new Float32Array(n)
  let phase = 0

  for (let i = 0; i < n; i++) {
    const t = i / SAMPLE_RATE
    const prog = i / n
    const baseFreq = 220 + 350 * Math.sin(prog * Math.PI * 0.8)
    const vibrato = Math.sin(2 * Math.PI * 16 * t) * 45
    phase += 2 * Math.PI * (baseFreq + vibrato) / SAMPLE_RATE
    const env = Math.exp(-prog * 4.5) * Math.sin(Math.min(1, prog * 40) * Math.PI * 0.5)
    out[i] = Math.sin(phase) * env * 0.95
  }
  return out
}

function genRecordScratch(duration = 0.40) {
  const n = Math.floor(SAMPLE_RATE * duration)
  const out = new Float32Array(n)
  let phase = 0
  for (let i = 0; i < n; i++) {
    const t = i / SAMPLE_RATE
    const prog = t / duration
    // Decelerating drag
    const freq = Math.max(80, 1400 * (1 - prog) ** 1.8)
    phase += 2 * Math.PI * freq / SAMPLE_RATE
    const env = Math.sin(prog * Math.PI) ** 0.8
    const vinyl = (Math.random() * 2 - 1) * 0.5
    out[i] = Math.tanh((Math.sin(phase) * 0.7 + vinyl)) * env * 0.9
  }
  return out
}

function genFailTrombone(duration = 1.20) {
  const n = Math.floor(SAMPLE_RATE * duration)
  const out = new Float32Array(n)
  const notes = [233.08, 220.00, 207.65, 196.00] // Bb3, A3, Ab3, G3
  const step = 0.28

  for (let i = 0; i < n; i++) {
    const t = i / SAMPLE_RATE
    const idx = Math.min(notes.length - 1, Math.floor(t / step))
    const localT = t - idx * step
    const f0 = notes[idx] - (idx === notes.length - 1 ? localT * 35 : 0) // slide on last note
    const vibrato = Math.sin(2 * Math.PI * 6 * localT) * (idx === notes.length - 1 ? 5 : 2)
    const env = Math.sin(Math.min(1, localT / 0.05) * Math.PI * 0.5) * Math.exp(-localT * 3.0)
    // Brass timbre (fundamental + 2nd + 3rd harmonic)
    const s = Math.sin(2 * Math.PI * (f0 + vibrato) * t) * 0.6 +
              Math.sin(2 * Math.PI * (f0 * 2) * t) * 0.3 +
              Math.sin(2 * Math.PI * (f0 * 3) * t) * 0.15
    out[i] = Math.tanh(s * 1.5) * env * 0.85
  }
  return out
}

function genApplause(duration = 1.50) {
  const n = Math.floor(SAMPLE_RATE * duration)
  const out = new Float32Array(n)
  for (let i = 0; i < n; i++) {
    const t = i / SAMPLE_RATE
    const env = Math.sin(Math.min(1, t / 0.3) * Math.PI * 0.5) * (1 - Math.max(0, t - 1.0) / 0.5)
    // Random claps impulses
    const clap = (Math.random() < 0.08 ? (Math.random() * 2 - 1) * 2.0 : 0)
    const crowd = (Math.random() * 2 - 1) * 0.25
    out[i] = Math.tanh((clap + crowd) * 1.2) * env * 0.85
  }
  return out
}

function genHeartbeat(duration = 0.80) {
  const n = Math.floor(SAMPLE_RATE * duration)
  const out = new Float32Array(n)
  const pulses = [0.05, 0.32] // Lub-Dub

  for (let i = 0; i < n; i++) {
    const t = i / SAMPLE_RATE
    let s = 0
    for (const pt of pulses) {
      if (t >= pt) {
        const lt = t - pt
        const env = Math.exp(-lt * 25) * Math.sin(Math.min(1, lt * 100) * Math.PI * 0.5)
        s += Math.sin(2 * Math.PI * 65 * lt) * env * 0.85
      }
    }
    out[i] = s * 0.95
  }
  return out
}

function genClockTick(duration = 0.15) {
  const n = Math.floor(SAMPLE_RATE * duration)
  const out = new Float32Array(n)
  for (let i = 0; i < n; i++) {
    const t = i / SAMPLE_RATE
    const env = Math.exp(-t * 90)
    const click = Math.sin(2 * Math.PI * 2800 * t) * env
    const body = Math.sin(2 * Math.PI * 850 * t) * Math.exp(-t * 40) * 0.5
    out[i] = (click + body) * 0.85
  }
  return out
}

function genGlitch(duration = 0.35) {
  const n = Math.floor(SAMPLE_RATE * duration)
  const out = new Float32Array(n)
  for (let i = 0; i < n; i++) {
    const t = i / SAMPLE_RATE
    const env = Math.sin(t / duration * Math.PI)
    const freq = 120 + Math.floor(Math.sin(t * 120) * 4) * 200
    const bitcrush = Math.sign(Math.sin(2 * Math.PI * freq * t)) * (Math.random() > 0.3 ? 1 : -1)
    out[i] = bitcrush * env * 0.75
  }
  return out
}

function genRewind(duration = 0.50) {
  const n = Math.floor(SAMPLE_RATE * duration)
  const out = new Float32Array(n)
  let phase = 0
  for (let i = 0; i < n; i++) {
    const t = i / SAMPLE_RATE
    const prog = t / duration
    const freq = 1800 + Math.sin(prog * 35) * 400 + prog * 600
    phase += 2 * Math.PI * freq / SAMPLE_RATE
    const env = Math.sin(prog * Math.PI)
    out[i] = Math.tanh(Math.sin(phase) + (Math.random() * 2 - 1) * 0.3) * env * 0.85
  }
  return out
}

function genCorkPop(duration = 0.20) {
  const n = Math.floor(SAMPLE_RATE * duration)
  const out = new Float32Array(n)
  let phase = 0
  for (let i = 0; i < n; i++) {
    const t = i / SAMPLE_RATE
    const prog = i / n
    const freq = 750 * Math.exp(-prog * 15) + 90
    phase += 2 * Math.PI * freq / SAMPLE_RATE
    const env = Math.exp(-prog * 16) * Math.sin(Math.min(1, prog * 50) * Math.PI * 0.5)
    out[i] = Math.sin(phase) * env * 0.95
  }
  return out
}

function genSnap(duration = 0.12) {
  const n = Math.floor(SAMPLE_RATE * duration)
  const out = new Float32Array(n)
  for (let i = 0; i < n; i++) {
    const t = i / SAMPLE_RATE
    const env = Math.exp(-t * 70)
    const noise = (Math.random() * 2 - 1) * env
    const resonant = Math.sin(2 * Math.PI * 3800 * t) * env * 0.7
    out[i] = (noise + resonant) * 0.85
  }
  return out
}

// Map of all 26 SFX files to their generators and durations
const SFX_MAP = [
  // Transitions
  { id: 'whoosh', filename: 'whoosh.wav', gen: () => genWhoosh(0.45, 200, 1800, 280) },
  { id: 'whoosh-fast', filename: 'whoosh-fast.wav', gen: () => genWhoosh(0.25, 400, 2800, 500) },
  { id: 'whoosh-deep', filename: 'whoosh-deep.wav', gen: () => genWhoosh(0.65, 80, 650, 120) },
  { id: 'glitch', filename: 'glitch.wav', gen: () => genGlitch(0.35) },
  { id: 'rewind', filename: 'rewind.wav', gen: () => genRewind(0.50) },

  // Accents & UI
  { id: 'pop', filename: 'pop.wav', gen: () => genPop(0.15) },
  { id: 'mouse-click', filename: 'mouse-click.wav', gen: () => genMouseClick(0.08) },
  { id: 'keyboard-type', filename: 'keyboard-type.wav', gen: () => genKeyboardType(0.12) },
  { id: 'camera-shutter', filename: 'camera-shutter.wav', gen: () => genCameraShutter(0.30) },
  { id: 'cork-pop', filename: 'cork-pop.wav', gen: () => genCorkPop(0.20) },
  { id: 'snap', filename: 'snap.wav', gen: () => genSnap(0.12) },

  // Notifications & Rewards
  { id: 'ding', filename: 'ding.wav', gen: () => genDing(0.85, 2093) },
  { id: 'bell-chime', filename: 'bell-chime.wav', gen: () => genBellChime(0.90) },
  { id: 'success', filename: 'success.wav', gen: () => genSuccess(0.60) },
  { id: 'coin', filename: 'coin.wav', gen: () => genCoin(0.35) },
  { id: 'cash-register', filename: 'cash-register.wav', gen: () => genCashRegister(0.75) },
  { id: 'alert', filename: 'alert.wav', gen: () => genAlert(0.40) },
  { id: 'error-buzz', filename: 'error-buzz.wav', gen: () => genErrorBuzz(0.30) },
  { id: 'level-up', filename: 'level-up.wav', gen: () => genLevelUp(0.65) },

  // Impacts & Dramatic
  { id: 'sub-boom', filename: 'sub-boom.wav', gen: () => genSubBoom(1.20) },
  { id: 'thud-impact', filename: 'thud-impact.wav', gen: () => genThudImpact(0.40) },
  { id: 'metal-hit', filename: 'metal-hit.wav', gen: () => genMetalHit(0.50) },
  { id: 'dramatic-riser', filename: 'dramatic-riser.wav', gen: () => genDramaticRiser(1.50) },

  // Comedy & Fun
  { id: 'funny-boing', filename: 'funny-boing.wav', gen: () => genFunnyBoing(0.45) },
  { id: 'record-scratch', filename: 'record-scratch.wav', gen: () => genRecordScratch(0.40) },
  { id: 'fail-trombone', filename: 'fail-trombone.wav', gen: () => genFailTrombone(1.20) },

  // Foley & Ambience
  { id: 'applause', filename: 'applause.wav', gen: () => genApplause(1.50) },
  { id: 'heartbeat', filename: 'heartbeat.wav', gen: () => genHeartbeat(0.80) },
  { id: 'clock-tick', filename: 'clock-tick.wav', gen: () => genClockTick(0.15) },
]

function main() {
  const publicDir = path.resolve(process.cwd(), 'public', 'sfx')
  const resourcesDir = path.resolve(process.cwd(), 'resources', 'sfx')

  if (!fs.existsSync(publicDir)) fs.mkdirSync(publicDir, { recursive: true })
  if (!fs.existsSync(resourcesDir)) fs.mkdirSync(resourcesDir, { recursive: true })

  console.log(`Generating ${SFX_MAP.length} studio-quality sound effects (16-bit 44.1kHz WAV)...`)

  let totalBytes = 0
  for (let i = 0; i < SFX_MAP.length; i++) {
    const item = SFX_MAP[i]
    const samples = item.gen()
    const buffer = createWavBuffer(samples)

    const pubPath = path.join(publicDir, item.filename)
    const resPath = path.join(resourcesDir, item.filename)

    fs.writeFileSync(pubPath, buffer)
    fs.writeFileSync(resPath, buffer)

    totalBytes += buffer.length
    console.log(`✓ [${i + 1}/${SFX_MAP.length}] ${item.filename} (${(buffer.length / 1024).toFixed(1)} KB)`)
  }

  console.log(`\nDone! Successfully generated ${SFX_MAP.length} SFX files. Total size: ${(totalBytes / 1024).toFixed(1)} KB`)
}

main()
