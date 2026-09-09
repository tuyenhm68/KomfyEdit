import fs from 'fs'
import path from 'path'

const SIZE = 33
const DENOM = SIZE - 1

function clamp(v) {
  return Math.max(0, Math.min(1, v))
}

function sCurve(x, contrast = 1.2) {
  return clamp(0.5 + Math.tanh((x - 0.5) * contrast * 2) / (2 * Math.tanh(contrast)))
}

function toLuma(r, g, b) {
  return 0.299 * r + 0.587 * g + 0.114 * b
}

const LUT_GENERATORS = {
  'cine-teal-orange': (r, g, b) => {
    // S-curve contrast
    let nr = sCurve(r, 1.15)
    let ng = sCurve(g, 1.1)
    let nb = sCurve(b, 1.15)
    const luma = toLuma(nr, ng, nb)
    // Shadows: push cyan/teal (lower red, raise green/blue)
    const shadowWeight = (1 - luma) * (1 - luma)
    nr -= shadowWeight * 0.08
    ng += shadowWeight * 0.04
    nb += shadowWeight * 0.12
    // Highlights/Midtones: push orange/warm (raise red/yellow)
    const highWeight = luma * luma
    nr += highWeight * 0.12
    ng += highWeight * 0.04
    nb -= highWeight * 0.08
    return [clamp(nr), clamp(ng), clamp(nb)]
  },

  'film-classic': (r, g, b) => {
    // Kodak film: lifted darks, warm highlights
    let nr = r * 0.95 + 0.03
    let ng = g * 0.96 + 0.02
    let nb = b * 0.92 + 0.01
    // Contrast S-curve
    nr = sCurve(nr, 1.1)
    ng = sCurve(ng, 1.05)
    nb = sCurve(nb, 1.05)
    // Film shadow tint (slight green/cyan in shadows)
    const shadow = Math.max(0, 0.4 - toLuma(nr, ng, nb))
    ng += shadow * 0.04
    return [clamp(nr), clamp(ng), clamp(nb)]
  },

  'vintage-kodachrome': (r, g, b) => {
    // Punchy reds, warm yellows, deep cyan-blues
    let nr = Math.pow(r, 0.85) * 1.08
    let ng = Math.pow(g, 0.95) * 1.02
    let nb = Math.pow(b, 1.15) * 0.92
    nr = sCurve(nr, 1.25)
    ng = sCurve(ng, 1.15)
    nb = sCurve(nb, 1.2)
    return [clamp(nr), clamp(ng), clamp(nb)]
  },

  'noir-bw': (r, g, b) => {
    const luma = toLuma(r, g, b)
    // High contrast black & white with crushed shadows
    const val = sCurve(luma, 1.45)
    const crushed = val < 0.1 ? val * 0.7 : val
    return [clamp(crushed), clamp(crushed), clamp(crushed)]
  },

  'cyber-neon': (r, g, b) => {
    const luma = toLuma(r, g, b)
    let nr = Math.pow(r, 0.9) * 1.1
    let ng = Math.pow(g, 1.1) * 0.9
    let nb = Math.pow(b, 0.8) * 1.25
    // Push shadows into deep violet
    const s = 1 - luma
    nr += s * 0.06
    nb += s * 0.15
    return [clamp(nr), clamp(ng), clamp(nb)]
  },

  'golden-hour': (r, g, b) => {
    // Rich amber and golden warm tones
    let nr = r * 1.14 + 0.02
    let ng = g * 1.05 + 0.01
    let nb = b * 0.82
    nr = sCurve(nr, 1.1)
    ng = sCurve(ng, 1.05)
    return [clamp(nr), clamp(ng), clamp(nb)]
  },

  'moody-forest': (r, g, b) => {
    // Desaturated warm tones, deep emerald greens
    const luma = toLuma(r, g, b)
    let nr = r * 0.85 + luma * 0.1
    let ng = g * 1.08
    let nb = b * 0.92
    // Muted shadows
    const s = Math.max(0, 0.5 - luma)
    ng += s * 0.05
    nb += s * 0.02
    return [clamp(nr), clamp(ng), clamp(nb)]
  },

  'retro-90s': (r, g, b) => {
    // VHS look: lifted blacks (milky shadows), slight magenta/yellow tint
    let nr = r * 0.92 + 0.06
    let ng = g * 0.90 + 0.05
    let nb = b * 0.88 + 0.07
    nr = sCurve(nr, 0.95)
    ng = sCurve(ng, 0.95)
    nb = sCurve(nb, 0.95)
    return [clamp(nr), clamp(ng), clamp(nb)]
  },

  'bleach-bypass': (r, g, b) => {
    const luma = toLuma(r, g, b)
    // Blend 65% monochrome + 35% color
    let nr = r * 0.35 + luma * 0.65
    let ng = g * 0.35 + luma * 0.65
    let nb = b * 0.35 + luma * 0.65
    // Harsh S-curve
    nr = sCurve(nr, 1.4)
    ng = sCurve(ng, 1.4)
    nb = sCurve(nb, 1.4)
    return [clamp(nr), clamp(ng), clamp(nb)]
  },

  'warm-sunset': (r, g, b) => {
    let nr = Math.pow(r, 0.85) * 1.2
    let ng = Math.pow(g, 1.0) * 0.95
    let nb = Math.pow(b, 1.15) * 0.9
    const luma = toLuma(r, g, b)
    // Deep purple in shadows
    const s = (1 - luma) * 0.1
    nb += s * 0.8
    return [clamp(nr), clamp(ng), clamp(nb)]
  },

  'cold-winter': (r, g, b) => {
    // Ice cool blue
    let nr = r * 0.82
    let ng = g * 0.94 + 0.02
    let nb = b * 1.18 + 0.04
    const luma = toLuma(nr, ng, nb)
    // Tint highlights icy cyan
    const h = luma * luma * 0.08
    ng += h * 0.5
    nb += h
    return [clamp(nr), clamp(ng), clamp(nb)]
  },

  'pastel-dream': (r, g, b) => {
    // Low contrast, lifted shadows, soft highlights
    let nr = r * 0.8 + 0.12
    let ng = g * 0.78 + 0.14
    let nb = b * 0.82 + 0.16
    // Soft pastel curves
    nr = Math.pow(nr, 0.95)
    ng = Math.pow(ng, 0.95)
    nb = Math.pow(nb, 0.95)
    return [clamp(nr), clamp(ng), clamp(nb)]
  },
}

function buildCubeFile(id, transformFn) {
  const lines = [
    `# KomfyEdit 3D LUT: ${id}`,
    `TITLE "${id}"`,
    `LUT_3D_SIZE ${SIZE}`,
    `DOMAIN_MIN 0.0 0.0 0.0`,
    `DOMAIN_MAX 1.0 1.0 1.0`,
  ]

  for (let b = 0; b < SIZE; b++) {
    const bv = b / DENOM
    for (let g = 0; g < SIZE; g++) {
      const gv = g / DENOM
      for (let r = 0; r < SIZE; r++) {
        const rv = r / DENOM
        const [outR, outG, outB] = transformFn(rv, gv, bv)
        lines.push(`${outR.toFixed(6)} ${outG.toFixed(6)} ${outB.toFixed(6)}`)
      }
    }
  }

  return lines.join('\n')
}

const resourcesDir = path.resolve('resources', 'luts')
const publicDir = path.resolve('public', 'luts')

fs.mkdirSync(resourcesDir, { recursive: true })
fs.mkdirSync(publicDir, { recursive: true })

console.log(`Generating 12 production 3D LUTs (size ${SIZE}x${SIZE}x${SIZE})...`)

for (const [id, fn] of Object.entries(LUT_GENERATORS)) {
  const cubeContent = buildCubeFile(id, fn)
  const resourcePath = path.join(resourcesDir, `${id}.cube`)
  const publicPath = path.join(publicDir, `${id}.cube`)

  fs.writeFileSync(resourcePath, cubeContent, 'utf-8')
  fs.writeFileSync(publicPath, cubeContent, 'utf-8')
  console.log(`✓ ${id}.cube -> resources/luts/ & public/luts/`)
}

console.log('\nAll 12 LUT files generated successfully!')
