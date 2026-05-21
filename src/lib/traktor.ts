import { normalizeCamelotKey } from './camelot'
import type { LibraryData, PlaylistInfo, TrackRecord, TransitionRecord } from '../types'

function getAttribute(element: Element | null, name: string): string | null {
  const value = element?.getAttribute(name)?.trim()
  return value ? value : null
}

function asNumber(value: string | null): number | null {
  if (!value) {
    return null
  }

  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function normalizeTraktorRating(value: string | null): number | null {
  const ranking = asNumber(value)
  if (ranking === null) {
    return null
  }

  return Math.max(0, Math.min(5, ranking / 51))
}

function buildTraktorTrackId(entry: Element, location: Element | null, index: number): string {
  const volume = getAttribute(location, 'VOLUME') ?? ''
  const directory = getAttribute(location, 'DIR')
  const fileName = getAttribute(location, 'FILE')

  if (directory && fileName) {
    return `${volume}${directory}${fileName}`
  }

  return (
    getAttribute(entry, 'AUDIO_ID') ??
    getAttribute(entry, 'TITLE') ??
    `traktor-track-${index}`
  )
}

function normalizeTraktorPath(location: Element | null, fallbackId: string): string {
  const directory = getAttribute(location, 'DIR')
  const fileName = getAttribute(location, 'FILE')
  if (!directory || !fileName) {
    return fallbackId
  }

  const volume = getAttribute(location, 'VOLUME')
  const normalizedDirectory = directory.replaceAll('/:', '/')
  return `${volume ? `${volume}:` : ''}${normalizedDirectory}${fileName}`
}

function getDirectChildren(parent: Element | null, tagName: string): Element[] {
  return parent
    ? Array.from(parent.children).filter((child) => child.tagName === tagName)
    : []
}

function collectPlaylistNodes(
  node: Element,
  trackLookup: Map<string, TrackRecord>,
  parentNames: string[] = [],
): PlaylistInfo[] {
  const nodeName = getAttribute(node, 'NAME')
  const nodeType = getAttribute(node, 'TYPE')
  const nextParentNames =
    nodeName && nodeName !== '$ROOT' && nodeType !== 'PLAYLIST'
      ? [...parentNames, nodeName]
      : parentNames

  if (nodeType === 'PLAYLIST') {
    const playlistElement = getDirectChildren(node, 'PLAYLIST')[0] ?? null
    const playlistName =
      [...parentNames, nodeName ?? 'Playlist'].filter(Boolean).join(' / ') || 'Playlist'
    const trackIds = getDirectChildren(playlistElement, 'ENTRY')
      .map((playlistEntry) =>
        getAttribute(getDirectChildren(playlistEntry, 'PRIMARYKEY')[0] ?? null, 'KEY'),
      )
      .filter((trackId): trackId is string => !!trackId && trackLookup.has(trackId))

    return trackIds.length > 0
      ? [
          {
            id: getAttribute(playlistElement, 'UUID') ?? playlistName,
            name: playlistName,
            trackIds,
          },
        ]
      : []
  }

  return getDirectChildren(getDirectChildren(node, 'SUBNODES')[0] ?? null, 'NODE').flatMap(
    (childNode) => collectPlaylistNodes(childNode, trackLookup, nextParentNames),
  )
}

export async function loadTraktorLibrary(file: File): Promise<LibraryData> {
  const xmlText = await file.text()
  const document = new DOMParser().parseFromString(xmlText, 'application/xml')
  const parserError = document.querySelector('parsererror')
  if (parserError) {
    throw new Error('The selected Traktor collection could not be parsed.')
  }

  const collectionEntries = Array.from(document.querySelectorAll('COLLECTION > ENTRY'))
  if (collectionEntries.length === 0) {
    throw new Error('No Traktor collection entries were found in the selected file.')
  }

  const tracks = collectionEntries.map<TrackRecord>((entry, index) => {
    const location = getDirectChildren(entry, 'LOCATION')[0] ?? null
    const info = getDirectChildren(entry, 'INFO')[0] ?? null
    const tempo = getDirectChildren(entry, 'TEMPO')[0] ?? null
    const trackId = buildTraktorTrackId(entry, location, index)

    return {
      id: trackId,
      title: getAttribute(entry, 'TITLE') ?? 'Untitled track',
      artist: getAttribute(entry, 'ARTIST') ?? 'Unknown artist',
      bpm: asNumber(getAttribute(tempo, 'BPM')),
      rating: normalizeTraktorRating(getAttribute(info, 'RANKING')),
      camelotKey: normalizeCamelotKey(getAttribute(info, 'KEY')),
      rawKey: asNumber(getAttribute(getDirectChildren(entry, 'MUSICAL_KEY')[0] ?? null, 'VALUE')),
      path: normalizeTraktorPath(location, trackId),
      playlists: [],
    }
  })

  const trackLookup = new Map(tracks.map((track) => [track.id, track]))
  const rootNode = document.querySelector('PLAYLISTS > NODE')
  const playlists = (rootNode ? collectPlaylistNodes(rootNode, trackLookup) : [])
    .map((playlist) => ({
      ...playlist,
      trackIds: playlist.trackIds.filter((trackId, index, trackIds) => trackIds.indexOf(trackId) === index),
    }))
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
