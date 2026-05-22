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
type PathSortMode = 'total' | 'average' | 'max'
type ScopeTrackSortKey = 'artist' | 'title' | 'bpm' | 'key' | 'inMaps'
type ScopeTrackSortDirection = 'asc' | 'desc'
type SelectedRegionSortKey = 'artist' | 'title' | 'bpm'
type SelectedRegionSortDirection = 'asc' | 'desc'
const POLAR_KEY_MODES = ['both', 'A', 'B'] as const
const PATH_SORT_MODES: Array<{ value: PathSortMode; label: string }> = [
  { value: 'total', label: 'Total Cost' },
  { value: 'average', label: 'Average Transition Cost' },
  { value: 'max', label: 'Max Transition Cost' },
]
const KEY_REPRESENTATIONS = ['camelot', 'open-key', 'musical'] as const
const KEY_REPRESENTATION_STORAGE_KEY = 'keybpmmap.keyRepresentation'
const PATH_FINDER_SETTINGS_STORAGE_KEY = 'keybpmmap.pathFinderSettings'
const APP_VERSION = __APP_VERSION__
const PATH_WEIGHT_FIELDS: Array<{
  key: keyof PathFinderWeights
  label: string
  description: string
  exampleFrom?: string
  exampleTo?: string
  exampleText?: string
}> = [
  { key: 'sameKey', label: 'Same Key', description: 'Keep the same harmonic slot.', exampleFrom: '8A', exampleTo: '8A' },
  { key: 'oneUp', label: 'One Up', description: 'Move clockwise by one on the wheel.', exampleFrom: '5A', exampleTo: '6A' },
  { key: 'oneDown', label: 'One Down', description: 'Move counter-clockwise by one on the wheel.', exampleFrom: '6A', exampleTo: '5A' },
  {
    key: 'aToB',
    label: 'A → B',
    description: 'Jump from the inner ring to the outer ring, or from a minor key to its relative major.',
    exampleFrom: '8A',
    exampleTo: '8B',
  },
  {
    key: 'bToA',
    label: 'B → A',
    description: 'Jump from the outer ring to the inner ring, or from a major key to its relative minor.',
    exampleFrom: '8B',
    exampleTo: '8A',
  },
  { key: 'energyBoost', label: 'xA → (x+3)B', description: 'Minor to major energy lift.', exampleFrom: '5A', exampleTo: '8B' },
  { key: 'energyDrop', label: 'xB → (x-3)A', description: 'Major to minor inverse of the energy lift.', exampleFrom: '8B', exampleTo: '5A' },
  { key: 'centerJump', label: 'Center Jump', description: 'Jump across the wheel center.', exampleFrom: '5A', exampleTo: '11A' },
  {
    key: 'tempoPercent',
    label: 'Tempo Per %',
    description: 'Cost per tempo percent difference.',
    exampleText: 'Example: 120.0 BPM → 121.2 BPM is 1%.',
  },
  {
    key: 'keyChangeByTempo',
    label: 'Tempo Key Change',
    description: 'Cost to shift key by tempo before evaluating transitions.',
    exampleText: 'Example: 8A at 120 BPM +5.946% → 3A at 127.1 BPM.',
  },
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
    startTrack: '',
    endTrack: '',
  })
  const [pathSearchRequest, setPathSearchRequest] = useState<{
    startTrackId: string
    endTrackId: string
    settings: PathFinderSettings
  } | null>(null)
  const [pathSearchStatus, setPathSearchStatus] = useState<string | null>(null)
  const [selectedPathId, setSelectedPathId] = useState<string | null>(null)
  const [pathSortMode, setPathSortMode] = useState<PathSortMode>('total')
  const [scopeTrackSort, setScopeTrackSort] = useState<{
    key: ScopeTrackSortKey
    direction: ScopeTrackSortDirection
  }>({
    key: 'artist',
    direction: 'asc',
  })
  const [selectedRegionSort, setSelectedRegionSort] = useState<{
    key: SelectedRegionSortKey
    direction: SelectedRegionSortDirection
  }>({
    key: 'artist',
    direction: 'asc',
  })
  const [showScopeTrackTable, setShowScopeTrackTable] = useState(false)
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
  const pathTrackOptions = useMemo(
    () =>
      pathScopeTracks.map((track) => ({
        id: track.id,
        label: formatTrackSearchLabel(track, keyRepresentation),
      })),
    [keyRepresentation, pathScopeTracks],
  )
  const pathTrackIdByLabel = useMemo(
    () =>
      new Map(
        pathTrackOptions.map((option) => [option.label.toLowerCase(), option.id]),
      ),
    [pathTrackOptions],
  )
  const pathTrackLabelById = useMemo(
    () => new Map(pathTrackOptions.map((option) => [option.id, option.label])),
    [pathTrackOptions],
  )
  const pathTrackLookup = useMemo(
    () => new Map(pathScopeTracks.map((track) => [track.id, track])),
    [pathScopeTracks],
  )
  const searchedPathSelection = useMemo(() => {
    if (!pathSearchRequest) {
      return null
    }

    if (!pathTrackLookup.has(pathSearchRequest.startTrackId) || !pathTrackLookup.has(pathSearchRequest.endTrackId)) {
      return null
    }

    return pathSearchRequest
  }, [pathSearchRequest, pathTrackLookup])
  const navigationPaths = useMemo(
    () => {
      if (!searchedPathSelection) {
        return []
      }

      return findNavigationPaths(
        pathScopeTracks,
        searchedPathSelection.startTrackId,
        searchedPathSelection.endTrackId,
        searchedPathSelection.settings,
      )
    },
    [pathScopeTracks, searchedPathSelection],
  )
  const sortedNavigationPaths = useMemo(
    () =>
      [...navigationPaths].sort((left, right) => {
        const metricDelta = getPathSortMetric(left, pathSortMode) - getPathSortMetric(right, pathSortMode)
        if (metricDelta !== 0) {
          return metricDelta
        }

        return left.totalCost - right.totalCost || left.steps.length - right.steps.length
      }),
    [navigationPaths, pathSortMode],
  )
  const selectedPath = useMemo<NavigationPath | null>(
    () =>
      sortedNavigationPaths.find((path) => path.id === selectedPathId) ??
      sortedNavigationPaths[0] ??
      null,
    [selectedPathId, sortedNavigationPaths],
  )
  const pathGraphMaxNodes = useMemo(
    () => Math.max(...sortedNavigationPaths.map((path) => path.trackIds.length), 0),
    [sortedNavigationPaths],
  )
  const pathGraphWidth = Math.max(460, pathGraphMaxNodes * 150)
  const pathGraphHeight = Math.max(150, sortedNavigationPaths.length * 92 + 24)
  const formatVisibleKey = useMemo(
    () => (camelotKey: string) => formatKey(camelotKey, keyRepresentation),
    [keyRepresentation],
  )
  const sortedScopeTrackRows = useMemo(() => {
    const compareInMapsRank = (track: TrackRecord) => {
      if (track.bpm !== null && polarKeySet.has(track.camelotKey)) {
        return 0
      }
      if (track.bpm === null) {
        return 2
      }
      return 1
    }

    return [...pathScopeTracks].sort((left, right) => {
      const directionFactor = scopeTrackSort.direction === 'asc' ? 1 : -1
      let comparison = 0

      switch (scopeTrackSort.key) {
        case 'artist':
          comparison = left.artist.localeCompare(right.artist) * directionFactor
          break
        case 'title':
          comparison = left.title.localeCompare(right.title) * directionFactor
          break
        case 'bpm':
          comparison = compareNullableNumber(left.bpm, right.bpm, scopeTrackSort.direction)
          break
        case 'key':
          comparison = compareCamelotKeys(left.camelotKey, right.camelotKey, scopeTrackSort.direction)
          break
        case 'inMaps':
          comparison = (compareInMapsRank(left) - compareInMapsRank(right)) * directionFactor
          break
      }

      if (comparison !== 0) {
        return comparison
      }

      return (
        left.artist.localeCompare(right.artist) ||
        left.title.localeCompare(right.title) ||
        left.id.localeCompare(right.id)
      )
    })
  }, [pathScopeTracks, polarKeySet, scopeTrackSort])

  const handleScopeTrackSort = (key: ScopeTrackSortKey) => {
    setScopeTrackSort((current) =>
      current.key === key
        ? {
            key,
            direction: current.direction === 'asc' ? 'desc' : 'asc',
          }
        : {
            key,
            direction: 'asc',
          },
    )
  }

  const getScopeTrackSortIndicator = (key: ScopeTrackSortKey) => {
    if (scopeTrackSort.key !== key) {
      return '↕'
    }
    return scopeTrackSort.direction === 'asc' ? '↑' : '↓'
  }
  const sortedSelectedRegionTracks = useMemo(() => {
    if (!selectedCell) {
      return []
    }

    return [...selectedCell.tracks].sort((left, right) => {
      const directionFactor = selectedRegionSort.direction === 'asc' ? 1 : -1

      switch (selectedRegionSort.key) {
        case 'artist':
          return (
            left.artist.localeCompare(right.artist) * directionFactor ||
            left.title.localeCompare(right.title) ||
            left.id.localeCompare(right.id)
          )
        case 'title':
          return (
            left.title.localeCompare(right.title) * directionFactor ||
            left.artist.localeCompare(right.artist) ||
            left.id.localeCompare(right.id)
          )
        case 'bpm':
          return (
            compareNullableNumber(left.bpm, right.bpm, selectedRegionSort.direction) ||
            left.artist.localeCompare(right.artist) ||
            left.title.localeCompare(right.title) ||
            left.id.localeCompare(right.id)
          )
      }
    })
  }, [selectedCell, selectedRegionSort])

  const handleSelectedRegionSort = (key: SelectedRegionSortKey) => {
    setSelectedRegionSort((current) =>
      current.key === key
        ? {
            key,
            direction: current.direction === 'asc' ? 'desc' : 'asc',
          }
        : {
            key,
            direction: 'asc',
          },
    )
  }

  const getSelectedRegionSortIndicator = (key: SelectedRegionSortKey) => {
    if (selectedRegionSort.key !== key) {
      return '↕'
    }
    return selectedRegionSort.direction === 'asc' ? '↑' : '↓'
  }

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

  const handlePathMaxStepCostChange = (value: string) => {
    const nextValue = Number(value)
    if (!Number.isFinite(nextValue)) {
      return
    }

    setPathFinderSettings((current) =>
      clampPathFinderSettings({
        ...current,
        maxStepCost: nextValue,
      }),
    )
  }

  const handlePathMaxAverageCostChange = (value: string) => {
    const nextValue = Number(value)
    if (!Number.isFinite(nextValue)) {
      return
    }

    setPathFinderSettings((current) =>
      clampPathFinderSettings({
        ...current,
        maxAverageStepCost: nextValue,
      }),
    )
  }

  const handleSetPathTrack = (target: 'startTrack' | 'endTrack', trackId: string) => {
    if (!pathTrackLabelById.has(trackId)) {
      return
    }

    setPathSelection((current) => ({ ...current, [target]: trackId }))
  }

  const handleFindPath = () => {
    const startTrackId = pathTrackLabelById.has(pathSelection.startTrack)
      ? pathSelection.startTrack
      : resolveTrackId(pathSelection.startTrack, pathTrackIdByLabel, pathTrackLookup)
    const endTrackId = pathTrackLabelById.has(pathSelection.endTrack)
      ? pathSelection.endTrack
      : resolveTrackId(pathSelection.endTrack, pathTrackIdByLabel, pathTrackLookup)

    if (!startTrackId || !endTrackId) {
      setPathSearchStatus('Select valid Start Track and End Track values from the list.')
      setPathSearchRequest(null)
      return
    }

    if (startTrackId === endTrackId) {
      setPathSearchStatus('Start Track and End Track must be different.')
      setPathSearchRequest(null)
      return
    }

    setPathSearchStatus(null)
    setPathSearchRequest({
      startTrackId,
      endTrackId,
      settings: clampPathFinderSettings(pathFinderSettings),
    })
    setSelectedPathId(null)
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
          <li>Exports both charts as PNG snapshots.</li>
        </ul>
        <div className="hero-social-links" aria-label="Skonoks links">
          Find my music and socials:
          <a
            href="https://soundcloud.com/skonoks"
            className="hero-social-link"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Soundcloud"
            title="Soundcloud"
          >
            <img src="social/soundcloud.png" alt="" aria-hidden="true" />
          </a>
          <a
            href="https://skonoks.bandcamp.com/"
            className="hero-social-link"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Bandcamp"
            title="Bandcamp"
          >
            <img src="social/bandcamp.png" alt="" aria-hidden="true" />
          </a>
          <a
            href="https://www.beatport.com/artist/skonoks/1160631"
            className="hero-social-link"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="BeatPort"
            title="BeatPort"
          >
            <img src="social/beatport.png" alt="" aria-hidden="true" />
          </a>
          <a
            href="https://music.apple.com/us/artist/skonoks/1688551885"
            className="hero-social-link"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Apple Music"
            title="Apple Music"
          >
            <img src="social/apple-music.png" alt="" aria-hidden="true" />
          </a>
          <a
            href="https://tidal.com/@skonoks"
            className="hero-social-link"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Tidal"
            title="Tidal"
          >
            <img src="social/tidal.png" alt="" aria-hidden="true" />
          </a>
          <a
            href="https://open.spotify.com/artist/1qCStUUvKfIofiPt236xhP"
            className="hero-social-link"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Spotify"
            title="Spotify"
          >
            <img src="social/spotify.png" alt="" aria-hidden="true" />
          </a>
          <a
            href="https://www.instagram.com/skonoks_/"
            className="hero-social-link"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Instagram"
            title="Instagram"
          >
            <img src="social/instagram.png" alt="" aria-hidden="true" />
          </a>
          <a
            href="https://www.facebook.com/skonoks"
            className="hero-social-link"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Facebook"
            title="Facebook"
          >
            <img src="social/facebook.png" alt="" aria-hidden="true" />
          </a>
        </div>
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

      <section className="panel insight-panel">
        <div className="chart-header">
          <div>
            <h2>Tracks in Scope</h2>
            <p>
              View a list of tracks matching the above filter criteria.
            </p>
          </div>
          <button
            type="button"
            className="secondary-button"
            onClick={() => setShowScopeTrackTable((current) => !current)}
          >
            {showScopeTrackTable ? 'Hide Track Table' : 'Show Track Table'}
          </button>
        </div>
        {showScopeTrackTable ? (
          <div className="scope-track-table-wrapper">
            <table className="scope-track-table">
              <thead>
                <tr>
                  <th>
                    <button
                      type="button"
                      className="scope-track-sort-button"
                      onClick={() => handleScopeTrackSort('artist')}
                    >
                      Artist <span aria-hidden="true">{getScopeTrackSortIndicator('artist')}</span>
                    </button>
                  </th>
                  <th>
                    <button
                      type="button"
                      className="scope-track-sort-button"
                      onClick={() => handleScopeTrackSort('title')}
                    >
                      Title <span aria-hidden="true">{getScopeTrackSortIndicator('title')}</span>
                    </button>
                  </th>
                  <th>
                    <button
                      type="button"
                      className="scope-track-sort-button"
                      onClick={() => handleScopeTrackSort('bpm')}
                    >
                      BPM <span aria-hidden="true">{getScopeTrackSortIndicator('bpm')}</span>
                    </button>
                  </th>
                  <th>
                    <button
                      type="button"
                      className="scope-track-sort-button"
                      onClick={() => handleScopeTrackSort('key')}
                    >
                      Key <span aria-hidden="true">{getScopeTrackSortIndicator('key')}</span>
                    </button>
                  </th>
                  <th>
                    <button
                      type="button"
                      className="scope-track-sort-button"
                      onClick={() => handleScopeTrackSort('inMaps')}
                    >
                      In Maps <span aria-hidden="true">{getScopeTrackSortIndicator('inMaps')}</span>
                    </button>
                  </th>
                  <th>Path Finder</th>
                </tr>
              </thead>
              <tbody>
                {sortedScopeTrackRows.map((track) => {
                  const isInPlots = track.bpm !== null && polarKeySet.has(track.camelotKey)
                  return (
                    <tr key={`scope-track:${track.id}`}>
                      <td>{track.artist}</td>
                      <td>
                        <TrackTitleLink track={track} />
                      </td>
                      <td>{track.bpm === null ? 'No BPM' : track.bpm.toFixed(1)}</td>
                      <td>{formatVisibleKey(track.camelotKey)}</td>
                      <td>
                        {isInPlots
                          ? 'Yes'
                          : (track.bpm === null ? 'No (missing BPM)' : 'No (hidden by key filter)')}
                      </td>
                      <td>
                        <div className="track-actions">
                          <button
                            type="button"
                            className="secondary-button track-action-button"
                            aria-label={`Set ${track.artist} - ${track.title} (${formatVisibleKey(track.camelotKey)}) as start track`}
                            onClick={() => handleSetPathTrack('startTrack', track.id)}
                          >
                            Set as Start Track
                          </button>
                          <button
                            type="button"
                            className="secondary-button track-action-button"
                            aria-label={`Set ${track.artist} - ${track.title} (${formatVisibleKey(track.camelotKey)}) as end track`}
                            onClick={() => handleSetPathTrack('endTrack', track.id)}
                          >
                            Set as End Track
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        ) : null}
      </section>

      <section className="panel pathfinder-panel">
        <div className="chart-header">
          <div>
            <h2>Path Finder</h2>
            <p>
              Set transition costs to guide route quality between tracks.
            </p>
            <p className="path-helper-copy">
              Costs define how expensive each key or tempo move is. Lower values prefer that move. The
              search keeps only the 10 best paths under your path limits and runs only when you click Find
              Path.
            </p>
          </div>
        </div>

        <div className="field-grid">
          <label>
            Start Track
            <input
              type="search"
              list="path-start-track-options"
              value={pathSelection.startTrack}
              placeholder="Type to filter tracks"
              onChange={(event) =>
                setPathSelection((current) => ({ ...current, startTrack: event.target.value }))
              }
            />
          </label>
          <datalist id="path-start-track-options">
            {pathTrackOptions.map((option) => (
              <option key={`path-start-${option.id}`} value={option.label} />
            ))}
          </datalist>

          <label>
            End Track
            <input
              type="search"
              list="path-end-track-options"
              value={pathSelection.endTrack}
              placeholder="Type to filter tracks"
              onChange={(event) =>
                setPathSelection((current) => ({ ...current, endTrack: event.target.value }))
              }
            />
          </label>
          <datalist id="path-end-track-options">
            {pathTrackOptions.map((option) => (
              <option key={`path-end-${option.id}`} value={option.label} />
            ))}
          </datalist>

          <label>
            Max Total Cost
            <input
              type="number"
              step="0.1"
              value={pathFinderSettings.maxTotalCost}
              onChange={(event) => handlePathMaxCostChange(event.target.value)}
            />
          </label>
          <label>
            Max Transition Cost
            <input
              type="number"
              step="0.1"
              value={pathFinderSettings.maxStepCost}
              onChange={(event) => handlePathMaxStepCostChange(event.target.value)}
            />
          </label>
          <label>
            Max Average Cost
            <input
              type="number"
              step="0.1"
              value={pathFinderSettings.maxAverageStepCost}
              onChange={(event) => handlePathMaxAverageCostChange(event.target.value)}
            />
          </label>
          <label>
            Sort Paths By
            <select value={pathSortMode} onChange={(event) => setPathSortMode(asPathSortMode(event.target.value))}>
              {PATH_SORT_MODES.map((mode) => (
                <option key={mode.value} value={mode.value}>
                  {mode.label}
                </option>
              ))}
            </select>
          </label>

          <label className="path-checkbox">
            <span>Allow Key Change by Tempo</span>
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
        <div className="path-actions">
          <button type="button" className="primary-button" onClick={handleFindPath}>
            Find Path
          </button>
          {pathSearchStatus ? <p className="path-status">{pathSearchStatus}</p> : null}
        </div>

        <h4 className="path-section-heading">Transition costs</h4>
        <div className="field-grid path-weight-grid">
          {PATH_WEIGHT_FIELDS.map((field) => {
            const helpText = `${field.description}${
              field.exampleFrom && field.exampleTo
                ? ` Example: ${formatVisibleKey(field.exampleFrom)} → ${formatVisibleKey(field.exampleTo)}.`
                : ` ${field.exampleText ?? ''}`
            }`

            return (
              <label key={field.key}>
                <span className="path-weight-label-row">
                  <span className="path-weight-label-text">
                    {formatWeightLabel(field.key, field.label, keyRepresentation)}
                  </span>
                  <span
                    className="path-weight-tooltip"
                    title={helpText}
                    aria-label={helpText}
                    tabIndex={0}
                  >
                    ⓘ
                  </span>
                </span>
                <input
                  type="number"
                  step="0.1"
                  value={pathFinderSettings.weights[field.key]}
                  onChange={(event) => handlePathWeightChange(field.key, event.target.value)}
                />
              </label>
            )
          })}
        </div>

        {searchedPathSelection ? (
          sortedNavigationPaths.length > 0 ? (
          <div className="path-results-grid">
            <div className="path-graph-wrapper">
              <svg
                className="path-graph"
                viewBox={`0 0 ${pathGraphWidth} ${pathGraphHeight}`}
                aria-label="Navigation path graph"
              >
                {sortedNavigationPaths.map((path, pathIndex) => {
                  const y = 38 + pathIndex * 92
                  const stepWidth =
                    path.trackIds.length <= 1 ? 0 : (pathGraphWidth - 120) / (path.trackIds.length - 1)
                  const points = path.trackIds
                    .map((_, index) => `${60 + index * stepWidth},${y}`)
                    .join(' ')
                  const isSelected = selectedPath?.id === path.id
                  const pathAriaLabel = `Select navigation path ${pathIndex + 1}. Total cost ${path.totalCost.toFixed(2)}. Average cost ${getPathAverageCost(path).toFixed(2)}. Maximum transition cost ${getPathMaxStepCost(path).toFixed(2)}.`

                  return (
                    <g
                      key={path.id}
                      className={isSelected ? 'path-graph-row is-selected' : 'path-graph-row'}
                      role="button"
                      tabIndex={0}
                      focusable="true"
                      aria-label={pathAriaLabel}
                      aria-pressed={isSelected}
                      onClick={() => setSelectedPathId(path.id)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault()
                          setSelectedPathId(path.id)
                        }
                      }}
                    >
                      <polyline points={points} />
                      {path.trackIds.map((trackId, nodeIndex) => {
                        const track = pathTrackLookup.get(trackId)
                        const x = 60 + nodeIndex * stepWidth

                        return (
                        <g key={`${path.id}:${nodeIndex}`}>
                          {track ? (
                            <title>
                              {track.artist} - {track.title} (Node {nodeIndex + 1}, Key:{' '}
                              {formatVisibleKey(track.camelotKey)})
                            </title>
                          ) : null}
                          <circle cx={x} cy={y} r={12} />
                          <text
                            x={x}
                            y={y + 5}
                            textAnchor="middle"
                            className="path-graph-node-label"
                          >
                            {nodeIndex + 1}
                          </text>
                          {track ? (
                            <text
                              x={x}
                              y={y + 26}
                              textAnchor="middle"
                              className="path-graph-track-label"
                            >
                              <tspan x={x} dy="0" className="path-graph-track-artist">{track.artist}</tspan>
                              <tspan x={x} dy="1.1em">{track.title}</tspan>
                            </text>
                          ) : null}
                        </g>
                        )
                      })}
                      <text x={10} y={y + 5} className="path-graph-label">
                        #{pathIndex + 1}
                      </text>
                      <text x={pathGraphWidth - 10} y={y - 20} textAnchor="end" className="path-graph-cost">
                        Tot {path.totalCost.toFixed(2)} · Avg {getPathAverageCost(path).toFixed(2)} · Max{' '}
                        {getPathMaxStepCost(path).toFixed(2)}
                      </text>
                    </g>
                  )
                })}
              </svg>
            </div>

            <ul className="simple-list path-summary-list">
              {sortedNavigationPaths.map((path, pathIndex) => (
                <li key={`summary:${path.id}`}>
                  <button type="button" onClick={() => setSelectedPathId(path.id)}>
                    <strong>Path #{pathIndex + 1}</strong>
                    <span>
                      {path.trackIds.length - 1} transition{path.trackIds.length - 1 === 1 ? '' : 's'}
                    </span>
                    <em>
                      Total {path.totalCost.toFixed(2)} · Avg {getPathAverageCost(path).toFixed(2)} · Max{' '}
                      {getPathMaxStepCost(path).toFixed(2)}
                    </em>
                  </button>
                </li>
              ))}
            </ul>

            {selectedPath ? (
              <div className="path-details">
                <p className="insight-subtitle">
                  Path total: {selectedPath.totalCost.toFixed(2)} across {selectedPath.steps.length} transition
                  {selectedPath.steps.length === 1 ? '' : 's'}
                </p>
                <p className="insight-subtitle">
                  Path avg/max transition cost: {getPathAverageCost(selectedPath).toFixed(2)} /{' '}
                  {getPathMaxStepCost(selectedPath).toFixed(2)}
                </p>
                <ul className="track-list">
                  {selectedPath.steps.map((step, index) => {
                    const fromTrack = pathTrackLookup.get(step.fromTrackId)
                    const toTrack = pathTrackLookup.get(step.toTrackId)
                    return (
                      <li key={`${selectedPath.id}:${step.fromTrackId}:${step.toTrackId}:${index}`}>
                        <div className="track-title">
                          <strong>Transition {index + 1}</strong>
                          <span>
                            {fromTrack ? <TrackLabelWithLinkedTitle track={fromTrack} /> : step.fromTrackId}{' '}
                            → {toTrack ? <TrackLabelWithLinkedTitle track={toTrack} /> : step.toTrackId}
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
            No path found for the selected tracks and max total cost. Increase Max Total Cost or adjust
            costs, then click Find Path again.
          </p>
          )
        ) : (
          <p className="placeholder-text">Pick Start Track and End Track, then click Find Path.</p>
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
              <div className="selected-region-sort-controls" role="group" aria-label="Sort selected region tracks">
               Sort By
                <button
                  type="button"
                  className="selected-region-sort-button"
                  onClick={() => handleSelectedRegionSort('artist')}
                >
                  Artist <span aria-hidden="true">{getSelectedRegionSortIndicator('artist')}</span>
                </button>
                <button
                  type="button"
                  className="selected-region-sort-button"
                  onClick={() => handleSelectedRegionSort('title')}
                >
                  Track <span aria-hidden="true">{getSelectedRegionSortIndicator('title')}</span>
                </button>
                <button
                  type="button"
                  className="selected-region-sort-button"
                  onClick={() => handleSelectedRegionSort('bpm')}
                >
                  BPM <span aria-hidden="true">{getSelectedRegionSortIndicator('bpm')}</span>
                </button>
              </div>
              <ul className="track-list">
                {sortedSelectedRegionTracks.length > 0 ? (
                  sortedSelectedRegionTracks.map((track) => (
                    <li key={track.id}>
                      <div className="track-title">
                        <strong>{track.artist}</strong>
                        <span>
                          <TrackTitleLink track={track} />
                        </span>
                      </div>
                      <div className="track-meta">
                        <span>{track.bpm === null ? 'No BPM' : `${track.bpm.toFixed(1)} BPM`}</span>
                        <span>{formatVisibleKey(track.camelotKey)}</span>
                        <span>{formatRating(track)}</span>
                      </div>
                      <div className="track-actions">
                        <button
                          type="button"
                          className="secondary-button track-action-button"
                          onClick={() => handleSetPathTrack('startTrack', track.id)}
                        >
                          Set as Start Track
                        </button>
                        <button
                          type="button"
                          className="secondary-button track-action-button"
                          onClick={() => handleSetPathTrack('endTrack', track.id)}
                        >
                          Set as End Track
                        </button>
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

function compareNullableNumber(
  leftValue: number | null,
  rightValue: number | null,
  direction: 'asc' | 'desc',
): number {
  if (leftValue === rightValue) {
    return 0
  }
  if (leftValue === null) {
    return 1
  }
  if (rightValue === null) {
    return -1
  }

  return direction === 'asc' ? leftValue - rightValue : rightValue - leftValue
}

function compareCamelotKeys(
  leftValue: string,
  rightValue: string,
  direction: 'asc' | 'desc',
): number {
  const leftMatch = leftValue.match(/^(1[0-2]|[1-9])(A|B)$/)
  const rightMatch = rightValue.match(/^(1[0-2]|[1-9])(A|B)$/)

  if (!leftMatch || !rightMatch) {
    return leftValue.localeCompare(rightValue) * (direction === 'asc' ? 1 : -1)
  }

  const leftNumber = Number(leftMatch[1])
  const rightNumber = Number(rightMatch[1])
  if (leftNumber !== rightNumber) {
    return (leftNumber - rightNumber) * (direction === 'asc' ? 1 : -1)
  }

  const leftFamily = leftMatch[2]
  const rightFamily = rightMatch[2]
  if (leftFamily !== rightFamily) {
    return (leftFamily === 'A' ? -1 : 1) * (direction === 'asc' ? 1 : -1)
  }

  return 0
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

function TrackTitleLink({ track }: { track: TrackRecord }) {
  const externalTrackUrl = getExternalTrackUrl(track.path)
  if (!externalTrackUrl) {
    return <>{track.title}</>
  }

  return (
    <a
      href={externalTrackUrl}
      target="_blank"
      rel="noopener noreferrer"
      className="track-title-link"
      aria-label={`${track.artist} — ${track.title} (opens in new tab)`}
      title={`${track.artist} — ${track.title} (opens in new tab)`}
    >
      {track.title}
    </a>
  )
}

function TrackLabelWithLinkedTitle({ track }: { track: TrackRecord }) {
  return (
    <>
      {track.artist} — <TrackTitleLink track={track} />
    </>
  )
}

function getExternalTrackUrl(path: string): string | null {
  try {
    const parsed = new URL(path)
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return null
    }
    return parsed.toString()
  } catch {
    return null
  }
}

function formatTrackSearchLabel(track: TrackRecord, keyRepresentation: KeyRepresentation): string {
  const key = formatKey(track.camelotKey, keyRepresentation)
  const bpmLabel = track.bpm === null ? 'No BPM' : `${track.bpm.toFixed(1)} BPM`
  return `${track.artist} — ${track.title} (${key}, ${bpmLabel})`
}

function formatWeightLabel(
  weight: keyof PathFinderWeights,
  fallbackLabel: string,
  keyRepresentation: KeyRepresentation,
): string {
  if (keyRepresentation === 'musical') {
    switch (weight) {
      case 'oneUp':
        return 'One 5th up'
      case 'oneDown':
        return 'One 5th down'
      case 'aToB':
        return 'min → rel maj'
      case 'bToA':
        return 'maj → rel min'
      case 'energyBoost':
        return 'min → maj'
      case 'energyDrop':
        return 'maj → min'
      default:
        return fallbackLabel
    }
  }

  const minorLabel = getRepresentationMinorLabel(keyRepresentation)
  const majorLabel = getRepresentationMajorLabel(keyRepresentation)

  switch (weight) {
    case 'aToB':
      return `${minorLabel} → ${majorLabel}`
    case 'bToA':
      return `${majorLabel} → ${minorLabel}`
    case 'energyBoost':
      return `x${minorLabel} → (x+3)${majorLabel}`
    case 'energyDrop':
      return `x${majorLabel} → (x-3)${minorLabel}`
    default:
      return fallbackLabel
  }
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
    parts.push(`${formatTempoAdjustment(step.adjustment)} (${step.adjustmentCost.toFixed(2)})`)
  }

  return parts.join(' · ')
}

function formatPathRule(rule: keyof PathFinderWeights): string {
  switch (rule) {
    case 'sameKey':
      return 'Same Key'
    case 'oneUp':
      return 'One Up'
    case 'oneDown':
      return 'One Down'
    case 'aToB':
      return 'A→B'
    case 'bToA':
      return 'B→A'
    case 'energyBoost':
      return 'xA→(x+3)B'
    case 'energyDrop':
      return 'xB→(x-3)A'
    case 'centerJump':
      return 'Center Jump'
    case 'tempoPercent':
      return 'Tempo'
    case 'keyChangeByTempo':
      return 'Tempo Key Change'
    default:
      return rule
  }
}

function formatTempoAdjustment(adjustment: NavigationPath['steps'][number]['adjustment']): string {
  if (adjustment === 'speed-up') {
    return 'Speed Up'
  }

  if (adjustment === 'slow-down') {
    return 'Slow Down'
  }

  return 'No Adjustment'
}

function resolveTrackId(
  value: string,
  pathTrackIdByLabel: Map<string, string>,
  pathTrackLookup: Map<string, TrackRecord>,
): string | null {
  const trimmed = value.trim()
  if (!trimmed) {
    return null
  }

  const byLabel = pathTrackIdByLabel.get(trimmed.toLowerCase())
  if (byLabel) {
    return byLabel
  }

  return pathTrackLookup.has(trimmed) ? trimmed : null
}

function getPathAverageCost(path: NavigationPath): number {
  if (path.steps.length === 0) {
    return 0
  }

  return path.totalCost / path.steps.length
}

function getPathMaxStepCost(path: NavigationPath): number {
  return path.steps.reduce((max, step) => Math.max(max, step.stepCost), 0)
}

function getPathSortMetric(path: NavigationPath, mode: PathSortMode): number {
  if (mode === 'average') {
    return getPathAverageCost(path)
  }

  if (mode === 'max') {
    return getPathMaxStepCost(path)
  }

  return path.totalCost
}

function asPathSortMode(value: string): PathSortMode {
  return PATH_SORT_MODES.some((mode) => mode.value === value) ? (value as PathSortMode) : 'total'
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
