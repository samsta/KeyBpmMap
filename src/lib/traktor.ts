import { XMLParser } from 'fast-xml-parser'
import { normalizeCamelotKey } from './camelot'
import type { LibraryData, PlaylistInfo, TrackRecord, TransitionRecord } from '../types'

interface TraktorLocationNode {
  VOLUME?: string
  DIR?: string
  FILE?: string
}

interface TraktorInfoNode {
  KEY?: string
  RANKING?: string
}

interface TraktorTempoNode {
  BPM?: string
}

interface TraktorPrimaryKeyNode {
  KEY?: string
}

interface TraktorPlaylistEntryNode {
  PRIMARYKEY?: TraktorPrimaryKeyNode
}

interface TraktorPlaylistNode {
  UUID?: string
  ENTRY?: TraktorPlaylistEntryNode | TraktorPlaylistEntryNode[]
}

interface TraktorBrowserNode {
  NAME?: string
  TYPE?: string
  SUBNODES?: {
    NODE?: TraktorBrowserNode | TraktorBrowserNode[]
  }
  PLAYLIST?: TraktorPlaylistNode
}

interface TraktorCollectionEntryNode {
  AUDIO_ID?: string
  TITLE?: string
  ARTIST?: string
  LOCATION?: TraktorLocationNode
  INFO?: TraktorInfoNode
  TEMPO?: TraktorTempoNode
  MUSICAL_KEY?: {
    VALUE?: string
  }
}

interface TraktorNmlDocument {
  NML?: {
    COLLECTION?: {
      ENTRY?: TraktorCollectionEntryNode | TraktorCollectionEntryNode[]
    }
    PLAYLISTS?: {
      NODE?: TraktorBrowserNode
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

function normalizeTraktorRating(value: string | undefined): number | null {
  const ranking = asNumber(value)
  if (ranking === null) {
    return null
  }

  return Math.max(0, Math.min(5, Math.round(ranking / 51)))
}

function buildTraktorTrackId(entry: TraktorCollectionEntryNode, index: number): string {
  const volume = asNonEmptyString(entry.LOCATION?.VOLUME) ?? ''
  const directory = asNonEmptyString(entry.LOCATION?.DIR)
  const fileName = asNonEmptyString(entry.LOCATION?.FILE)

  if (directory && fileName) {
    return `${volume}${directory}${fileName}`
  }

  return asNonEmptyString(entry.AUDIO_ID) ?? asNonEmptyString(entry.TITLE) ?? `traktor-track-${index}`
}

function normalizeTraktorPath(entry: TraktorCollectionEntryNode, fallbackId: string): string {
  const directory = asNonEmptyString(entry.LOCATION?.DIR)
  const fileName = asNonEmptyString(entry.LOCATION?.FILE)
  if (!directory || !fileName) {
    return fallbackId
  }

  const volume = asNonEmptyString(entry.LOCATION?.VOLUME)
  const normalizedDirectory = directory.replaceAll('/:', '/')
  return `${volume ? `${volume}:` : ''}${normalizedDirectory}${fileName}`
}

function collectPlaylistNodes(
  node: TraktorBrowserNode,
  trackLookup: Map<string, TrackRecord>,
  parentNames: string[] = [],
): PlaylistInfo[] {
  const nodeName = asNonEmptyString(node.NAME)
  const nodeType = asNonEmptyString(node.TYPE)
  const nextParentNames =
    nodeName && nodeName !== '$ROOT' && nodeType !== 'PLAYLIST'
      ? [...parentNames, nodeName]
      : parentNames

  if (nodeType === 'PLAYLIST') {
    const playlistName = [...parentNames, nodeName ?? 'Playlist'].filter(Boolean).join(' / ')
    const trackIds = asArray(node.PLAYLIST?.ENTRY)
      .map((playlistEntry) => asNonEmptyString(playlistEntry.PRIMARYKEY?.KEY))
      .filter((trackId): trackId is string => !!trackId && trackLookup.has(trackId))

    return trackIds.length > 0
      ? [
          {
            id: asNonEmptyString(node.PLAYLIST?.UUID) ?? playlistName,
            name: playlistName,
            trackIds: trackIds.filter(
              (trackId, index, allTrackIds) => allTrackIds.indexOf(trackId) === index,
            ),
          },
        ]
      : []
  }

  return asArray(node.SUBNODES?.NODE).flatMap((childNode) =>
    collectPlaylistNodes(childNode, trackLookup, nextParentNames),
  )
}

export async function loadTraktorLibrary(file: File): Promise<LibraryData> {
  const xmlText = await file.text()
  const document = xmlParser.parse(xmlText) as TraktorNmlDocument
  const collectionEntries = asArray(document.NML?.COLLECTION?.ENTRY)
  if (collectionEntries.length === 0) {
    throw new Error('No Traktor collection entries were found in the selected file.')
  }

  const tracks = collectionEntries.map<TrackRecord>((entry, index) => {
    const trackId = buildTraktorTrackId(entry, index)

    return {
      id: trackId,
      title: asNonEmptyString(entry.TITLE) ?? 'Untitled track',
      artist: asNonEmptyString(entry.ARTIST) ?? 'Unknown artist',
      bpm: asNumber(entry.TEMPO?.BPM),
      rating: normalizeTraktorRating(entry.INFO?.RANKING),
      camelotKey: normalizeCamelotKey(entry.INFO?.KEY),
      rawKey: asNumber(entry.MUSICAL_KEY?.VALUE),
      path: normalizeTraktorPath(entry, trackId),
      playlists: [],
    }
  })

  const trackLookup = new Map(tracks.map((track) => [track.id, track]))
  const playlists = asArray(document.NML?.PLAYLISTS?.NODE)
    .flatMap((rootNode) => collectPlaylistNodes(rootNode, trackLookup))
    .sort((left, right) => left.name.localeCompare(right.name))

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
