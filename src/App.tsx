import { useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react'
import './App.css'
import HeatmapChart from './components/HeatmapChart'
import PolarDensityChart from './components/PolarDensityChart'
import {
  buildDensityCells,
  clampBpmBandSize,
  createBpmBands,
  DEFAULT_BPM_BAND_SIZE,
  findSparseCells,
  MAX_BPM_BAND_SIZE,
  MIN_BPM_BAND_SIZE,
  summarizeTracks,
} from './lib/analysis'
import { CAMELOT_KEYS, formatKey, type KeyRepresentation } from './lib/camelot'
import { downloadSvgAsPng } from './lib/exportSvg'
import { loadLibraryFromFile } from './lib/libraryLoader'
import { createMockLibrary } from './lib/mockData'
import {
  DEFAULT_PATH_FINDER_SETTINGS,
  clampPathFinderSettings,
  findNavigationPaths,
  type NavigationPath,
  type PathFinderSettings,
  type PathFinderWeights,
} from './lib/pathFinder'
import type { LibraryData, SparseCellSummary, TrackRecord } from './types'

const initialFilters = {
  playlistId: 'all',
  query: '',
  minRating: '0',
  bpmMin: '',
  bpmMax: '',
}

interface OpenFileHandle {
  getFile: () => Promise<File>
}

interface OpenFilePickerConfig {
  id?: string
  multiple?: boolean
  startIn?: 'music'
  types?: Array<{
    description?: string
    accept: Record<string, string[]>
  }>
}

type PolarKeyMode = 'both' | 'A' | 'B'
const POLAR_KEY_MODES = ['both', 'A', 'B'] as const
const KEY_REPRESENTATIONS = ['camelot', 'open-key', 'musical'] as const
const KEY_REPRESENTATION_STORAGE_KEY = 'keybpmmap.keyRepresentation'
const PATH_FINDER_SETTINGS_STORAGE_KEY = 'keybpmmap.pathFinderSettings'
const APP_VERSION = __APP_VERSION__
const PATH_WEIGHT_FIELDS: Array<{ key: keyof PathFinderWeights; label: string }> = [
  { key: 'sameKey', label: 'same key' },
  { key: 'oneUp', label: 'one up' },
  { key: 'oneDown', label: 'one down' },
  { key: 'aToB', label: 'A→B' },
  { key: 'bToA', label: 'B→A' },
  { key: 'energyBoost', label: 'xA→(x+3)B' },
  { key: 'centerJump', label: 'center jump' },
  { key: 'tempoPercent', label: 'tempo per %' },
  { key: 'keyChangeByTempo', label: 'tempo key change' },
]

function App() {
  const [library, setLibrary] = useState<LibraryData>(() => createMockLibrary())
  const [filters, setFilters] = useState(initialFilters)
  const [selectedCellId, setSelectedCellId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [bpmBandSize, setBpmBandSize] = useState(DEFAULT_BPM_BAND_SIZE)
  const [polarKeyMode, setPolarKeyMode] = useState<PolarKeyMode>('both')
  const [keyRepresentation, setKeyRepresentation] = useState<KeyRepresentation>(
    getInitialKeyRepresentation,
  )
  const [pathFinderSettings, setPathFinderSettings] = useState<PathFinderSettings>(
    getInitialPathFinderSettings,
  )
  const [pathSelection, setPathSelection] = useState({
    startTrackId: '',
    endTrackId: '',
  })
  const [selectedPathId, setSelectedPathId] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const polarRef = useRef<SVGSVGElement>(null)
  const heatmapRef = useRef<SVGSVGElement>(null)

  useEffect(() => {
    try {
      window.localStorage.setItem(KEY_REPRESENTATION_STORAGE_KEY, keyRepresentation)
    } catch {
      // Ignore localStorage persistence errors.
    }
  }, [keyRepresentation])

  useEffect(() => {
    try {
      window.localStorage.setItem(
        PATH_FINDER_SETTINGS_STORAGE_KEY,
        JSON.stringify(pathFinderSettings),
      )
    } catch {
      // Ignore localStorage persistence errors.
    }
  }, [pathFinderSettings])

  const playlistLookup = useMemo(
    () => new Map(library.playlists.map((playlist) => [playlist.id, playlist])),
    [library.playlists],
  )

  const filteredTracks = useMemo(() => {
    const playlistTrackIds =
      filters.playlistId === 'all'
        ? null
        : new Set(playlistLookup.get(filters.playlistId)?.trackIds ?? [])
    const query = filters.query.trim().toLowerCase()
    const minRating = Number(filters.minRating) || 0
    const bpmMin = filters.bpmMin === '' ? null : Number(filters.bpmMin)
    const bpmMax = filters.bpmMax === '' ? null : Number(filters.bpmMax)

    return library.tracks.filter((track) => {
      if (playlistTrackIds && !playlistTrackIds.has(track.id)) {
        return false
      }

      if (query) {
        const haystack = `${track.artist} ${track.title} ${track.camelotKey} ${formatKey(track.camelotKey, keyRepresentation)}`.toLowerCase()
        if (!haystack.includes(query)) {
          return false
        }
      }

      if ((track.rating ?? 0) < minRating) {
        return false
      }

      if (bpmMin !== null && (track.bpm === null || track.bpm < bpmMin)) {
        return false
      }

      if (bpmMax !== null && (track.bpm === null || track.bpm > bpmMax)) {
        return false
      }

      return true
    })
  }, [filters, keyRepresentation, library.tracks, playlistLookup])

  const bpmBands = useMemo(
    () => createBpmBands(filteredTracks, bpmBandSize),
    [bpmBandSize, filteredTracks],
  )
  const densityCells = useMemo(
    () => buildDensityCells(filteredTracks, bpmBands),
    [bpmBands, filteredTracks],
  )
  const polarKeys = useMemo(
    () =>
      polarKeyMode === 'both'
        ? CAMELOT_KEYS
        : CAMELOT_KEYS.filter((camelotKey) => camelotKey.endsWith(polarKeyMode)),
    [polarKeyMode],
  )
  const polarKeySet = useMemo(() => new Set(polarKeys), [polarKeys])
  const visibleKeyCells = useMemo(
    () => densityCells.filter((cell) => polarKeySet.has(cell.camelotKey)),
    [densityCells, polarKeySet],
  )
  const selectedCell = useMemo(
    () => densityCells.find((cell) => cell.id === selectedCellId) ?? null,
    [densityCells, selectedCellId],
  )
  const summary = useMemo(() => summarizeTracks(filteredTracks), [filteredTracks])
  const sparseCells = useMemo(() => findSparseCells(densityCells, bpmBands), [bpmBands, densityCells])
  const pathScopeTracks = useMemo(
    () =>
      [...filteredTracks].sort(
        (left, right) =>
          left.artist.localeCompare(right.artist) ||
          left.title.localeCompare(right.title) ||
          left.id.localeCompare(right.id),
      ),
    [filteredTracks],
  )
  const resolvedPathSelection = useMemo(() => {
    const trackIds = pathScopeTracks.map((track) => track.id)
    if (trackIds.length === 0) {
      return { startTrackId: '', endTrackId: '' }
    }

    const trackIdSet = new Set(trackIds)
    const startTrackId = trackIdSet.has(pathSelection.startTrackId)
      ? pathSelection.startTrackId
      : trackIds[0]
    const endCandidates = trackIds.filter((trackId) => trackId !== startTrackId)
    const endTrackId = endCandidates.includes(pathSelection.endTrackId)
      ? pathSelection.endTrackId
      : (endCandidates[0] ?? startTrackId)

    return { startTrackId, endTrackId }
  }, [pathScopeTracks, pathSelection.endTrackId, pathSelection.startTrackId])
  const pathTrackLookup = useMemo(
    () => new Map(pathScopeTracks.map((track) => [track.id, track])),
    [pathScopeTracks],
  )
  const navigationPaths = useMemo(
    () =>
      findNavigationPaths(
        pathScopeTracks,
        resolvedPathSelection.startTrackId,
        resolvedPathSelection.endTrackId,
        pathFinderSettings,
      ),
    [pathFinderSettings, pathScopeTracks, resolvedPathSelection.endTrackId, resolvedPathSelection.startTrackId],
  )
  const selectedPath = useMemo<NavigationPath | null>(
    () =>
      navigationPaths.find((path) => path.id === selectedPathId) ??
      navigationPaths[0] ??
      null,
    [navigationPaths, selectedPathId],
  )
  const pathGraphMaxNodes = useMemo(
    () => Math.max(...navigationPaths.map((path) => path.trackIds.length), 0),
    [navigationPaths],
  )
  const pathGraphWidth = Math.max(460, pathGraphMaxNodes * 150)
  const pathGraphHeight = Math.max(130, navigationPaths.length * 76 + 24)
  const formatVisibleKey = useMemo(
    () => (camelotKey: string) => formatKey(camelotKey, keyRepresentation),
    [keyRepresentation],
  )

  const handleLoadMockData = () => {
    setLibrary(createMockLibrary())
    setSelectedCellId(null)
    setFilters(initialFilters)
    setError(null)
    setPolarKeyMode('both')
  }

  const loadLibraryFile = async (file: File | null) => {
    if (!file) {
      return
    }

    setLoading(true)
    setError(null)

    try {
      const nextLibrary = await loadLibraryFromFile(file)
      setLibrary(nextLibrary)
      setSelectedCellId(null)
      setFilters(initialFilters)
      setPolarKeyMode('both')
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : 'The selected library file could not be parsed.',
      )
    } finally {
      setLoading(false)
    }
  }

  const handleChangeKeyMode = (mode: PolarKeyMode) => {
    setPolarKeyMode(mode)
    setSelectedCellId(null)
  }

  const handlePathWeightChange = (weight: keyof PathFinderWeights, value: string) => {
    const nextValue = Number(value)
    if (!Number.isFinite(nextValue)) {
      return
    }

    setPathFinderSettings((current) =>
      clampPathFinderSettings({
        ...current,
        weights: {
          ...current.weights,
          [weight]: nextValue,
        },
      }),
    )
  }

  const handlePathMaxCostChange = (value: string) => {
    const nextValue = Number(value)
    if (!Number.isFinite(nextValue)) {
      return
    }

    setPathFinderSettings((current) =>
      clampPathFinderSettings({
        ...current,
        maxTotalCost: nextValue,
      }),
    )
  }

  const handleOpenDatabase = async () => {
    const pickerWindow = window as Window & {
      showOpenFilePicker?: (options?: OpenFilePickerConfig) => Promise<OpenFileHandle[]>
    }

    if (pickerWindow.showOpenFilePicker) {
      try {
        const [fileHandle] = await pickerWindow.showOpenFilePicker({
          id: 'engine-dj-database',
          multiple: false,
          types: [
            {
              description: 'Engine DJ, Traktor, or Rekordbox library',
              accept: {
                'application/vnd.sqlite3': ['.db', '.sqlite', '.sqlite3', '.backup'],
                'application/x-sqlite3': ['.db', '.sqlite', '.sqlite3', '.backup'],
                'application/xml': ['.nml', '.xml'],
                'text/xml': ['.xml'],
                'application/octet-stream': ['.db', '.sqlite', '.sqlite3', '.backup'],
              },
            },
          ],
        })
        await loadLibraryFile(await fileHandle.getFile())
        return
      } catch (caughtError) {
        if (caughtError instanceof DOMException && caughtError.name === 'AbortError') {
          return
        }

        console.warn('Falling back to the browser file input.', caughtError)
      }
    }

    fileInputRef.current?.click()
  }

  const handleFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    await loadLibraryFile(event.target.files?.[0] ?? null)
    event.target.value = ''
  }

  const exportChart = async (
    svgElement: SVGSVGElement | null,
    fileName: string,
  ) => {
    if (!svgElement) {
      return
    }

    await downloadSvgAsPng(svgElement, fileName)
  }

  const selectedPlaylistName =
    filters.playlistId === 'all'
      ? 'All playlists'
      : playlistLookup.get(filters.playlistId)?.name ?? 'Selected playlist'

  return (
    <main className="app-shell">
      <section className="hero-panel panel">
        <div>
          <p className="eyebrow">Client-only DJ library map</p>
          <h1>See where your key and BPM density actually lives.</h1>
          <p className="lede">
            Load your library in the browser, inspect harmonic and tempo hotspots,
            and drill into sparse areas — without uploading your files anywhere.
          </p>
          <dl className="platform-instructions">
            <dt>Engine DJ</dt>
            <dd>
              Open the database file directly. It is usually stored at
              {' '}
              <code aria-label="Example macOS Engine DJ database path">
                ~/Music/Engine Library/Database2/m.db
              </code>
              {' '}
              on macOS or
              {' '}
              <code aria-label="Example Windows Engine DJ database path">
                %USERPROFILE%\Music\Engine Library\Database2\m.db
              </code>
              {' '}
              on Windows.
            </dd>

            <dt>Traktor</dt>
            <dd>
              Open your{' '}
              <code>collection.nml</code>
              {' '}
              file. Traktor stores it at
              {' '}
              <code aria-label="Example macOS Traktor collection path">
                ~/Documents/Native Instruments/Traktor 3/collection.nml
              </code>
              {' '}
              on macOS or
              {' '}
              <code aria-label="Example Windows Traktor collection path">
                %USERPROFILE%\Documents\Native Instruments\Traktor 3\collection.nml
              </code>
              {' '}
              on Windows.
            </dd>

            <dt>Rekordbox</dt>
            <dd>
              Export your collection as XML first: open Rekordbox in Export mode, go to
              {' '}
              <strong>File → Export Collection in XML format</strong>
              , save the file (e.g.{' '}
              <code>rekordbox.xml</code>
              ), then open it here.
            </dd>
          </dl>
        </div>

        <div className="hero-actions">
          <button
            type="button"
            className="primary-button"
            onClick={handleOpenDatabase}
            disabled={loading}
          >
            {loading ? 'Loading library…' : 'Load library file'}
          </button>
          <button type="button" className="secondary-button" onClick={handleLoadMockData}>
            Use mock crate
          </button>
          <input
            ref={fileInputRef}
            className="visually-hidden"
            type="file"
            accept=".db,.sqlite,.sqlite3,.backup,.nml,.xml"
            onChange={handleFileChange}
          />
        </div>

        <ul className="hero-notes">
          <li>Reads Engine DJ SQLite files locally with sql.js (WASM).</li>
          <li>Reads Traktor collection.nml files and their backups locally in the browser.</li>
          <li>Reads Rekordbox XML exports locally in the browser.</li>
          <li>Understands Engine DJ, Traktor, and Rekordbox playlist relationships.</li>
          <li>Exports both charts as PNG snapshots for notes or prep docs.</li>
        </ul>
      </section>

      <section className="panel source-panel">
        <div>
          <p className="label">Current source</p>
          <strong>{library.sourceName}</strong>
          <p>{getSourceDescription(library)}</p>
        </div>
        <div>
          <p className="label">Playlist scope</p>
          <strong>{selectedPlaylistName}</strong>
          <p>{library.playlists.length} detected playlists</p>
        </div>
        <div>
          <p className="label">Privacy</p>
          <strong>Browser only</strong>
          <p>No upload path, no remote API, no backend.</p>
        </div>
        <div>
          <p className="label">Version</p>
          <strong>v{APP_VERSION}</strong>
        </div>
      </section>

      {error ? <section className="panel error-banner">{error}</section> : null}

      <section className="panel filters-panel">
        <div className="field-grid">
          <label>
            Key display
            <select
              value={keyRepresentation}
              onChange={(event) => setKeyRepresentation(asKeyRepresentation(event.target.value))}
            >
              {KEY_REPRESENTATIONS.map((representation) => (
                <option key={representation} value={representation}>
                  {formatKeyRepresentationLabel(representation)}
                </option>
              ))}
            </select>
          </label>

          <label>
            Playlist
            <select
              value={filters.playlistId}
              onChange={(event) =>
                setFilters((current) => ({ ...current, playlistId: event.target.value }))
              }
            >
              <option value="all">All playlists</option>
              {library.playlists.map((playlist) => (
                <option key={playlist.id} value={playlist.id}>
                  {playlist.name}
                </option>
              ))}
            </select>
          </label>

          <label>
            Search
            <input
              type="search"
              value={filters.query}
              placeholder="Artist, title, key"
              onChange={(event) =>
                setFilters((current) => ({ ...current, query: event.target.value }))
              }
            />
          </label>

          <label>
            Min rating
            <select
              value={filters.minRating}
              onChange={(event) =>
                setFilters((current) => ({ ...current, minRating: event.target.value }))
              }
            >
              {[0, 1, 2, 3, 4, 5].map((rating) => (
                <option key={rating} value={rating}>
                  {rating === 0 ? 'Any' : `${rating}+`}
                </option>
              ))}
            </select>
          </label>

          <label>
            BPM min
            <input
              type="number"
              inputMode="numeric"
              value={filters.bpmMin}
              placeholder="90"
              onChange={(event) =>
                setFilters((current) => ({ ...current, bpmMin: event.target.value }))
              }
            />
          </label>

          <label>
            BPM max
            <input
              type="number"
              inputMode="numeric"
              value={filters.bpmMax}
              placeholder="140"
              onChange={(event) =>
                setFilters((current) => ({ ...current, bpmMax: event.target.value }))
              }
            />
          </label>

          <label>
            BPM band size
            <select
              value={bpmBandSize}
              onChange={(event) => {
                setBpmBandSize(clampBpmBandSize(Number(event.target.value)))
                setSelectedCellId(null)
              }}
            >
              {Array.from(
                { length: MAX_BPM_BAND_SIZE - MIN_BPM_BAND_SIZE + 1 },
                (_, index) => {
                  const value = MIN_BPM_BAND_SIZE + index
                  return (
                    <option key={value} value={value}>
                      {value} BPM
                    </option>
                  )
                },
              )}
            </select>
          </label>
        </div>
      </section>

      <section className="stats-grid">
        <article className="panel stat-card">
          <span>Tracks in scope</span>
          <strong>{summary.totalTracks}</strong>
          <p>{summary.playableTracks} with BPM analysis</p>
        </article>
        <article className="panel stat-card">
          <span>Average BPM</span>
          <strong>{summary.averageBpm ? summary.averageBpm.toFixed(1) : '—'}</strong>
          <p>
            {bpmBands.length} bands at {bpmBandSize} BPM granularity
          </p>
        </article>
        <article className="panel stat-card">
          <span>Average rating</span>
          <strong>{summary.averageRating ? summary.averageRating.toFixed(1) : '—'}</strong>
          <p>0–5 star normalized scale</p>
        </article>
        <article className="panel stat-card">
          <span>Key coverage</span>
          <strong>{summary.keyCoverage}/24</strong>
          <p>Camelot cells represented</p>
        </article>
      </section>

      <section className="panel pathfinder-panel">
        <div className="chart-header">
          <div>
            <h2>Path finder</h2>
            <p>
              Find weighted routes between two tracks using key transitions, tempo deltas, and optional
              tempo-based key changes.
            </p>
            <p>Showing up to 5 best paths under the configured max total cost.</p>
          </div>
        </div>

        <div className="field-grid">
          <label>
            Start track
            <select
              value={resolvedPathSelection.startTrackId}
              onChange={(event) =>
                setPathSelection((current) => ({ ...current, startTrackId: event.target.value }))
              }
            >
              {pathScopeTracks.map((track) => (
                <option key={`path-start-${track.id}`} value={track.id}>
                  {formatTrackLabel(track)}
                </option>
              ))}
            </select>
          </label>

          <label>
            End track
            <select
              value={resolvedPathSelection.endTrackId}
              onChange={(event) =>
                setPathSelection((current) => ({ ...current, endTrackId: event.target.value }))
              }
            >
              {pathScopeTracks.map((track) => (
                <option key={`path-end-${track.id}`} value={track.id}>
                  {formatTrackLabel(track)}
                </option>
              ))}
            </select>
          </label>

          <label>
            Max total cost
            <input
              type="number"
              step="0.1"
              value={pathFinderSettings.maxTotalCost}
              onChange={(event) => handlePathMaxCostChange(event.target.value)}
            />
          </label>

          <label className="path-checkbox">
            <span>Allow key change by tempo</span>
            <input
              type="checkbox"
              checked={pathFinderSettings.allowKeyChangeByTempo}
              onChange={(event) =>
                setPathFinderSettings((current) => ({
                  ...current,
                  allowKeyChangeByTempo: event.target.checked,
                }))
              }
            />
          </label>
        </div>

        <div className="field-grid path-weight-grid">
          {PATH_WEIGHT_FIELDS.map((field) => (
            <label key={field.key}>
              {field.label}
              <input
                type="number"
                step="0.1"
                value={pathFinderSettings.weights[field.key]}
                onChange={(event) => handlePathWeightChange(field.key, event.target.value)}
              />
            </label>
          ))}
        </div>

        {navigationPaths.length > 0 ? (
          <div className="path-results-grid">
            <div className="path-graph-wrapper">
              <svg
                className="path-graph"
                viewBox={`0 0 ${pathGraphWidth} ${pathGraphHeight}`}
                aria-label="Navigation path graph"
              >
                {navigationPaths.map((path, pathIndex) => {
                  const y = 40 + pathIndex * 70
                  const stepWidth =
                    path.trackIds.length <= 1 ? 0 : (pathGraphWidth - 120) / (path.trackIds.length - 1)
                  const points = path.trackIds
                    .map((_, index) => `${60 + index * stepWidth},${y}`)
                    .join(' ')
                  const isSelected = selectedPath?.id === path.id

                  return (
                    <g
                      key={path.id}
                      className={isSelected ? 'path-graph-row is-selected' : 'path-graph-row'}
                      onClick={() => setSelectedPathId(path.id)}
                    >
                      <polyline points={points} />
                      {path.trackIds.map((trackId, nodeIndex) => (
                        <g key={`${path.id}:${trackId}`}>
                          <circle cx={60 + nodeIndex * stepWidth} cy={y} r={12} />
                          <text
                            x={60 + nodeIndex * stepWidth}
                            y={y + 5}
                            textAnchor="middle"
                            className="path-graph-node-label"
                          >
                            {nodeIndex + 1}
                          </text>
                        </g>
                      ))}
                      <text x={10} y={y + 5} className="path-graph-label">
                        #{pathIndex + 1}
                      </text>
                      <text x={pathGraphWidth - 10} y={y + 5} textAnchor="end" className="path-graph-cost">
                        {path.totalCost.toFixed(2)}
                      </text>
                    </g>
                  )
                })}
              </svg>
            </div>

            <ul className="simple-list path-summary-list">
              {navigationPaths.map((path, pathIndex) => (
                <li key={`summary:${path.id}`}>
                  <button type="button" onClick={() => setSelectedPathId(path.id)}>
                    <strong>Path #{pathIndex + 1}</strong>
                    <span>
                      {path.trackIds.length - 1} transition{path.trackIds.length - 1 === 1 ? '' : 's'}
                    </span>
                    <em>{path.totalCost.toFixed(2)} cost</em>
                  </button>
                </li>
              ))}
            </ul>

            {selectedPath ? (
              <div className="path-details">
                <p className="insight-subtitle">
                  Path total: {selectedPath.totalCost.toFixed(2)} across {selectedPath.steps.length} step
                  {selectedPath.steps.length === 1 ? '' : 's'}
                </p>
                <ul className="track-list">
                  {selectedPath.steps.map((step, index) => {
                    const fromTrack = pathTrackLookup.get(step.fromTrackId)
                    const toTrack = pathTrackLookup.get(step.toTrackId)
                    return (
                      <li key={`${selectedPath.id}:${step.fromTrackId}:${step.toTrackId}:${index}`}>
                        <div className="track-title">
                          <strong>Step {index + 1}</strong>
                          <span>
                            {fromTrack ? formatTrackLabel(fromTrack) : step.fromTrackId} →{' '}
                            {toTrack ? formatTrackLabel(toTrack) : step.toTrackId}
                          </span>
                        </div>
                        <div className="track-meta">
                          <span>{formatPathStepSummary(step, formatVisibleKey)}</span>
                          <span>{step.stepCost.toFixed(2)} cost</span>
                        </div>
                      </li>
                    )
                  })}
                </ul>
              </div>
            ) : null}
          </div>
        ) : (
          <p className="placeholder-text">
            No path found for the selected tracks and max total cost. Increase the max cost or adjust
            weights.
          </p>
        )}
      </section>

      <section className="visual-grid">
        <article className="panel chart-panel">
          <div className="chart-header">
            <div>
              <h2>Polar harmonic density map</h2>
              <p>
                {formatKeyModeDescription(polarKeyMode, keyRepresentation)} wedges outside-in by{' '}
                {bpmBandSize} BPM ring.
              </p>
              <p>Showing {formatKeyRepresentationLabel(keyRepresentation).toLowerCase()} labels.</p>
            </div>
            <div className="chart-actions">
              <div className="segmented-control" role="group" aria-label="Polar key family">
                {POLAR_KEY_MODES.map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    className={mode === polarKeyMode ? 'segment-button is-active' : 'segment-button'}
                    onClick={() => handleChangeKeyMode(mode)}
                  >
                    {formatKeyModeButtonLabel(mode, keyRepresentation)}
                  </button>
                ))}
              </div>
              <button
                type="button"
                className="secondary-button"
                onClick={() => exportChart(polarRef.current, 'keybpmmap-polar.png')}
              >
                Export PNG
              </button>
            </div>
          </div>
          <PolarDensityChart
            ref={polarRef}
            bands={bpmBands}
            cells={visibleKeyCells}
            keys={polarKeys}
            formatKeyLabel={formatVisibleKey}
            selectedCellId={selectedCellId}
            onSelect={setSelectedCellId}
          />
        </article>

        <article className="panel chart-panel">
          <div className="chart-header">
            <div>
              <h2>BPM versus key heatmap</h2>
              <p>
                Quick comparison of dense and empty harmonic/tempo cells for{' '}
                {formatKeyModeDescription(polarKeyMode, keyRepresentation)} keys.
              </p>
              <p>Showing {formatKeyRepresentationLabel(keyRepresentation).toLowerCase()} labels.</p>
            </div>
            <div className="chart-actions">
              <div className="segmented-control" role="group" aria-label="Heatmap key family">
                {POLAR_KEY_MODES.map((mode) => (
                  <button
                    key={`heatmap-${mode}`}
                    type="button"
                    className={mode === polarKeyMode ? 'segment-button is-active' : 'segment-button'}
                    onClick={() => handleChangeKeyMode(mode)}
                  >
                    {formatKeyModeButtonLabel(mode, keyRepresentation)}
                  </button>
                ))}
              </div>
              <button
                type="button"
                className="secondary-button"
                onClick={() => exportChart(heatmapRef.current, 'keybpmmap-heatmap.png')}
              >
                Export PNG
              </button>
            </div>
          </div>
          <HeatmapChart
            ref={heatmapRef}
            bands={bpmBands}
            cells={visibleKeyCells}
            keys={polarKeys}
            formatKeyLabel={formatVisibleKey}
            selectedCellId={selectedCellId}
            onSelect={setSelectedCellId}
          />
        </article>
      </section>

      <section className="insights-grid">
        <article className="panel insight-panel">
          <h2>Selected region</h2>
          {selectedCell ? (
            <>
              <p className="insight-subtitle">
                {formatVisibleKey(selectedCell.camelotKey)} · {selectedCell.bandLabel} · {selectedCell.count} track
                {selectedCell.count === 1 ? '' : 's'}
              </p>
              <ul className="track-list">
                {selectedCell.tracks.length > 0 ? (
                  selectedCell.tracks.map((track) => (
                    <li key={track.id}>
                      <div className="track-title">
                        <strong>{track.artist}</strong>
                        <span>{track.title}</span>
                      </div>
                      <div className="track-meta">
                        <span>{track.bpm ? `${track.bpm.toFixed(1)} BPM` : 'No BPM'}</span>
                        <span>{formatVisibleKey(track.camelotKey)}</span>
                        <span>{formatRating(track)}</span>
                      </div>
                    </li>
                  ))
                ) : (
                  <li>No tracks live in this cell with the current filters.</li>
                )}
              </ul>
            </>
          ) : (
            <p className="placeholder-text">
              Click a polar wedge or heatmap cell to inspect the exact tracks inside it.
            </p>
          )}
        </article>

        <article className="panel insight-panel">
          <h2>Sparse / missing regions</h2>
          {sparseCells.length > 0 ? (
            <ul className="simple-list sparse-list">
              {sparseCells.map((cell) => {
                const status = getSparseCellStatus(cell)
                const regionSummary =
                  cell.cellCount === 1 ? '1 cell' : `${cell.cellCount} cells`

                return (
                  <li key={`${cell.firstCellId}:${cell.id}`}>
                    {cell.cellCount === 1 ? (
                      <button type="button" onClick={() => setSelectedCellId(cell.firstCellId)}>
                        <strong>{formatVisibleKey(cell.camelotKey)}</strong>
                        <span>{cell.bandLabel}</span>
                        <em>{status}</em>
                        <small>{regionSummary}</small>
                      </button>
                    ) : (
                      <div className="sparse-summary">
                        <strong>{formatVisibleKey(cell.camelotKey)}</strong>
                        <span>{cell.bandLabel}</span>
                        <em>{status}</em>
                        <small>{regionSummary}</small>
                      </div>
                    )}
                  </li>
                )
              })}
            </ul>
          ) : (
            <p className="placeholder-text">No sparse or empty regions remain after the current filters.</p>
          )}
        </article>

      </section>
    </main>
  )
}

function formatRating(track: TrackRecord): string {
  if (track.rating === null) {
    return 'No rating'
  }

  return `${track.rating.toFixed(1)}★`
}

function getSourceDescription(library: LibraryData): string {
  if (library.source === 'mock') {
    return 'Demo dataset'
  }

  const name = library.sourceName.toLowerCase()
  if (name.endsWith('.nml')) {
    return 'Local Traktor collection'
  }

  if (name.endsWith('.xml')) {
    return 'Local Rekordbox collection'
  }

  return 'Local Engine DJ database'
}

function getSparseCellStatus(cell: SparseCellSummary): string {
  if (cell.count === 0) {
    return 'empty'
  }

  return cell.cellCount === 1 ? '1 track' : '1 track each'
}

function formatKeyModeButtonLabel(mode: PolarKeyMode, representation: KeyRepresentation): string {
  const minorLabel = getRepresentationMinorLabel(representation)
  const majorLabel = getRepresentationMajorLabel(representation)
  if (mode === 'both') {
    return `${minorLabel} + ${majorLabel}`
  }

  return mode === 'A' ? `${minorLabel} only` : `${majorLabel} only`
}

function formatKeyModeDescription(mode: PolarKeyMode, representation: KeyRepresentation): string {
  const minorLabel = getRepresentationMinorLabel(representation)
  const majorLabel = getRepresentationMajorLabel(representation)
  if (mode === 'both') {
    return `${minorLabel}/${majorLabel}`
  }

  return mode === 'A' ? `${minorLabel}` : `${majorLabel}`
}

function getRepresentationMinorLabel(representation: KeyRepresentation): string {
  switch (representation) {
    case 'open-key':
      return 'm'
    case 'musical':
      return 'min'
    case 'camelot':
    default:
      return 'A'
  }
}

function getRepresentationMajorLabel(representation: KeyRepresentation): string {
  switch (representation) {
    case 'open-key':
      return 'd'
    case 'musical':
      return 'maj'
    case 'camelot':
    default:
      return 'B'
  }
}

function formatKeyRepresentationLabel(representation: KeyRepresentation): string {
  switch (representation) {
    case 'open-key':
      return 'Open Key'
    case 'musical':
      return 'Musical'
    case 'camelot':
    default:
      return 'Camelot'
  }
}

function formatTrackLabel(track: TrackRecord): string {
  return `${track.artist} — ${track.title}`
}

function formatPathStepSummary(
  step: NavigationPath['steps'][number],
  formatVisibleKey: (camelotKey: string) => string,
): string {
  const parts = [
    `${formatVisibleKey(step.fromKey)} ${step.fromBpm.toFixed(1)} → ${formatVisibleKey(step.toKey)} ${step.toBpm.toFixed(1)} BPM`,
    `${formatPathRule(step.keyRule)} (${step.keyCost.toFixed(2)})`,
    `tempo ${step.tempoPercentDelta.toFixed(2)}% (${step.tempoCost.toFixed(2)})`,
  ]

  if (step.adjustment !== 'none') {
    parts.push(`${step.adjustment} (${step.adjustmentCost.toFixed(2)})`)
  }

  return parts.join(' · ')
}

function formatPathRule(rule: keyof PathFinderWeights): string {
  switch (rule) {
    case 'sameKey':
      return 'same key'
    case 'oneUp':
      return 'one up'
    case 'oneDown':
      return 'one down'
    case 'aToB':
      return 'A→B'
    case 'bToA':
      return 'B→A'
    case 'energyBoost':
      return 'xA→(x+3)B'
    case 'centerJump':
      return 'center jump'
    case 'tempoPercent':
      return 'tempo'
    case 'keyChangeByTempo':
      return 'tempo key change'
    default:
      return rule
  }
}

function asKeyRepresentation(value: string): KeyRepresentation {
  return KEY_REPRESENTATIONS.includes(value as KeyRepresentation)
    ? (value as KeyRepresentation)
    : 'camelot'
}

function getInitialKeyRepresentation(): KeyRepresentation {
  if (typeof window === 'undefined') {
    return 'camelot'
  }

  try {
    return asKeyRepresentation(window.localStorage.getItem(KEY_REPRESENTATION_STORAGE_KEY) ?? '')
  } catch {
    return 'camelot'
  }
}

function getInitialPathFinderSettings(): PathFinderSettings {
  if (typeof window === 'undefined') {
    return DEFAULT_PATH_FINDER_SETTINGS
  }

  try {
    const raw = window.localStorage.getItem(PATH_FINDER_SETTINGS_STORAGE_KEY)
    if (!raw) {
      return DEFAULT_PATH_FINDER_SETTINGS
    }

    const parsed = JSON.parse(raw)
    return clampPathFinderSettings({
      ...DEFAULT_PATH_FINDER_SETTINGS,
      ...parsed,
      weights: {
        ...DEFAULT_PATH_FINDER_SETTINGS.weights,
        ...(parsed as { weights?: Partial<PathFinderWeights> }).weights,
      },
    })
  } catch {
    return DEFAULT_PATH_FINDER_SETTINGS
  }
}

export default App
