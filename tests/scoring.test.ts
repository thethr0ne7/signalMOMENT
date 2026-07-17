import { calculateGameResult, GAME_SECONDS } from '../src/features/game/scoring.js'

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message)
}

const perfect = calculateGameResult(15_000, 15_000, true, 1)
assert(perfect.score === GAME_SECONDS, 'score must reach the game limit')
assert(perfect.accuracy === 100, 'perfect tracking must produce 100% accuracy')
assert(perfect.success, 'success flag must be preserved')

const partial = calculateGameResult(5_000, 10_000, false, 2)
assert(partial.score === 5, 'score must be measured in seconds')
assert(partial.accuracy === 50, 'accuracy must compare inside time to active time')
assert(!partial.success, 'failure flag must be preserved')

const capped = calculateGameResult(20_000, 10_000, true, 3)
assert(capped.score === GAME_SECONDS, 'score must be capped at game duration')
assert(capped.accuracy === 100, 'accuracy must be capped at 100%')

console.log('scoring tests passed')
