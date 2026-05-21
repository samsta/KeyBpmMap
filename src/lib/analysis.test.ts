import { describe, expect, it } from 'vitest'
import { clampBpmBandSize, createBpmBands, getBpmBandIndex } from './analysis'
import type { TrackRecord } from '../types'

const tracks: TrackRecord[] = [
  {
    id: '1',
    title: 'A',
    artist: 'AA',
    bpm: 124,
    rating: null,
    camelotKey: '8A',
    rawKey: null,
    path: '',
    playlists: [],
  },
  {
    id: '2',
    title: 'B',
    artist: 'BB',
    bpm: 127,
    rating: null,
    camelotKey: '8B',
    rawKey: null,
    path: '',
    playlists: [],
  },
]

describe('analysis conversion helpers', () => {
  it('clamps bpm band size into allowed range', () => {
    expect(clampBpmBandSize(-5)).toBe(1)
    expect(clampBpmBandSize(3.7)).toBe(4)
    expect(clampBpmBandSize(99)).toBe(15)
  })

  it('creates bpm bands with range labels for larger band sizes', () => {
    const bands = createBpmBands(tracks, 2)
    expect(bands.map((band) => band.label)).toEqual(['124-125', '126-127'])
  })

  it('returns -1 for tracks without bpm when resolving band index', () => {
    const bands = createBpmBands(tracks, 1)
    expect(getBpmBandIndex(null, bands)).toBe(-1)
  })
})
