import { CAMELOT_KEYS } from './camelot'
import type {
  BpmBand,
  DensityCell,
  SummaryStats,
  TrackRecord,
  TransitionRecord,
  TransitionSummary,
} from '../types'

export const BPM_BANDS: BpmBand[] = [
  { label: '<90', min: 0, max: 90 },
  { label: '90-109', min: 90, max: 110 },
  { label: '110-123', min: 110, max: 124 },
  { label: '124-127', min: 124, max: 128 },
  { label: '128-134', min: 128, max: 135 },
  { label: '135+', min: 135, max: null },
]

export function getBpmBandIndex(bpm: number | null): number {
  if (bpm === null) {
    return -1
  }

  return BPM_BANDS.findIndex(
    (band) => bpm >= band.min && (band.max === null || bpm < band.max),
  )
}

export function buildDensityCells(tracks: TrackRecord[]): DensityCell[] {
  return BPM_BANDS.flatMap((band, bandIndex) =>
    CAMELOT_KEYS.map((camelotKey) => {
      const cellTracks = tracks.filter(
        (track) =>
          track.camelotKey === camelotKey && getBpmBandIndex(track.bpm) === bandIndex,
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
