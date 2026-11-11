import { useEffect, useState } from 'react'

export default function PortalFrame() {
  const [key, setKey] = useState(0)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    // No ocultamos el iframe mientras carga. Así, aunque un recurso externo tarde,
    // el portal sigue siendo visible y nunca queda una pantalla negra.
    const timer = setTimeout(() => setLoaded(true), 1800)
    return () => clearTimeout(timer)
  }, [key])

  const reload = () => {
    setLoaded(false)
    setKey((value) => value + 1)
  }

  return (
    <main className="portal-host">
      <header className="react-toolbar">
        <div className="react-toolbar__brand">
          <div className="react-toolbar__mark">G&amp;S</div>
          <div>
            <strong>Distribuidora G&amp;S</strong>
            <span>Plataforma comercial</span>
          </div>
        </div>
        <div className="react-toolbar__actions">
          <button type="button" onClick={reload}>Recargar</button>
          <a href="./portal-gys-v5.html?v=20260822-5" target="_blank" rel="noreferrer">Abrir pantalla completa</a>
        </div>
      </header>

      <section className="portal-stage">
        {!loaded && <div className="portal-loading">Cargando plataforma…</div>}
        <iframe
          key={key}
          className="portal-frame"
          src="./portal-gys-v5.html?v=20260822-5"
          title="Distribuidora G&S"
          onLoad={() => setLoaded(true)}
        />
      </section>
    </main>
  )
}
