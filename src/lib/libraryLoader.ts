import type { LibraryData } from '../types'
import { loadEngineDjLibrary } from './engineDj'
import { loadTraktorLibrary } from './traktor'

function isTraktorCollection(file: File): boolean {
  return file.name.toLowerCase().endsWith('.nml')
}

export function loadLibraryFromFile(file: File): Promise<LibraryData> {
  return isTraktorCollection(file) ? loadTraktorLibrary(file) : loadEngineDjLibrary(file)
}
