import type { ActivityEvent, ChainSnapshot } from '../../shared/api/client'

export function IncomingChallenge({ chain }: { chain: ChainSnapshot | null }) {
  if (!chain?.inviter) return null

  const inviterResult = chain.results
    .filter((result) => result.userId === chain.inviter?.userId)
    .sort((a, b) => b.score - a.score)[0]

  if (!inviterResult) return null

  return (
    <section className="challenge-card">
      <div className="challenge-card__head">
        <span>ВХОДЯЩИЙ ВЫЗОВ</span>
        <i>DEPTH {chain.inviter.depth}</i>
      </div>
      <div className="challenge-card__score">
        <div>
          <small>{chain.inviter.firstName}</small>
          <strong>{inviterResult.score.toFixed(2)}<em>с</em></strong>
        </div>
        <div className="challenge-card__accuracy">
          <b>{Math.round(inviterResult.accuracy)}%</b>
          <span>STABILITY</span>
        </div>
      </div>
      <p>Побей результат пригласившего и усили цепь.</p>
    </section>
  )
}

export function ChainSummary({ chain }: { chain: ChainSnapshot | null }) {
  if (!chain) return null

  return (
    <section className="chain-summary">
      <div><span>УЧАСТНИКИ</span><strong>{chain.participantCount}</strong></div>
      <div><span>ГЛУБИНА</span><strong>{chain.maxDepth}</strong></div>
      <div><span>РЕКОРД ЦЕПИ</span><strong>{chain.bestResult.toFixed(2)}с</strong></div>
    </section>
  )
}

function activityCopy(event: ActivityEvent) {
  if (event.eventType === 'chain_joined') return `${event.actorName} принял сигнал`
  if (event.eventType === 'result_recorded') return `${event.actorName} завершил контакт`
  if (event.eventType === 'chain_created') return 'Цепь создана'
  if (event.eventType === 'session_created') return `${event.actorName} начал попытку`
  return 'Активность цепи обновлена'
}

export function ActivityFeed({ events }: { events: ActivityEvent[] }) {
  if (events.length === 0) return null

  return (
    <section className="activity-feed">
      <div className="activity-feed__title"><span>CHAIN ACTIVITY</span><i>{events.length}</i></div>
      <div className="activity-feed__list">
        {events.slice(0, 8).map((event) => (
          <article key={event.id}>
            <i className={`activity-dot activity-${event.eventType}`} />
            <div>
              <strong>{activityCopy(event)}</strong>
              <span>{new Date(event.createdAt).toLocaleString('ru-RU', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
            </div>
          </article>
        ))}
      </div>
    </section>
  )
}
