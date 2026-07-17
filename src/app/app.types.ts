export type Screen = 'home' | 'countdown' | 'game' | 'result' | 'history'

export type GameResult = {
  score: number
  accuracy: number
  success: boolean
  createdAt: number
}
