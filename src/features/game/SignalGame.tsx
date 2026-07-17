import { useEffect, useRef, useState } from 'react'
import type { GameResult } from '../../app/app.types'
import { telegramAdapter } from '../../shared/telegram/telegramAdapter'
import { calculateGameResult, GAME_SECONDS } from './scoring'

export function SignalGame({ onFinish }: { onFinish: (result: GameResult) => void }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const [timeLeft, setTimeLeft] = useState(GAME_SECONDS)
  const [integrity, setIntegrity] = useState(100)
  const [active, setActive] = useState(false)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    let raf = 0
    const start = performance.now()
    let last = start
    let elapsedInside = 0
    let totalActive = 0
    let pointer = { x: -9999, y: -9999, down: false }
    let integrityValue = 100
    let done = false

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
    }

    const finish = (success: boolean) => {
      if (done) return
      done = true
      onFinish(calculateGameResult(elapsedInside, totalActive, success))
    }

    const draw = (now: number) => {
      const dt = Math.min(40, now - last)
      last = now
      const elapsed = now - start
      const rect = canvas.getBoundingClientRect()
      const w = rect.width
      const h = rect.height
      const t = elapsed / 1000
      const radius = Math.min(w, h) * 0.095
      const cx = w / 2 + Math.sin(t * 1.35) * w * 0.24 + Math.sin(t * 3.4) * 16
      const cy = h / 2 + Math.cos(t * 1.12) * h * 0.19 + Math.cos(t * 2.8) * 14
      const inside = pointer.down && Math.hypot(pointer.x - cx, pointer.y - cy) <= radius

      if (pointer.down) totalActive += dt
      if (inside) {
        elapsedInside += dt
        integrityValue = Math.min(100, integrityValue + dt * 0.012)
      } else {
        integrityValue -= dt * (pointer.down ? 0.045 : 0.075)
      }

      setIntegrity(Math.max(0, integrityValue))
      setTimeLeft(Math.max(0, GAME_SECONDS - elapsed / 1000))

      ctx.clearRect(0, 0, w, h)
      ctx.save()
      ctx.globalAlpha = 0.35
      ctx.strokeStyle = '#2fe6a6'
      for (let r = radius * 1.7; r < radius * 4.6; r += radius * 0.9) {
        ctx.beginPath()
        ctx.arc(cx, cy, r + Math.sin(t * 3 + r) * 3, 0, Math.PI * 2)
        ctx.stroke()
      }
      ctx.restore()

      const glow = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius * 2.3)
      glow.addColorStop(0, inside ? 'rgba(47,230,166,.95)' : 'rgba(139,92,255,.95)')
      glow.addColorStop(.34, inside ? 'rgba(47,230,166,.35)' : 'rgba(139,92,255,.35)')
      glow.addColorStop(1, 'rgba(0,0,0,0)')
      ctx.fillStyle = glow
      ctx.beginPath()
      ctx.arc(cx, cy, radius * 2.3, 0, Math.PI * 2)
      ctx.fill()

      ctx.strokeStyle = inside ? '#2FE6A6' : '#8B5CFF'
      ctx.lineWidth = 3
      ctx.beginPath()
      ctx.arc(cx, cy, radius, 0, Math.PI * 2)
      ctx.stroke()
      ctx.fillStyle = inside ? '#2FE6A6' : '#FFFFFF'
      ctx.beginPath()
      ctx.arc(cx, cy, 7, 0, Math.PI * 2)
      ctx.fill()

      if (pointer.down) {
        ctx.strokeStyle = inside ? 'rgba(47,230,166,.9)' : 'rgba(255,49,49,.9)'
        ctx.lineWidth = 2
        ctx.beginPath()
        ctx.arc(pointer.x, pointer.y, 20, 0, Math.PI * 2)
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
    <section className="screen game-screen">
      <div className="hud">
        <div><span>ОСТАЛОСЬ</span><strong>{timeLeft.toFixed(1)}</strong></div>
        <div><span>ЦЕЛОСТНОСТЬ</span><strong>{Math.round(integrity)}%</strong></div>
      </div>
      <div className="canvas-wrap">
        <canvas ref={canvasRef} />
        {!active && <div className="touch-hint">УДЕРЖИВАЙ ПАЛЕЦ<br />НА ИМПУЛЬСЕ</div>}
      </div>
      <div className="integrity"><i style={{ width: `${integrity}%` }} /></div>
    </section>
  )
}
