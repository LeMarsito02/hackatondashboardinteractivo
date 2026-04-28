import { useEffect, useMemo, useState } from 'react'
import { hasSupabaseCredentials, supabase } from './supabaseClient'

const LEVELS = [
  { max: 1, label: 'NORMAL', color: '#16a34a' },
  { max: 2, label: 'MEDIA', color: '#ca8a04' },
  { max: 4, label: 'ALTA', color: '#ea580c' },
  { max: 5, label: 'CRÍTICA', color: '#dc2626' },
]

const levelFromPriority = (priority = 0) => LEVELS.find((l) => priority <= l.max) ?? LEVELS[0]

const formatTime = (iso) => (iso ? new Date(iso).toLocaleString() : 'Sin fecha')

const baseFilters = {
  camera: 'all',
  priority: 'all',
  status: 'all',
  falsePositive: 'all',
}

export default function App() {
  const [events, setEvents] = useState([])
  const [cameras, setCameras] = useState([])
  const [heartbeats, setHeartbeats] = useState([])
  const [selectedEvent, setSelectedEvent] = useState(null)
  const [filters, setFilters] = useState(baseFilters)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!supabase) {
      setLoading(false)
      return
    }

    const loadData = async () => {
      setLoading(true)
      const [eventsRes, camerasRes, heartbeatsRes] = await Promise.all([
        supabase.from('security_events').select('*').order('created_at', { ascending: false }).limit(120),
        supabase.from('cameras').select('*').order('created_at', { ascending: false }),
        supabase.from('camera_heartbeats').select('*').order('created_at', { ascending: false }).limit(200),
      ])

      if (!eventsRes.error) setEvents(eventsRes.data || [])
      if (!camerasRes.error) setCameras(camerasRes.data || [])
      if (!heartbeatsRes.error) setHeartbeats(heartbeatsRes.data || [])
      setLoading(false)
    }

    loadData()

    const eventsChannel = supabase
      .channel('security-events-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'security_events' }, (payload) => {
        setEvents((current) => {
          if (payload.eventType === 'INSERT') return [payload.new, ...current]
          if (payload.eventType === 'UPDATE') return current.map((e) => (e.id === payload.new.id ? payload.new : e))
          if (payload.eventType === 'DELETE') return current.filter((e) => e.id !== payload.old.id)
          return current
        })
      })
      .subscribe()

    const heartbeatsChannel = supabase
      .channel('camera-heartbeats-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'camera_heartbeats' }, (payload) => {
        setHeartbeats((current) => {
          if (payload.eventType === 'INSERT') return [payload.new, ...current]
          if (payload.eventType === 'UPDATE') return current.map((h) => (h.id === payload.new.id ? payload.new : h))
          if (payload.eventType === 'DELETE') return current.filter((h) => h.id !== payload.old.id)
          return current
        })
      })
      .subscribe()

    return () => {
      supabase.removeChannel(eventsChannel)
      supabase.removeChannel(heartbeatsChannel)
    }
  }, [])

  const filteredEvents = useMemo(() => {
    return events.filter((event) => {
      const priority = event.final_priority ?? event.priority ?? 0
      const eventStatus = event.status ?? 'pending'
      const isFalsePositive = Boolean(event.false_positive)

      if (filters.camera !== 'all' && (event.camera_id || event.camera_name) !== filters.camera) return false
      if (filters.priority !== 'all' && String(priority) !== filters.priority) return false
      if (filters.status !== 'all' && eventStatus !== filters.status) return false
      if (filters.falsePositive !== 'all' && String(isFalsePositive) !== filters.falsePositive) return false
      return true
    })
  }, [events, filters])

  const kpis = useMemo(() => {
    const today = new Date().toDateString()
    const todayEvents = events.filter((e) => new Date(e.created_at).toDateString() === today)
    const lastEvent = events[0]

    return {
      today: todayEvents.length,
      critical: events.filter((e) => (e.final_priority ?? e.priority ?? 0) >= 5).length,
      pending: events.filter((e) => (e.status ?? 'pending') === 'pending').length,
      falsePositive: events.filter((e) => e.false_positive).length,
      activeCameras: cameras.filter((c) => c.is_active).length,
      lastAlert: lastEvent?.created_at,
    }
  }, [events, cameras])

  const latestHeartbeatByCamera = useMemo(() => {
    return heartbeats.reduce((acc, hb) => {
      if (!acc[hb.camera_id]) acc[hb.camera_id] = hb
      return acc
    }, {})
  }, [heartbeats])

  const updateEventStatus = async (event, status, falsePositive = false, confirmedThreat = false) => {
    if (!supabase) return

    const patch = {
      status,
      reviewed: true,
      reviewed_at: new Date().toISOString(),
      false_positive: falsePositive,
      confirmed_threat: confirmedThreat,
    }

    await supabase.from('security_events').update(patch).eq('id', event.id)
    await supabase.from('event_reviews').insert({
      event_id: event.id,
      reviewer_name: 'Operador Dashboard',
      action: status,
      notes: `Acción rápida desde dashboard: ${status}`,
    })
  }

  return (
    <div className="container">
      <header>
        <h1>🎛️ Centro de Control de Cámaras</h1>
        <p>Alertas en vivo, revisión humana y estado operativo en tiempo real con Supabase Realtime.</p>
      </header>

      {!hasSupabaseCredentials && <div className="warning">Configura VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY.</div>}

      <section className="kpi-grid">
        <KPI title="Alertas hoy" value={kpis.today} />
        <KPI title="Críticas" value={kpis.critical} />
        <KPI title="Pendientes" value={kpis.pending} />
        <KPI title="Falsos positivos" value={kpis.falsePositive} />
        <KPI title="Cámaras activas" value={kpis.activeCameras} />
        <KPI title="Última alerta" value={kpis.lastAlert ? formatTime(kpis.lastAlert) : 'N/A'} />
      </section>

      <section className="panel">
        <h2>Filtros</h2>
        <div className="filters">
          <select onChange={(e) => setFilters((f) => ({ ...f, camera: e.target.value }))}>
            <option value="all">Todas las cámaras</option>
            {[...new Set(events.map((e) => e.camera_id || e.camera_name).filter(Boolean))].map((camera) => (
              <option key={camera} value={camera}>{camera}</option>
            ))}
          </select>
          <select onChange={(e) => setFilters((f) => ({ ...f, priority: e.target.value }))}>
            <option value="all">Todas las prioridades</option>
            {[0, 1, 2, 3, 4, 5].map((p) => <option key={p} value={String(p)}>{p}</option>)}
          </select>
          <select onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value }))}>
            <option value="all">Todos los estados</option>
            {['pending', 'reviewing', 'confirmed', 'false_positive', 'resolved', 'ignored'].map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
          <select onChange={(e) => setFilters((f) => ({ ...f, falsePositive: e.target.value }))}>
            <option value="all">Falso positivo: todos</option>
            <option value="true">Sí</option>
            <option value="false">No</option>
          </select>
        </div>
      </section>

      <main className="layout">
        <section className="panel live-alerts">
          <h2>🚨 Alertas en vivo</h2>
          {loading && <p>Cargando...</p>}
          {!loading && filteredEvents.length === 0 && <p>Sin alertas para los filtros seleccionados.</p>}
          <div className="cards">
            {filteredEvents.map((event) => {
              const priority = event.final_priority ?? event.priority ?? 0
              const level = levelFromPriority(priority)

              return (
                <article key={event.id} className="card" onClick={() => setSelectedEvent(event)}>
                  {event.image_url ? <img src={event.image_url} alt="Evento" /> : <div className="image-placeholder">Sin imagen</div>}
                  <h3>{event.camera_name || event.camera_id || 'Cámara sin nombre'}</h3>
                  <p><strong>Ubicación:</strong> {event.address || 'Sin dirección'}</p>
                  <p><strong>Prioridad:</strong> {priority}/5</p>
                  <p><strong>Nivel:</strong> <span style={{ color: level.color }}>{level.label}</span></p>
                  <p><strong>Gemini:</strong> {event.gemini_description || event.description || 'Sin descripción'}</p>
                  <p><strong>Estado:</strong> {event.status || 'pending'}</p>
                  <p><strong>Hora:</strong> {formatTime(event.created_at)}</p>
                  <div className="buttons" onClick={(e) => e.stopPropagation()}>
                    <button onClick={() => updateEventStatus(event, 'confirmed', false, true)}>Confirmar</button>
                    <button onClick={() => updateEventStatus(event, 'false_positive', true, false)}>Falso positivo</button>
                    <button onClick={() => updateEventStatus(event, 'resolved')}>Revisado</button>
                  </div>
                </article>
              )
            })}
          </div>
        </section>

        <aside className="stack">
          <section className="panel">
            <h2>🗺️ Mapa de cámaras (lista geográfica MVP)</h2>
            <div className="map-list">
              {cameras.map((camera) => {
                const cameraEvents = events.filter((event) => (event.camera_id || event.camera_name) === camera.id)
                const latest = cameraEvents[0]
                const priority = latest ? (latest.final_priority ?? latest.priority ?? 0) : 0
                const level = levelFromPriority(priority)

                return (
                  <div key={camera.id} className="map-item" onClick={() => latest && setSelectedEvent(latest)}>
                    <div className="dot" style={{ background: level.color }} />
                    <div>
                      <strong>{camera.name}</strong>
                      <p>{camera.address || `${camera.lat}, ${camera.lon}`}</p>
                      <small>Última alerta: {latest ? formatTime(latest.created_at) : 'Sin alertas'}</small>
                    </div>
                  </div>
                )
              })}
            </div>
          </section>

          <section className="panel">
            <h2>📡 Estado de cámaras</h2>
            {cameras.map((camera) => {
              const hb = latestHeartbeatByCamera[camera.id]
              return (
                <div key={camera.id} className="heartbeat-item">
                  <strong>{camera.name}</strong>
                  <small>{hb ? `${hb.status} · ${formatTime(hb.created_at)}` : 'Sin heartbeat'}</small>
                </div>
              )
            })}
          </section>
        </aside>
      </main>

      {selectedEvent && (
        <section className="panel detail">
          <h2>Detalle del evento</h2>
          <p><strong>ID:</strong> {selectedEvent.id}</p>
          <p><strong>Cámara:</strong> {selectedEvent.camera_name || selectedEvent.camera_id}</p>
          <p><strong>Descripción Gemini:</strong> {selectedEvent.gemini_description || 'Sin descripción'}</p>
          <p><strong>Objetos detectados:</strong> {selectedEvent.detected_objects?.join(', ') || 'Sin objetos'}</p>
          <p><strong>Notas operador:</strong> {selectedEvent.operator_notes || 'Sin notas'}</p>
        </section>
      )}
    </div>
  )
}

function KPI({ title, value }) {
  return (
    <article className="kpi">
      <h3>{title}</h3>
      <p>{value}</p>
    </article>
  )
}
