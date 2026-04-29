import { useEffect, useMemo, useState } from 'react'
import { hasSupabaseCredentials, supabase } from './supabaseClient'
import { baseFilters, formatTime } from './utils/dashboard'
import { AlertCard, AlertDetailPanel, AlertsTable, EmptyState, ErrorNotice, KpiCard, SkeletonCard } from './components'

const STORAGE_BUCKET = import.meta.env.VITE_SUPABASE_STORAGE_BUCKET || 'security-snapshots'
const isHttpUrl = (v) => typeof v === 'string' && /^https?:\/\//i.test(v)
const pickImagePath = (e) => e?.image_path || e?.storage_path || e?.snapshot_path || e?.file_path || e?.image_key || null
const HOURS = { '6h': 6, '24h': 24, '72h': 72 }

async function resolveImageUrl(event) { const direct = event.image_url || event.snapshot_url; if (isHttpUrl(direct)) return direct; const path = pickImagePath(event); if (!path || !supabase) return null; const clean = path.replace(/^\/+/, ''); const { data } = await supabase.storage.from(STORAGE_BUCKET).createSignedUrl(clean, 3600); if (data?.signedUrl) return data.signedUrl; return supabase.storage.from(STORAGE_BUCKET).getPublicUrl(clean).data?.publicUrl || null }
const enrichEvent = async (event) => ({ ...event, _resolvedImageUrl: await resolveImageUrl(event) })

export default function App() {
  const [events, setEvents] = useState([]), [cameras, setCameras] = useState([]), [heartbeats, setHeartbeats] = useState([])
  const [selectedEvent, setSelectedEvent] = useState(null), [filters, setFilters] = useState(baseFilters), [loading, setLoading] = useState(true), [error, setError] = useState(''), [view, setView] = useState('cards'), [connection, setConnection] = useState('live')

  const loadData = async () => {
    if (!supabase) return
    setLoading(true); setError('')
    const [e, c, h] = await Promise.all([supabase.from('security_events').select('*').order('created_at', { ascending: false }).limit(200), supabase.from('cameras').select('*'), supabase.from('camera_heartbeats').select('*').order('created_at', { ascending: false }).limit(200)])
    if (e.error) setError(e.error.message); else setEvents(await Promise.all((e.data || []).map(enrichEvent)))
    if (!c.error) setCameras(c.data || []); if (!h.error) setHeartbeats(h.data || [])
    setLoading(false)
  }

  useEffect(() => {
    if (!supabase) { setLoading(false); return }
    loadData()
    const eventsChannel = supabase.channel('security-events-live').on('postgres_changes', { event: '*', schema: 'public', table: 'security_events' }, async (p) => {
      if (p.eventType === 'INSERT') { const incoming = await enrichEvent(p.new); setEvents((x) => [incoming, ...x]) }
      if (p.eventType === 'UPDATE') { const incoming = await enrichEvent(p.new); setEvents((x) => x.map((i) => i.id === incoming.id ? incoming : i)); setSelectedEvent((s) => s?.id === incoming.id ? incoming : s) }
      if (p.eventType === 'DELETE') setEvents((x) => x.filter((i) => i.id !== p.old.id))
    }).subscribe((s) => setConnection(s === 'SUBSCRIBED' ? 'live' : 'reconnecting'))

    const hbChannel = supabase.channel('camera-heartbeats-live').on('postgres_changes', { event: '*', schema: 'public', table: 'camera_heartbeats' }, (p) => {
      setHeartbeats((x) => p.eventType === 'INSERT' ? [p.new, ...x] : p.eventType === 'UPDATE' ? x.map((h) => h.id === p.new.id ? p.new : h) : x.filter((h) => h.id !== p.old.id))
    }).subscribe()
    return () => { supabase.removeChannel(eventsChannel); supabase.removeChannel(hbChannel) }
  }, [])

  const filteredEvents = useMemo(() => events.filter((e) => {
    const p = e.final_priority ?? e.priority ?? 0, s = e.status ?? 'pending', fp = Boolean(e.false_positive)
    if (filters.camera !== 'all' && (e.camera_id || e.camera_name) !== filters.camera) return false
    if (filters.priority !== 'all' && String(p) !== filters.priority) return false
    if (filters.status !== 'all' && s !== filters.status) return false
    if (filters.falsePositive !== 'all' && String(fp) !== filters.falsePositive) return false
    if (filters.timeRange !== 'all') { const hours = HOURS[filters.timeRange]; if (Date.now() - new Date(e.created_at).getTime() > hours * 3600000) return false }
    if (filters.query && !`${e.description || ''} ${e.address || e.location || ''}`.toLowerCase().includes(filters.query.toLowerCase())) return false
    return true
  }), [events, filters])

  const kpis = useMemo(() => ({ today: events.filter((e) => new Date(e.created_at).toDateString() === new Date().toDateString()).length, critical: events.filter((e) => (e.final_priority ?? e.priority ?? 0) >= 5).length, pending: events.filter((e) => (e.status ?? 'pending') === 'pending').length, falsePositive: events.filter((e) => e.false_positive).length, activeCameras: cameras.filter((c) => c.is_active).length, avgResponse: Math.round(events.filter((e) => e.reviewed_at).reduce((acc, e) => acc + (new Date(e.reviewed_at) - new Date(e.created_at)), 0) / Math.max(events.filter((e) => e.reviewed_at).length, 1) / 60000), lastAlert: events[0]?.created_at }), [events, cameras])

  const updateEventStatus = async (event, status, falsePositive = false, confirmedThreat = false) => {
    const { error: up } = await supabase.from('security_events').update({ status, reviewed: true, reviewed_at: new Date().toISOString(), false_positive: falsePositive, confirmed_threat: confirmedThreat }).eq('id', event.id)
    if (up) return setError(up.message)
    const { error: rev } = await supabase.from('event_reviews').insert({ event_id: event.id, reviewer_name: 'Operador Dashboard', action: status, notes: `Acción rápida desde dashboard: ${status}` })
    if (rev) setError(rev.message)
  }

  const camerasDerived = cameras.length ? cameras : [...new Map(events.map((e) => [e.camera_id || e.camera_name, { id: e.camera_id || e.camera_name, name: e.camera_name || e.camera_id, address: e.address || e.location }])).values()]
  const byPriority = [1, 2, 3, 4, 5].map((p) => ({ p, count: events.filter((e) => (e.final_priority ?? e.priority ?? 0) === p).length }))

  return <div className='shell'><aside className='sidebar'><h2>🛰️ Control Center</h2><nav>{['Dashboard', 'Alertas', 'Cámaras', 'Mapa', 'Analítica', 'Configuración'].map((i) => <a key={i}>{i}</a>)}</nav><p className='muted'>Supabase: {connection}</p></aside><main className='main'>
    <header className='topbar'><div><h1>Centro de Control Inteligente</h1><p>Monitoreo en vivo con IA y Supabase Realtime</p></div><div className='top-actions'><span className={`badge ${connection === 'live' ? 'confirmed' : 'pending'}`}>{connection}</span><button onClick={loadData}>Actualizar</button><span>{new Date().toLocaleTimeString()}</span></div></header>
    {!hasSupabaseCredentials && <ErrorNotice message='Configura VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY.' />}{error && <ErrorNotice message={error} />}
    <section className='kpi-grid'><KpiCard title='Alertas hoy' value={kpis.today} hint='Últimas 24h' /><KpiCard title='Críticas' value={kpis.critical} hint='Prioridad máxima' tone='critical' /><KpiCard title='Pendientes' value={kpis.pending} hint='Requieren acción' /><KpiCard title='Falsos positivos' value={kpis.falsePositive} hint='Calidad IA' /><KpiCard title='Cámaras activas' value={kpis.activeCameras} hint='Online' /><KpiCard title='Resp. promedio' value={`${Number.isFinite(kpis.avgResponse) ? kpis.avgResponse : 0} min`} hint='Tiempo de revisión' /><KpiCard title='Última alerta' value={kpis.lastAlert ? formatTime(kpis.lastAlert) : 'N/A'} hint='Tiempo real' /></section>
    <section className='workspace'><section className='panel'><div className='panel-head'><h3>Alertas en vivo</h3><div><button onClick={() => setView('cards')}>Cards</button><button onClick={() => setView('table')}>Tabla</button></div></div><div className='filters'><input placeholder='Buscar descripción/ubicación' onChange={(e) => setFilters((f) => ({ ...f, query: e.target.value }))} /><select onChange={(e) => setFilters((f) => ({ ...f, camera: e.target.value }))}><option value='all'>Todas las cámaras</option>{[...new Set(events.map((e) => e.camera_id || e.camera_name).filter(Boolean))].map((c) => <option key={c} value={c}>{c}</option>)}</select><select onChange={(e) => setFilters((f) => ({ ...f, priority: e.target.value }))}><option value='all'>Prioridad</option>{[0, 1, 2, 3, 4, 5].map((p) => <option key={p} value={String(p)}>{p}</option>)}</select><select onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value }))}><option value='all'>Estado</option>{['pending', 'reviewing', 'confirmed', 'false_positive', 'resolved'].map((s) => <option key={s} value={s}>{s}</option>)}</select><select onChange={(e) => setFilters((f) => ({ ...f, falsePositive: e.target.value }))}><option value='all'>Falso positivo</option><option value='true'>Sí</option><option value='false'>No</option></select><select onChange={(e) => setFilters((f) => ({ ...f, timeRange: e.target.value }))}><option value='all'>Rango</option><option value='6h'>Últ. 6h</option><option value='24h'>Últ. 24h</option><option value='72h'>Últ. 72h</option></select></div>{loading ? <div className='cards'><SkeletonCard /><SkeletonCard /><SkeletonCard /></div> : filteredEvents.length === 0 ? <EmptyState title='Sin alertas' description='No hay alertas para los filtros seleccionados.' /> : view === 'cards' ? <div className='cards'>{filteredEvents.map((event) => <AlertCard key={event.id} event={event} onSelect={setSelectedEvent} onAction={updateEventStatus} />)}</div> : <AlertsTable events={filteredEvents} onSelect={setSelectedEvent} onAction={updateEventStatus} />}</section>
    <aside className='right'><AlertDetailPanel event={selectedEvent} onAction={updateEventStatus} /><section className='panel'><h3>Mapa/lista cámaras MVP</h3>{camerasDerived.length ? camerasDerived.map((c) => <div key={c.id} className='list-item'><strong>{c.name || c.id}</strong><small>{c.address || c.location || 'Sin ubicación'}</small></div>) : <EmptyState title='Sin cámaras' description='No hay datos de cámaras todavía.' />}</section><section className='panel'><h3>Estado de cámaras</h3>{camerasDerived.map((c) => { const hb = heartbeats.find((h) => h.camera_id === c.id); return <div key={c.id} className='list-item'><span>{c.name || c.id}</span><small>{hb ? `${hb.status || 'ok'} · ${formatTime(hb.created_at)}` : 'Sin heartbeat'}</small></div> })}</section><section className='panel'><h3>Analítica rápida</h3>{byPriority.map((item) => <div key={item.p} className='bar-row'><small>P{item.p}</small><div className='bar'><span style={{ width: `${Math.min(100, item.count * 12)}%` }} /></div><small>{item.count}</small></div>)}</section></aside></section>
  </main></div>
}
