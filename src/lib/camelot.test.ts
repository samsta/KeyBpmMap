import { describe, expect, it } from 'vitest'
import {
  camelotToMusicalKey,
  camelotToOpenKey,
  formatKey,
  normalizeCamelotKey,
  type KeyRepresentation,
} from './camelot'

describe('normalizeCamelotKey', () => {
  it('normalizes camelot values', () => {
    expect(normalizeCamelotKey('8a')).toBe('8A')
    expect(normalizeCamelotKey('12B')).toBe('12B')
  })

  it('normalizes open key values', () => {
    expect(normalizeCamelotKey('1d')).toBe('8B')
    expect(normalizeCamelotKey('12m')).toBe('7A')
  })

  it('normalizes musical keys', () => {
    expect(normalizeCamelotKey('C major')).toBe('8B')
    expect(normalizeCamelotKey('f#m')).toBe('11A')
    expect(normalizeCamelotKey('D♭ minor')).toBe('12A')
  })

  it('normalizes numeric engine keys', () => {
    expect(normalizeCamelotKey(0)).toBe('8B')
    expect(normalizeCamelotKey('1')).toBe('8A')
  })

  it('returns unknown for unsupported input', () => {
    expect(normalizeCamelotKey('nope')).toBe('?')
    expect(normalizeCamelotKey(null)).toBe('?')
  })
})

describe('key representation conversion', () => {
  it('converts camelot to open key', () => {
    expect(camelotToOpenKey('8B')).toBe('1d')
    expect(camelotToOpenKey('7A')).toBe('12m')
    expect(camelotToOpenKey('?')).toBe('?')
  })

  it('converts camelot to musical key', () => {
    expect(camelotToMusicalKey('8B')).toBe('C major')
    expect(camelotToMusicalKey('8A')).toBe('A minor')
    expect(camelotToMusicalKey('?')).toBe('?')
  })

  it('formats a key by representation', () => {
    const formats: Record<KeyRepresentation, string> = {
      camelot: '8A',
      'open-key': '1m',
      musical: 'A minor',
    }

    for (const [representation, expected] of Object.entries(formats)) {
      expect(formatKey('A minor', representation as KeyRepresentation)).toBe(expected)
    }
  })
})
