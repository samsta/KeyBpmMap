import initSqlJs from 'sql.js'
import sqlWasmUrl from 'sql.js/dist/sql-wasm.wasm?url'
import { normalizeCamelotKey } from './camelot'
import type { LibraryData, PlaylistInfo, TrackRecord, TransitionRecord } from '../types'

let sqlPromise: ReturnType<typeof initSqlJs> | null = null

type SqlRow = Record<string, string | number | Uint8Array | null>
type SqlDatabase = InstanceType<Awaited<ReturnType<typeof initSqlJs>>['Database']>

interface PlaylistEntity {
  id: string
  playlistId: string
  trackId: string
  nextEntityId: string | null
  sortIndex: number
}

function getSql() {
  sqlPromise ??= initSqlJs({
    locateFile: () => sqlWasmUrl,
  })

  return sqlPromise
}

function readRows(database: SqlDatabase, tableName: string): SqlRow[] {
  const statement = database.prepare(`SELECT * FROM "${tableName.replace(/"/g, '""')}"`)
  const rows: SqlRow[] = []

  while (statement.step()) {
    rows.push(statement.getAsObject())
  }

  statement.free()
  return rows
}

function findTableName(tableNames: string[], target: string): string | null {
  return tableNames.find((name) => name.toLowerCase() === target.toLowerCase()) ?? null
}

function getFirstValue<T>(row: SqlRow, names: string[]): T | null {
  for (const [key, value] of Object.entries(row)) {
    if (names.some((name) => name.toLowerCase() === key.toLowerCase())) {
      return value as T
    }
  }

  return null
}

function asId(value: unknown): string | null {
  if (typeof value === 'string') {
    return value.trim() || null
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value)
  }

  return null
}

function asNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value
  }

  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : null
  }

  return null
}

function normalizeRating(value: unknown): number | null {
  const rating = asNumber(value)
  if (rating === null) {
    return null
  }

  if (rating > 5) {
    return Math.max(0, Math.min(5, rating / 20))
  }

  return Math.max(0, Math.min(5, rating))
}

function orderPlaylistTrackIds(entities: PlaylistEntity[]): string[] {
  if (entities.length === 0) {
    return []
  }

  const byId = new Map(entities.map((entity) => [entity.id, entity]))
  const nextIds = new Set(
    entities
      .map((entity) => entity.nextEntityId)
      .filter((value): value is string => value !== null && byId.has(value)),
  )
  const visited = new Set<string>()
  const ordered: string[] = []
  const heads = entities
    .filter((entity) => !nextIds.has(entity.id))
    .sort((left, right) => left.sortIndex - right.sortIndex)

  const walk = (entity: PlaylistEntity) => {
    let current: PlaylistEntity | undefined = entity

    while (current && !visited.has(current.id)) {
      visited.add(current.id)
      ordered.push(current.trackId)
      current = current.nextEntityId ? byId.get(current.nextEntityId) : undefined
    }
  }

  heads.forEach(walk)
  entities
    .sort((left, right) => left.sortIndex - right.sortIndex)
    .filter((entity) => !visited.has(entity.id))
    .forEach(walk)

  return [...new Set(ordered)]
}

export async function loadEngineDjLibrary(file: File): Promise<LibraryData> {
  const SQL = await getSql()
  const bytes = new Uint8Array(await file.arrayBuffer())
  const database = new SQL.Database(bytes)

  try {
    const tableRows = database.exec(
      "SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name",
    )
    const tableNames = (tableRows[0]?.values ?? []).map((row) => String(row[0]))

    const trackTable = findTableName(tableNames, 'Track')
    if (!trackTable) {
      throw new Error('No Track table was found in the selected SQLite database.')
    }

    const playlistTable = findTableName(tableNames, 'Playlist')
    const playlistEntityTable = findTableName(tableNames, 'PlaylistEntity')

    const trackRows = readRows(database, trackTable)
    const playlistRows = playlistTable ? readRows(database, playlistTable) : []
    const playlistEntityRows = playlistEntityTable ? readRows(database, playlistEntityTable) : []

    const tracks = trackRows
      .map<TrackRecord | null>((row) => {
        const id = asId(getFirstValue(row, ['Id', 'id', 'trackId']))
        if (!id) {
          return null
        }

        const bpm = asNumber(getFirstValue(row, ['bpmAnalyzed', 'bpm', 'BPM']))
        const rawKey = asNumber(getFirstValue(row, ['key', 'keyAnalyzed', 'musicalKey']))

        return {
          id,
          title: asId(getFirstValue(row, ['title', 'name', 'Name'])) ?? 'Untitled track',
          artist:
            asId(getFirstValue(row, ['artist', 'albumArtist', 'Artist', 'AlbumArtist'])) ??
            'Unknown artist',
          bpm,
          rating: normalizeRating(getFirstValue(row, ['rating', 'Rating'])),
          camelotKey: normalizeCamelotKey(getFirstValue(row, ['key', 'keyAnalyzed', 'musicalKey'])),
          rawKey,
          path: asId(getFirstValue(row, ['path', 'location', 'filePath'])) ?? '',
          playlists: [],
        }
      })
      .filter((track): track is TrackRecord => track !== null)

    const trackLookup = new Map(tracks.map((track) => [track.id, track]))

    const playlistEntities = playlistEntityRows
      .map<PlaylistEntity | null>((row, index) => {
        const id = asId(getFirstValue(row, ['Id', 'id', 'entityId']))
        const playlistId = asId(getFirstValue(row, ['listId', 'playlistId', 'PlaylistId']))
        const trackId = asId(getFirstValue(row, ['trackId', 'TrackId']))
        if (!id || !playlistId || !trackId || !trackLookup.has(trackId)) {
          return null
        }

        return {
          id,
          playlistId,
          trackId,
          nextEntityId: asId(getFirstValue(row, ['nextEntityId', 'NextEntityId'])),
          sortIndex: asNumber(getFirstValue(row, ['sortOrder', 'SortOrder', 'position'])) ?? index,
        }
      })
      .filter((entity): entity is PlaylistEntity => entity !== null)

    const playlistMap = new Map<string, PlaylistInfo>()

    for (const row of playlistRows) {
      const id = asId(getFirstValue(row, ['Id', 'id', 'listId']))
      if (!id) {
        continue
      }

      playlistMap.set(id, {
        id,
        name: asId(getFirstValue(row, ['title', 'name', 'Title', 'Name'])) ?? `Playlist ${id}`,
        trackIds: [],
      })
    }

    const entitiesByPlaylist = new Map<string, PlaylistEntity[]>()
    for (const entity of playlistEntities) {
      const group = entitiesByPlaylist.get(entity.playlistId) ?? []
      group.push(entity)
      entitiesByPlaylist.set(entity.playlistId, group)
    }

    for (const [playlistId, entities] of entitiesByPlaylist.entries()) {
      const playlist =
        playlistMap.get(playlistId) ??
        ({
          id: playlistId,
          name: `Playlist ${playlistId}`,
          trackIds: [],
        } satisfies PlaylistInfo)

      const orderedTrackIds = orderPlaylistTrackIds(entities)
      playlist.trackIds = orderedTrackIds
      playlistMap.set(playlistId, playlist)

      for (const trackId of orderedTrackIds) {
        const track = trackLookup.get(trackId)
        if (track && !track.playlists.includes(playlistId)) {
          track.playlists.push(playlistId)
        }
      }
    }

    const playlists = [...playlistMap.values()]
      .filter((playlist) => playlist.trackIds.length > 0)
      .sort((left, right) => left.name.localeCompare(right.name))

    const transitions: TransitionRecord[] = playlists.flatMap((playlist) => {
      return playlist.trackIds.slice(0, -1).flatMap((trackId, index) => {
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
      })
    })

    return {
      source: 'database',
      sourceName: file.name,
      tracks,
      playlists,
      transitions,
    }
  } finally {
    database.close()
  }
}
