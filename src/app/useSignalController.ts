import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { GameResult, Screen } from './app.types'
import { signalApi } from '../shared/api/client'
import type { ActivityEvent, ChainSnapshot, GameSession } from '../shared/api/client'
import { trackProductEvent } from '../shared/analytics/productAnalytics'
import { loadBestScore, loadHistory, saveResult } from '../shared/storage/localResults'
import { telegramAdapter } from '../shared/telegram/telegramAdapter'

function hashSeed(value: string) {
  let hash = 2166136261
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

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
  const [gameSeed, setGameSeed] = useState(hashSeed('local'))
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
    trackProductEvent('app_opened', { inviterPresent: Boolean(startParam) })
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
      setGameSeed(hashSeed(resolvedChain.chainId))
      trackProductEvent('challenge_viewed', {
        chainId: resolvedChain.chainId,
        inviterPresent: Boolean(startParam),
      })
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
    trackProductEvent('game_started', {
      chainId,
      seed: gameSeed,
      attemptNumber: history.length + 1,
      inviterPresent: Boolean(startParam),
    })
    void signalApi.startGameSession(chainId)
      .then((gameSession) => { gameSessionRef.current = gameSession })
      .catch((error) => console.warn('Server game session unavailable; result remains local.', error))
  }, [chainId, gameSeed, history.length, startParam])

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
    if (!next.interrupted) {
      void signalApi.saveResult(gameSessionRef.current, chainId, next, clientDurationMs)
        .then(() => refreshSocialState(chainId))
        .catch((error) => console.warn('Server result persistence failed; local result is preserved.', error))
    }
    trackProductEvent('game_finished', {
      chainId,
      seed: next.seed ?? gameSeed,
      pattern: next.pattern,
      success: next.success,
      interrupted: Boolean(next.interrupted),
      score: next.score,
      skillScore: next.skillScore,
      failurePhase: next.failurePhase,
      assistedTimeMs: next.assistedTimeMs,
    })
    telegramAdapter.haptic(next.success ? 'success' : 'error')
    setScreen('result')
  }, [best, chainId, gameSeed, history, refreshSocialState])

  const share = useCallback(() => {
    if (!result) return
    trackProductEvent('share_clicked', { chainId, score: result.score, seed: result.seed ?? gameSeed })
    telegramAdapter.shareSignal(result.score, result.accuracy, shareToken)
  }, [chainId, gameSeed, result, shareToken])

  return {
    screen, setScreen, countdown, result, best, history, inviter, player,
    chain, activity, gameSeed, start, finish, share,
  }
}