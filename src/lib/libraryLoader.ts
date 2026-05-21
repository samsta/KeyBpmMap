import type { LibraryData } from '../types'
import { loadEngineDjLibrary } from './engineDj'
import { loadRekordboxLibrary } from './rekordbox'
import { loadTraktorLibrary } from './traktor'

export type LibraryFormat = 'engine-dj' | 'traktor' | 'rekordbox'

export function getLibraryFormatFromName(fileName: string): LibraryFormat {
  const normalizedName = fileName.toLowerCase()

  if (normalizedName.endsWith('.nml')) {
    return 'traktor'
  }

  if (normalizedName.endsWith('.xml')) {
    return 'rekordbox'
  }

  return 'engine-dj'
}

export function loadLibraryFromFile(file: File): Promise<LibraryData> {
  switch (getLibraryFormatFromName(file.name)) {
    case 'traktor':
      return loadTraktorLibrary(file)
    case 'rekordbox':
      return loadRekordboxLibrary(file)
    case 'engine-dj':
    default:
      return loadEngineDjLibrary(file)
  }
}
