import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { GameResult, Screen } from './app.types'
import { signalApi } from '../shared/api/client'
import type { ActivityEvent, ChainSnapshot, GameSession } from '../shared/api/client'
import { loadBestScore, loadHistory, saveResult } from '../shared/storage/localResults'
import { telegramAdapter } from '../shared/telegram/telegramAdapter'

export function useSignalController() {
  const [screen, setScreen] = useState<Screen>('home')
  const [countdown, setCountdown] = useState(3)
  const [result, setResult] = useState<GameResult | null>(null)
  const [best, setBest] = useState(loadBestScore)
  const [history, setHistory] = useState<GameResult[]>(loadHistory)
  const [chainId, setChainId] = useState('local')
  const [shareToken, setShareToken] = useState('local')
  const [inviter, setInviter] = useState('сети')
  const [chain, setChain] = useState<ChainSnapshot | null>(null)
  const [activity, setActivity] = useState<ActivityEvent[]>([])
  const gameSessionRef = useRef<GameSession | null>(null)
  const gameStartedAtRef = useRef(0)

  const player = useMemo(() => telegramAdapter.getPlayerName(), [])
  const startParam = useMemo(() => telegramAdapter.getStartParam(), [])

  const refreshSocialState = useCallback(async (activeChainId: string) => {
    try {
      const [nextChain, nextActivity] = await Promise.all([
        signalApi.getChain(activeChainId),
        signalApi.getActivity(),
      ])
      setChain(nextChain)
      setActivity(nextActivity.filter((event) => !event.chainId || event.chainId === activeChainId))
    } catch (error) {
      console.warn('Chain comparison unavailable; local gameplay remains active.', error)
    }
  }, [])

  useEffect(() => {
    telegramAdapter.init()
    const bootstrap = async () => {
      try {
        await signalApi.authenticate(telegramAdapter.getInitData())
      } catch (error) {
        console.warn('Verified Telegram session unavailable; using local fallback.', error)
      }

      const resolvedChain = await signalApi.resolveChain(startParam)
      setChainId(resolvedChain.chainId)
      setShareToken(resolvedChain.shareToken)
      setInviter(resolvedChain.inviterLabel)
      await refreshSocialState(resolvedChain.chainId)
    }
    void bootstrap()
  }, [refreshSocialState, startParam])

  const start = useCallback(() => {
    telegramAdapter.haptic('tap')
    setCountdown(history.length > 0 ? 1 : 3)
    setScreen('countdown')
    gameStartedAtRef.current = Date.now()
    gameSessionRef.current = null
    void signalApi.startGameSession(chainId)
      .then((gameSession) => { gameSessionRef.current = gameSession })
      .catch((error) => console.warn('Server game session unavailable; result remains local.', error))
  }, [chainId, history.length])

  useEffect(() => {
    if (screen !== 'countdown') return
    if (countdown <= 0) {
      setScreen('game')
      return
    }
    const delay = history.length > 0 ? 420 : 650
    const id = window.setTimeout(() => setCountdown((value) => value - 1), delay)
    return () => window.clearTimeout(id)
  }, [screen, countdown, history.length])

  const finish = useCallback((next: GameResult) => {
    setResult(next)
    const saved = saveResult(next, history, best)
    setHistory(saved.history)
    setBest(saved.best)
    const clientDurationMs = Math.max(0, Date.now() - gameStartedAtRef.current)
    void signalApi.saveResult(gameSessionRef.current, chainId, next, clientDurationMs)
      .then(() => refreshSocialState(chainId))
      .catch((error) => console.warn('Server result persistence failed; local result is preserved.', error))
    telegramAdapter.haptic(next.success ? 'success' : 'error')
    setScreen('result')
  }, [best, chainId, history, refreshSocialState])

  const share = useCallback(() => {
    if (!result) return
    telegramAdapter.shareSignal(result.score, result.accuracy, shareToken)
  }, [result, shareToken])

  return {
    screen, setScreen, countdown, result, best, history, inviter, player,
    chain, activity, start, finish, share,
  }
}
