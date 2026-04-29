import { formatAiSummary, formatRelative, formatTime, getBestAiText, levelFromPriority, statusTone } from './utils/dashboard'

export const StatusBadge = ({ status, falsePositive }) => <span className={`badge status ${statusTone(status, falsePositive)}`}>{falsePositive ? 'false_positive' : status || 'pending'}</span>
export const PriorityBadge = ({ priority }) => { const level = levelFromPriority(priority); return <span className={`badge priority ${level.tone}`}>{level.label} · {priority}/5</span> }
export const KpiCard = ({ title, value, hint, tone='default' }) => <article className={`kpi-card ${tone}`}><p>{title}</p><h3>{value}</h3><small>{hint}</small></article>

export function AlertCard({ event, onSelect, onAction }) {
  const priority = event.final_priority ?? event.priority ?? 0
  const ai = formatAiSummary(getBestAiText(event))
  return <article className='alert-card' onClick={() => onSelect(event)}>
    {event._resolvedImageUrl ? <img src={event._resolvedImageUrl} alt='evento' /> : <div className='image-placeholder'>Sin imagen</div>}
    <div className='alert-body'>
      <div className='row'><PriorityBadge priority={priority} /><StatusBadge status={event.status} falsePositive={event.false_positive} /></div>
      <h4>{event.camera_name || event.camera_id || 'Cámara sin nombre'}</h4>
      <p className='muted'>{event.address || event.location || 'Ubicación no disponible'}</p>
      <p className='clamp'>{ai.summary}</p>
      <small>{formatTime(event.created_at)} · {formatRelative(event.created_at)}</small>
      <div className='buttons' onClick={(e) => e.stopPropagation()}>
        <button onClick={() => onAction(event, 'confirmed', false, true)}>Confirmar</button>
        <button onClick={() => onAction(event, 'false_positive', true, false)}>Falso positivo</button>
        <button onClick={() => onAction(event, 'resolved')}>Revisado</button>
      </div>
    </div>
  </article>
}

export const AlertsTable = ({ events, onSelect }) => <div className='table-wrap'><table><thead><tr><th>Hora</th><th>Cámara</th><th>Ubicación</th><th>Prioridad</th><th>Estado</th></tr></thead><tbody>{events.map((e) => <tr key={e.id} onClick={() => onSelect(e)}><td>{formatRelative(e.created_at)}</td><td>{e.camera_name || e.camera_id}</td><td>{e.address || e.location || 'N/A'}</td><td><PriorityBadge priority={e.final_priority ?? e.priority ?? 0} /></td><td><StatusBadge status={e.status} falsePositive={e.false_positive} /></td></tr>)}</tbody></table></div>

export const AlertDetailPanel = ({ event, onAction }) => {
  if (!event) return <section className='panel'><h3>Detalle de alerta</h3><p className='muted'>Selecciona una alerta para ver su detalle.</p></section>
  const ai = formatAiSummary(getBestAiText(event))
  return <section className='panel'><h3>Detalle de alerta seleccionada</h3>{event._resolvedImageUrl && <img className='detail-image' src={event._resolvedImageUrl} alt='detalle' />}<p><b>Cámara:</b> {event.camera_name || event.camera_id}</p><p><b>Ubicación:</b> {event.address || event.location || 'N/A'}</p><p><b>Descripción IA:</b> {ai.technical || ai.summary}</p>{ai.hasTechnical && <details><summary>Ver detalle técnico</summary><pre>{ai.technical}</pre></details>}<div className='buttons'><button onClick={() => onAction(event, 'confirmed', false, true)}>Confirmar</button><button onClick={() => onAction(event, 'false_positive', true, false)}>Falso positivo</button><button onClick={() => onAction(event, 'resolved')}>Revisado</button></div></section>
}
