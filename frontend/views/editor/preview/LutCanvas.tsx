import React from 'react'
import { loadLut } from '../../../lib/lut-cache'
import type { CubeLut } from '@core/lut'
import type { ChromaKey } from '@core/project-model'

export interface LutCanvasRef {
  renderNow: () => void
  getCanvas: () => HTMLCanvasElement | null
  clear: () => void
}

export interface LutCanvasProps {
  sourceElement: HTMLVideoElement | HTMLImageElement | null
  filterId?: string
  intensity?: number // 0..100
  chromaKey?: ChromaKey
  isPlaying?: boolean
  className?: string
  style?: React.CSSProperties
}

const VERTEX_SHADER = `#version 300 es
in vec2 a_position;
out vec2 v_uv;

void main() {
  v_uv = (a_position + 1.0) * 0.5;
  v_uv.y = 1.0 - v_uv.y;
  gl_Position = vec4(a_position, 0.0, 1.0);
}
`

const FRAGMENT_SHADER = `#version 300 es
precision highp float;
precision highp sampler3D;

in vec2 v_uv;
out vec4 fragColor;

uniform sampler2D u_image;
uniform sampler3D u_lut;
uniform float u_intensity;
uniform float u_lut_size;
uniform bool u_lut_enabled;

uniform bool u_chroma_enabled;
uniform vec3 u_chroma_color;
uniform float u_chroma_similarity;
uniform float u_chroma_smoothness;
uniform float u_chroma_spill;

void main() {
  vec4 color = texture(u_image, v_uv);

  if (u_lut_enabled) {
    vec3 scale = (u_lut_size - 1.0) / u_lut_size * color.rgb + 0.5 / u_lut_size;
    vec3 graded = texture(u_lut, scale).rgb;
    color.rgb = mix(color.rgb, graded, u_intensity);
  }

  if (u_chroma_enabled) {
    float dist = distance(color.rgb, u_chroma_color);
    float sim = u_chroma_similarity;
    float blend = max(0.0001, u_chroma_smoothness);
    float alphaFactor = smoothstep(sim, sim + blend, dist);
    color.a *= alphaFactor;

    if (u_chroma_spill > 0.0) {
      if (u_chroma_color.g > u_chroma_color.r && u_chroma_color.g > u_chroma_color.b) {
        float maxOther = max(color.r, color.b);
        if (color.g > maxOther) {
          color.g = mix(color.g, maxOther, u_chroma_spill);
        }
      } else if (u_chroma_color.b > u_chroma_color.r && u_chroma_color.b > u_chroma_color.g) {
        float maxOther = max(color.r, color.g);
        if (color.b > maxOther) {
          color.b = mix(color.b, maxOther, u_chroma_spill);
        }
      }
    }
  }

  fragColor = color;
}
`

function hexToRgb01(hex: string): [number, number, number] {
  const clean = hex.replace(/^#/, '')
  const r = parseInt(clean.substring(0, 2) || '0', 16) / 255
  const g = parseInt(clean.substring(2, 4) || '0', 16) / 255
  const b = parseInt(clean.substring(4, 6) || '0', 16) / 255
  return [r, g, b]
}

export const LutCanvas = React.forwardRef<LutCanvasRef, LutCanvasProps>(function LutCanvas(
  { sourceElement, filterId, intensity = 100, chromaKey, isPlaying = false, className, style },
  ref,
) {
  const canvasRef = React.useRef<HTMLCanvasElement>(null)
  const glRef = React.useRef<WebGL2RenderingContext | null>(null)
  const programRef = React.useRef<WebGLProgram | null>(null)
  const imageTextureRef = React.useRef<WebGLTexture | null>(null)
  const dummyLutTextureRef = React.useRef<WebGLTexture | null>(null)
  const lutTextureCacheRef = React.useRef<Map<string, { texture: WebGLTexture; size: number }>>(new Map())
  const activeLutRef = React.useRef<CubeLut | null>(null)
  const animFrameIdRef = React.useRef<number>(0)

  // WebGL initialization
  React.useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const gl = canvas.getContext('webgl2', {
      alpha: true,
      premultipliedAlpha: false,
      preserveDrawingBuffer: false,
    })
    if (!gl) {
      console.warn('[LutCanvas] WebGL2 is not supported on this device.')
      return
    }
    glRef.current = gl

    // Compile shaders
    const vs = gl.createShader(gl.VERTEX_SHADER)!
    gl.shaderSource(vs, VERTEX_SHADER)
    gl.compileShader(vs)

    const fs = gl.createShader(gl.FRAGMENT_SHADER)!
    gl.shaderSource(fs, FRAGMENT_SHADER)
    gl.compileShader(fs)

    const program = gl.createProgram()!
    gl.attachShader(program, vs)
    gl.attachShader(program, fs)
    gl.linkProgram(program)

    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      console.error('[LutCanvas] Shader link error:', gl.getProgramInfoLog(program))
      return
    }
    programRef.current = program

    // Fullscreen Quad geometry
    const quad = new Float32Array([
      -1, -1,
       1, -1,
      -1,  1,
       1,  1,
    ])
    const vbo = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo)
    gl.bufferData(gl.ARRAY_BUFFER, quad, gl.STATIC_DRAW)

    const posLoc = gl.getAttribLocation(program, 'a_position')
    gl.enableVertexAttribArray(posLoc)
    gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0)

    // Image texture on Unit 0
    const imgTex = gl.createTexture()
    gl.bindTexture(gl.TEXTURE_2D, imgTex)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
    imageTextureRef.current = imgTex

    // 1x1x1 dummy 3D texture on Unit 1 fallback
    const dummyTex = gl.createTexture()
    gl.bindTexture(gl.TEXTURE_3D, dummyTex)
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_R, gl.CLAMP_TO_EDGE)
    gl.texImage3D(
      gl.TEXTURE_3D,
      0,
      gl.RGBA8,
      1, 1, 1, 0,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      new Uint8Array([255, 255, 255, 255]),
    )
    dummyLutTextureRef.current = dummyTex

    return () => {
      // Cleanup WebGL resources
      const cached = lutTextureCacheRef.current
      for (const { texture } of cached.values()) {
        gl.deleteTexture(texture)
      }
      cached.clear()

      if (imgTex) gl.deleteTexture(imgTex)
      if (dummyTex) gl.deleteTexture(dummyTex)
      if (program) gl.deleteProgram(program)
      if (vs) gl.deleteShader(vs)
      if (fs) gl.deleteShader(fs)
      if (vbo) gl.deleteBuffer(vbo)
      glRef.current = null
      programRef.current = null
    }
  }, [])

  // Load LUT data when filterId changes
  React.useEffect(() => {
    if (!filterId) {
      activeLutRef.current = null
      clearCanvas()
      return
    }

    let cancelled = false
    loadLut(filterId)
      .then(lut => {
        if (cancelled) return
        activeLutRef.current = lut
        ensureLutTexture(lut, filterId)
        draw()
      })
      .catch(err => {
        console.warn(`[LutCanvas] Failed to load LUT ${filterId}:`, err)
        activeLutRef.current = null
      })

    return () => {
      cancelled = true
    }
  }, [filterId])

  // Helper to upload 3D texture into WebGL context
  const ensureLutTexture = React.useCallback((lut: CubeLut, id: string) => {
    const gl = glRef.current
    if (!gl) return

    const cache = lutTextureCacheRef.current
    if (cache.has(id)) return

    const tex = gl.createTexture()
    if (!tex) return

    gl.bindTexture(gl.TEXTURE_3D, tex)
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_R, gl.CLAMP_TO_EDGE)

    const ext = gl.getExtension('OES_texture_float_linear')
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1)

    if (ext) {
      gl.texImage3D(
        gl.TEXTURE_3D,
        0,
        gl.RGB32F,
        lut.size,
        lut.size,
        lut.size,
        0,
        gl.RGB,
        gl.FLOAT,
        lut.data,
      )
    } else {
      // Fallback to RGB8 Uint8Array for guaranteed hardware filtering
      const uint8 = new Uint8Array(lut.data.length)
      for (let i = 0; i < lut.data.length; i++) {
        uint8[i] = Math.round(Math.max(0, Math.min(1, lut.data[i])) * 255)
      }
      gl.texImage3D(
        gl.TEXTURE_3D,
        0,
        gl.RGB8,
        lut.size,
        lut.size,
        lut.size,
        0,
        gl.RGB,
        gl.UNSIGNED_BYTE,
        uint8,
      )
    }

    cache.set(id, { texture: tex, size: lut.size })
  }, [])

  /** Wipes the canvas so nothing from a previous frame outlives its source. */
  const clearCanvas = React.useCallback(() => {
    const gl = glRef.current
    if (!gl) return
    gl.clearColor(0, 0, 0, 0)
    gl.clear(gl.COLOR_BUFFER_BIT)
  }, [])

  // Draw loop
  const draw = React.useCallback(() => {
    const gl = glRef.current
    const program = programRef.current
    const canvas = canvasRef.current
    const source = sourceElement
    const currentFilterId = filterId

    const hasLut = Boolean(currentFilterId && lutTextureCacheRef.current.has(currentFilterId))
    const hasChroma = Boolean(chromaKey && chromaKey.enabled)

    if (!gl || !program || !canvas) return
    if (!source || (!hasLut && !hasChroma)) {
      clearCanvas()
      return
    }

    // Check if source element has visual data
    const isVideo = source instanceof HTMLVideoElement
    const isImage = source instanceof HTMLImageElement

    if (isVideo && source.readyState < 2) return
    if (isImage && !source.complete) {
      clearCanvas()
      return
    }

    const sourceW = isVideo ? source.videoWidth : source.naturalWidth
    const sourceH = isVideo ? source.videoHeight : source.naturalHeight
    if (!sourceW || !sourceH) return

    if (canvas.width !== sourceW || canvas.height !== sourceH) {
      canvas.width = sourceW
      canvas.height = sourceH
    }

    gl.viewport(0, 0, canvas.width, canvas.height)
    gl.useProgram(program)

    // Unit 0: Video frame
    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_2D, imageTextureRef.current)
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 4)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source)
    gl.uniform1i(gl.getUniformLocation(program, 'u_image'), 0)

    // Unit 1: 3D LUT
    gl.activeTexture(gl.TEXTURE1)
    if (hasLut && currentFilterId) {
      const lutEntry = lutTextureCacheRef.current.get(currentFilterId)
      if (lutEntry) {
        gl.bindTexture(gl.TEXTURE_3D, lutEntry.texture)
        gl.uniform1i(gl.getUniformLocation(program, 'u_lut'), 1)
        gl.uniform1i(gl.getUniformLocation(program, 'u_lut_enabled'), 1)
        const normIntensity = Math.max(0, Math.min(100, intensity)) / 100
        gl.uniform1f(gl.getUniformLocation(program, 'u_intensity'), normIntensity)
        gl.uniform1f(gl.getUniformLocation(program, 'u_lut_size'), lutEntry.size)
      } else {
        gl.bindTexture(gl.TEXTURE_3D, dummyLutTextureRef.current)
        gl.uniform1i(gl.getUniformLocation(program, 'u_lut'), 1)
        gl.uniform1i(gl.getUniformLocation(program, 'u_lut_enabled'), 0)
      }
    } else {
      gl.bindTexture(gl.TEXTURE_3D, dummyLutTextureRef.current)
      gl.uniform1i(gl.getUniformLocation(program, 'u_lut'), 1)
      gl.uniform1i(gl.getUniformLocation(program, 'u_lut_enabled'), 0)
      gl.uniform1f(gl.getUniformLocation(program, 'u_intensity'), 0)
      gl.uniform1f(gl.getUniformLocation(program, 'u_lut_size'), 1)
    }

    // Chroma key uniforms
    if (hasChroma && chromaKey) {
      gl.uniform1i(gl.getUniformLocation(program, 'u_chroma_enabled'), 1)
      const [cr, cg, cb] = hexToRgb01(chromaKey.color)
      gl.uniform3f(gl.getUniformLocation(program, 'u_chroma_color'), cr, cg, cb)
      gl.uniform1f(gl.getUniformLocation(program, 'u_chroma_similarity'), Math.max(0.0001, (chromaKey.similarity ?? 30) / 100))
      gl.uniform1f(gl.getUniformLocation(program, 'u_chroma_smoothness'), Math.max(0.0001, (chromaKey.smoothness ?? 10) / 100))
      gl.uniform1f(gl.getUniformLocation(program, 'u_chroma_spill'), Math.max(0, (chromaKey.spill ?? 50) / 100))
    } else {
      gl.uniform1i(gl.getUniformLocation(program, 'u_chroma_enabled'), 0)
    }

    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)
  }, [clearCanvas, filterId, intensity, chromaKey, sourceElement])

  /**
   * A still is decoded asynchronously, so the first draw after it is mounted or
   * its src is swapped usually finds `complete === false`. Nothing else would
   * come back to it — the paused path only redraws when a prop changes — so the
   * element itself has to say when it is ready.
   */
  React.useEffect(() => {
    if (!(sourceElement instanceof HTMLImageElement)) return
    const image = sourceElement
    const onLoad = () => draw()
    image.addEventListener('load', onLoad)
    return () => image.removeEventListener('load', onLoad)
  }, [draw, sourceElement])

  // Playback requestAnimationFrame loop
  React.useEffect(() => {
    const shouldPlay = isPlaying && ((Boolean(filterId) && intensity > 0) || Boolean(chromaKey?.enabled))
    if (!shouldPlay) {
      if (animFrameIdRef.current) {
        cancelAnimationFrame(animFrameIdRef.current)
        animFrameIdRef.current = 0
      }
      return
    }

    const loop = () => {
      draw()
      animFrameIdRef.current = requestAnimationFrame(loop)
    }

    animFrameIdRef.current = requestAnimationFrame(loop)
    return () => {
      if (animFrameIdRef.current) {
        cancelAnimationFrame(animFrameIdRef.current)
        animFrameIdRef.current = 0
      }
    }
  }, [draw, isPlaying, filterId, intensity, chromaKey])

  // Redraw when source, filter, intensity, or chromaKey changes while paused
  React.useEffect(() => {
    if (!isPlaying) {
      draw()
    }
  }, [draw, isPlaying, filterId, intensity, chromaKey])

  React.useImperativeHandle(
    ref,
    () => ({
      renderNow: draw,
      getCanvas: () => canvasRef.current,
      clear: clearCanvas,
    }),
    [clearCanvas, draw],
  )

  const isVisible = Boolean((filterId && intensity > 0) || (chromaKey && chromaKey.enabled))

  return (
    <canvas
      ref={canvasRef}
      className={className}
      style={{
        ...style,
        display: isVisible ? style?.display ?? 'block' : 'none',
      }}
    />
  )
})
