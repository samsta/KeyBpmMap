import type { TrackRecord } from '../types'

const EPSILON = 1e-9
const SPEED_UP_FACTOR = 1.05946
const SLOW_DOWN_FACTOR = 0.9439
const MAX_PATH_RESULTS = 10
const MAX_EXPLORED_STATES = 50_000

export interface PathFinderWeights {
  sameKey: number
  oneUp: number
  oneDown: number
  aToB: number
  bToA: number
  energyBoost: number
  energyDrop: number
  centerJump: number
  tempoPercent: number
  keyChangeByTempo: number
}

export interface PathFinderSettings {
  weights: PathFinderWeights
  allowKeyChangeByTempo: boolean
  maxTotalCost: number
  maxStepCost: number
  maxAverageStepCost: number
}

export interface PathStep {
  fromTrackId: string
  toTrackId: string
  fromKey: string
  toKey: string
  fromBpm: number
  toBpm: number
  keyRule: keyof PathFinderWeights
  keyCost: number
  tempoPercentDelta: number
  tempoCost: number
  adjustment: 'none' | 'speed-up' | 'slow-down'
  adjustmentCost: number
  stepCost: number
}

export interface NavigationPath {
  id: string
  trackIds: string[]
  steps: PathStep[]
  totalCost: number
}

interface ParsedCamelot {
  index: number
  mode: 'A' | 'B'
}

interface TempoAdjustedState {
  key: string
  bpm: number
  adjustment: 'none' | 'speed-up' | 'slow-down'
  adjustmentCost: number
}

interface CandidateState {
  trackIds: string[]
  steps: PathStep[]
  totalCost: number
}

class MinCostQueue {
  private readonly data: CandidateState[] = []

  get size(): number {
    return this.data.length
  }

  push(value: CandidateState): void {
    this.data.push(value)
    this.bubbleUp(this.data.length - 1)
  }

  pop(): CandidateState | undefined {
    if (this.data.length === 0) {
      return undefined
    }

    const top = this.data[0]
    const tail = this.data.pop()
    if (this.data.length > 0 && tail) {
      this.data[0] = tail
      this.bubbleDown(0)
    }

    return top
  }

  private bubbleUp(index: number): void {
    let currentIndex = index
    while (currentIndex > 0) {
      const parentIndex = Math.floor((currentIndex - 1) / 2)
      if (this.data[parentIndex].totalCost <= this.data[currentIndex].totalCost) {
        break
      }

      ;[this.data[parentIndex], this.data[currentIndex]] = [this.data[currentIndex], this.data[parentIndex]]
      currentIndex = parentIndex
    }
  }

  private bubbleDown(index: number): void {
    let currentIndex = index

    while (true) {
      const leftIndex = currentIndex * 2 + 1
      const rightIndex = currentIndex * 2 + 2
      let nextIndex = currentIndex

      if (
        leftIndex < this.data.length &&
        this.data[leftIndex].totalCost < this.data[nextIndex].totalCost
      ) {
        nextIndex = leftIndex
      }

      if (
        rightIndex < this.data.length &&
        this.data[rightIndex].totalCost < this.data[nextIndex].totalCost
      ) {
        nextIndex = rightIndex
      }

      if (nextIndex === currentIndex) {
        break
      }

      ;[this.data[currentIndex], this.data[nextIndex]] = [this.data[nextIndex], this.data[currentIndex]]
      currentIndex = nextIndex
    }
  }
}

export const DEFAULT_PATH_FINDER_WEIGHTS: PathFinderWeights = {
  sameKey: 0,
  oneUp: 1,
  oneDown: 1,
  aToB: 2,
  bToA: 2,
  energyBoost: 1,
  energyDrop: 1,
  centerJump: 4,
  tempoPercent: 1,
  keyChangeByTempo: 3,
}

export const DEFAULT_PATH_FINDER_SETTINGS: PathFinderSettings = {
  weights: DEFAULT_PATH_FINDER_WEIGHTS,
  allowKeyChangeByTempo: false,
  maxTotalCost: 10,
  maxStepCost: 4,
  maxAverageStepCost: 3,
}

export function clampPathFinderSettings(value: PathFinderSettings): PathFinderSettings {
  return {
    weights: {
      sameKey: clampWeight(value.weights.sameKey),
      oneUp: clampWeight(value.weights.oneUp),
      oneDown: clampWeight(value.weights.oneDown),
      aToB: clampWeight(value.weights.aToB),
      bToA: clampWeight(value.weights.bToA),
      energyBoost: clampWeight(value.weights.energyBoost),
      energyDrop: clampWeight(value.weights.energyDrop),
      centerJump: clampWeight(value.weights.centerJump),
      tempoPercent: clampWeight(value.weights.tempoPercent),
      keyChangeByTempo: clampWeight(value.weights.keyChangeByTempo),
    },
    allowKeyChangeByTempo: Boolean(value.allowKeyChangeByTempo),
    maxTotalCost: clampWeight(value.maxTotalCost),
    maxStepCost: clampWeight(value.maxStepCost),
    maxAverageStepCost: clampWeight(value.maxAverageStepCost),
  }
}

export function findNavigationPaths(
  tracks: TrackRecord[],
  startTrackId: string,
  endTrackId: string,
  rawSettings: PathFinderSettings,
): NavigationPath[] {
  if (!startTrackId || !endTrackId || startTrackId === endTrackId) {
    return []
  }

  const settings = clampPathFinderSettings(rawSettings)
  if (settings.maxTotalCost <= 0) {
    return []
  }

  const trackById = new Map(tracks.map((track) => [track.id, track]))
  const startTrack = trackById.get(startTrackId)
  const endTrack = trackById.get(endTrackId)

  if (!startTrack || !endTrack || startTrack.bpm === null || endTrack.bpm === null) {
    return []
  }

  const queue = new MinCostQueue()
  queue.push({
    trackIds: [startTrack.id],
    steps: [],
    totalCost: 0,
  })
  const results: NavigationPath[] = []
  const bestArrivalCosts = new Map<string, number[]>()
  let exploredStates = 0

  while (queue.size > 0) {
    const current = queue.pop()

    if (!current) {
      break
    }

    exploredStates += 1
    if (exploredStates > MAX_EXPLORED_STATES) {
      break
    }

    const currentTrackId = current.trackIds.at(-1)
    if (!currentTrackId) {
      continue
    }

    if (currentTrackId === endTrackId && current.steps.length > 0) {
      const averageCost = current.totalCost / current.steps.length
      if (averageCost - settings.maxAverageStepCost > EPSILON) {
        continue
      }

      results.push({
        id: createNavigationPathId(current.trackIds, current.steps),
        trackIds: current.trackIds,
        steps: current.steps,
        totalCost: current.totalCost,
      })

      if (results.length >= MAX_PATH_RESULTS) {
        break
      }
      continue
    }

    if (current.totalCost + EPSILON >= settings.maxTotalCost) {
      continue
    }

    const currentTrack = trackById.get(currentTrackId)
    if (!currentTrack || currentTrack.bpm === null) {
      continue
    }

    const candidateStates = getTempoAdjustedStates(currentTrack, settings)

    for (const nextTrack of tracks) {
      if (nextTrack.id === currentTrack.id || nextTrack.bpm === null || current.trackIds.includes(nextTrack.id)) {
        continue
      }

      for (const tempoAdjustedState of candidateStates) {
        const transition = scoreTransition(tempoAdjustedState, nextTrack, settings.weights)
        if (!transition) {
          continue
        }

        if (transition.stepCost - settings.maxStepCost > EPSILON) {
          continue
        }

        const totalCost = current.totalCost + transition.stepCost
        if (totalCost - settings.maxTotalCost > EPSILON) {
          continue
        }

        if (!allowTrackArrival(bestArrivalCosts, nextTrack.id, totalCost)) {
          continue
        }

        queue.push({
          trackIds: [...current.trackIds, nextTrack.id],
          steps: [...current.steps, {
            fromTrackId: currentTrack.id,
            toTrackId: nextTrack.id,
            ...transition,
          }],
          totalCost,
        })
      }
    }
  }

  return results
    .sort((left, right) => left.totalCost - right.totalCost || left.steps.length - right.steps.length)
    .slice(0, MAX_PATH_RESULTS)
}

function scoreTransition(
  fromState: TempoAdjustedState,
  toTrack: TrackRecord,
  weights: PathFinderWeights,
): Omit<PathStep, 'fromTrackId' | 'toTrackId'> | null {
  const keyTransition = getKeyTransitionCost(fromState.key, toTrack.camelotKey, weights)
  if (!keyTransition) {
    return null
  }

  if (toTrack.bpm === null || fromState.bpm <= 0 || toTrack.bpm <= 0) {
    return null
  }

  const tempoPercentDelta = Math.abs((toTrack.bpm - fromState.bpm) / fromState.bpm) * 100
  const tempoCost = tempoPercentDelta * weights.tempoPercent
  const stepCost = fromState.adjustmentCost + keyTransition.cost + tempoCost

  return {
    fromKey: fromState.key,
    toKey: toTrack.camelotKey,
    fromBpm: fromState.bpm,
    toBpm: toTrack.bpm,
    keyRule: keyTransition.rule,
    keyCost: keyTransition.cost,
    tempoPercentDelta,
    tempoCost,
    adjustment: fromState.adjustment,
    adjustmentCost: fromState.adjustmentCost,
    stepCost,
  }
}

function getTempoAdjustedStates(track: TrackRecord, settings: PathFinderSettings): TempoAdjustedState[] {
  if (track.bpm === null) {
    return []
  }

  const states: TempoAdjustedState[] = [
    {
      key: track.camelotKey,
      bpm: track.bpm,
      adjustment: 'none',
      adjustmentCost: 0,
    },
  ]

  if (!settings.allowKeyChangeByTempo) {
    return states
  }

  const speedUpKey = shiftCamelotKey(track.camelotKey, -5)
  const slowDownKey = shiftCamelotKey(track.camelotKey, 5)

  if (speedUpKey) {
    states.push({
      key: speedUpKey,
      bpm: track.bpm * SPEED_UP_FACTOR,
      adjustment: 'speed-up',
      adjustmentCost: settings.weights.keyChangeByTempo,
    })
  }

  if (slowDownKey) {
    states.push({
      key: slowDownKey,
      bpm: track.bpm * SLOW_DOWN_FACTOR,
      adjustment: 'slow-down',
      adjustmentCost: settings.weights.keyChangeByTempo,
    })
  }

  return states
}

function getKeyTransitionCost(
  fromCamelot: string,
  toCamelot: string,
  weights: PathFinderWeights,
): { rule: keyof PathFinderWeights; cost: number } | null {
  const from = parseCamelotKey(fromCamelot)
  const to = parseCamelotKey(toCamelot)

  if (!from || !to) {
    return null
  }

  if (from.index === to.index && from.mode === to.mode) {
    return { rule: 'sameKey', cost: weights.sameKey }
  }

  const upOffset = (to.index - from.index + 12) % 12

  if (from.mode === to.mode && upOffset === 1) {
    return { rule: 'oneUp', cost: weights.oneUp }
  }

  if (from.mode === to.mode && upOffset === 11) {
    return { rule: 'oneDown', cost: weights.oneDown }
  }

  if (from.index === to.index && from.mode === 'A' && to.mode === 'B') {
    return { rule: 'aToB', cost: weights.aToB }
  }

  if (from.index === to.index && from.mode === 'B' && to.mode === 'A') {
    return { rule: 'bToA', cost: weights.bToA }
  }

  if (from.mode === 'A' && to.mode === 'B' && upOffset === 3) {
    return { rule: 'energyBoost', cost: weights.energyBoost }
  }

  if (from.mode === 'B' && to.mode === 'A' && upOffset === 9) {
    return { rule: 'energyDrop', cost: weights.energyDrop }
  }

  if (from.mode === to.mode && upOffset === 6) {
    return { rule: 'centerJump', cost: weights.centerJump }
  }

  return null
}

function parseCamelotKey(value: string): ParsedCamelot | null {
  const match = value.match(/^(1[0-2]|[1-9])(A|B)$/i)
  if (!match) {
    return null
  }

  return {
    index: Number(match[1]),
    mode: match[2].toUpperCase() as 'A' | 'B',
  }
}

function shiftCamelotKey(value: string, shift: number): string | null {
  const parsed = parseCamelotKey(value)
  if (!parsed) {
    return null
  }

  const shifted = (((parsed.index - 1 + shift) % 12) + 12) % 12
  return `${shifted + 1}${parsed.mode}`
}

function allowTrackArrival(bestArrivalCosts: Map<string, number[]>, trackId: string, cost: number): boolean {
  const current = bestArrivalCosts.get(trackId) ?? []
  const next = [...current, cost].sort((left, right) => left - right).slice(0, MAX_PATH_RESULTS)

  if (!next.some((value) => Math.abs(value - cost) <= EPSILON)) {
    return false
  }

  bestArrivalCosts.set(trackId, next)
  return true
}

function clampWeight(value: number): number {
  if (!Number.isFinite(value)) {
    return 0
  }

  return Math.max(0, value)
}

function createNavigationPathId(trackIds: string[], steps: PathStep[]): string {
  const trackSegment = trackIds.join('→')
  const stepSegment = steps
    .map((step) =>
      [
        step.fromTrackId,
        step.toTrackId,
        step.fromKey,
        step.toKey,
        step.adjustment,
        step.keyRule,
        step.fromBpm.toFixed(6),
        step.toBpm.toFixed(6),
      ].join(':'),
    )
    .join('|')

  return `${trackSegment}::${stepSegment}`
}
