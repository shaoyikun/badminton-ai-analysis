import { AppRouter } from './app/AppRouter'
import { AnalysisSessionProvider } from './hooks/useAnalysisTask'
import { MobileAppShell } from './app/MobileAppShell'

function App() {
  return (
    <AnalysisSessionProvider>
      <MobileAppShell>
        <AppRouter />
      </MobileAppShell>
    </AnalysisSessionProvider>
  )
}

export default App
