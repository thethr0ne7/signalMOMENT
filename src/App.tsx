import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import type { GameResult, Screen } from './app/app.types'
import { SignalGame } from './features/game/SignalGame'
import { signalApi } from './shared/api/client'
import type { GameSession } from './shared/api/client'
import { loadBestScore, loadHistory, saveResult } from './shared/storage/localResults'
import { telegramAdapter } from './shared/telegram/telegramAdapter'

export default function App() {
  const [screen, setScreen] = useState<Screen>('home')
  const [countdown, setCountdown] = useState(3)
  const [result, setResult] = useState<GameResult | null>(null)
  const [best, setBest] = useState(loadBestScore)
  const [history, setHistory] = useState<GameResult[]>(loadHistory)
  const [chainId, setChainId] = useState('local')
  const [shareToken, setShareToken] = useState('local')
  const [inviter, setInviter] = useState('сети')
  const gameSessionRef = useRef<GameSession | null>(null)
  const gameStartedAtRef = useRef(0)

  const player = useMemo(() => telegramAdapter.getPlayerName(), [])
  const startParam = useMemo(() => telegramAdapter.getStartParam(), [])

  useEffect(() => {
    telegramAdapter.init()
    const bootstrap = async () => {
      try {
        await signalApi.authenticate(telegramAdapter.getInitData())
      } catch (error) {
        console.warn('Verified Telegram session unavailable; using local fallback.', error)
      }

      const chain = await signalApi.resolveChain(startParam)
      setChainId(chain.chainId)
      setShareToken(chain.shareToken)
      setInviter(chain.inviterLabel)
    }
    void bootstrap()
  }, [startParam])

  const start = useCallback(() => {
    telegramAdapter.haptic('tap')
    setCountdown(3)
    setScreen('countdown')
    gameStartedAtRef.current = Date.now()
    gameSessionRef.current = null
    void signalApi.startGameSession(chainId)
      .then((gameSession) => { gameSessionRef.current = gameSession })
      .catch((error) => console.warn('Server game session unavailable; result remains local.', error))
  }, [chainId])

  useEffect(() => {
    if (screen !== 'countdown') return
    if (countdown <= 0) {
      setScreen('game')
      return
    }

    const id = window.setTimeout(() => setCountdown((value) => value - 1), 650)
    return () => window.clearTimeout(id)
  }, [screen, countdown])

  const finish = useCallback((next: GameResult) => {
    setResult(next)
    const saved = saveResult(next, history, best)
    setHistory(saved.history)
    setBest(saved.best)
    const clientDurationMs = Math.max(0, Date.now() - gameStartedAtRef.current)
    void signalApi.saveResult(gameSessionRef.current, chainId, next, clientDurationMs)
      .catch((error) => console.warn('Server result persistence failed; local result is preserved.', error))
    telegramAdapter.haptic(next.success ? 'success' : 'error')
    setScreen('result')
  }, [best, chainId, history])

  return (
    <main className={`app-shell screen-${screen}`}>
      <div className="ambient ambient-mint" />
      <div className="ambient ambient-violet" />
      <div className="ambient ambient-cyan" />
      <div className="noise" />
      <div className="grid" />

      <header className="topbar">
        <div className="brand-mark" aria-hidden="true"><i /><b /></div>
        <div>
          <div className="brand">ЛОВИ СИГНАЛ</div>
          <div className="brand-sub">CHAIN PROTOCOL</div>
        </div>
        <button className="icon-btn" onClick={() => setScreen('history')} aria-label="Результаты">
          <span /><span /><span />
        </button>
      </header>

      {screen === 'home' && (
        <section className="screen home-screen screen-enter">
          <div className="eyebrow"><i /> ВХОДЯЩИЙ ИМПУЛЬС</div>
          <h1>Сигнал передан<br />от {inviter}</h1>
          <p className="lead">Удержи живое ядро внутри контакта 15 секунд. Потеря контроля разрушает сигнал — возвращение стабилизирует его.</p>

          <div className="signal-orb" aria-hidden="true">
            <i className="orb-ring ring-one" />
            <i className="orb-ring ring-two" />
            <i className="orb-ring ring-three" />
            <span><b /></span>
          </div>

          <div className="stats-row">
            <Stat label="ЛИЧНЫЙ РЕКОРД" value={`${best.toFixed(2)} с`} />
            <Stat label="ОПЕРАТОР" value={player} />
          </div>
          <button className="primary energy-button" onClick={start}><span>✦</span> ПРИНЯТЬ СИГНАЛ</button>
          <button className="ghost" onClick={() => setScreen('history')}>МОИ РЕЗУЛЬТАТЫ</button>
        </section>
      )}

      {screen === 'countdown' && (
        <section className="screen centered countdown-screen screen-enter">
          <div className="eyebrow"><i /> СИНХРОНИЗАЦИЯ</div>
          <div className="countdown-shell">
            <div className="countdown-radar" />
            <div className="countdown" key={countdown}>{countdown || 'GO'}</div>
          </div>
          <p className="muted">Следуй за ядром. Не отпускай контакт.</p>
        </section>
      )}

      {screen === 'game' && <SignalGame onFinish={finish} />}

      {screen === 'result' && result && (
        <section className="screen result-screen screen-enter">
          <div className={`status-badge ${result.success ? 'success' : 'danger'}`}>
            <i /> {result.success ? 'СИГНАЛ СОХРАНЁН' : 'СИГНАЛ ПОТЕРЯН'}
          </div>
          <div className="result-label">ВРЕМЯ КОНТАКТА</div>
          <div className="result-score">{result.score.toFixed(2)}<small> сек</small></div>

          <div className="result-core">
            <div className="accuracy-ring" style={{ '--p': `${result.accuracy * 3.6}deg` } as CSSProperties}>
              <div><strong>{Math.round(result.accuracy)}%</strong><span>STABILITY</span></div>
            </div>
            <i className="result-orbit orbit-a" />
            <i className="result-orbit orbit-b" />
          </div>

          <div className="result-stability">
            <div><span>SIGNAL STABILITY</span><strong>{Math.round(result.accuracy)}%</strong></div>
            <div className="result-track"><i style={{ width: `${result.accuracy}%` }} /></div>
          </div>

          <div className="stats-row">
            <Stat label="ЛУЧШИЙ" value={`${best.toFixed(2)} с`} />
            <Stat label="ПОПЫТОК" value={String(history.length)} />
          </div>
          <button className="primary energy-button" onClick={() => telegramAdapter.shareSignal(result.score, result.accuracy, shareToken)}><span>↗</span> ПЕРЕДАТЬ СИГНАЛ</button>
          <button className="ghost" onClick={start}>ЕЩЁ РАЗ</button>
          <button className="text-btn" onClick={() => setScreen('home')}>На главный экран</button>
        </section>
      )}

      {screen === 'history' && (
        <section className="screen leaderboard-screen screen-enter">
          <div className="eyebrow"><i /> ЛОКАЛЬНЫЙ ПРОТОКОЛ</div>
          <h2>История контактов</h2>
          {history.length === 0 ? <p className="muted">Здесь появятся результаты после первой игры.</p> : (
            <div className="history-list">
              {history.map((item, index) => (
                <div className="history-item" key={`${item.createdAt}-${index}`}>
                  <span>#{String(index + 1).padStart(2, '0')}</span>
                  <div><strong>{item.score.toFixed(2)} с</strong><small>{item.success ? 'СИГНАЛ СОХРАНЁН' : 'КОНТАКТ ПОТЕРЯН'}</small></div>
                  <em>{Math.round(item.accuracy)}%</em>
                </div>
              ))}
            </div>
          )}
          <button className="primary energy-button" onClick={start}><span>✦</span> НОВЫЙ КОНТАКТ</button>
          <button className="ghost" onClick={() => setScreen('home')}>НАЗАД</button>
        </section>
      )}
    </main>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return <div className="stat"><span>{label}</span><strong>{value}</strong><i /></div>
}
