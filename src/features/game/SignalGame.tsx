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

function stabilityLabel(integrity: number, inside: boolean) {
  if (integrity <= 25) return 'КРИТИЧЕСКИЙ РАЗРЫВ'
  if (integrity <= 55) return 'СИГНАЛ НЕСТАБИЛЕН'
  if (inside) return 'СИНХРОНИЗАЦИЯ'
  return 'ПОИСК КОНТАКТА'
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
    const particles: Particle[] = Array.from({ length: reducedMotion ? 16 : 38 }, (_, index) => ({
      angle: (Math.PI * 2 * index) / 38,
      distance: 1.4 + Math.random() * 2.2,
      speed: 0.12 + Math.random() * 0.34,
      size: 0.8 + Math.random() * 2.2,
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
    const trail: Array<{ x: number; y: number; life: number }> = []

    const resize = () => {
      const rect = canvas.getBoundingClientRect()
      const dpr = Math.min(devicePixelRatio || 1, 2)
      canvas.width = Math.floor(rect.width * dpr)
      canvas.height = Math.floor(rect.height * dpr)
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }

    const point = (event: PointerEvent) => {
      const rect = canvas.getBoundingClientRect()
      pointer.x = event.clientX - rect.left
      pointer.y = event.clientY - rect.top
    }

    const down = (event: PointerEvent) => {
      pointer.down = true
      point(event)
      canvas.setPointerCapture?.(event.pointerId)
      setActive(true)
      telegramAdapter.haptic('tap')
    }

    const move = (event: PointerEvent) => point(event)
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

    const drawArc = (cx: number, cy: number, radius: number, rotation: number, alpha: number, color: string) => {
      ctx.save()
      ctx.translate(cx, cy)
      ctx.rotate(rotation)
      ctx.strokeStyle = color
      ctx.globalAlpha = alpha
      ctx.lineWidth = 1.4
      ctx.setLineDash([radius * 0.35, radius * 0.12])
      ctx.beginPath()
      ctx.arc(0, 0, radius, -Math.PI * 0.7, Math.PI * 0.55)
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
      const radius = Math.min(w, h) * 0.102
      const cx = w / 2
        + Math.sin(t * 1.18 * motion) * w * 0.22
        + Math.sin(t * 3.2 * motion) * 15
      const cy = h / 2
        + Math.cos(t * 1.04 * motion) * h * 0.18
        + Math.cos(t * 2.5 * motion) * 13
      const distance = Math.hypot(pointer.x - cx, pointer.y - cy)
      const inside = pointer.down && distance <= radius * 1.06
      const danger = Math.max(0, 1 - integrityValue / 100)
      const pulse = 1 + Math.sin(t * 3.6) * 0.045

      if (pointer.down) totalActive += dt
      if (inside) {
        elapsedInside += dt
        integrityValue = Math.min(100, integrityValue + dt * 0.018)
      } else {
        integrityValue -= dt * (pointer.down ? 0.05 : 0.078)
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

      trail.unshift({ x: cx, y: cy, life: 1 })
      if (trail.length > 18) trail.pop()
      trail.forEach((pointItem, index) => {
        pointItem.life -= 0.055
        ctx.fillStyle = inside
          ? `rgba(47,230,166,${Math.max(0, pointItem.life) * 0.09})`
          : `rgba(139,92,255,${Math.max(0, pointItem.life) * 0.08})`
        ctx.beginPath()
        ctx.arc(pointItem.x, pointItem.y, Math.max(1, radius * 0.72 - index * 1.7), 0, Math.PI * 2)
        ctx.fill()
      })

      ctx.clearRect(0, 0, w, h)

      const field = ctx.createRadialGradient(cx, cy, radius * 0.15, cx, cy, radius * 4.8)
      field.addColorStop(0, inside ? 'rgba(47,230,166,.24)' : 'rgba(139,92,255,.22)')
      field.addColorStop(0.42, danger > 0.52 ? 'rgba(255,49,49,.09)' : 'rgba(85,246,255,.035)')
      field.addColorStop(1, 'rgba(0,0,0,0)')
      ctx.fillStyle = field
      ctx.fillRect(0, 0, w, h)

      particles.forEach((particle, index) => {
        const orbit = radius * particle.distance * (1 + Math.sin(t * 0.8 + particle.phase) * 0.08)
        const angle = particle.angle + t * particle.speed * (inside ? 1.35 : 0.7)
        const px = cx + Math.cos(angle) * orbit
        const py = cy + Math.sin(angle) * orbit * 0.72
        const alpha = 0.18 + Math.sin(t * 2 + particle.phase) * 0.13 + (inside ? 0.16 : 0)
        ctx.fillStyle = danger > 0.62 && index % 3 === 0
          ? `rgba(255,78,78,${Math.max(0.05, alpha)})`
          : `rgba(85,246,255,${Math.max(0.04, alpha)})`
        ctx.beginPath()
        ctx.arc(px, py, particle.size * (danger > 0.6 ? 1.35 : 1), 0, Math.PI * 2)
        ctx.fill()
      })

      drawArc(cx, cy, radius * 1.48, t * 0.5, 0.52, inside ? '#2FE6A6' : '#8B5CFF')
      drawArc(cx, cy, radius * 1.83, -t * 0.32, 0.28, '#55F6FF')
      drawArc(cx, cy, radius * 2.34, t * 0.18, 0.14 + danger * 0.28, danger > 0.55 ? '#FF3131' : '#FFFFFF')

      if (danger > 0.45 && !reducedMotion) {
        ctx.save()
        ctx.strokeStyle = `rgba(255,49,49,${0.18 + danger * 0.5})`
        ctx.lineWidth = 1.2
        for (let index = 0; index < 3; index += 1) {
          const angle = t * (1.1 + index * 0.2) + index * 2.1
          ctx.beginPath()
          ctx.moveTo(cx + Math.cos(angle) * radius * 0.7, cy + Math.sin(angle) * radius * 0.7)
          for (let step = 1; step <= 5; step += 1) {
            const progress = step / 5
            const jitter = Math.sin(t * 14 + step * 8 + index) * radius * 0.14 * danger
            ctx.lineTo(
              cx + Math.cos(angle) * radius * (0.7 + progress * 1.5) + jitter,
              cy + Math.sin(angle) * radius * (0.7 + progress * 1.5) - jitter * 0.45,
            )
          }
          ctx.stroke()
        }
        ctx.restore()
      }

      const glow = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius * 2.5)
      glow.addColorStop(0, inside ? 'rgba(255,255,255,.98)' : 'rgba(255,255,255,.9)')
      glow.addColorStop(0.12, inside ? 'rgba(47,230,166,.96)' : 'rgba(139,92,255,.92)')
      glow.addColorStop(0.46, danger > 0.58 ? 'rgba(255,49,49,.24)' : 'rgba(85,246,255,.18)')
      glow.addColorStop(1, 'rgba(0,0,0,0)')
      ctx.fillStyle = glow
      ctx.beginPath()
      ctx.arc(cx, cy, radius * 2.5 * pulse, 0, Math.PI * 2)
      ctx.fill()

      ctx.save()
      ctx.translate(cx, cy)
      ctx.rotate(t * 0.4)
      ctx.strokeStyle = inside ? '#2FE6A6' : danger > 0.55 ? '#FF5151' : '#8B5CFF'
      ctx.lineWidth = inside ? 3.2 : 2.4
      ctx.shadowColor = ctx.strokeStyle
      ctx.shadowBlur = inside ? 22 : 14
      ctx.beginPath()
      ctx.arc(0, 0, radius * pulse, 0, Math.PI * 2)
      ctx.stroke()
      ctx.restore()

      ctx.fillStyle = '#FFFFFF'
      ctx.shadowColor = inside ? '#2FE6A6' : '#8B5CFF'
      ctx.shadowBlur = 24
      ctx.beginPath()
      ctx.arc(cx, cy, radius * 0.12, 0, Math.PI * 2)
      ctx.fill()
      ctx.shadowBlur = 0

      if (pointer.down) {
        ctx.strokeStyle = inside ? 'rgba(47,230,166,.95)' : 'rgba(255,49,49,.92)'
        ctx.lineWidth = 2
        ctx.beginPath()
        ctx.arc(pointer.x, pointer.y, 22 + Math.sin(t * 6) * 2, 0, Math.PI * 2)
        ctx.stroke()
        ctx.beginPath()
        ctx.moveTo(pointer.x - 7, pointer.y)
        ctx.lineTo(pointer.x + 7, pointer.y)
        ctx.moveTo(pointer.x, pointer.y - 7)
        ctx.lineTo(pointer.x, pointer.y + 7)
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
        <div className="hud-cell">
          <span>TIME LINK</span>
          <strong>{timeLeft.toFixed(1)}</strong>
          <small>SEC</small>
        </div>
        <div className="hud-center" aria-hidden="true">
          <i className={locked ? 'is-locked' : ''} />
        </div>
        <div className="hud-cell hud-cell-right">
          <span>STABILITY</span>
          <strong>{Math.round(integrity)}</strong>
          <small>%</small>
        </div>
      </div>

      <div className="game-status" aria-live="polite">
        <span className={locked ? 'status-dot is-locked' : 'status-dot'} />
        {stabilityLabel(integrity, locked)}
      </div>

      <div className="canvas-wrap">
        <canvas ref={canvasRef} />
        {!active && (
          <div className="touch-hint">
            <strong>КОСНИСЬ ЯДРА</strong>
            <span>Удерживай контакт и следуй за сигналом</span>
          </div>
        )}
      </div>

      <div className="stability-panel">
        <div className="stability-meta">
          <span>SIGNAL STABILITY</span>
          <strong>{Math.round(integrity)}%</strong>
        </div>
        <div className="integrity">
          <i style={{ width: `${integrity}%` }} />
          <b style={{ left: `${integrity}%` }} />
        </div>
      </div>
    </section>
  )
}
