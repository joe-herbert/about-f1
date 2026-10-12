import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import 'react-grid-layout/css/styles.css'
import 'react-resizable/css/styles.css'
import './index.css'
import App from './App'
import { initAccount } from './store/account'
import { loadInstalledPlugins } from './widgets/plugins'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, refetchOnWindowFocus: false, gcTime: 30 * 60 * 1000 },
  },
})

// Signed in, dashboards and preferences come from the account, so load them before the first render.
await initAccount()
loadInstalledPlugins()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </StrictMode>,
)
