import type { GameResult } from '../../app/app.types'

export type ChainContext = {
  chainId: string
  inviterLabel: string
}

export interface SignalApi {
  resolveChain(startParam: string): Promise<ChainContext>
  saveResult(chainId: string, result: GameResult): Promise<void>
}

function createLocalChainId() {
  return crypto.randomUUID?.() ?? Math.random().toString(36).slice(2, 10)
}

export const signalApi: SignalApi = {
  async resolveChain(startParam) {
    if (startParam.startsWith('chain_')) {
      return {
        chainId: startParam.replace('chain_', ''),
        inviterLabel: 'друга',
      }
    }

    return {
      chainId: createLocalChainId(),
      inviterLabel: 'сети',
    }
  },

  async saveResult() {
    // Sprint 2: replace with verified server-side persistence.
  },
}
