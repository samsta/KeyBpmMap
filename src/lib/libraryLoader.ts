import type { LibraryData } from '../types'
import { loadEngineDjLibrary } from './engineDj'
import { loadRekordboxLibrary } from './rekordbox'
import { loadTraktorLibrary } from './traktor'

function isTraktorCollection(file: File): boolean {
  return file.name.toLowerCase().endsWith('.nml')
}

function isRekordboxCollection(file: File): boolean {
  return file.name.toLowerCase().endsWith('.xml')
}

export function loadLibraryFromFile(file: File): Promise<LibraryData> {
  if (isTraktorCollection(file)) {
    return loadTraktorLibrary(file)
  }

  if (isRekordboxCollection(file)) {
    return loadRekordboxLibrary(file)
  }

  return loadEngineDjLibrary(file)
}
