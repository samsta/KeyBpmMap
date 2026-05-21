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

export const CAMELOT_KEYS = Array.from({ length: 12 }, (_, index) => {
  const number = index + 1
  return [`${number}A`, `${number}B`]
}).flat()

const CAMELOT_PATTERN = /^(1[0-2]|[1-9])(A|B)$/i

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

    const parsed = Number(trimmed)
    if (Number.isInteger(parsed)) {
      return engineNumericKeyToCamelot(parsed)
    }
  }

  return '?'
}
