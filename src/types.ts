export type DataSource = 'mock' | 'database'

export interface TrackRecord {
  id: string
  title: string
  artist: string
  bpm: number | null
  rating: number | null
  camelotKey: string
  rawKey: number | null
  path: string
  playlists: string[]
}

export interface PlaylistInfo {
  id: string
  name: string
  trackIds: string[]
}

export interface TransitionRecord {
  playlistId: string
  playlistName: string
  fromTrackId: string
  toTrackId: string
  fromKey: string
  toKey: string
  fromBpm: number | null
  toBpm: number | null
}

export interface LibraryData {
  source: DataSource
  sourceName: string
  tracks: TrackRecord[]
  playlists: PlaylistInfo[]
  transitions: TransitionRecord[]
}

export interface BpmBand {
  label: string
  min: number
  max: number | null
}

export interface DensityCell {
  id: string
  camelotKey: string
  bandLabel: string
  bandIndex: number
  count: number
  tracks: TrackRecord[]
}

export interface SummaryStats {
  totalTracks: number
  playableTracks: number
  averageBpm: number | null
  averageRating: number | null
  keyCoverage: number
}

export interface TransitionSummary {
  id: string
  label: string
  count: number
  transitions: TransitionRecord[]
}
