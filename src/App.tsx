import { useMemo, useRef, useState, type ChangeEvent } from 'react'
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
import { CAMELOT_KEYS } from './lib/camelot'
import { downloadSvgAsPng } from './lib/exportSvg'
import { loadLibraryFromFile } from './lib/libraryLoader'
import { createMockLibrary } from './lib/mockData'
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
const APP_VERSION = __APP_VERSION__

function App() {
  const [library, setLibrary] = useState<LibraryData>(() => createMockLibrary())
  const [filters, setFilters] = useState(initialFilters)
  const [selectedCellId, setSelectedCellId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [bpmBandSize, setBpmBandSize] = useState(DEFAULT_BPM_BAND_SIZE)
  const [polarKeyMode, setPolarKeyMode] = useState<PolarKeyMode>('both')
  const fileInputRef = useRef<HTMLInputElement>(null)
  const polarRef = useRef<SVGSVGElement>(null)
  const heatmapRef = useRef<SVGSVGElement>(null)

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
        const haystack = `${track.artist} ${track.title} ${track.camelotKey}`.toLowerCase()
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
  }, [filters, library.tracks, playlistLookup])

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
              <strong>File → Export Collection in xml format</strong>
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

      <section className="visual-grid">
        <article className="panel chart-panel">
          <div className="chart-header">
            <div>
              <h2>Polar harmonic density map</h2>
              <p>
                Camelot {formatKeyModeDescription(polarKeyMode)} wedges outside-in by {bpmBandSize}{' '}
                BPM ring.
              </p>
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
                    {formatKeyModeButtonLabel(mode)}
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
            selectedCellId={selectedCellId}
            onSelect={setSelectedCellId}
          />
        </article>

        <article className="panel chart-panel">
          <div className="chart-header">
            <div>
              <h2>BPM versus key heatmap</h2>
              <p>
                Quick comparison of dense and empty harmonic/tempo cells for Camelot{' '}
                {formatKeyModeDescription(polarKeyMode)} keys.
              </p>
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
                    {formatKeyModeButtonLabel(mode)}
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
                {selectedCell.camelotKey} · {selectedCell.bandLabel} · {selectedCell.count} track
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
                        <span>{track.camelotKey}</span>
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
                        <strong>{cell.camelotKey}</strong>
                        <span>{cell.bandLabel}</span>
                        <em>{status}</em>
                        <small>{regionSummary}</small>
                      </button>
                    ) : (
                      <div className="sparse-summary">
                        <strong>{cell.camelotKey}</strong>
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

function formatKeyModeButtonLabel(mode: PolarKeyMode): string {
  return mode === 'both' ? 'A + B' : `${mode} only`
}

function formatKeyModeDescription(mode: PolarKeyMode): string {
  return mode === 'both' ? 'A/B-side' : `${mode}-side`
}

export default App
