import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './styles/app.css'

const node = document.getElementById('react-ui')
if (node) {
  try {
    ReactDOM.createRoot(node).render(<App />)
  } catch (error) {
    console.error('React UI no pudo iniciar. El portal principal permanece disponible.', error)
  }
}
