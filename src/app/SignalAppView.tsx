import type { CSSProperties } from 'react'
import { ActivityFeed, ChainSummary, IncomingChallenge } from '../features/chain/ChainPanels'
import { SignalGame } from '../features/game/SignalGame'
import { useSignalController } from './useSignalController'

export default function SignalAppView() {
  const app = useSignalController()

  return (
    <main className={`app-shell screen-${app.screen}`}>
      <div className="ambient ambient-mint" />
      <div className="ambient ambient-violet" />
      <div className="ambient ambient-cyan" />
      <div className="noise" />
      <div className="grid" />

      <header className="topbar">
        <div className="brand-mark" aria-hidden="true"><i /><b /></div>
        <div><div className="brand">ЛОВИ СИГНАЛ</div><div className="brand-sub">CHAIN PROTOCOL</div></div>
        <button className="icon-btn" onClick={() => app.setScreen('history')} aria-label="Результаты"><span /><span /><span /></button>
      </header>

      {app.screen === 'home' && (
        <section className="screen home-screen screen-enter">
          <div className="eyebrow"><i /> ВХОДЯЩИЙ ИМПУЛЬС</div>
          <h1>Сигнал передан<br />от {app.inviter}</h1>
          <p className="lead">Удержи живое ядро внутри контакта 15 секунд. Потеря контроля разрушает сигнал — возвращение стабилизирует его.</p>
          <IncomingChallenge chain={app.chain} />
          <div className="signal-orb" aria-hidden="true">
            <i className="orb-ring ring-one" /><i className="orb-ring ring-two" /><i className="orb-ring ring-three" /><span><b /></span>
          </div>
          <ChainSummary chain={app.chain} />
          <div className="stats-row"><Stat label="ЛИЧНЫЙ РЕКОРД" value={`${app.best.toFixed(2)} с`} /><Stat label="ОПЕРАТОР" value={app.player} /></div>
          <button className="primary energy-button" onClick={app.start}><span>✦</span> ПРИНЯТЬ СИГНАЛ</button>
          <button className="ghost" onClick={() => app.setScreen('history')}>ЦЕПЬ И РЕЗУЛЬТАТЫ</button>
        </section>
      )}

      {app.screen === 'countdown' && (
        <section className="screen centered countdown-screen screen-enter">
          <div className="eyebrow"><i /> СИНХРОНИЗАЦИЯ</div>
          <div className="countdown-shell"><div className="countdown-radar" /><div className="countdown" key={app.countdown}>{app.countdown || 'GO'}</div></div>
          <p className="muted">Следуй за ядром. Не отпускай контакт.</p>
        </section>
      )}

      {app.screen === 'game' && <SignalGame onFinish={app.finish} />}

      {app.screen === 'result' && app.result && (
        <section className="screen result-screen screen-enter">
          <div className={`status-badge ${app.result.success ? 'success' : 'danger'}`}><i /> {app.result.success ? 'СИГНАЛ СОХРАНЁН' : 'СИГНАЛ ПОТЕРЯН'}</div>
          <div className="result-label">ВРЕМЯ КОНТАКТА</div>
          <div className="result-score">{app.result.score.toFixed(2)}<small> сек</small></div>
          <div className="result-core">
            <div className="accuracy-ring" style={{ '--p': `${app.result.accuracy * 3.6}deg` } as CSSProperties}><div><strong>{Math.round(app.result.accuracy)}%</strong><span>STABILITY</span></div></div>
            <i className="result-orbit orbit-a" /><i className="result-orbit orbit-b" />
          </div>
          <div className="result-stability"><div><span>SIGNAL STABILITY</span><strong>{Math.round(app.result.accuracy)}%</strong></div><div className="result-track"><i style={{ width: `${app.result.accuracy}%` }} /></div></div>
          <ChainSummary chain={app.chain} />
          <div className="stats-row"><Stat label="ЛУЧШИЙ" value={`${app.best.toFixed(2)} с`} /><Stat label="ПОПЫТОК" value={String(app.history.length)} /></div>
          <button className="primary energy-button" onClick={app.share}><span>↗</span> ПЕРЕДАТЬ СИГНАЛ</button>
          <button className="ghost" onClick={app.start}>ЕЩЁ РАЗ</button>
          <button className="text-btn" onClick={() => app.setScreen('home')}>На главный экран</button>
        </section>
      )}

      {app.screen === 'history' && (
        <section className="screen leaderboard-screen screen-enter">
          <div className="eyebrow"><i /> ПРОТОКОЛ ЦЕПИ</div>
          <h2>Цепь и контакты</h2>
          <ChainSummary chain={app.chain} />
          <ActivityFeed events={app.activity} />
          {app.history.length === 0 ? <p className="muted">Здесь появятся результаты после первой игры.</p> : (
            <div className="history-list">{app.history.map((item, index) => (
              <div className="history-item" key={`${item.createdAt}-${index}`}><span>#{String(index + 1).padStart(2, '0')}</span><div><strong>{item.score.toFixed(2)} с</strong><small>{item.success ? 'СИГНАЛ СОХРАНЁН' : 'КОНТАКТ ПОТЕРЯН'}</small></div><em>{Math.round(item.accuracy)}%</em></div>
            ))}</div>
          )}
          <button className="primary energy-button" onClick={app.start}><span>✦</span> НОВЫЙ КОНТАКТ</button>
          <button className="ghost" onClick={() => app.setScreen('home')}>НАЗАД</button>
        </section>
      )}
    </main>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return <div className="stat"><span>{label}</span><strong>{value}</strong><i /></div>
}
