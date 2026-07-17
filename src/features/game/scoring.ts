import type { GameResult } from '../../app/app.types'

export const GAME_SECONDS = 15

export function calculateGameResult(
  elapsedInsideMs: number,
  totalActiveMs: number,
  success: boolean,
  createdAt = Date.now(),
): GameResult {
  const score = Math.min(GAME_SECONDS, Math.max(0, elapsedInsideMs) / 1000)
  const accuracy = totalActiveMs > 0
    ? Math.min(100, Math.max(0, elapsedInsideMs) / totalActiveMs * 100)
    : 0

  return { score, accuracy, success, createdAt }
}
