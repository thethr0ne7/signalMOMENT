import { useEffect, useRef, useState } from 'react'
import type { GameResult } from '../../app/app.types'
import { telegramAdapter } from '../../shared/telegram/telegramAdapter'
import { calculateGameResult, GAME_SECONDS } from './scoring'

type Particle = {
  angle: number
  distance: number
  speed: number
  size: number
  phase: number
}

type TrailPoint = {
  x: number
  y: number
  life: number
}

const TOUCH_OFFSET_Y = 46

function stabilityLabel(integrity: number, inside: boolean) {
  if (integrity <= 25) return 'КРИТИЧЕСКИЙ РАЗРЫВ'
  if (integrity <= 55) return 'СИГНАЛ НЕСТАБИЛЕН'
  if (inside) return 'КОНТАКТ ЗАФИКСИРОВАН'
  return 'НАВЕДИ ПАЛЕЦ ПОД ЯДРО'
}

export function SignalGame({ onFinish }: { onFinish: (result: GameResult) => void }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const [timeLeft, setTimeLeft] = useState(GAME_SECONDS)
  const [integrity, setIntegrity] = useState(100)
  const [active, setActive] = useState(false)
  const [locked, setLocked] = useState(false)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const particles: Particle[] = Array.from({ length: reducedMotion ? 14 : 34 }, (_, index) => ({
      angle: (Math.PI * 2 * index) / 34,
      distance: 1.35 + Math.random() * 2.1,
      speed: 0.12 + Math.random() * 0.3,
      size: 0.8 + Math.random() * 2.1,
      phase: Math.random() * Math.PI * 2,
    }))

    let raf = 0
    const start = performance.now()
    let last = start
    let elapsedInside = 0
    let totalActive = 0
    let pointer = { x: -9999, y: -9999, down: false }
    let integrityValue = 100
    let done = false
    let previousInside = false
    let lastUiUpdate = 0
    const trail: TrailPoint[] = []

    const resize = () => {
      const rect = canvas.getBoundingClientRect()
      const dpr = Math.min(devicePixelRatio || 1, 2)
      canvas.width = Math.floor(rect.width * dpr)
      canvas.height = Math.floor(rect.height * dpr)
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }

    const updatePointer = (event: PointerEvent) => {
      const rect = canvas.getBoundingClientRect()
      pointer.x = event.clientX - rect.left
      pointer.y = event.clientY - rect.top
    }

    const down = (event: PointerEvent) => {
      pointer.down = true
      updatePointer(event)
      canvas.setPointerCapture?.(event.pointerId)
      setActive(true)
      telegramAdapter.haptic('tap')
    }

    const move = (event: PointerEvent) => updatePointer(event)
    const up = () => {
      pointer.down = false
      setActive(false)
      setLocked(false)
    }

    const finish = (success: boolean) => {
      if (done) return
      done = true
      onFinish(calculateGameResult(elapsedInside, totalActive, success))
    }

    const drawOrbit = (x: number, y: number, radius: number, rotation: number, alpha: number, color: string) => {
      ctx.save()
      ctx.translate(x, y)
      ctx.rotate(rotation)
      ctx.strokeStyle = color
      ctx.globalAlpha = alpha
      ctx.lineWidth = 1.4
      ctx.setLineDash([radius * 0.34, radius * 0.13])
      ctx.beginPath()
      ctx.arc(0, 0, radius, -Math.PI * 0.72, Math.PI * 0.56)
      ctx.stroke()
      ctx.restore()
    }

    const draw = (now: number) => {
      const dt = Math.min(40, now - last)
      last = now
      const elapsed = now - start
      const rect = canvas.getBoundingClientRect()
      const w = rect.width
      const h = rect.height
      const t = elapsed / 1000
      const motion = reducedMotion ? 0.35 : 1
      const radius = Math.max(34, Math.min(50, Math.min(w, h) * 0.102))
      const edgeX = radius * 2.7
      const edgeTop = radius * 2.7
      const edgeBottom = radius * 2.7 + TOUCH_OFFSET_Y
      const rawX = w / 2 + Math.sin(t * 1.12 * motion) * w * 0.2 + Math.sin(t * 3.05 * motion) * 13
      const rawY = h / 2 - 18 + Math.cos(t * 1.01 * motion) * h * 0.16 + Math.cos(t * 2.4 * motion) * 11
      const coreX = Math.min(w - edgeX, Math.max(edgeX, rawX))
      const coreY = Math.min(h - edgeBottom, Math.max(edgeTop, rawY))
      const anchorX = coreX
      const anchorY = coreY + TOUCH_OFFSET_Y
      const captureRadius = Math.max(50, radius * 1.25)
      const distance = Math.hypot(pointer.x - anchorX, pointer.y - anchorY)
      const inside = pointer.down && distance <= captureRadius
      const danger = Math.max(0, 1 - integrityValue / 100)
      const pulse = 1 + Math.sin(t * 3.6) * 0.045

      if (pointer.down) totalActive += dt
      if (inside) {
        elapsedInside += dt
        integrityValue = Math.min(100, integrityValue + dt * 0.02)
      } else {
        integrityValue -= dt * (pointer.down ? 0.042 : 0.065)
      }

      if (inside !== previousInside) {
        setLocked(inside)
        if (inside) telegramAdapter.haptic('tap')
        previousInside = inside
      }

      if (now - lastUiUpdate > 45) {
        setIntegrity(Math.max(0, integrityValue))
        setTimeLeft(Math.max(0, GAME_SECONDS - elapsed / 1000))
        lastUiUpdate = now
      }

      trail.unshift({ x: coreX, y: coreY, life: 1 })
      if (trail.length > 20) trail.pop()
      trail.forEach((point) => { point.life -= 0.052 })

      ctx.clearRect(0, 0, w, h)

      trail.forEach((point, index) => {
        const alpha = Math.max(0, point.life) * (inside ? 0.13 : 0.09)
        ctx.fillStyle = inside ? `rgba(47,230,166,${alpha})` : `rgba(139,92,255,${alpha})`
        ctx.beginPath()
        ctx.arc(point.x, point.y, Math.max(2, radius * 0.56 - index * 1.05), 0, Math.PI * 2)
        ctx.fill()
      })

      const field = ctx.createRadialGradient(coreX, coreY, radius * 0.1, coreX, coreY, radius * 4.8)
      field.addColorStop(0, inside ? 'rgba(47,230,166,.26)' : 'rgba(139,92,255,.22)')
      field.addColorStop(0.45, danger > 0.52 ? 'rgba(255,49,49,.1)' : 'rgba(85,246,255,.04)')
      field.addColorStop(1, 'rgba(0,0,0,0)')
      ctx.fillStyle = field
      ctx.fillRect(0, 0, w, h)

      particles.forEach((particle, index) => {
        const orbit = radius * particle.distance * (1 + Math.sin(t * 0.8 + particle.phase) * 0.08)
        const angle = particle.angle + t * particle.speed * (inside ? 1.4 : 0.72)
        const px = coreX + Math.cos(angle) * orbit
        const py = coreY + Math.sin(angle) * orbit * 0.72
        const alpha = 0.15 + Math.sin(t * 2 + particle.phase) * 0.12 + (inside ? 0.17 : 0)
        ctx.fillStyle = danger > 0.62 && index % 3 === 0
          ? `rgba(255,78,78,${Math.max(0.05, alpha)})`
          : `rgba(85,246,255,${Math.max(0.04, alpha)})`
        ctx.beginPath()
        ctx.arc(px, py, particle.size * (danger > 0.6 ? 1.3 : 1), 0, Math.PI * 2)
        ctx.fill()
      })

      drawOrbit(coreX, coreY, radius * 1.48, t * 0.5, 0.54, inside ? '#2FE6A6' : '#8B5CFF')
      drawOrbit(coreX, coreY, radius * 1.86, -t * 0.32, 0.3, '#55F6FF')
      drawOrbit(coreX, coreY, radius * 2.35, t * 0.18, 0.15 + danger * 0.28, danger > 0.55 ? '#FF3131' : '#FFFFFF')

      const expandingPulse = radius * (1.35 + ((t * 0.75) % 1) * 1.25)
      ctx.strokeStyle = inside ? 'rgba(47,230,166,.28)' : 'rgba(139,92,255,.22)'
      ctx.lineWidth = 1.2
      ctx.beginPath()
      ctx.arc(coreX, coreY, expandingPulse, 0, Math.PI * 2)
      ctx.stroke()

      if (pointer.down) {
        ctx.strokeStyle = inside ? 'rgba(47,230,166,.48)' : 'rgba(255,95,95,.4)'
        ctx.lineWidth = 1.5
        ctx.setLineDash([5, 7])
        ctx.beginPath()
        ctx.moveTo(coreX, coreY + radius * 0.75)
        ctx.quadraticCurveTo(coreX, anchorY - 14, pointer.x, pointer.y)
        ctx.stroke()
        ctx.setLineDash([])
      }

      ctx.strokeStyle = inside ? 'rgba(47,230,166,.82)' : 'rgba(255,255,255,.24)'
      ctx.lineWidth = inside ? 2.2 : 1.2
      ctx.beginPath()
      ctx.arc(anchorX, anchorY, captureRadius + Math.sin(t * 5) * 2, 0, Math.PI * 2)
      ctx.stroke()
      ctx.beginPath()
      ctx.arc(anchorX, anchorY, 9, 0, Math.PI * 2)
      ctx.stroke()

      const glow = ctx.createRadialGradient(coreX, coreY, 0, coreX, coreY, radius * 2.55)
      glow.addColorStop(0, 'rgba(255,255,255,.98)')
      glow.addColorStop(0.12, inside ? 'rgba(47,230,166,.96)' : 'rgba(139,92,255,.92)')
      glow.addColorStop(0.48, danger > 0.58 ? 'rgba(255,49,49,.25)' : 'rgba(85,246,255,.18)')
      glow.addColorStop(1, 'rgba(0,0,0,0)')
      ctx.fillStyle = glow
      ctx.beginPath()
      ctx.arc(coreX, coreY, radius * 2.55 * pulse, 0, Math.PI * 2)
      ctx.fill()

      ctx.save()
      ctx.translate(coreX, coreY)
      ctx.rotate(t * 0.4)
      ctx.strokeStyle = inside ? '#2FE6A6' : danger > 0.55 ? '#FF5151' : '#8B5CFF'
      ctx.lineWidth = inside ? 3.3 : 2.4
      ctx.shadowColor = ctx.strokeStyle
      ctx.shadowBlur = inside ? 24 : 15
      ctx.beginPath()
      ctx.arc(0, 0, radius * pulse, 0, Math.PI * 2)
      ctx.stroke()
      ctx.restore()

      ctx.fillStyle = '#FFFFFF'
      ctx.shadowColor = inside ? '#2FE6A6' : '#8B5CFF'
      ctx.shadowBlur = 26
      ctx.beginPath()
      ctx.arc(coreX, coreY, Math.max(7, radius * 0.16), 0, Math.PI * 2)
      ctx.fill()
      ctx.shadowBlur = 0

      if (pointer.down) {
        ctx.strokeStyle = inside ? 'rgba(47,230,166,.95)' : 'rgba(255,49,49,.9)'
        ctx.lineWidth = 2
        ctx.beginPath()
        ctx.arc(pointer.x, pointer.y, 20 + Math.sin(t * 6) * 2, 0, Math.PI * 2)
        ctx.stroke()
      }

      if (integrityValue <= 0) return finish(false)
      if (elapsed >= GAME_SECONDS * 1000) return finish(true)
      raf = requestAnimationFrame(draw)
    }

    resize()
    addEventListener('resize', resize)
    canvas.addEventListener('pointerdown', down)
    canvas.addEventListener('pointermove', move)
    canvas.addEventListener('pointerup', up)
    canvas.addEventListener('pointercancel', up)
    raf = requestAnimationFrame(draw)

    return () => {
      cancelAnimationFrame(raf)
      removeEventListener('resize', resize)
      canvas.removeEventListener('pointerdown', down)
      canvas.removeEventListener('pointermove', move)
      canvas.removeEventListener('pointerup', up)
      canvas.removeEventListener('pointercancel', up)
    }
  }, [onFinish])

  return (
    <section className={`screen game-screen ${integrity <= 25 ? 'is-critical' : integrity <= 55 ? 'is-warning' : ''}`}>
      <div className="hud hud-premium">
        <div className="hud-cell"><span>TIME LINK</span><strong>{timeLeft.toFixed(1)}</strong><small>SEC</small></div>
        <div className="hud-center" aria-hidden="true"><i className={locked ? 'is-locked' : ''} /></div>
        <div className="hud-cell hud-cell-right"><span>STABILITY</span><strong>{Math.round(integrity)}</strong><small>%</small></div>
      </div>

      <div className="game-status" aria-live="polite">
        <span className={locked ? 'status-dot is-locked' : 'status-dot'} />
        {stabilityLabel(integrity, locked)}
      </div>

      <div className="canvas-wrap">
        <canvas ref={canvasRef} />
        {!active && (
          <div className="touch-hint">
            <strong>ПОСТАВЬ ПАЛЕЦ ПОД ЯДРО</strong>
            <span>Следуй за большим кольцом — сам сигнал останется видимым</span>
          </div>
        )}
      </div>

      <div className="stability-panel">
        <div className="stability-meta"><span>SIGNAL STABILITY</span><strong>{Math.round(integrity)}%</strong></div>
        <div className="integrity"><i style={{ width: `${integrity}%` }} /><b style={{ left: `${integrity}%` }} /></div>
      </div>
    </section>
  )
}
