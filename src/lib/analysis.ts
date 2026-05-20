import { CAMELOT_KEYS } from './camelot'
import type {
  BpmBand,
  DensityCell,
  SummaryStats,
  TrackRecord,
  TransitionRecord,
  TransitionSummary,
} from '../types'

export const DEFAULT_BPM_BAND_SIZE = 1
export const MIN_BPM_BAND_SIZE = 1
export const MAX_BPM_BAND_SIZE = 15

export function clampBpmBandSize(value: number): number {
  return Math.min(MAX_BPM_BAND_SIZE, Math.max(MIN_BPM_BAND_SIZE, Math.round(value)))
}

export function createBpmBands(
  tracks: TrackRecord[],
  bandSize = DEFAULT_BPM_BAND_SIZE,
): BpmBand[] {
  const normalizedBandSize = clampBpmBandSize(bandSize)
  const bpmValues = tracks
    .map((track) => track.bpm)
    .filter((bpm): bpm is number => bpm !== null && Number.isFinite(bpm))

  if (bpmValues.length === 0) {
    return [
      {
        label: formatBpmBandLabel(0, normalizedBandSize),
        min: 0,
        max: normalizedBandSize,
      },
    ]
  }

  const minimumBpm = Math.floor(Math.min(...bpmValues) / normalizedBandSize) * normalizedBandSize
  const maximumBpm = Math.floor(Math.max(...bpmValues) / normalizedBandSize) * normalizedBandSize

  const bands: BpmBand[] = []
  for (let start = minimumBpm; start <= maximumBpm; start += normalizedBandSize) {
    bands.push({
      label: formatBpmBandLabel(start, normalizedBandSize),
      min: start,
      max: start + normalizedBandSize,
    })
  }

  return bands
}

function formatBpmBandLabel(start: number, bandSize: number): string {
  if (bandSize === 1) {
    return `${start}`
  }

  return `${start}-${start + bandSize - 1}`
}

export function getBpmBandIndex(bpm: number | null, bands: BpmBand[]): number {
  if (bpm === null) {
    return -1
  }

  return bands.findIndex(
    (band) => bpm >= band.min && (band.max === null || bpm < band.max),
  )
}

export function buildDensityCells(tracks: TrackRecord[], bands: BpmBand[]): DensityCell[] {
  return bands.flatMap((band, bandIndex) =>
    CAMELOT_KEYS.map((camelotKey) => {
      const cellTracks = tracks.filter(
        (track) =>
          track.camelotKey === camelotKey && getBpmBandIndex(track.bpm, bands) === bandIndex,
      )

      return {
        id: `${camelotKey}:${band.label}`,
        camelotKey,
        bandLabel: band.label,
        bandIndex,
        count: cellTracks.length,
        tracks: cellTracks,
      }
    }),
  )
}

export function summarizeTracks(tracks: TrackRecord[]): SummaryStats {
  const bpmTracks = tracks.filter((track) => track.bpm !== null)
  const ratingTracks = tracks.filter((track) => track.rating !== null)
  const keyedTracks = new Set(
    tracks.filter((track) => track.camelotKey !== '?').map((track) => track.camelotKey),
  )

  return {
    totalTracks: tracks.length,
    playableTracks: bpmTracks.length,
    averageBpm:
      bpmTracks.length > 0
        ? bpmTracks.reduce((total, track) => total + (track.bpm ?? 0), 0) / bpmTracks.length
        : null,
    averageRating:
      ratingTracks.length > 0
        ? ratingTracks.reduce((total, track) => total + (track.rating ?? 0), 0) /
          ratingTracks.length
        : null,
    keyCoverage: keyedTracks.size,
  }
}

export function summarizeTransitions(
  transitions: TransitionRecord[],
  limit = 8,
): TransitionSummary[] {
  const groups = new Map<string, TransitionSummary>()

  for (const transition of transitions) {
    const label = `${transition.fromKey} → ${transition.toKey}`
    const entry = groups.get(label) ?? {
      id: label,
      label,
      count: 0,
      transitions: [],
    }

    entry.count += 1
    entry.transitions.push(transition)
    groups.set(label, entry)
  }

  return [...groups.values()].sort((left, right) => right.count - left.count).slice(0, limit)
}

export function findSparseCells(cells: DensityCell[], limit = 8): DensityCell[] {
  return cells
    .filter((cell) => cell.count <= 1)
    .sort((left, right) => left.count - right.count || left.id.localeCompare(right.id))
    .slice(0, limit)
}
