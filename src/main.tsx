import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import 'mapbox-gl/dist/mapbox-gl.css'
import App from './App.tsx'

// Share links use a real path (/shared/:id) so phones can hand them to the app; the web app routes by hash
const sharedPath = window.location.pathname.match(/^\/shared\/([^/]+)\/?$/)
if (sharedPath) window.history.replaceState(null, '', `/${window.location.search}#/shared/${sharedPath[1]}`)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
