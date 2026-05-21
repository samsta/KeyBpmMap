import { describe, expect, it } from 'vitest'
import { getLibraryFormatFromName } from './libraryLoader'

describe('getLibraryFormatFromName', () => {
  it('detects traktor collections by .nml extension', () => {
    expect(getLibraryFormatFromName('collection.nml')).toBe('traktor')
    expect(getLibraryFormatFromName('COLLECTION.NML')).toBe('traktor')
  })

  it('detects rekordbox collections by .xml extension', () => {
    expect(getLibraryFormatFromName('rekordbox.xml')).toBe('rekordbox')
    expect(getLibraryFormatFromName('EXPORT.XML')).toBe('rekordbox')
  })

  it('defaults to engine dj for other extensions', () => {
    expect(getLibraryFormatFromName('m.db')).toBe('engine-dj')
    expect(getLibraryFormatFromName('library.sqlite3')).toBe('engine-dj')
  })
})
