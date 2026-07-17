import type { GameResult } from '../../app/app.types'

const BEST_KEY = 'lovi_signal_best'
const HISTORY_KEY = 'lovi_signal_history'
const MAX_HISTORY = 20

export function loadBestScore(): number {
  return Number(localStorage.getItem(BEST_KEY) || 0)
}

export function loadHistory(): GameResult[] {
  try {
    return JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]') as GameResult[]
  } catch {
    return []
  }
}

export function saveResult(result: GameResult, history: GameResult[], best: number) {
  const nextHistory = [result, ...history].slice(0, MAX_HISTORY)
  const nextBest = Math.max(best, result.score)

  localStorage.setItem(HISTORY_KEY, JSON.stringify(nextHistory))
  localStorage.setItem(BEST_KEY, String(nextBest))

  return { history: nextHistory, best: nextBest }
}
