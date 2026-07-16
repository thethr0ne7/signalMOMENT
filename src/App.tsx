import { useEffect, useMemo, useRef, useState } from 'react'
import { getPlayerName, getStartParam, haptic, initTelegram, shareSignal } from './telegram'

type Screen = 'home' | 'countdown' | 'game' | 'result' | 'leaderboard'

type Result = {
  score: number
  accuracy: number
  success: boolean
  createdAt: number
}

const GAME_SECONDS = 15
const STORAGE_KEY = 'lovi_signal_best'
const HISTORY_KEY = 'lovi_signal_history'

function uid() {
  return Math.random().toString(36).slice(2, 10)
}

export default function App() {
  const [screen, setScreen] = useState<Screen>('home')
  const [countdown, setCountdown] = useState(3)
  const [result, setResult] = useState<Result | null>(null)
  const [best, setBest] = useState(() => Number(localStorage.getItem(STORAGE_KEY) || 0))
  const [history, setHistory] = useState<Result[]>(() => {
    try { return JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]') } catch { return [] }
  })
  const player = useMemo(getPlayerName, [])
  const startParam = useMemo(getStartParam, [])
  const inviter = startParam.startsWith('chain_') ? 'друга' : 'сети'
  const chainId = useMemo(() => startParam.startsWith('chain_') ? startParam.replace('chain_', '') : uid(), [startParam])

  useEffect(() => { initTelegram() }, [])

  function start() {
    haptic('tap')
    setCountdown(3)
    setScreen('countdown')
  }

  useEffect(() => {
    if (screen !== 'countdown') return
    if (countdown <= 0) {
      setScreen('game')
      return
    }
    const id = window.setTimeout(() => setCountdown((v) => v - 1), 650)
    return () => window.clearTimeout(id)
  }, [screen, countdown])

  function finish(next: Result) {
    setResult(next)
    const nextHistory = [next, ...history].slice(0, 20)
    setHistory(nextHistory)
    localStorage.setItem(HISTORY_KEY, JSON.stringify(nextHistory))
    if (next.score > best) {
      setBest(next.score)
      localStorage.setItem(STORAGE_KEY, String(next.score))
    }
    haptic(next.success ? 'success' : 'error')
    setScreen('result')
  }

  return (
    <main className="app-shell">
      <div className="grid" />
      <header className="topbar">
        <div className="brand-dot" />
        <div className="brand">ЛОВИ СИГНАЛ</div>
        <button className="icon-btn" onClick={() => setScreen('leaderboard')} aria-label="Результаты">≡</button>
      </header>

      {screen === 'home' && (
        <section className="screen home-screen">
          <div className="eyebrow">ВХОДЯЩИЙ ИМПУЛЬС</div>
          <h1>Сигнал передан<br />от {inviter}</h1>
          <p className="lead">Удержи импульс внутри поля 15 секунд. Чем точнее движение, тем сильнее твоя цепь.</p>
          <div className="signal-orb"><span /></div>
          <div className="stats-row">
            <Stat label="РЕКОРД" value={`${best.toFixed(2)} с`} />
            <Stat label="ИГРОК" value={player} />
          </div>
          <button className="primary" onClick={start}>ПРИНЯТЬ СИГНАЛ</button>
          <button className="ghost" onClick={() => setScreen('leaderboard')}>МОИ РЕЗУЛЬТАТЫ</button>
        </section>
      )}

      {screen === 'countdown' && (
        <section className="screen centered">
          <div className="eyebrow">СИНХРОНИЗАЦИЯ</div>
          <div className="countdown">{countdown || 'GO'}</div>
          <p className="muted">Поставь палец на импульс</p>
        </section>
      )}

      {screen === 'game' && <SignalGame onFinish={finish} />}

      {screen === 'result' && result && (
        <section className="screen result-screen">
          <div className={`status-badge ${result.success ? 'success' : 'danger'}`}>
            {result.success ? 'СИГНАЛ СОХРАНЁН' : 'СИГНАЛ ПОТЕРЯН'}
          </div>
          <div className="result-score">{result.score.toFixed(2)}<small> сек</small></div>
          <div className="accuracy-ring" style={{'--p': `${result.accuracy * 3.6}deg`} as React.CSSProperties}>
            <div><strong>{Math.round(result.accuracy)}%</strong><span>ТОЧНОСТЬ</span></div>
          </div>
          <div className="stats-row">
            <Stat label="ЛУЧШИЙ" value={`${best.toFixed(2)} с`} />
            <Stat label="ПОПЫТОК" value={String(history.length)} />
          </div>
          <button className="primary" onClick={() => shareSignal(result.score, result.accuracy, chainId)}>ЛОВИ СИГНАЛ →</button>
          <button className="ghost" onClick={start}>ЕЩЁ РАЗ</button>
          <button className="text-btn" onClick={() => setScreen('home')}>На главный экран</button>
        </section>
      )}

      {screen === 'leaderboard' && (
        <section className="screen leaderboard-screen">
          <div className="eyebrow">ЛОКАЛЬНЫЙ ПРОТОКОЛ</div>
          <h2>Твои попытки</h2>
          {history.length === 0 ? <p className="muted">Здесь появятся результаты после первой игры.</p> : (
            <div className="history-list">
              {history.map((item, i) => (
                <div className="history-item" key={item.createdAt + '-' + i}>
                  <span>#{i + 1}</span>
                  <strong>{item.score.toFixed(2)} с</strong>
                  <em>{Math.round(item.accuracy)}%</em>
                </div>
              ))}
            </div>
          )}
          <button className="primary" onClick={start}>ИГРАТЬ</button>
          <button className="ghost" onClick={() => setScreen('home')}>НАЗАД</button>
        </section>
      )}
    </main>
  )
}

function Stat({label, value}:{label:string; value:string}) {
  return <div className="stat"><span>{label}</span><strong>{value}</strong></div>
}

function SignalGame({onFinish}:{onFinish:(r:Result)=>void}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const [timeLeft, setTimeLeft] = useState(GAME_SECONDS)
  const [integrity, setIntegrity] = useState(100)
  const [active, setActive] = useState(false)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')!
    let raf = 0
    let start = performance.now()
    let last = start
    let elapsedInside = 0
    let totalActive = 0
    let pointer = {x: -9999, y: -9999, down: false}
    let integrityValue = 100
    let done = false

    const resize = () => {
      const rect = canvas.getBoundingClientRect()
      const dpr = Math.min(devicePixelRatio || 1, 2)
      canvas.width = Math.floor(rect.width * dpr)
      canvas.height = Math.floor(rect.height * dpr)
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }
    resize()
    addEventListener('resize', resize)

    const point = (event: PointerEvent) => {
      const rect = canvas.getBoundingClientRect()
      pointer.x = event.clientX - rect.left
      pointer.y = event.clientY - rect.top
    }
    const down = (event: PointerEvent) => { pointer.down = true; point(event); setActive(true); haptic('tap') }
    const move = (event: PointerEvent) => point(event)
    const up = () => { pointer.down = false; setActive(false) }
    canvas.addEventListener('pointerdown', down)
    canvas.addEventListener('pointermove', move)
    canvas.addEventListener('pointerup', up)
    canvas.addEventListener('pointercancel', up)

    const finish = (success: boolean, elapsedMs: number) => {
      if (done) return
      done = true
      const score = Math.min(GAME_SECONDS, elapsedInside / 1000)
      const accuracy = totalActive > 0 ? Math.min(100, (elapsedInside / totalActive) * 100) : 0
      onFinish({score, accuracy, success, createdAt: Date.now()})
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
      const distance = Math.hypot(pointer.x - cx, pointer.y - cy)
      const inside = pointer.down && distance <= radius

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
      ctx.beginPath(); ctx.arc(cx, cy, radius * 2.3, 0, Math.PI * 2); ctx.fill()

      ctx.strokeStyle = inside ? '#2FE6A6' : '#8B5CFF'
      ctx.lineWidth = 3
      ctx.beginPath(); ctx.arc(cx, cy, radius, 0, Math.PI * 2); ctx.stroke()
      ctx.fillStyle = inside ? '#2FE6A6' : '#FFFFFF'
      ctx.beginPath(); ctx.arc(cx, cy, 7, 0, Math.PI * 2); ctx.fill()

      if (pointer.down) {
        ctx.strokeStyle = inside ? 'rgba(47,230,166,.9)' : 'rgba(255,49,49,.9)'
        ctx.lineWidth = 2
        ctx.beginPath(); ctx.arc(pointer.x, pointer.y, 20, 0, Math.PI * 2); ctx.stroke()
      }

      if (integrityValue <= 0) return finish(false, elapsed)
      if (elapsed >= GAME_SECONDS * 1000) return finish(true, elapsed)
      raf = requestAnimationFrame(draw)
    }

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
      <div className="integrity"><i style={{width: `${integrity}%`}} /></div>
    </section>
  )
}
