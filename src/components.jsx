import { formatAiSummary, formatRelative, formatTime, getBestAiText, levelFromPriority, statusTone } from './utils/dashboard'

export const StatusBadge = ({ status, falsePositive }) => <span className={`badge status ${statusTone(status, falsePositive)}`}>{falsePositive ? 'falso positivo' : status || 'pending'}</span>
export const PriorityBadge = ({ priority }) => { const level = levelFromPriority(priority); return <span className={`badge priority ${level.tone}`}>{level.label} · {priority}/5</span> }
export const KpiCard = ({ title, value, hint, tone = 'default' }) => <article className={`kpi-card ${tone}`}><p>{title}</p><h3>{value}</h3><small>{hint}</small></article>

export const EmptyState = ({ title, description }) => <div className='empty'><h4>{title}</h4><p className='muted'>{description}</p></div>
export const ErrorNotice = ({ message }) => <div className='warning'>{message}</div>
export const SkeletonCard = () => <article className='alert-card skeleton'><div className='image-placeholder' /><div className='alert-body'><div className='s-line' /><div className='s-line w60' /><div className='s-line w80' /></div></article>

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
      {ai.hasTechnical && <small className='muted'>Detalle técnico disponible en panel derecho.</small>}
      <small>{formatTime(event.created_at)} · {formatRelative(event.created_at)}</small>
      <div className='buttons' onClick={(e) => e.stopPropagation()}>
        <button onClick={() => onAction(event, 'confirmed', false, true)}>Confirmar</button>
        <button onClick={() => onAction(event, 'false_positive', true, false)}>Marcar FP</button>
        <button onClick={() => onAction(event, 'resolved')}>Revisado</button>
      </div>
    </div>
  </article>
}

export const AlertsTable = ({ events, onSelect, onAction }) => <div className='table-wrap'><table><thead><tr><th>Hora</th><th>Cámara</th><th>Ubicación</th><th>Prioridad</th><th>Estado</th><th>Acciones</th></tr></thead><tbody>{events.map((e) => <tr key={e.id} onClick={() => onSelect(e)}><td>{formatRelative(e.created_at)}</td><td>{e.camera_name || e.camera_id}</td><td>{e.address || e.location || 'N/A'}</td><td><PriorityBadge priority={e.final_priority ?? e.priority ?? 0} /></td><td><StatusBadge status={e.status} falsePositive={e.false_positive} /></td><td><button onClick={(ev) => { ev.stopPropagation(); onAction(e, 'resolved') }}>Revisar</button></td></tr>)}</tbody></table></div>

export const AlertDetailPanel = ({ event, onAction }) => {
  if (!event) return <section className='panel'><h3>Detalle de alerta</h3><EmptyState title='Sin alerta seleccionada' description='Haz clic en una tarjeta o fila para ver información completa.' /></section>
  const ai = formatAiSummary(getBestAiText(event))
  return <section className='panel'><h3>Detalle de alerta seleccionada</h3>{event._resolvedImageUrl && <img className='detail-image' src={event._resolvedImageUrl} alt='detalle' />}<p><b>Cámara:</b> {event.camera_name || event.camera_id}</p><p><b>Ubicación:</b> {event.address || event.location || 'N/A'}</p><p><b>Estado:</b> <StatusBadge status={event.status} falsePositive={event.false_positive} /></p><p><b>Descripción IA:</b> {ai.summary}</p>{ai.hasTechnical && <details><summary>Ver detalle técnico</summary><pre>{ai.technical}</pre></details>}<div className='buttons'><button onClick={() => onAction(event, 'confirmed', false, true)}>Confirmar</button><button onClick={() => onAction(event, 'false_positive', true, false)}>Falso positivo</button><button onClick={() => onAction(event, 'resolved')}>Revisado</button></div></section>
}
