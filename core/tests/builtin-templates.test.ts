import { describe, it, expect } from 'vitest'
import {
  BUILTIN_TEMPLATES,
  builtinTemplateFileName,
  findBuiltinTemplate,
} from '../src/builtin-templates'
import { TEMPLATE_CATEGORIES, komfyTemplateSchema } from '../src/template-model'
import { applyTemplate } from '../src/template-apply'
import type { Asset } from '../src/project-model'

const asset = (over: Partial<Asset> = {}): Asset => ({
  id: 'a', type: 'video', path: 'C:/mine/shot.mp4',
  prompt: '', resolution: '', duration: 30, width: 1920, height: 1080, createdAt: 0,
  ...over,
} as Asset)

/*
 * The samples ship inside the binary, so a malformed one is not a bad file the
 * user can delete — it is a broken first launch. Everything here runs at build
 * time for that reason.
 */
describe('built-in templates', () => {
  it('ships more than one, so the list is a library rather than an example', () => {
    expect(BUILTIN_TEMPLATES.length).toBeGreaterThanOrEqual(3)
  })

  it.each(BUILTIN_TEMPLATES.map(t => [t.name, t] as const))(
    '%s is a valid template document',
    (_name, template) => {
      expect(() => komfyTemplateSchema.parse(template)).not.toThrow()
    },
  )

  it.each(BUILTIN_TEMPLATES.map(t => [t.name, t] as const))(
    '%s has slots, and every slot points at a clip that exists',
    (_name, template) => {
      expect(template.slots.length).toBeGreaterThan(0)
      const clipIds = new Set(template.timeline.clips.map(clip => clip.id))
      for (const slot of template.slots) {
        expect(clipIds.has(slot.clipId)).toBe(true)
        expect(slot.duration).toBeGreaterThan(0)
      }
    },
  )

  it.each(BUILTIN_TEMPLATES.map(t => [t.name, t] as const))(
    '%s carries no media and no path from any machine',
    (_name, template) => {
      expect(template.bundledMedia).toEqual([])
      const serialised = JSON.stringify(template)
      expect(serialised).not.toMatch(/[A-Za-z]:[\\/]/)
      for (const clip of template.timeline.clips) {
        expect(clip.asset).toBeNull()
      }
    },
  )

  it.each(BUILTIN_TEMPLATES.map(t => [t.name, t] as const))(
    '%s numbers its slots 1..n in play order',
    (_name, template) => {
      const indexes = template.slots.map(slot => slot.slotIndex)
      expect(indexes).toEqual(indexes.map((_, i) => i + 1))

      const starts = template.slots.map(slot =>
        template.timeline.clips.find(clip => clip.id === slot.clipId)!.startTime)
      expect(starts).toEqual([...starts].sort((a, b) => a - b))
    },
  )

  /* Every clip must sit on a track the timeline actually has. */
  it.each(BUILTIN_TEMPLATES.map(t => [t.name, t] as const))(
    '%s puts every clip on a track that exists',
    (_name, template) => {
      for (const clip of template.timeline.clips) {
        expect(template.timeline.tracks[clip.trackIndex]).toBeDefined()
      }
    },
  )

  /*
   * A slot clip never lands on the subtitle track. `addSubtitleTrack` prepends,
   * so index 0 is captions in any captioned project, and footage parked there
   * is drawn by nothing — the bug that made B-roll inserts invisible.
   */
  it.each(BUILTIN_TEMPLATES.map(t => [t.name, t] as const))(
    '%s keeps footage off the subtitle track',
    (_name, template) => {
      for (const slot of template.slots) {
        const clip = template.timeline.clips.find(c => c.id === slot.clipId)!
        expect(template.timeline.tracks[clip.trackIndex].type).not.toBe('subtitle')
      }
    },
  )

  it.each(BUILTIN_TEMPLATES.map(t => [t.name, t] as const))(
    '%s names both ends of every transition after a clip it holds',
    (_name, template) => {
      const clipIds = new Set(template.timeline.clips.map(clip => clip.id))
      for (const transition of template.timeline.transitions ?? []) {
        expect(clipIds.has(transition.leftClipId)).toBe(true)
        expect(clipIds.has(transition.rightClipId)).toBe(true)
      }
    },
  )

  /* Keyframes are clip-local seconds; one past the clip's end never fires. */
  it.each(BUILTIN_TEMPLATES.map(t => [t.name, t] as const))(
    '%s keeps every keyframe inside the clip it animates',
    (_name, template) => {
      for (const clip of template.timeline.clips) {
        for (const track of clip.keyframes ?? []) {
          for (const point of track.points) {
            expect(point.t).toBeGreaterThanOrEqual(0)
            expect(point.t).toBeLessThanOrEqual(clip.duration + 0.001)
          }
        }
      }
    },
  )

  it.each(BUILTIN_TEMPLATES.map(t => [t.name, t] as const))(
    '%s applies to a real timeline with every slot filled',
    (_name, template) => {
      const bindings = template.slots.map(slot => ({
        slotIndex: slot.slotIndex,
        asset: asset({ id: `asset-${slot.slotIndex}` }),
      }))
      const { timeline, unfilledSlots, shortSlots } = applyTemplate(template, bindings)

      expect(unfilledSlots).toEqual([])
      expect(shortSlots).toEqual([])
      expect(timeline.clips.filter(clip => clip.assetId)).toHaveLength(template.slots.length)
      expect(timeline.width).toBe(template.width)

      // Ids are remapped, so nothing may still point into the template.
      const ids = new Set(timeline.clips.map(clip => clip.id))
      for (const slot of template.slots) expect(ids.has(slot.clipId)).toBe(false)
      for (const transition of timeline.transitions ?? []) {
        expect(ids.has(transition.leftClipId)).toBe(true)
        expect(ids.has(transition.rightClipId)).toBe(true)
      }
    },
  )

  it('gives each sample a distinct id and file name', () => {
    const ids = BUILTIN_TEMPLATES.map(t => t.id)
    const names = BUILTIN_TEMPLATES.map(builtinTemplateFileName)
    expect(new Set(ids).size).toBe(ids.length)
    expect(new Set(names).size).toBe(names.length)
  })

  it('finds a sample by the file name the browser addresses it with', () => {
    for (const template of BUILTIN_TEMPLATES) {
      expect(findBuiltinTemplate(builtinTemplateFileName(template))?.id).toBe(template.id)
    }
    expect(findBuiltinTemplate('khong-co.komfytemplate')).toBeUndefined()
  })

  it('offers a landscape option, not only vertical', () => {
    expect(BUILTIN_TEMPLATES.some(t => t.width > t.height)).toBe(true)
    expect(BUILTIN_TEMPLATES.some(t => t.height > t.width)).toBe(true)
  })

  /*
   * The shelves the browser's left column offers. A pill that leads to an empty
   * shelf is worse than no pill: it reads as a broken library rather than as a
   * category nobody has filled.
   */
  describe('shelves', () => {
    it('files every sample under a known category', () => {
      for (const template of BUILTIN_TEMPLATES) {
        expect(TEMPLATE_CATEGORIES).toContain(template.category as never)
      }
    })

    it('leaves no shelf empty', () => {
      for (const category of TEMPLATE_CATEGORIES) {
        const onShelf = BUILTIN_TEMPLATES.filter(t => t.category === category)
        expect(onShelf.length).toBeGreaterThan(0)
      }
    })

    it('gives the shape and shot-count filters something to find either way', () => {
      expect(BUILTIN_TEMPLATES.some(t => t.slots.length <= 3)).toBe(true)
      expect(BUILTIN_TEMPLATES.some(t => t.slots.length > 3)).toBe(true)
    })
  })
})
