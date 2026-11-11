import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { QueryClientProvider } from '@tanstack/react-query'
import { Toaster } from 'sonner'
import App from './App'
import { queryClient } from './services/queryClient'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <QueryClientProvider client={queryClient}>
        <App />
        <Toaster position="top-right" richColors />
      </QueryClientProvider>
    </BrowserRouter>
  </React.StrictMode>,
)
