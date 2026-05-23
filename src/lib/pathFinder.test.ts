import { describe, expect, it } from 'vitest'
import {
  findNavigationPaths,
  findNavigationPathsAsync,
  type PathFinderSettings,
} from './pathFinder'
import type { TrackRecord } from '../types'

const makeTrack = (
  id: string,
  camelotKey: string,
  bpm: number,
): TrackRecord => ({
  id,
  title: id,
  artist: 'artist',
  bpm,
  rating: null,
  camelotKey,
  rawKey: null,
  path: '',
  playlists: [],
})

const TEST_PATH_FINDER_SETTINGS: PathFinderSettings = {
  weights: {
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
  },
  allowKeyChangeByTempo: false,
  maxTotalCost: 10,
  maxStepCost: 4,
  maxAverageStepCost: 3,
}

describe('findNavigationPaths', () => {
  it('returns the lowest-cost path first', () => {
    const tracks: TrackRecord[] = [
      makeTrack('start', '8A', 120),
      makeTrack('end', '8B', 120),
      makeTrack('slow-hop', '8A', 122),
      makeTrack('fast-hop', '8A', 126),
    ]

    const paths = findNavigationPaths(tracks, 'start', 'end', {
      ...TEST_PATH_FINDER_SETTINGS,
      maxTotalCost: 10,
    })

    expect(paths.length).toBeGreaterThan(0)
    expect(paths[0]?.trackIds).toEqual(['start', 'end'])
    expect(paths[0]?.totalCost).toBeCloseTo(2, 6)
  })

  it('caps results to 10 best paths and honors maxTotalCost', () => {
    const tracks: TrackRecord[] = [
      makeTrack('start', '8A', 120),
      makeTrack('end', '8B', 120),
      makeTrack('mid-1', '8A', 121),
      makeTrack('mid-2', '8A', 122),
      makeTrack('mid-3', '8A', 123),
      makeTrack('mid-4', '8A', 124),
      makeTrack('mid-5', '8A', 125),
      makeTrack('mid-6', '8A', 126),
    ]

    const allPaths = findNavigationPaths(tracks, 'start', 'end', {
      ...TEST_PATH_FINDER_SETTINGS,
      maxTotalCost: 100,
    })
    expect(allPaths).toHaveLength(10)

    const tightPaths = findNavigationPaths(tracks, 'start', 'end', {
      ...TEST_PATH_FINDER_SETTINGS,
      maxTotalCost: 2.1,
    })
    expect(tightPaths).toHaveLength(1)
    expect(tightPaths[0]?.trackIds).toEqual(['start', 'end'])
  })

  it('supports optional key change by tempo', () => {
    const tracks: TrackRecord[] = [
      makeTrack('start', '8A', 120),
      makeTrack('end', '3A', 127),
    ]

    const disabled = findNavigationPaths(tracks, 'start', 'end', {
      ...TEST_PATH_FINDER_SETTINGS,
      allowKeyChangeByTempo: false,
      maxTotalCost: 10,
    })
    expect(disabled).toEqual([])

    const enabled = findNavigationPaths(tracks, 'start', 'end', {
      ...TEST_PATH_FINDER_SETTINGS,
      allowKeyChangeByTempo: true,
      maxTotalCost: 10,
      maxAverageStepCost: 10,
    })

    expect(enabled).toHaveLength(1)
    expect(enabled[0]?.steps[0]?.adjustment).toBe('speed-up')
    expect(enabled[0]?.totalCost).toBeGreaterThan(3)
    expect(enabled[0]?.totalCost).toBeLessThan(4)
  })

  it('creates unique ids for paths with the same track sequence but different steps', () => {
    const tracks: TrackRecord[] = [
      makeTrack('start', '8A', 120),
      makeTrack('end', '9A', 126),
    ]

    const paths = findNavigationPaths(tracks, 'start', 'end', {
      ...TEST_PATH_FINDER_SETTINGS,
      allowKeyChangeByTempo: true,
      maxTotalCost: 100,
      maxStepCost: 100,
      maxAverageStepCost: 100,
    })

    expect(paths).toHaveLength(2)
    expect(paths[0]?.trackIds).toEqual(['start', 'end'])
    expect(paths[1]?.trackIds).toEqual(['start', 'end'])
    expect(paths[0]?.id).not.toBe(paths[1]?.id)
  })

  it('supports xB to (x-3)A transitions', () => {
    const tracks: TrackRecord[] = [
      makeTrack('start', '8B', 120),
      makeTrack('end', '5A', 120),
    ]

    const paths = findNavigationPaths(tracks, 'start', 'end', {
      ...TEST_PATH_FINDER_SETTINGS,
      maxTotalCost: 10,
    })

    expect(paths).toHaveLength(1)
    expect(paths[0]?.steps[0]?.keyRule).toBe('energyDrop')
    expect(paths[0]?.totalCost).toBe(1)
  })

  it('enforces max step and average step cost limits', () => {
    const tracks: TrackRecord[] = [
      makeTrack('start', '8A', 120),
      makeTrack('end', '8B', 120),
      makeTrack('mid', '8A', 120),
    ]

    const averageLimitedPaths = findNavigationPaths(tracks, 'start', 'end', {
      ...TEST_PATH_FINDER_SETTINGS,
      maxTotalCost: 10,
      maxAverageStepCost: 1.1,
      maxStepCost: 4,
    })
    expect(averageLimitedPaths).toHaveLength(1)
    expect(averageLimitedPaths[0]?.trackIds).toEqual(['start', 'mid', 'end'])

    const stepLimitedPaths = findNavigationPaths(tracks, 'start', 'end', {
      ...TEST_PATH_FINDER_SETTINGS,
      maxTotalCost: 10,
      maxAverageStepCost: 3,
      maxStepCost: 1.5,
    })
    expect(stepLimitedPaths).toEqual([])
  })

  it('checks max average step cost on the completed path', () => {
    const tracks: TrackRecord[] = [
      makeTrack('start', '8A', 120),
      makeTrack('mid', '8B', 120),
      makeTrack('end', '8B', 120),
    ]

    const paths = findNavigationPaths(tracks, 'start', 'end', {
      ...TEST_PATH_FINDER_SETTINGS,
      maxTotalCost: 10,
      maxStepCost: 4,
      maxAverageStepCost: 1.5,
    })

    expect(paths).toHaveLength(1)
    expect(paths[0]?.trackIds).toEqual(['start', 'mid', 'end'])
    expect(paths[0]?.totalCost).toBe(2)
  })

  it('returns no paths when either endpoint is missing', () => {
    const tracks: TrackRecord[] = [makeTrack('start', '8A', 120)]
    const settings: PathFinderSettings = { ...TEST_PATH_FINDER_SETTINGS }

    expect(findNavigationPaths(tracks, 'start', 'end', settings)).toEqual([])
    expect(findNavigationPaths(tracks, '', 'end', settings)).toEqual([])
  })

  it('matches synchronous search results when run asynchronously', async () => {
    const tracks: TrackRecord[] = [
      makeTrack('start', '8A', 120),
      makeTrack('end', '8B', 120),
      makeTrack('mid-1', '8A', 121),
      makeTrack('mid-2', '8A', 122),
      makeTrack('mid-3', '8A', 123),
    ]
    const settings: PathFinderSettings = {
      ...TEST_PATH_FINDER_SETTINGS,
      maxTotalCost: 20,
      maxStepCost: 8,
      maxAverageStepCost: 8,
    }

    const syncResult = findNavigationPaths(tracks, 'start', 'end', settings)
    const asyncResult = await findNavigationPathsAsync(tracks, 'start', 'end', settings)

    expect(asyncResult).toEqual(syncResult)
  })

  it('reports progress and supports cancellation in async search', async () => {
    const tracks: TrackRecord[] = [
      makeTrack('start', '8A', 120),
      makeTrack('end', '8B', 120),
      ...Array.from({ length: 60 }, (_, index) => makeTrack(`mid-${index}`, `${(index % 12) + 1}A`, 110 + index)),
    ]
    const progressEvents: number[] = []
    const abortController = new AbortController()
    const searchPromise = findNavigationPathsAsync(tracks, 'start', 'end', {
      ...TEST_PATH_FINDER_SETTINGS,
      maxTotalCost: 100,
      maxStepCost: 50,
      maxAverageStepCost: 50,
    }, {
      signal: abortController.signal,
      yieldAfterExpansions: 20,
      onProgress: (progress) => {
        progressEvents.push(progress.exploredStates)
        if (progress.exploredStates > 5) {
          abortController.abort()
        }
      },
    })

    await expect(searchPromise).resolves.toEqual([])
    expect(progressEvents.length).toBeGreaterThan(0)
  })
})
