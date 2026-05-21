import { XMLParser } from 'fast-xml-parser'
import { normalizeCamelotKey } from './camelot'
import type { LibraryData, PlaylistInfo, TrackRecord, TransitionRecord } from '../types'

interface RekordboxTrackNode {
  TrackID?: string
  Name?: string
  Artist?: string
  AverageBpm?: string
  Rating?: string
  Tonality?: string
  Location?: string
}

interface RekordboxPlaylistTrackNode {
  Key?: string
}

interface RekordboxPlaylistNode {
  Type?: string
  Name?: string
  Count?: string
  Entries?: string
  NODE?: RekordboxPlaylistNode | RekordboxPlaylistNode[]
  TRACK?: RekordboxPlaylistTrackNode | RekordboxPlaylistTrackNode[]
}

interface RekordboxDocument {
  DJ_PLAYLISTS?: {
    COLLECTION?: {
      TRACK?: RekordboxTrackNode | RekordboxTrackNode[]
    }
    PLAYLISTS?: {
      NODE?: RekordboxPlaylistNode
    }
  }
}

const xmlParser = new XMLParser({
  attributeNamePrefix: '',
  ignoreAttributes: false,
  parseTagValue: false,
  trimValues: true,
})

function asArray<T>(value: T | T[] | null | undefined): T[] {
  if (!value) {
    return []
  }

  return Array.isArray(value) ? value : [value]
}

function asNonEmptyString(value: string | undefined): string | null {
  if (!value) {
    return null
  }

  const trimmed = value.trim()
  return trimmed ? trimmed : null
}

function asNumber(value: string | undefined): number | null {
  const normalizedValue = asNonEmptyString(value)
  if (!normalizedValue) {
    return null
  }

  const parsed = Number(normalizedValue)
  return Number.isFinite(parsed) ? parsed : null
}

function normalizeRekordboxRating(value: string | undefined): number | null {
  const raw = asNumber(value)
  if (raw === null) {
    return null
  }

  // Rekordbox encodes rating as 0, 51, 102, 153, 204, 255
  return Math.max(0, Math.min(5, Math.round(raw / 51)))
}

function normalizeRekordboxPath(location: string | undefined): string {
  if (!location) {
    return ''
  }

  // Strip the "file://localhost" prefix if present
  return location.replace(/^file:\/\/localhost/, '')
}

function collectRekordboxPlaylists(
  node: RekordboxPlaylistNode,
  trackLookup: Map<string, TrackRecord>,
  parentNames: string[] = [],
): PlaylistInfo[] {
  const nodeType = asNonEmptyString(node.Type)
  const nodeName = asNonEmptyString(node.Name)

  // Type "1" is a playlist, Type "0" is a folder/container
  if (nodeType === '1') {
    const playlistName = [...parentNames, nodeName ?? 'Playlist'].filter(Boolean).join(' / ')
    const trackIds = asArray(node.TRACK)
      .map((entry) => asNonEmptyString(entry.Key))
      .filter((trackId): trackId is string => !!trackId && trackLookup.has(trackId))

    return trackIds.length > 0
      ? [
          {
            id: playlistName,
            name: playlistName,
            trackIds: trackIds.filter(
              (trackId, index, all) => all.indexOf(trackId) === index,
            ),
          },
        ]
      : []
  }

  const nextParentNames =
    nodeName && nodeName !== 'ROOT' ? [...parentNames, nodeName] : parentNames

  return asArray(node.NODE).flatMap((childNode) =>
    collectRekordboxPlaylists(childNode, trackLookup, nextParentNames),
  )
}

export async function loadRekordboxLibrary(file: File): Promise<LibraryData> {
  const xmlText = await file.text()
  const document = xmlParser.parse(xmlText) as RekordboxDocument
  const collectionEntries = asArray(document.DJ_PLAYLISTS?.COLLECTION?.TRACK)
  if (collectionEntries.length === 0) {
    throw new Error('No Rekordbox collection entries were found in the selected file.')
  }

  const tracks = collectionEntries.map<TrackRecord>((entry) => {
    const trackId = asNonEmptyString(entry.TrackID) ?? asNonEmptyString(entry.Name) ?? 'unknown'
    const path = normalizeRekordboxPath(asNonEmptyString(entry.Location) ?? undefined)

    return {
      id: trackId,
      title: asNonEmptyString(entry.Name) ?? 'Untitled track',
      artist: asNonEmptyString(entry.Artist) ?? 'Unknown artist',
      bpm: asNumber(entry.AverageBpm),
      rating: normalizeRekordboxRating(entry.Rating),
      camelotKey: normalizeCamelotKey(entry.Tonality),
      rawKey: null,
      path: path || trackId,
      playlists: [],
    }
  })

  const trackLookup = new Map(tracks.map((track) => [track.id, track]))
  const rootNode = document.DJ_PLAYLISTS?.PLAYLISTS?.NODE
  const playlists = rootNode
    ? collectRekordboxPlaylists(rootNode, trackLookup)
        .sort((left, right) => left.name.localeCompare(right.name))
    : []

  for (const playlist of playlists) {
    for (const trackId of playlist.trackIds) {
      const track = trackLookup.get(trackId)
      if (track) {
        track.playlists.push(playlist.id)
      }
    }
  }

  const transitions: TransitionRecord[] = playlists.flatMap((playlist) =>
    playlist.trackIds.slice(0, -1).flatMap((trackId, index) => {
      const fromTrack = trackLookup.get(trackId)
      const toTrack = trackLookup.get(playlist.trackIds[index + 1])
      if (!fromTrack || !toTrack) {
        return []
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
    }),
  )

  return {
    source: 'database',
    sourceName: file.name,
    tracks,
    playlists,
    transitions,
  }
}
