import { useEffect, useRef, useState } from 'react'
import type { GamePattern, GameResult } from '../../app/app.types'
import { trackProductEvent } from '../../shared/analytics/productAnalytics'
import { telegramAdapter } from '../../shared/telegram/telegramAdapter'
import { calculateGameResult, GAME_SECONDS } from './scoring'

type Phase = 'СПОКОЙНО' | 'УСКОРЕНИЕ' | 'ЛОЖНЫЙ МАНЁВР' | 'РЫВОК' | 'ВОССТАНОВЛЕНИЕ'
type Point = { x: number; y: number; life: number }

const GRACE_MS = 360
const HUD_MS = 100

function patternFor(seed: number): GamePattern {
  return (['ORBIT', 'ZIGZAG', 'FAKEOUT'] as GamePattern[])[seed % 3]
}

function comboFor(ms: number) {
  if (ms >= 12_000) return 4
  if (ms >= 8_000) return 3
  if (ms >= 5_000) return 2
  if (ms >= 2_000) return 1
  return 0
}

function phaseFor(ms: number, seed: number): Phase {
  const shift = seed % 600
  if (ms < 2_300 + shift * 0.2) return 'СПОКОЙНО'
  if (ms < 5_200 + shift * 0.25) return 'УСКОРЕНИЕ'
  if (ms < 8_500 + shift * 0.2) return 'ЛОЖНЫЙ МАНЁВР'
  if (ms < 12_000 + shift * 0.1) return 'РЫВОК'
  return 'ВОССТАНОВЛЕНИЕ'
}

function route(pattern: GamePattern, phase: Phase, t: number, w: number, h: number) {
  const speed = phase === 'РЫВОК' ? 1.55 : phase === 'УСКОРЕНИЕ' ? 1.28 : 0.92
  const jitter = phase === 'ЛОЖНЫЙ МАНЁВР' ? 18 : 7
  if (pattern === 'ZIGZAG') {
    const zig = (2 / Math.PI) * Math.asin(Math.sin(t * 2.05 * speed))
    return { x: w / 2 + zig * w * 0.23, y: h / 2 + Math.cos(t * 1.25) * h * 0.15 }
  }
  if (pattern === 'FAKEOUT') {
    return { x: w / 2 + Math.sin(t * speed) * w * 0.2 + Math.sin(t * 5.2) * jitter, y: h / 2 + Math.cos(t * 1.1) * h * 0.15 + Math.sin(t * 6.4) * 11 }
  }
  return { x: w / 2 + Math.sin(t * 1.12 * speed) * w * 0.2, y: h / 2 + Math.cos(t * 1.01 * speed) * h * 0.16 }
}

export function SignalGame({ seed, onFinish }: { seed: number; onFinish: (result: GameResult) => void }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const [timeLeft, setTimeLeft] = useState(GAME_SECONDS)
  const [integrity, setIntegrity] = useState(100)
  const [started, setStarted] = useState(false)
  const [locked, setLocked] = useState(false)
  const [combo, setCombo] = useState(0)
  const [paused, setPaused] = useState(false)

  useEffect(() => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return

    const pattern = patternFor(seed)
    const mountedAt = performance.now()
    let width = 0
    let height = 0
    let last = mountedAt
    let startedAt = 0
    let pausedAt = 0
    let pausedDuration = 0
    let firstLockAt = 0
    let elapsedInside = 0
    let totalActive = 0
    let longestStreak = 0
    let streak = 0
    let lastInsideAt = 0
    let integrityValue = 100
    let assistedMs = 0
    let graceMs = 0
    let centerSum = 0
    let distanceSum = 0
    let samples = 0
    let recoveries = 0
    let previousInside = false
    let lastUi = 0
    let done = false
    let raf = 0
    let pointer = { x: -999, y: -999, down: false }
    const trail: Point[] = []

    const resize = () => {
      const rect = canvas.getBoundingClientRect()
      const dpr = Math.min(devicePixelRatio || 1, 2)
      width = rect.width
      height = rect.height
      canvas.width = width * dpr
      canvas.height = height * dpr
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }

    const finish = (success: boolean, failurePhase?: Phase) => {
      if (done) return
      done = true
      const base = calculateGameResult(elapsedInside, totalActive, success)
      const centerAccuracy = samples ? Math.round(centerSum / samples * 100) : 0
      const reaction = firstLockAt ? firstLockAt - mountedAt : 0
      const skillScore = Math.max(0, Math.min(100, centerAccuracy * 0.5 + base.accuracy * 0.3 + Math.min(100, longestStreak / 150) * 0.2 - Math.min(20, assistedMs / 250)))
      onFinish({ ...base, longestStreakMs: longestStreak, reactionTimeMs: reaction || undefined, comboTier: comboFor(longestStreak), recoveries, skillScore, centerAccuracy, assistedTimeMs: assistedMs, graceTimeMs: graceMs, averageDistance: samples ? distanceSum / samples : 0, failurePhase, pattern, seed })
    }

    const pointerPosition = (event: PointerEvent) => {
      const rect = canvas.getBoundingClientRect()
      pointer.x = event.clientX - rect.left
      pointer.y = event.clientY - rect.top
    }
    const down = (event: PointerEvent) => { pointer.down = true; pointerPosition(event); canvas.setPointerCapture?.(event.pointerId); telegramAdapter.haptic('tap') }
    const move = (event: PointerEvent) => pointerPosition(event)
    const up = () => { pointer.down = false; setLocked(false) }
    const visibility = () => {
      if (document.hidden) { pausedAt = performance.now(); pointer.down = false; setPaused(true); trackProductEvent('game_paused', { seed, pattern }) }
      else if (pausedAt) { pausedDuration += performance.now() - pausedAt; pausedAt = 0; last = performance.now(); setPaused(false) }
    }

    const draw = (now: number) => {
      if (pausedAt) { raf = requestAnimationFrame(draw); return }
      const dt = Math.min(40, now - last)
      last = now
      const elapsed = startedAt ? now - startedAt - pausedDuration : 0
      const phase = phaseFor(elapsed, seed)
      const t = elapsed / 1000
      const radius = Math.max(35, Math.min(50, Math.min(width, height) * 0.1))
      const pos = route(pattern, phase, t, width, height)
      const coreX = Math.max(radius * 2.5, Math.min(width - radius * 2.5, pos.x))
      const coreY = Math.max(radius * 2.5, Math.min(height - radius * 3.4, pos.y))
      const anchorY = coreY + 48
      const captureRadius = Math.max(52, radius * 1.3)
      const distance = Math.hypot(pointer.x - coreX, pointer.y - anchorY)
      const assisted = pointer.down && distance > captureRadius && distance <= captureRadius + 18
      const inside = pointer.down && (distance <= captureRadius || assisted)
      const inGrace = startedAt > 0 && !inside && now - lastInsideAt <= GRACE_MS

      if (inside && !startedAt) { startedAt = now; firstLockAt = now; setStarted(true); trackProductEvent('first_lock', { seed, pattern, reactionTimeMs: now - mountedAt }); telegramAdapter.haptic('success') }
      if (startedAt) {
        if (pointer.down) totalActive += dt
        if (inside) {
          if (!previousInside && lastInsideAt && now - lastInsideAt > GRACE_MS) recoveries += 1
          lastInsideAt = now
          elapsedInside += dt
          streak += dt
          longestStreak = Math.max(longestStreak, streak)
          const normalized = Math.min(1, distance / captureRadius)
          centerSum += 1 - normalized
          distanceSum += distance
          samples += 1
          if (assisted) assistedMs += dt
          integrityValue = Math.min(100, integrityValue + dt * 0.022)
        } else if (inGrace) { graceMs += dt; integrityValue -= dt * 0.005 }
        else { streak = 0; integrityValue -= dt * (pointer.down ? 0.042 : 0.058) }
      }
      if (inside !== previousInside) { setLocked(inside); previousInside = inside }
      if (now - lastUi > HUD_MS) { setTimeLeft(startedAt ? Math.max(0, GAME_SECONDS - elapsed / 1000) : GAME_SECONDS); setIntegrity(Math.max(0, integrityValue)); setCombo(comboFor(streak)); lastUi = now }

      trail.unshift({ x: coreX, y: coreY, life: 1 })
      if (trail.length > 18) trail.pop()
      ctx.clearRect(0, 0, width, height)
      trail.forEach((point, index) => { point.life -= 0.06; ctx.fillStyle = inside ? `rgba(47,230,166,${Math.max(0, point.life) * 0.12})` : `rgba(139,92,255,${Math.max(0, point.life) * 0.08})`; ctx.beginPath(); ctx.arc(point.x, point.y, Math.max(2, radius * 0.55 - index), 0, Math.PI * 2); ctx.fill() })
      ctx.strokeStyle = inside || inGrace ? '#2FE6A6' : '#8B5CFF'
      ctx.lineWidth = inside ? 3 : 1.5
      ctx.beginPath(); ctx.arc(coreX, anchorY, captureRadius, 0, Math.PI * 2); ctx.stroke()
      ctx.shadowColor = ctx.strokeStyle; ctx.shadowBlur = inside ? 28 : 16
      ctx.beginPath(); ctx.arc(coreX, coreY, radius, 0, Math.PI * 2); ctx.stroke(); ctx.shadowBlur = 0
      ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(coreX, coreY, 8, 0, Math.PI * 2); ctx.fill()

      if (integrityValue <= 0) return finish(false, phase)
      if (startedAt && elapsed >= GAME_SECONDS * 1000) return finish(true)
      raf = requestAnimationFrame(draw)
    }

    resize()
    addEventListener('resize', resize)
    document.addEventListener('visibilitychange', visibility)
    canvas.addEventListener('pointerdown', down)
    canvas.addEventListener('pointermove', move)
    canvas.addEventListener('pointerup', up)
    canvas.addEventListener('pointercancel', up)
    raf = requestAnimationFrame(draw)
    return () => { cancelAnimationFrame(raf); removeEventListener('resize', resize); document.removeEventListener('visibilitychange', visibility); canvas.removeEventListener('pointerdown', down); canvas.removeEventListener('pointermove', move); canvas.removeEventListener('pointerup', up); canvas.removeEventListener('pointercancel', up) }
  }, [onFinish, seed])

  return <section className={`screen game-screen ${integrity <= 25 ? 'is-critical' : integrity <= 55 ? 'is-warning' : ''}`}>
    <div className="hud hud-premium"><div className="hud-cell"><span>ВРЕМЯ</span><strong>{timeLeft.toFixed(1)}</strong><small>СЕК</small></div><div className="hud-center" aria-hidden="true"><i className={locked ? 'is-locked' : ''} /></div><div className="hud-cell hud-cell-right"><span>ЦЕЛОСТНОСТЬ</span><strong>{Math.round(integrity)}</strong><small>%</small></div></div>
    <div className="game-meta-row"><span>{patternFor(seed)}</span><strong className={combo ? 'combo-live' : ''}>{combo ? `x${combo}` : ''}</strong><em /></div>
    <div className="canvas-wrap"><canvas ref={canvasRef} />{!started && <div className="touch-hint"><strong>ПОЙМАЙ СИГНАЛ</strong><span>Следуй за нижним кольцом</span></div>}{paused && <div className="touch-hint"><strong>ПАУЗА</strong><span>Вернись в игру и продолжай</span></div>}</div>
  </section>
}