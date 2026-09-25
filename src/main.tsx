import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import './index.css'
import App from './App'
import { AuthGate } from './components/AuthGate'
import { SelectionProvider } from './lib/selection'
import { CatalogView } from './pages/CatalogView'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5, // 5 minutes
      retry: 1,
    },
  },
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          {/* Buyer-facing. Deliberately OUTSIDE AuthGate: a buyer has no account. */}
          <Route path="/c/:id" element={<CatalogView />} />
          <Route
            path="*"
            element={
              <AuthGate>
                <SelectionProvider>
                  <App />
                </SelectionProvider>
              </AuthGate>
            }
          />
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
)
