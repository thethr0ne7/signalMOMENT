export type Screen = 'home' | 'countdown' | 'game' | 'result' | 'history'

export type GamePattern = 'ORBIT' | 'ZIGZAG' | 'FAKEOUT'

export type GameResult = {
  score: number
  accuracy: number
  success: boolean
  createdAt: number
  longestStreakMs?: number
  reactionTimeMs?: number
  comboTier?: number
  recoveries?: number
  skillScore?: number
  centerAccuracy?: number
  assistedTimeMs?: number
  graceTimeMs?: number
  averageDistance?: number
  failurePhase?: string
  pattern?: GamePattern
  seed?: number
  interrupted?: boolean
}