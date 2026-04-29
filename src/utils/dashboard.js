export const LEVELS = [
  { max: 1, label: 'NORMAL', tone: 'low' },
  { max: 2, label: 'MEDIA', tone: 'medium' },
  { max: 4, label: 'ALTA', tone: 'high' },
  { max: 5, label: 'CRÍTICA', tone: 'critical' },
]

export const baseFilters = { camera: 'all', priority: 'all', status: 'all', falsePositive: 'all', timeRange: 'all', query: '' }

export const levelFromPriority = (priority = 0) => LEVELS.find((l) => priority <= l.max) ?? LEVELS[0]
export const formatTime = (iso) => (iso ? new Date(iso).toLocaleString() : 'Sin fecha')
export const formatRelative = (iso) => {
  if (!iso) return 'N/A'
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.max(1, Math.floor(diff / 60000))
  if (mins < 60) return `Hace ${mins} min`
  const hours = Math.floor(mins / 60)
  return `Hace ${hours} h`
}

export const isAiError = (text = '') => {
  const value = String(text)
  return /RESOURCE_EXHAUSTED|Quota exceeded|\b429\b|generativelanguage|gemini|https?:\/\//i.test(value) || (value.includes('{') && value.length > 220)
}

export function formatAiSummary(raw) {
  const text = typeof raw === 'string' ? raw : raw ? JSON.stringify(raw) : ''
  if (!text) return { summary: 'Sin descripción reportada.', technical: '' }
  if (isAiError(text)) {
    return {
      summary: 'Análisis IA no disponible por límite de cuota.',
      technical: text,
      hasTechnical: true,
    }
  }
  return {
    summary: text.length > 160 ? `${text.slice(0, 157)}...` : text,
    technical: text.length > 160 ? text : '',
    hasTechnical: text.length > 160,
  }
}

export function parseGeminiAnalysis(raw) {
  if (!raw) return null
  if (typeof raw === 'object') return raw
  if (typeof raw !== 'string') return null
  try {
    return JSON.parse(raw)
  } catch {
    return null
  }
}

export function getBestAiText(event) {
  const parsed = parseGeminiAnalysis(event?.gemini_analysis)
  return (
    parsed?.descripcion ||
    parsed?.resumen ||
    event?.ai_description ||
    event?.gemini_description ||
    event?.description ||
    ''
  )
}

export function statusTone(status, falsePositive) {
  if (falsePositive || status === 'false_positive') return 'false-positive'
  if (status === 'confirmed') return 'confirmed'
  if (status === 'resolved') return 'reviewed'
  if (status === 'pending') return 'pending'
  return 'default'
}
