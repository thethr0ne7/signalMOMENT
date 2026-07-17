import type { GameResult } from '../../app/app.types'

export type ChainContext = {
  chainId: string
  shareToken: string
  inviterLabel: string
}

export type GameSession = {
  id: string
  nonce: string
  signature: string
  seed: number
}

export type ChainParticipant = {
  userId: string
  firstName: string
  username: string | null
  depth: number
  bestResult: number | null
  joinedAt: string
  isCurrentUser: boolean
  isInviter: boolean
}

export type ChainResult = {
  userId: string
  firstName: string
  score: number
  accuracy: number
  success: boolean
  createdAt: string
}

export type ChainSnapshot = {
  id: string
  status: 'active' | 'expired' | 'completed'
  participantCount: number
  bestResult: number
  maxDepth: number
  expiresAt: string
  inviter: ChainParticipant | null
  participants: ChainParticipant[]
  results: ChainResult[]
}

export type ActivityEvent = {
  id: number
  eventType: string
  chainId: string | null
  actorName: string
  createdAt: string
  payload: Record<string, unknown>
}

type AuthSession = {
  access_token: string
  expires_at?: number
}

export interface SignalApi {
  authenticate(initData: string): Promise<boolean>
  resolveChain(startParam: string): Promise<ChainContext>
  getChain(chainId: string): Promise<ChainSnapshot | null>
  getActivity(): Promise<ActivityEvent[]>
  startGameSession(chainId: string): Promise<GameSession | null>
  saveResult(session: GameSession | null, chainId: string, result: GameResult, clientDurationMs: number): Promise<void>
}

const apiUrl = import.meta.env.VITE_SIGNAL_API_URL || ''
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || ''
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || ''
const SESSION_KEY = 'signalmoment_session'

let session: AuthSession | null = loadSession()

function loadSession(): AuthSession | null {
  try {
    return JSON.parse(localStorage.getItem(SESSION_KEY) || 'null')
  } catch {
    return null
  }
}

function createLocalChainId() {
  return crypto.randomUUID?.() ?? Math.random().toString(36).slice(2, 10)
}

function inviterToken(startParam: string) {
  return startParam.startsWith('chain_') ? startParam.slice('chain_'.length) : null
}

function hasServerSession() {
  return Boolean(apiUrl && session?.access_token)
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  if (!apiUrl) throw new Error('Signal API is not configured')
  const headers = new Headers(init.headers)
  headers.set('Content-Type', 'application/json')
  if (session?.access_token) headers.set('Authorization', `Bearer ${session.access_token}`)

  const response = await fetch(`${apiUrl}${path}`, { ...init, headers })
  const body = await response.json()
  if (!response.ok) throw new Error(body.error || `Signal API ${response.status}`)
  return body as T
}

async function exchangeToken(tokenHash: string) {
  const response = await fetch(`${supabaseUrl}/auth/v1/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: supabaseAnonKey },
    body: JSON.stringify({ token_hash: tokenHash, type: 'magiclink' }),
  })
  if (!response.ok) throw new Error('Unable to create application session')
  session = await response.json() as AuthSession
  localStorage.setItem(SESSION_KEY, JSON.stringify(session))
}

export const signalApi: SignalApi = {
  async authenticate(initData) {
    if (!apiUrl || !supabaseUrl || !supabaseAnonKey || !initData) return false
    if (session?.access_token && (!session.expires_at || session.expires_at * 1000 > Date.now() + 30_000)) return true
    const auth = await request<{ token_hash: string }>('/auth/telegram', {
      method: 'POST',
      body: JSON.stringify({ initData }),
    })
    await exchangeToken(auth.token_hash)
    return true
  },

  async resolveChain(startParam) {
    const token = inviterToken(startParam)
    if (hasServerSession()) {
      const { chain } = await request<{ chain: { id: string; share_token: string } }>('/chains', {
        method: 'POST',
        body: JSON.stringify({ inviterToken: token }),
      })
      return { chainId: chain.id, shareToken: chain.share_token, inviterLabel: token ? 'друга' : 'сети' }
    }

    const localId = token || createLocalChainId()
    return { chainId: localId, shareToken: localId, inviterLabel: token ? 'друга' : 'сети' }
  },

  async getChain(chainId) {
    if (!hasServerSession()) return null
    const { chain } = await request<{ chain: ChainSnapshot }>(`/chains/${chainId}`)
    return chain
  },

  async getActivity() {
    if (!hasServerSession()) return []
    const { events } = await request<{ events: ActivityEvent[] }>('/users/me/activity')
    return events
  },

  async startGameSession(chainId) {
    if (!hasServerSession()) return null
    const { session: gameSession } = await request<{ session: GameSession }>('/game-sessions', {
      method: 'POST',
      body: JSON.stringify({ chainId }),
    })
    return gameSession
  },

  async saveResult(gameSession, _chainId, result, clientDurationMs) {
    if (!gameSession || !hasServerSession()) return
    await request(`/game-sessions/${gameSession.id}/results`, {
      method: 'POST',
      body: JSON.stringify({
        score: result.score,
        accuracy: result.accuracy,
        success: result.success,
        clientDurationMs,
        nonce: gameSession.nonce,
        signature: gameSession.signature,
      }),
    })
  },
}
