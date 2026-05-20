import type { LibraryData, PlaylistInfo, TrackRecord, TransitionRecord } from '../types'

const tracks: TrackRecord[] = [
  {
    id: 't-001',
    title: 'Blue Twilight',
    artist: 'Nori Lane',
    bpm: 122,
    rating: 4,
    camelotKey: '8A',
    rawKey: null,
    path: '/mock/blue-twilight.wav',
    playlists: ['p-1', 'p-2'],
  },
  {
    id: 't-002',
    title: 'Lift Off',
    artist: 'Signal Motel',
    bpm: 124,
    rating: 5,
    camelotKey: '8B',
    rawKey: null,
    path: '/mock/lift-off.wav',
    playlists: ['p-1'],
  },
  {
    id: 't-003',
    title: 'Warehouse Bloom',
    artist: 'Tess Vector',
    bpm: 127,
    rating: 4,
    camelotKey: '9A',
    rawKey: null,
    path: '/mock/warehouse-bloom.wav',
    playlists: ['p-1', 'p-3'],
  },
  {
    id: 't-004',
    title: 'Glass Steps',
    artist: 'Ion Harbour',
    bpm: 128,
    rating: 3,
    camelotKey: '9B',
    rawKey: null,
    path: '/mock/glass-steps.wav',
    playlists: ['p-1', 'p-3'],
  },
  {
    id: 't-005',
    title: 'Afterlight',
    artist: 'Mika Current',
    bpm: 130,
    rating: 5,
    camelotKey: '10A',
    rawKey: null,
    path: '/mock/afterlight.wav',
    playlists: ['p-1'],
  },
  {
    id: 't-006',
    title: 'Velvet Relay',
    artist: 'Ossia Drive',
    bpm: 135,
    rating: 4,
    camelotKey: '10B',
    rawKey: null,
    path: '/mock/velvet-relay.wav',
    playlists: ['p-2'],
  },
  {
    id: 't-007',
    title: 'Neon Tides',
    artist: 'Helix Bloom',
    bpm: 138,
    rating: 2,
    camelotKey: '11A',
    rawKey: null,
    path: '/mock/neon-tides.wav',
    playlists: ['p-2'],
  },
  {
    id: 't-008',
    title: 'Shadowline',
    artist: 'Rae Pacific',
    bpm: 140,
    rating: 4,
    camelotKey: '11B',
    rawKey: null,
    path: '/mock/shadowline.wav',
    playlists: ['p-2'],
  },
  {
    id: 't-009',
    title: 'Circuit Prayer',
    artist: 'Lumen Phase',
    bpm: 110,
    rating: 5,
    camelotKey: '6A',
    rawKey: null,
    path: '/mock/circuit-prayer.wav',
    playlists: ['p-3'],
  },
  {
    id: 't-010',
    title: 'Sunrise Draft',
    artist: 'Adi Quartz',
    bpm: 116,
    rating: 3,
    camelotKey: '7A',
    rawKey: null,
    path: '/mock/sunrise-draft.wav',
    playlists: ['p-3'],
  },
]

const playlists: PlaylistInfo[] = [
  {
    id: 'p-1',
    name: 'Peak-time ladders',
    trackIds: ['t-001', 't-002', 't-003', 't-004', 't-005'],
  },
  {
    id: 'p-2',
    name: 'Late-night pressure',
    trackIds: ['t-001', 't-006', 't-007', 't-008'],
  },
  {
    id: 'p-3',
    name: 'Warm-up bridge',
    trackIds: ['t-009', 't-010', 't-003', 't-004'],
  },
]

const transitions: TransitionRecord[] = playlists.flatMap((playlist) => {
  return playlist.trackIds.slice(0, -1).map((trackId, index) => {
    const fromTrack = tracks.find((track) => track.id === trackId)
    const toTrack = tracks.find((track) => track.id === playlist.trackIds[index + 1])

    if (!fromTrack || !toTrack) {
      throw new Error('Mock playlist references an unknown track.')
    }

    return {
      playlistId: playlist.id,
      playlistName: playlist.name,
      fromTrackId: fromTrack.id,
      toTrackId: toTrack.id,
      fromKey: fromTrack.camelotKey,
      toKey: toTrack.camelotKey,
      fromBpm: fromTrack.bpm,
      toBpm: toTrack.bpm,
    }
  })
})

export function createMockLibrary(): LibraryData {
  return {
    source: 'mock',
    sourceName: 'Mock DJ crate',
    tracks,
    playlists,
    transitions,
  }
}
