import { useCallback, useEffect, useRef, useState } from 'react'
import { useProjects } from '../contexts/ProjectContext'
import { useView } from '../contexts/ViewContext'
import { Button } from '../components/ui/button'
import { FramelessTopBar } from '../components/WindowControls'
import { VideoEditor } from './VideoEditor'
import {
  hasVisualAssetMetadataForMigration,
  runVisualAssetMetadataMigration,
} from '../lib/project-asset-metadata-migration'

export function Project() {
  const { activeProject, setProject, updateAsset } = useProjects()
  const { goHome } = useView()
  const [assetMetadataMigrationProgress, setAssetMetadataMigrationProgress] = useState({ running: false, total: 0, completed: 0 })
  const [upgradePassProjectId, setUpgradePassProjectId] = useState<string | null>(null)
  const activeProjectId = activeProject?.id ?? null
  const activeProjectAssets = activeProject?.assets ?? null
  const needsAssetMetadataMigration = activeProjectAssets
    ? hasVisualAssetMetadataForMigration(activeProjectAssets)
    : false

  const handleSaveActiveProject = useCallback((project: typeof activeProject extends null ? never : NonNullable<typeof activeProject>) => {
    if (!activeProjectId) return
    setProject(activeProjectId, project)
  }, [activeProjectId, setProject])

  // Read the asset list through a ref so the migration effect below does not
  // depend on its identity.
  const activeProjectAssetsRef = useRef(activeProjectAssets)
  activeProjectAssetsRef.current = activeProjectAssets

  // Runs once per project, keyed on the id alone.
  //
  // It used to also depend on the asset array, which the editor replaces on
  // every autosave. That restarted the migration constantly, and each restart
  // swapped the editor out for the progress screen — whose unmount autosaves
  // again. With an asset that can never migrate (a relative path, a file that
  // has since moved) the flag never clears and the two screens trade places
  // forever, which reads as the window flickering and going unresponsive.
  useEffect(() => {
    if (!activeProjectId) return
    const assets = activeProjectAssetsRef.current
    if (!assets || !hasVisualAssetMetadataForMigration(assets)) {
      // Record the pass even when there was nothing to do. The progress screen
      // shows whenever this project has not had its pass yet and some asset
      // looks unmigrated, and this effect only re-runs when the project id
      // changes — so a project that opened clean and later gained an asset
      // without metadata would raise the screen with nothing left to lower it.
      setUpgradePassProjectId(activeProjectId)
      return
    }

    let cancelled = false

    const runAssetMetadataMigration = async () => {
      for await (const event of runVisualAssetMetadataMigration(assets, window.electronAPI)) {
        if (cancelled) return

        if (event.kind === 'progress') {
          setAssetMetadataMigrationProgress({ running: true, total: event.total, completed: event.completed })
          continue
        }

        for (const update of event.updates) {
          updateAsset(activeProjectId, update.assetId, update.updates)
        }

        setAssetMetadataMigrationProgress({ running: false, total: 0, completed: 0 })
        setUpgradePassProjectId(activeProjectId)
      }
    }

    void runAssetMetadataMigration()

    return () => {
      cancelled = true
    }
  }, [activeProjectId, updateAsset])

  if (!activeProject) {
    return (
      <div className="h-screen bg-background flex items-center justify-center">
        <FramelessTopBar />
        <div className="text-center">
          <p className="text-zinc-400 mb-4">Project not found</p>
          <Button onClick={goHome}>Go Home</Button>
        </div>
      </div>
    )
  }

  const shouldShowAssetMetadataMigrationProgressScreen = assetMetadataMigrationProgress.running
    || (upgradePassProjectId !== activeProjectId && needsAssetMetadataMigration)

  if (shouldShowAssetMetadataMigrationProgressScreen) {
    const progressPct = assetMetadataMigrationProgress.total > 0
      ? (assetMetadataMigrationProgress.completed / assetMetadataMigrationProgress.total) * 100
      : 0

    return (
      <div className="h-screen bg-background flex items-center justify-center">
        <FramelessTopBar />
        <div className="w-[360px]">
          <p className="text-center text-sm text-zinc-300 mb-4">
            Preparing your project assets...
          </p>
          <div className="h-2 w-full rounded-full bg-zinc-800 overflow-hidden">
            <div
              className="h-full bg-blue-500 transition-all duration-150"
              style={{ width: `${Math.max(0, Math.min(100, progressPct))}%` }}
            />
          </div>
        </div>
      </div>
    )
  }

  // No wrapper header: the editor's own title bar carries the project name and
  // the way back home.
  return (
    <div className="h-screen bg-app-bg">
      <VideoEditor
        key={activeProject.id}
        currentProject={activeProject}
        saveProject={handleSaveActiveProject}
      />
    </div>
  )
}
