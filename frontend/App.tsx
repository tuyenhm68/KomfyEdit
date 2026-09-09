import { ProjectProvider } from './contexts/ProjectContext'
import { ViewProvider, useView } from './contexts/ViewContext'
import { KeyboardShortcutsProvider } from './contexts/KeyboardShortcutsContext'
import { KeyboardShortcutsModal } from './components/KeyboardShortcutsModal'
import { SettingsProvider } from './contexts/SettingsContext'
import { SettingsModal } from './components/SettingsModal'
import { I18nProvider } from './i18n/I18nContext'
import { FramelessTopBar } from './components/WindowControls'
import { Home } from './views/Home'
import { Project } from './views/Project'

function AppContent() {
  const { currentView } = useView()

  return (
    <div className="relative h-screen w-screen">
      {/* The editor draws its own title bar with the controls in it; every
          other screen gets this overlay strip instead. */}
      {currentView !== 'project' && <FramelessTopBar />}
      {currentView === 'project' ? <Project /> : <Home />}
    </div>
  )
}

export default function App() {
  return (
    <I18nProvider>
      <SettingsProvider>
        <ProjectProvider>
          <ViewProvider>
            <KeyboardShortcutsProvider>
              <AppContent />
              <KeyboardShortcutsModal />
              <SettingsModal />
            </KeyboardShortcutsProvider>
          </ViewProvider>
        </ProjectProvider>
      </SettingsProvider>
    </I18nProvider>
  )
}

