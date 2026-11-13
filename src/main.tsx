import { lazy, StrictMode, Suspense } from 'react'
import { createRoot } from 'react-dom/client'
import { ErrorBoundary } from './components/ErrorBoundary'
const App = lazy(() => import('./App'))
const MobileApp = lazy(() => import('./MobileApp'))
const MovieEditorWindow = lazy(() => import('./MovieEditorWindow').then((module) => ({ default: module.MovieEditorWindow })))
import { installBrowserMock } from './browserMock'
import { applyTheme, readThemeMirror } from './lib/theme'
import './styles.css'
import './styles/tokens.css'
import './guided-studio.css'
import './workspace-theme.css'
import './movie-workspace.css'
import './original-theme.css'

installBrowserMock()

const mobile = new URLSearchParams(location.search).get('mobile') === '1'
const movieEditor = new URLSearchParams(location.search).get('movieEditor') === '1'
document.documentElement.classList.toggle('mobile-route', mobile)
document.documentElement.classList.toggle('movie-editor-route', movieEditor)
// First paint uses the localStorage mirror; the async settings load corrects it if stale.
applyTheme(document.documentElement, readThemeMirror())

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <Suspense fallback={<main className="davai-movie-loading" role="status">正在打开工作区…</main>}>
        {movieEditor ? <MovieEditorWindow /> : mobile ? <MobileApp /> : <App />}
      </Suspense>
    </ErrorBoundary>
  </StrictMode>,
)

import './scene-composer.css'
import './production-workspace.css'
import './studio-polish.css'
import './workspace-audit.css'
import './styles/studio-refresh.css'
import './styles/themes.css'
