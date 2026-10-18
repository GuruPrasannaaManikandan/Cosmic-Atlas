import React from 'react'
import ReactDOM from 'react-dom/client'
import { App } from './ui/App'
import './ui/styles.css'
import { api } from './ui/api'

// Wake the API early: free-tier hosting cold-starts it after idle. Result ignored; each feature reports its own errors.
void api.health()

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
