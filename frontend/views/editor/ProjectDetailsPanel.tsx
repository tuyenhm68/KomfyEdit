import { useMemo } from 'react'
import { HelpCircle } from 'lucide-react'
import type { Project } from '../../types/project-model'
import { selectActiveTimeline, selectAssets } from './editor-selectors'
import { useEditorActions, useEditorStore } from './editor-store'
import { getEffectiveTimelineDimensions } from '@core/video-resolution'

/**
 * What the right-hand panel shows when nothing is selected: project- and
 * timeline-level facts, kept read-only apart from a Modify button that opens
 * project settings.
 */
export function ProjectDetailsPanel({ project }: { project: Project }) {
  const actions = useEditorActions()
  const assets = useEditorStore(selectAssets)
  const activeTimeline = useEditorStore(selectActiveTimeline)

  const dimensions = useMemo(() => {
    return getEffectiveTimelineDimensions(activeTimeline, assets)
  }, [activeTimeline, assets])

  const createdAt = new Date(project.createdAt).toLocaleDateString()

  const bgDescription = useMemo(() => {
    const bg = activeTimeline?.background
    if (!bg || (bg.type === 'color' && (!bg.color || bg.color.toLowerCase() === '#000000'))) {
      return 'Black'
    }
    if (bg.type === 'color') return bg.color || 'Black'
    if (bg.type === 'blur') return `Blurred Media (${bg.blur ?? 40}%)`
    if (bg.type === 'image') return 'Custom Image'
    return 'Black'
  }, [activeTimeline?.background])

  return (
    <div className="flex h-full min-h-0 flex-col bg-zinc-900">
      <div className="flex h-[34px] flex-shrink-0 items-center border-b border-zinc-800 px-4">
        <span className="text-[13px] font-medium text-zinc-100">Details</span>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
        <dl className="space-y-3">
          <Row label="Name" value={project.name} />
          <Row label="Path" value={project.id} wrap />
          <Row label="Imported media" value="Stay in original location" />
          <Row label="Arrange layers" value="Turned on" hint />
          <Row label="Proxy" value="Turned off" hint />
        </dl>

        <div className="my-5 h-px bg-zinc-800" />

        <dl className="space-y-3">
          <Row label="Timeline name" value={activeTimeline?.name ?? '—'} />
          <Row label="Aspect ratio" value={dimensions.aspectRatioLabel} />
          <Row label="Resolution" value={`${dimensions.width}×${dimensions.height}`} />
          <Row label="Frame rate" value={`${dimensions.fps.toFixed(2)}fps`} />
          <Row label="Background" value={bgDescription} />
          <Row label="Created" value={createdAt} />
        </dl>
      </div>

      <div className="flex flex-shrink-0 justify-end border-t border-zinc-800 px-4 py-2.5">
        <button
          onClick={() => actions.openProjectSettingsModal()}
          className="h-[26px] rounded-[4px] bg-zinc-800 px-4 text-[12px] text-zinc-200 transition-colors hover:bg-zinc-700"
        >
          Modify
        </button>
      </div>
    </div>
  )
}

function Row({ label, value, hint, wrap }: { label: string; value: string; hint?: boolean; wrap?: boolean }) {
  return (
    <div className="flex items-start gap-3">
      <dt className="flex w-[112px] flex-shrink-0 items-center gap-1 text-[12px] text-zinc-400">
        {label}:
        {hint && <HelpCircle className="h-3 w-3 text-zinc-600" />}
      </dt>
      <dd className={`min-w-0 flex-1 text-[12px] text-zinc-200 ${wrap ? 'break-all' : 'truncate'}`}>
        {value}
      </dd>
    </div>
  )
}
