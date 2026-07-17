import { useEffect, useRef, useState } from 'react'
import type { GameResult } from '../../app/app.types'
import { telegramAdapter } from '../../shared/telegram/telegramAdapter'
import { calculateGameResult, GAME_SECONDS } from './scoring'

type Particle = { angle: number; distance: number; speed: number; size: number; phase: number }
type TrailPoint = { x: number; y: number; life: number }
type Phase = 'ЗАХВАТ' | 'СПОКОЙНО' | 'УСКОРЕНИЕ' | 'ЛОЖНЫЙ МАНЁВР' | 'РЫВОК' | 'ВОССТАНОВЛЕНИЕ'
type EventBeat = 'ОЖИДАНИЕ' | 'РЕЗОНАНС' | 'ЭЛЕКТРОМАГНИТНАЯ БУРЯ' | 'ПЕРЕГРУЗКА'

const BASE_TOUCH_OFFSET_Y = 46
const LOSS_GRACE_MS = 360
const PREDICTION_MS = 42
const MAGNETIC_ASSIST_BAND = 18

function comboTier(streakMs: number) {
  if (streakMs >= 12_000) return 4
  if (streakMs >= 8_000) return 3
  if (streakMs >= 5_000) return 2
  if (streakMs >= 2_000) return 1
  return 0
}

function movementPhase(elapsedMs: number): Phase {
  if (elapsedMs < 2_500) return 'СПОКОЙНО'
  if (elapsedMs < 5_500) return 'УСКОРЕНИЕ'
  if (elapsedMs < 8_500) return 'ЛОЖНЫЙ МАНЁВР'
  if (elapsedMs < 12_000) return 'РЫВОК'
  return 'ВОССТАНОВЛЕНИЕ'
}

function phaseMotion(phase: Phase) {
  if (phase === 'УСКОРЕНИЕ') return { speed: 1.28, amp: 1.06, jitter: 0.9 }
  if (phase === 'ЛОЖНЫЙ МАНЁВР') return { speed: 1.06, amp: 1.14, jitter: 1.45 }
  if (phase === 'РЫВОК') return { speed: 1.54, amp: 1.18, jitter: 1.9 }
  if (phase === 'ВОССТАНОВЛЕНИЕ') return { speed: 0.8, amp: 0.86, jitter: 0.4 }
  return { speed: 0.8, amp: 0.8, jitter: 0.3 }
}

function eventBeat(elapsedMs: number): EventBeat {
  if (elapsedMs < 3_500) return 'ОЖИДАНИЕ'
  if (elapsedMs < 7_000) return 'РЕЗОНАНС'
  if (elapsedMs < 11_000) return 'ЭЛЕКТРОМАГНИТНАЯ БУРЯ'
  return 'ПЕРЕГРУЗКА'
}

function statusLabel(started: boolean, integrity: number, inside: boolean, grace: boolean, assisted: boolean) {
  if (!started) return 'ПОЙМАЙ СИГНАЛ — ТАЙМЕР ЖДЁТ'
  if (assisted) return 'МАГНИТНЫЙ ЗАХВАТ'
  if (grace && !inside) return 'ВОССТАНОВИ КОНТАКТ'
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
  const [started, setStarted] = useState(false)
  const [phase, setPhase] = useState<Phase>('ЗАХВАТ')
  const [beat, setBeat] = useState<EventBeat>('ОЖИДАНИЕ')
  const [combo, setCombo] = useState(0)
  const [streakSeconds, setStreakSeconds] = useState(0)
  const [inGrace, setInGrace] = useState(false)
  const [assisted, setAssisted] = useState(false)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const particles: Particle[] = Array.from({ length: reducedMotion ? 14 : 36 }, (_, index) => ({
      angle: (Math.PI * 2 * index) / 36,
      distance: 1.35 + Math.random() * 2.1,
      speed: 0.12 + Math.random() * 0.3,
      size: 0.8 + Math.random() * 2.1,
      phase: Math.random() * Math.PI * 2,
    }))

    let raf = 0
    const mountedAt = performance.now()
    let last = mountedAt
    let gameStartedAt = 0
    let firstLockAt = 0
    let elapsedInside = 0
    let totalActive = 0
    let currentStreak = 0
    let longestStreak = 0
    let lastInsideAt = 0
    let recoveries = 0
    let integrityValue = 100
    let done = false
    let previousInside = false
    let previousBeat: EventBeat = 'ОЖИДАНИЕ'
    let lastUiUpdate = 0
    let lastPointerAt = mountedAt
    let pointer = { x: -9999, y: -9999, vx: 0, vy: 0, down: false }
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
      const now = performance.now()
      const nextX = event.clientX - rect.left
      const nextY = event.clientY - rect.top
      const delta = Math.max(8, now - lastPointerAt)
      const rawVx = (nextX - pointer.x) / delta
      const rawVy = (nextY - pointer.y) / delta
      if (pointer.x > -1000) {
        pointer.vx = pointer.vx * 0.68 + rawVx * 0.32
        pointer.vy = pointer.vy * 0.68 + rawVy * 0.32
      }
      pointer.x = nextX
      pointer.y = nextY
      lastPointerAt = now
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
      pointer.vx = 0
      pointer.vy = 0
      setActive(false)
      setLocked(false)
    }

    const finish = (success: boolean) => {
      if (done) return
      done = true
      const base = calculateGameResult(elapsedInside, totalActive, success)
      onFinish({
        ...base,
        longestStreakMs: longestStreak,
        reactionTimeMs: firstLockAt ? firstLockAt - mountedAt : undefined,
        comboTier: comboTier(longestStreak),
        recoveries,
      })
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
      const gameElapsed = gameStartedAt ? now - gameStartedAt : 0
      const currentPhase = gameStartedAt ? movementPhase(gameElapsed) : 'ЗАХВАТ'
      const currentBeat = gameStartedAt ? eventBeat(gameElapsed) : 'ОЖИДАНИЕ'
      const motionConfig = phaseMotion(currentPhase)
      const rect = canvas.getBoundingClientRect()
      const w = rect.width
      const h = rect.height
      const t = gameElapsed / 1000
      const motion = reducedMotion ? 0.35 : 1
      const radius = Math.max(34, Math.min(50, Math.min(w, h) * 0.102))
      const pointerSpeed = Math.min(2.2, Math.hypot(pointer.vx, pointer.vy))
      const touchOffsetY = BASE_TOUCH_OFFSET_Y + Math.min(10, pointerSpeed * 4)
      const edgeX = radius * 2.7
      const edgeTop = radius * 2.7
      const edgeBottom = radius * 2.7 + touchOffsetY
      const feint = currentPhase === 'ЛОЖНЫЙ МАНЁВР' ? Math.sin(t * 7.5) * 17 : 0
      const surge = currentPhase === 'РЫВОК' ? Math.sin(t * 11) * 14 : 0
      const storm = currentBeat === 'ЭЛЕКТРОМАГНИТНАЯ БУРЯ' ? Math.sin(t * 15) * 5 : 0
      const rawX = w / 2 + Math.sin(t * 1.12 * motionConfig.speed * motion) * w * 0.2 * motionConfig.amp + Math.sin(t * 3.05 * motion) * 13 * motionConfig.jitter + feint + storm
      const rawY = h / 2 - 18 + Math.cos(t * 1.01 * motionConfig.speed * motion) * h * 0.16 * motionConfig.amp + Math.cos(t * 2.4 * motion) * 11 * motionConfig.jitter + surge
      const coreX = Math.min(w - edgeX, Math.max(edgeX, rawX))
      const coreY = Math.min(h - edgeBottom, Math.max(edgeTop, rawY))
      const anchorX = coreX
      const anchorY = coreY + touchOffsetY
      const predictedX = pointer.x + pointer.vx * PREDICTION_MS
      const predictedY = pointer.y + pointer.vy * PREDICTION_MS
      const captureRadius = Math.max(52, radius * 1.3) + pointerSpeed * 8
      const predictedDistance = Math.hypot(predictedX - anchorX, predictedY - anchorY)
      const directDistance = Math.hypot(pointer.x - anchorX, pointer.y - anchorY)
      const magneticAssist = pointer.down && directDistance > captureRadius && predictedDistance <= captureRadius + MAGNETIC_ASSIST_BAND
      const inside = pointer.down && (directDistance <= captureRadius || magneticAssist)
      const withinLossGrace = gameStartedAt > 0 && !inside && now - lastInsideAt <= LOSS_GRACE_MS
      const danger = Math.max(0, 1 - integrityValue / 100)
      const pulse = 1 + Math.sin(now / 280) * 0.045

      if (currentBeat !== previousBeat && currentBeat !== 'ОЖИДАНИЕ') {
        telegramAdapter.haptic(currentBeat === 'ПЕРЕГРУЗКА' ? 'success' : 'tap')
        previousBeat = currentBeat
      }

      if (inside && !gameStartedAt) {
        gameStartedAt = now
        firstLockAt = now
        setStarted(true)
        telegramAdapter.haptic('success')
      }

      if (gameStartedAt) {
        if (pointer.down) totalActive += dt
        if (inside) {
          if (!previousInside && lastInsideAt > 0 && now - lastInsideAt > LOSS_GRACE_MS) recoveries += 1
          lastInsideAt = now
          elapsedInside += dt
          currentStreak += dt
          longestStreak = Math.max(longestStreak, currentStreak)
          const resonanceBonus = currentBeat === 'РЕЗОНАНС' ? 0.006 : 0
          integrityValue = Math.min(100, integrityValue + dt * (0.022 + resonanceBonus))
        } else if (withinLossGrace) {
          currentStreak += dt * 0.35
          integrityValue = Math.max(0, integrityValue - dt * 0.005)
        } else {
          currentStreak = 0
          const stormPenalty = currentBeat === 'ЭЛЕКТРОМАГНИТНАЯ БУРЯ' ? 0.008 : 0
          integrityValue -= dt * (pointer.down ? 0.038 + stormPenalty : 0.058)
        }
      }

      if (inside !== previousInside) {
        setLocked(inside)
        if (inside && gameStartedAt) telegramAdapter.haptic('tap')
        previousInside = inside
      }

      if (now - lastUiUpdate > 45) {
        setIntegrity(Math.max(0, integrityValue))
        setTimeLeft(gameStartedAt ? Math.max(0, GAME_SECONDS - gameElapsed / 1000) : GAME_SECONDS)
        setPhase(currentPhase)
        setBeat(currentBeat)
        setCombo(comboTier(currentStreak))
        setStreakSeconds(currentStreak / 1000)
        setInGrace(withinLossGrace)
        setAssisted(magneticAssist)
        lastUiUpdate = now
      }

      trail.unshift({ x: coreX, y: coreY, life: 1 })
      if (trail.length > 24) trail.pop()
      trail.forEach((point) => { point.life -= 0.047 })
      ctx.clearRect(0, 0, w, h)

      trail.forEach((point, index) => {
        const alpha = Math.max(0, point.life) * (inside ? 0.14 : 0.09)
        ctx.fillStyle = inside ? `rgba(47,230,166,${alpha})` : `rgba(139,92,255,${alpha})`
        ctx.beginPath()
        ctx.arc(point.x, point.y, Math.max(2, radius * 0.58 - index), 0, Math.PI * 2)
        ctx.fill()
      })

      const field = ctx.createRadialGradient(coreX, coreY, radius * 0.1, coreX, coreY, radius * 4.8)
      field.addColorStop(0, inside ? 'rgba(47,230,166,.27)' : 'rgba(139,92,255,.22)')
      field.addColorStop(0.45, danger > 0.52 ? 'rgba(255,49,49,.1)' : 'rgba(85,246,255,.04)')
      field.addColorStop(1, 'rgba(0,0,0,0)')
      ctx.fillStyle = field
      ctx.fillRect(0, 0, w, h)

      particles.forEach((particle, index) => {
        const beatBoost = currentBeat === 'ПЕРЕГРУЗКА' ? 1.28 : currentBeat === 'РЕЗОНАНС' ? 1.12 : 1
        const orbit = radius * particle.distance * beatBoost * (1 + Math.sin(t * 0.8 + particle.phase) * 0.08)
        const angle = particle.angle + t * particle.speed * (inside ? 1.4 + comboTier(currentStreak) * 0.16 : 0.72)
        const px = coreX + Math.cos(angle) * orbit
        const py = coreY + Math.sin(angle) * orbit * 0.72
        const alpha = 0.15 + Math.sin(t * 2 + particle.phase) * 0.12 + (inside ? 0.17 : 0)
        ctx.fillStyle = danger > 0.62 && index % 3 === 0 ? `rgba(255,78,78,${Math.max(0.05, alpha)})` : `rgba(85,246,255,${Math.max(0.04, alpha)})`
        ctx.beginPath()
        ctx.arc(px, py, particle.size * beatBoost, 0, Math.PI * 2)
        ctx.fill()
      })

      drawOrbit(coreX, coreY, radius * 1.48, t * 0.5, 0.54, inside ? '#2FE6A6' : '#8B5CFF')
      drawOrbit(coreX, coreY, radius * 1.86, -t * 0.32, 0.3, '#55F6FF')
      drawOrbit(coreX, coreY, radius * 2.35, t * 0.18, 0.15 + danger * 0.28, danger > 0.55 ? '#FF3131' : '#FFFFFF')

      if (pointer.down) {
        ctx.strokeStyle = inside ? 'rgba(47,230,166,.5)' : magneticAssist ? 'rgba(85,246,255,.65)' : 'rgba(255,95,95,.4)'
        ctx.setLineDash([5, 7])
        ctx.beginPath()
        ctx.moveTo(coreX, coreY + radius * 0.75)
        ctx.quadraticCurveTo(coreX, anchorY - 14, predictedX, predictedY)
        ctx.stroke()
        ctx.setLineDash([])
      }

      ctx.strokeStyle = inside || withinLossGrace ? 'rgba(47,230,166,.86)' : magneticAssist ? 'rgba(85,246,255,.9)' : 'rgba(255,255,255,.25)'
      ctx.lineWidth = inside ? 2.4 : 1.2
      ctx.beginPath()
      ctx.arc(anchorX, anchorY, captureRadius + Math.sin(t * 5) * 2, 0, Math.PI * 2)
      ctx.stroke()

      const glow = ctx.createRadialGradient(coreX, coreY, 0, coreX, coreY, radius * 2.6)
      glow.addColorStop(0, 'rgba(255,255,255,.98)')
      glow.addColorStop(0.12, inside ? 'rgba(47,230,166,.96)' : 'rgba(139,92,255,.92)')
      glow.addColorStop(0.48, danger > 0.58 ? 'rgba(255,49,49,.25)' : 'rgba(85,246,255,.18)')
      glow.addColorStop(1, 'rgba(0,0,0,0)')
      ctx.fillStyle = glow
      ctx.beginPath()
      ctx.arc(coreX, coreY, radius * 2.6 * pulse, 0, Math.PI * 2)
      ctx.fill()

      ctx.strokeStyle = inside ? '#2FE6A6' : danger > 0.55 ? '#FF5151' : '#8B5CFF'
      ctx.lineWidth = inside ? 3.3 : 2.4
      ctx.shadowColor = ctx.strokeStyle
      ctx.shadowBlur = inside ? 24 : 15
      ctx.beginPath()
      ctx.arc(coreX, coreY, radius * pulse, 0, Math.PI * 2)
      ctx.stroke()
      ctx.shadowBlur = 0
      ctx.fillStyle = '#fff'
      ctx.beginPath()
      ctx.arc(coreX, coreY, Math.max(7, radius * 0.16), 0, Math.PI * 2)
      ctx.fill()

      if (integrityValue <= 0) return finish(false)
      if (gameStartedAt && gameElapsed >= GAME_SECONDS * 1000) return finish(true)
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
      <div className={`event-beat beat-${beat.toLowerCase().replaceAll(' ', '-')}`}>{beat}</div>
      <div className="game-meta-row"><span>{phase}</span><strong className={combo ? 'combo-live' : ''}>{combo ? `COMBO x${combo}` : 'BUILD COMBO'}</strong><em>{streakSeconds.toFixed(1)}с</em></div>
      <div className="game-status" aria-live="polite"><span className={locked ? 'status-dot is-locked' : 'status-dot'} />{statusLabel(started, integrity, locked, inGrace, assisted)}</div>
      <div className="canvas-wrap">
        <canvas ref={canvasRef} />
        {!active && !started && <div className="touch-hint"><strong>ПОЙМАЙ СИГНАЛ</strong><span>Двигай палец естественно — система компенсирует быстрые движения</span></div>}
      </div>
      <div className="stability-panel"><div className="stability-meta"><span>SIGNAL STABILITY</span><strong>{Math.round(integrity)}%</strong></div><div className="integrity"><i style={{ width: `${integrity}%` }} /><b style={{ left: `${integrity}%` }} /></div></div>
    </section>
  )
}
