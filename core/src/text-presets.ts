import type {
  KeyframeTrack,
  SubtitleStyle,
  TextOverlayStyle,
  TimelineClip,
} from './project-model'
import {
  DEFAULT_CLIP_TRANSFORM,
  DEFAULT_COLOR_CORRECTION,
  DEFAULT_SUBTITLE_STYLE,
  DEFAULT_TEXT_STYLE,
} from './project-model'
import { makeId } from './id-generator'

export interface TextPreset {
  id: string
  name: string
  description: string
  category: 'basic' | 'title' | 'creative' | 'subtitle'
  style: Partial<TextOverlayStyle>
}

export interface TextAnimation {
  id: string
  name: string
  description: string
  createTracks: (clipDuration: number) => KeyframeTrack[]
}

export const TEXT_PRESETS: TextPreset[] = [
  {
    id: 'default',
    name: 'Default Title',
    description: 'Standard white text with a subtle drop shadow',
    category: 'basic',
    style: {
      fontSize: 64,
      fontFamily: 'Inter, Arial, sans-serif',
      fontWeight: 'bold',
      fontStyle: 'normal',
      color: '#FFFFFF',
      backgroundColor: 'transparent',
      textAlign: 'center',
      strokeColor: 'transparent',
      strokeWidth: 0,
      shadowColor: 'rgba(0,0,0,0.6)',
      shadowBlur: 4,
      shadowOffsetX: 2,
      shadowOffsetY: 2,
      letterSpacing: 0,
      lineHeight: 1.2,
      padding: 0,
      borderRadius: 0,
      opacity: 100,
    },
  },
  {
    id: 'bold-punch',
    name: 'Bold Impact',
    description: 'Bold yellow text with a thick high-contrast black outline',
    category: 'title',
    style: {
      fontSize: 72,
      fontFamily: 'Impact, Arial Black, sans-serif',
      fontWeight: '900',
      fontStyle: 'normal',
      color: '#FACC15',
      backgroundColor: 'transparent',
      textAlign: 'center',
      strokeColor: '#000000',
      strokeWidth: 3,
      shadowColor: 'rgba(0,0,0,0.85)',
      shadowBlur: 6,
      shadowOffsetX: 3,
      shadowOffsetY: 3,
      letterSpacing: 1,
      lineHeight: 1.1,
      padding: 0,
      borderRadius: 0,
      opacity: 100,
    },
  },
  {
    id: 'cinematic-gold',
    name: 'Cinematic Gold',
    description: 'Classic cinematic style with elegant golden serif text',
    category: 'creative',
    style: {
      fontSize: 56,
      fontFamily: 'Georgia, serif',
      fontWeight: 'normal',
      fontStyle: 'normal',
      color: '#F59E0B',
      backgroundColor: 'transparent',
      textAlign: 'center',
      strokeColor: 'transparent',
      strokeWidth: 0,
      shadowColor: 'rgba(0,0,0,0.9)',
      shadowBlur: 8,
      shadowOffsetX: 2,
      shadowOffsetY: 2,
      letterSpacing: 4,
      lineHeight: 1.3,
      padding: 0,
      borderRadius: 0,
      opacity: 100,
    },
  },
  {
    id: 'neon-cyan',
    name: 'Neon Cyber',
    description: 'Cyberpunk style glowing cyan neon light effect',
    category: 'creative',
    style: {
      fontSize: 64,
      fontFamily: 'Inter, sans-serif',
      fontWeight: 'bold',
      fontStyle: 'normal',
      color: '#38BDF8',
      backgroundColor: 'transparent',
      textAlign: 'center',
      strokeColor: '#0284C7',
      strokeWidth: 1,
      shadowColor: '#0284C7',
      shadowBlur: 14,
      shadowOffsetX: 0,
      shadowOffsetY: 0,
      letterSpacing: 2,
      lineHeight: 1.2,
      padding: 0,
      borderRadius: 0,
      opacity: 100,
    },
  },
  {
    id: 'lower-third',
    name: 'Lower Third',
    description: 'Lower-left name tag with semi-transparent rounded black box',
    category: 'subtitle',
    style: {
      fontSize: 40,
      fontFamily: 'Inter, sans-serif',
      fontWeight: '600',
      fontStyle: 'normal',
      color: '#F4F4F5',
      backgroundColor: 'rgba(0,0,0,0.7)',
      textAlign: 'left',
      positionX: 30,
      positionY: 82,
      strokeColor: 'transparent',
      strokeWidth: 0,
      shadowColor: 'transparent',
      shadowBlur: 0,
      shadowOffsetX: 0,
      shadowOffsetY: 0,
      letterSpacing: 0,
      lineHeight: 1.2,
      padding: 12,
      borderRadius: 6,
      opacity: 100,
    },
  },
  {
    id: 'minimal-box',
    name: 'Minimalist Box',
    description: 'Black text on a modern minimalist white block',
    category: 'basic',
    style: {
      fontSize: 48,
      fontFamily: 'Inter, sans-serif',
      fontWeight: 'bold',
      fontStyle: 'normal',
      color: '#09090B',
      backgroundColor: '#FFFFFF',
      textAlign: 'center',
      strokeColor: 'transparent',
      strokeWidth: 0,
      shadowColor: 'rgba(0,0,0,0.3)',
      shadowBlur: 10,
      shadowOffsetX: 0,
      shadowOffsetY: 4,
      letterSpacing: 1,
      lineHeight: 1.2,
      padding: 14,
      borderRadius: 8,
      opacity: 100,
    },
  },
  {
    id: 'retro-sunset',
    name: 'Retro Sunset',
    description: 'Vibrant 80s synthwave style magenta and purple',
    category: 'creative',
    style: {
      fontSize: 64,
      fontFamily: 'Arial, sans-serif',
      fontWeight: '900',
      fontStyle: 'italic',
      color: '#EC4899',
      backgroundColor: 'transparent',
      textAlign: 'center',
      strokeColor: '#FBBF24',
      strokeWidth: 2,
      shadowColor: 'rgba(124,58,237,0.8)',
      shadowBlur: 8,
      shadowOffsetX: 3,
      shadowOffsetY: 3,
      letterSpacing: 2,
      lineHeight: 1.2,
      padding: 0,
      borderRadius: 0,
      opacity: 100,
    },
  },
  {
    id: 'headline-alert',
    name: 'Headline Red',
    description: 'Bold urgent red with strong contrast for breaking news',
    category: 'title',
    style: {
      fontSize: 68,
      fontFamily: 'Impact, sans-serif',
      fontWeight: 'bold',
      fontStyle: 'normal',
      color: '#EF4444',
      backgroundColor: 'transparent',
      textAlign: 'center',
      strokeColor: '#000000',
      strokeWidth: 2,
      shadowColor: 'rgba(0,0,0,0.9)',
      shadowBlur: 4,
      shadowOffsetX: 2,
      shadowOffsetY: 2,
      letterSpacing: 1,
      lineHeight: 1.1,
      padding: 0,
      borderRadius: 0,
      opacity: 100,
    },
  },
  {
    id: 'elegant-serif',
    name: 'Modern Editorial',
    description: 'Elegant light cream editorial magazine typography',
    category: 'creative',
    style: {
      fontSize: 54,
      fontFamily: 'Times New Roman, serif',
      fontWeight: 'normal',
      fontStyle: 'italic',
      color: '#FEF3C7',
      backgroundColor: 'transparent',
      textAlign: 'center',
      strokeColor: 'transparent',
      strokeWidth: 0,
      shadowColor: 'rgba(0,0,0,0.5)',
      shadowBlur: 4,
      shadowOffsetX: 1,
      shadowOffsetY: 1,
      letterSpacing: 3,
      lineHeight: 1.3,
      padding: 0,
      borderRadius: 0,
      opacity: 100,
    },
  },
  {
    id: 'caption-bubble',
    name: 'Speech Bubble',
    description: 'Rounded speech bubble for vlogs and narration',
    category: 'subtitle',
    style: {
      fontSize: 44,
      fontFamily: 'Inter, sans-serif',
      fontWeight: '500',
      fontStyle: 'normal',
      color: '#FFFFFF',
      backgroundColor: 'rgba(24,24,27,0.85)',
      textAlign: 'center',
      strokeColor: 'rgba(255,255,255,0.2)',
      strokeWidth: 1,
      shadowColor: 'rgba(0,0,0,0.4)',
      shadowBlur: 6,
      shadowOffsetX: 0,
      shadowOffsetY: 3,
      letterSpacing: 0,
      lineHeight: 1.2,
      padding: 16,
      borderRadius: 16,
      opacity: 100,
    },
  },
  {
    id: 'lower-third-basic',
    name: 'Lower Third Basic',
    description: 'Standard lower-third name tag',
    category: 'subtitle',
    style: {
      text: 'Name Here',
      fontSize: 32,
      fontWeight: '600',
      color: '#FFFFFF',
      positionX: 10,
      positionY: 82,
      textAlign: 'left',
      backgroundColor: 'rgba(0,0,0,0.7)',
      padding: 12,
      borderRadius: 6,
      maxWidth: 40,
    },
  },
  {
    id: 'subtitle-style',
    name: 'Subtitle Caption',
    description: 'Clean subtitle caption at the bottom of the frame',
    category: 'subtitle',
    style: {
      text: 'Subtitle text',
      fontSize: 36,
      fontWeight: 'normal',
      color: '#FFFFFF',
      positionX: 50,
      positionY: 88,
      textAlign: 'center',
      backgroundColor: 'rgba(0,0,0,0.6)',
      padding: 8,
      borderRadius: 4,
    },
  },
  {
    id: 'end-card',
    name: 'End Card',
    description: 'Elegant closing thank-you message',
    category: 'creative',
    style: {
      text: 'Thank You',
      fontSize: 72,
      fontWeight: '300',
      positionX: 50,
      positionY: 45,
      textAlign: 'center',
      letterSpacing: 8,
      color: '#E4E4E7',
    },
  },
  {
    id: 'corner-tag',
    name: 'Corner Tag (LIVE)',
    description: 'Red live badge in top corner',
    category: 'basic',
    style: {
      text: 'LIVE',
      fontSize: 20,
      fontWeight: '700',
      positionX: 92,
      positionY: 8,
      textAlign: 'right',
      color: '#FFFFFF',
      backgroundColor: 'rgba(239,68,68,0.9)',
      padding: 6,
      borderRadius: 4,
    },
  },
  {
    id: 'tiktok-classic',
    name: 'TikTok Classic',
    description: 'Bold white text with 4px black outline, centered in bottom safe zone',
    category: 'subtitle',
    style: {
      fontSize: 54,
      fontFamily: 'Inter, Arial, sans-serif',
      fontWeight: '900',
      fontStyle: 'normal',
      color: '#FFFFFF',
      backgroundColor: 'transparent',
      textAlign: 'center',
      positionX: 50,
      positionY: 75,
      strokeColor: '#000000',
      strokeWidth: 4,
      shadowColor: 'rgba(0,0,0,0.95)',
      shadowBlur: 6,
      shadowOffsetX: 2,
      shadowOffsetY: 3,
      letterSpacing: 1,
      lineHeight: 1.15,
      padding: 0,
      borderRadius: 0,
      opacity: 100,
    },
  },
  {
    id: 'viral-yellow',
    name: 'Viral Yellow',
    description: 'Neon yellow text with thick black outline, viral highlight style',
    category: 'subtitle',
    style: {
      fontSize: 56,
      fontFamily: 'Impact, Arial Black, sans-serif',
      fontWeight: '900',
      fontStyle: 'normal',
      color: '#FFE600',
      backgroundColor: 'transparent',
      textAlign: 'center',
      positionX: 50,
      positionY: 75,
      strokeColor: '#000000',
      strokeWidth: 4,
      shadowColor: 'rgba(0,0,0,0.95)',
      shadowBlur: 6,
      shadowOffsetX: 2,
      shadowOffsetY: 3,
      letterSpacing: 1,
      lineHeight: 1.15,
      padding: 0,
      borderRadius: 0,
      opacity: 100,
    },
  },
  {
    id: 'viral-neon',
    name: 'Neon Green',
    description: 'Glowing neon green text with ultra-high contrast black border',
    category: 'subtitle',
    style: {
      fontSize: 56,
      fontFamily: 'Impact, Arial Black, sans-serif',
      fontWeight: '900',
      fontStyle: 'normal',
      color: '#00FF66',
      backgroundColor: 'transparent',
      textAlign: 'center',
      positionX: 50,
      positionY: 75,
      strokeColor: '#000000',
      strokeWidth: 4,
      shadowColor: 'rgba(0,0,0,0.95)',
      shadowBlur: 8,
      shadowOffsetX: 2,
      shadowOffsetY: 3,
      letterSpacing: 1,
      lineHeight: 1.15,
      padding: 0,
      borderRadius: 0,
      opacity: 100,
    },
  },
]

export const TEXT_ANIMATIONS: TextAnimation[] = [
  {
    id: 'fly-in',
    name: 'Fly In',
    description: 'Text flies in smoothly from bottom to center with fade',
    createTracks: (duration: number) => {
      const animDur = Math.min(0.5, duration * 0.5)
      const fadeDur = Math.min(0.3, duration * 0.3)
      return [
        {
          property: 'transform.positionY',
          points: [
            { t: 0, value: 35, easing: 'ease-out' },
            { t: animDur, value: 0, easing: 'linear' },
          ],
        },
        {
          property: 'opacity',
          points: [
            { t: 0, value: 0, easing: 'ease-out' },
            { t: fadeDur, value: 100, easing: 'linear' },
          ],
        },
      ]
    },
  },
  {
    id: 'slide-in',
    name: 'Slide In',
    description: 'Text slides smoothly from left into center',
    createTracks: (duration: number) => {
      const animDur = Math.min(0.5, duration * 0.5)
      const fadeDur = Math.min(0.3, duration * 0.3)
      return [
        {
          property: 'transform.positionX',
          points: [
            { t: 0, value: -40, easing: 'ease-out' },
            { t: animDur, value: 0, easing: 'linear' },
          ],
        },
        {
          property: 'opacity',
          points: [
            { t: 0, value: 0, easing: 'ease-out' },
            { t: fadeDur, value: 100, easing: 'linear' },
          ],
        },
      ]
    },
  },
  {
    id: 'fade-in',
    name: 'Fade In',
    description: 'Smooth fade in transition',
    createTracks: (duration: number) => {
      const animDur = Math.min(0.6, duration * 0.6)
      return [
        {
          property: 'opacity',
          points: [
            { t: 0, value: 0, easing: 'ease-out' },
            { t: animDur, value: 100, easing: 'linear' },
          ],
        },
      ]
    },
  },
  {
    id: 'pop',
    name: 'Pop (Bounce In)',
    description: 'Text pops in from center with a subtle bounce',
    createTracks: (duration: number) => {
      const peakDur = Math.min(0.35, duration * 0.35)
      const settleDur = Math.min(0.5, duration * 0.5)
      const fadeDur = Math.min(0.15, duration * 0.15)
      return [
        {
          property: 'transform.scale',
          points: [
            { t: 0, value: 0, easing: 'ease-out' },
            { t: peakDur, value: 120, easing: 'ease-in-out' },
            { t: settleDur, value: 100, easing: 'linear' },
          ],
        },
        {
          property: 'opacity',
          points: [
            { t: 0, value: 0, easing: 'linear' },
            { t: fadeDur, value: 100, easing: 'linear' },
          ],
        },
      ]
    },
  },
  {
    id: 'typewriter',
    name: 'Typewriter',
    description: 'Character-by-character typewriter reveal effect',
    createTracks: (duration: number) => {
      const typeDur = Math.min(1.5, Math.max(0.6, duration * 0.65))
      return [
        {
          property: 'text.progress',
          points: [
            { t: 0, value: 0, easing: 'linear' },
            { t: typeDur, value: 100, easing: 'linear' },
          ],
        },
      ]
    },
  },
]

export function getTextPreset(id: string): TextPreset | undefined {
  return TEXT_PRESETS.find(p => p.id === id)
}

export function getTextAnimation(id: string): TextAnimation | undefined {
  return TEXT_ANIMATIONS.find(a => a.id === id)
}

/**
 * Apply a text preset to a clip.
 * CRITICAL: Preserves existing text content on the clip so user work is never lost!
 */
export function applyTextPreset(clip: TimelineClip, presetId: string): TimelineClip {
  const preset = getTextPreset(presetId)
  if (!preset) return clip

  const currentText = clip.textStyle?.text ?? 'Title Text'
  return {
    ...clip,
    textStyle: {
      ...DEFAULT_TEXT_STYLE,
      ...clip.textStyle,
      ...preset.style,
      text: currentText, // Preserve existing text!
    },
  }
}

/**
 * Apply a preset animation to a clip by generating keyframes on KE-201 keyframe system.
 * Replaces existing keyframe tracks for the properties touched by this animation,
 * while preserving any other existing keyframe tracks (e.g. volume or filter).
 */
export function applyTextAnimation(clip: TimelineClip, animationId: string): TimelineClip {
  const anim = getTextAnimation(animationId)
  if (!anim) return clip

  const newTracks = anim.createTracks(clip.duration)
  const touchedProps = new Set(newTracks.map(t => t.property))

  const existingTracks = (clip.keyframes ?? []).filter(
    t => !touchedProps.has(t.property),
  )

  return {
    ...clip,
    keyframes: [...existingTracks, ...newTracks],
  }
}

/**
 * Create a new text clip configured with a preset style and optional animation.
 */
export function createTextClipWithPreset(
  presetId = 'default',
  animationId?: string,
  text = 'Title Text',
  startTime = 0,
  trackIndex = 0,
  duration = 4,
): TimelineClip {
  const preset = getTextPreset(presetId) ?? TEXT_PRESETS[0]
  let clip: TimelineClip = {
    id: makeId('clip-text'),
    assetId: null,
    type: 'text',
    startTime,
    duration,
    trimStart: 0,
    trimEnd: 0,
    speed: 1,
    reversed: false,
    muted: true,
    volume: 1,
    trackIndex,
    asset: null,
    flipH: false,
    flipV: false,
    transitionIn: { type: 'none', duration: 0 },
    transitionOut: { type: 'none', duration: 0 },
    colorCorrection: { ...DEFAULT_COLOR_CORRECTION },
    transform: { ...DEFAULT_CLIP_TRANSFORM },
    opacity: 100,
    textStyle: {
      ...DEFAULT_TEXT_STYLE,
      ...preset.style,
      text,
    },
  }

  if (animationId) {
    clip = applyTextAnimation(clip, animationId)
  }

  return clip
}

export interface SubtitlePreset {
  id: string
  name: string
  description: string
  style: Partial<SubtitleStyle>
}

export const SUBTITLE_PRESETS: SubtitlePreset[] = [
  {
    id: 'default',
    name: 'Default Subtitle',
    description: 'Standard white subtitle at the bottom of the screen',
    style: {
      fontSize: 32,
      fontFamily: 'sans-serif',
      fontWeight: 'normal',
      color: '#FFFFFF',
      backgroundColor: 'transparent',
      position: 'bottom',
      italic: false,
    },
  },
  {
    id: 'tiktok-classic',
    name: 'TikTok Classic',
    description: 'Bold white text with high-contrast outline, short-form style',
    style: {
      fontSize: 38,
      fontFamily: 'sans-serif',
      fontWeight: 'bold',
      color: '#FFFFFF',
      backgroundColor: 'transparent',
      position: 'bottom',
      italic: false,
    },
  },
  {
    id: 'viral-yellow',
    name: 'Viral Yellow',
    description: 'Bold neon yellow text that stands out on any short video background',
    style: {
      fontSize: 40,
      fontFamily: 'sans-serif',
      fontWeight: 'bold',
      color: '#FFE600',
      backgroundColor: 'transparent',
      position: 'bottom',
      italic: false,
    },
  },
  {
    id: 'viral-neon',
    name: 'Neon Green',
    description: 'High-contrast neon green text to capture viewers\' attention',
    style: {
      fontSize: 40,
      fontFamily: 'sans-serif',
      fontWeight: 'bold',
      color: '#00FF66',
      backgroundColor: 'transparent',
      position: 'bottom',
      italic: false,
    },
  },
  {
    id: 'dark-box',
    name: 'Dark Box',
    description: 'White text on a semi-transparent black box for easy reading',
    style: {
      fontSize: 34,
      fontFamily: 'sans-serif',
      fontWeight: 'bold',
      color: '#FFFFFF',
      backgroundColor: 'rgba(0,0,0,0.75)',
      position: 'bottom',
      italic: false,
    },
  },
  {
    id: 'center-punch',
    name: 'Center Impact',
    description: 'Centered on screen punchy text for hook questions and key statements',
    style: {
      fontSize: 44,
      fontFamily: 'sans-serif',
      fontWeight: 'bold',
      color: '#FFFF00',
      backgroundColor: 'transparent',
      position: 'center',
      italic: false,
    },
  },
]

export function getSubtitlePreset(id: string): SubtitlePreset | undefined {
  return SUBTITLE_PRESETS.find(p => p.id === id)
}

export function applySubtitlePreset(
  currentStyle: Partial<SubtitleStyle> = {},
  presetId: string,
): SubtitleStyle {
  const preset = getSubtitlePreset(presetId) ?? SUBTITLE_PRESETS[0]
  return {
    ...DEFAULT_SUBTITLE_STYLE,
    ...currentStyle,
    ...preset.style,
  }
}

