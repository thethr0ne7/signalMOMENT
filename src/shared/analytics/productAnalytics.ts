type AnalyticsPayload = Record<string, string | number | boolean | null | undefined>

const endpoint = import.meta.env.VITE_ANALYTICS_URL || ''
const sessionId = crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`

export function trackProductEvent(name: string, payload: AnalyticsPayload = {}) {
  const event = {
    name,
    sessionId,
    createdAt: new Date().toISOString(),
    ...payload,
  }

  window.dispatchEvent(new CustomEvent('signalmoment:analytics', { detail: event }))

  if (!endpoint) return
  const body = JSON.stringify(event)
  if (navigator.sendBeacon) {
    navigator.sendBeacon(endpoint, new Blob([body], { type: 'application/json' }))
    return
  }

  void fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
    keepalive: true,
  }).catch(() => undefined)
}