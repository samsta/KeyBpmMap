const ENGINE_KEY_MAP = [
  '8B',
  '8A',
  '9B',
  '9A',
  '10B',
  '10A',
  '11B',
  '11A',
  '12B',
  '12A',
  '1B',
  '1A',
  '2B',
  '2A',
  '3B',
  '3A',
  '4B',
  '4A',
  '5B',
  '5A',
  '6B',
  '6A',
  '7B',
  '7A',
] as const

const OPEN_KEY_TO_CAMELOT: Record<string, string> = {
  '1d': '8B',
  '2d': '9B',
  '3d': '10B',
  '4d': '11B',
  '5d': '12B',
  '6d': '1B',
  '7d': '2B',
  '8d': '3B',
  '9d': '4B',
  '10d': '5B',
  '11d': '6B',
  '12d': '7B',
  '1m': '8A',
  '2m': '9A',
  '3m': '10A',
  '4m': '11A',
  '5m': '12A',
  '6m': '1A',
  '7m': '2A',
  '8m': '3A',
  '9m': '4A',
  '10m': '5A',
  '11m': '6A',
  '12m': '7A',
}

const CAMELOT_TO_OPEN_KEY: Record<string, string> = Object.fromEntries(
  Object.entries(OPEN_KEY_TO_CAMELOT).map(([openKey, camelotKey]) => [camelotKey, openKey]),
)

const STANDARD_KEY_TO_CAMELOT: Record<string, string> = {
  'A major': '11B',
  'A minor': '8A',
  'A# major': '6B',
  'A# minor': '3A',
  'Ab major': '4B',
  'Ab minor': '1A',
  'B major': '1B',
  'B minor': '10A',
  'Bb major': '6B',
  'Bb minor': '3A',
  'C major': '8B',
  'C minor': '5A',
  'C# major': '3B',
  'C# minor': '12A',
  'Cb major': '1B',
  'Cb minor': '10A',
  'D major': '10B',
  'D minor': '7A',
  'D# major': '5B',
  'D# minor': '2A',
  'Db major': '3B',
  'Db minor': '12A',
  'E major': '12B',
  'E minor': '9A',
  'Eb major': '5B',
  'Eb minor': '2A',
  'F major': '7B',
  'F minor': '4A',
  'F# major': '2B',
  'F# minor': '11A',
  'G major': '9B',
  'G minor': '6A',
  'G# major': '4B',
  'G# minor': '1A',
  'Gb major': '2B',
  'Gb minor': '11A',
}

const CAMELOT_TO_MUSICAL_KEY: Record<string, string> = {
  '1A': 'Ab minor',
  '1B': 'B major',
  '2A': 'D# minor',
  '2B': 'F# major',
  '3A': 'A# minor',
  '3B': 'C# major',
  '4A': 'F minor',
  '4B': 'Ab major',
  '5A': 'C minor',
  '5B': 'D# major',
  '6A': 'G minor',
  '6B': 'A# major',
  '7A': 'D minor',
  '7B': 'F major',
  '8A': 'A minor',
  '8B': 'C major',
  '9A': 'E minor',
  '9B': 'G major',
  '10A': 'B minor',
  '10B': 'D major',
  '11A': 'F# minor',
  '11B': 'A major',
  '12A': 'C# minor',
  '12B': 'E major',
 }

export const CAMELOT_KEYS = Array.from({ length: 12 }, (_, index) => {
  const number = index + 1
  return [`${number}A`, `${number}B`]
}).flat()

const CAMELOT_PATTERN = /^(1[0-2]|[1-9])(A|B)$/i
const OPEN_KEY_PATTERN = /^(1[0-2]|[1-9])(D|M)$/i
export type KeyRepresentation = 'camelot' | 'open-key' | 'musical'

function normalizeStandardKey(value: string): string | null {
  const compact = value
    .trim()
    .replaceAll('_', ' ')
    .replaceAll('♭', 'b')
    .replaceAll('♯', '#')
    .replace(/\s+/g, '')

  const match = compact.match(/^([A-Ga-g])([#b]?)(maj|major|min|minor|m)?$/i)
  if (!match) {
    return null
  }

  const [, note, accidental = '', rawMode] = match
  const normalizedNote = `${note.toUpperCase()}${accidental}`
  const normalizedMode =
    rawMode && ['m', 'min', 'minor'].includes(rawMode.toLowerCase()) ? 'minor' : 'major'

  return STANDARD_KEY_TO_CAMELOT[`${normalizedNote} ${normalizedMode}`] ?? null
}

export function engineNumericKeyToCamelot(value: number): string {
  return ENGINE_KEY_MAP[value] ?? '?'
}

export function normalizeCamelotKey(value: unknown): string {
  if (typeof value === 'number' && Number.isInteger(value)) {
    return engineNumericKeyToCamelot(value)
  }

  if (typeof value === 'string') {
    const trimmed = value.trim().toUpperCase()
    if (CAMELOT_PATTERN.test(trimmed)) {
      return trimmed
    }

    if (OPEN_KEY_PATTERN.test(trimmed)) {
      return OPEN_KEY_TO_CAMELOT[trimmed.toLowerCase()] ?? '?'
    }

    const standardKey = normalizeStandardKey(value)
    if (standardKey) {
      return standardKey
    }

    const parsed = Number(trimmed)
    if (Number.isInteger(parsed)) {
      return engineNumericKeyToCamelot(parsed)
    }
  }

  return '?'
}

export function camelotToOpenKey(camelotKey: string): string {
  const normalizedCamelotKey = normalizeCamelotKey(camelotKey)
  if (normalizedCamelotKey === '?') {
    return '?'
  }

  return CAMELOT_TO_OPEN_KEY[normalizedCamelotKey] ?? '?'
}

export function camelotToMusicalKey(camelotKey: string): string {
  const normalizedCamelotKey = normalizeCamelotKey(camelotKey)
  if (normalizedCamelotKey === '?') {
    return '?'
  }

  return CAMELOT_TO_MUSICAL_KEY[normalizedCamelotKey] ?? '?'
}

export function formatKey(
  value: unknown,
  representation: KeyRepresentation = 'camelot',
): string {
  const camelotKey = normalizeCamelotKey(value)
  if (camelotKey === '?') {
    return '?'
  }

  switch (representation) {
    case 'open-key':
      return camelotToOpenKey(camelotKey)
    case 'musical':
      return camelotToMusicalKey(camelotKey)
    case 'camelot':
    default:
      return camelotKey
  }
}
