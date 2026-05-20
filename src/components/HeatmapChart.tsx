import { scaleLinear, scaleSequential } from 'd3'
import { interpolateTurbo } from 'd3-scale-chromatic'
import { forwardRef, useMemo } from 'react'
import { CAMELOT_KEYS } from '../lib/camelot'
import type { BpmBand, DensityCell } from '../types'

interface HeatmapChartProps {
  bands: BpmBand[]
  cells: DensityCell[]
  selectedCellId: string | null
  onSelect: (cellId: string) => void
}

const width = 920
const margin = { top: 32, right: 24, bottom: 72, left: 76 }
const BAND_HEIGHT_PX = 18

const HeatmapChart = forwardRef<SVGSVGElement, HeatmapChartProps>(
  ({ bands, cells, selectedCellId, onSelect }, ref) => {
    const maximum = Math.max(1, ...cells.map((cell) => cell.count))
    const height = Math.max(420, margin.top + margin.bottom + bands.length * BAND_HEIGHT_PX)
    const colorScale = useMemo(
      () => scaleSequential(interpolateTurbo).domain([0, maximum]),
      [maximum],
    )
    const xScale = useMemo(
      () =>
        scaleLinear()
          .domain([0, CAMELOT_KEYS.length])
          .range([margin.left, width - margin.right]),
      [],
    )
    const yScale = useMemo(
      () =>
        scaleLinear()
          .domain([0, bands.length])
          .range([margin.top, height - margin.bottom]),
      [bands.length, height],
    )

    return (
      <svg
        ref={ref}
        className="chart-svg"
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label="BPM by key heatmap"
      >
        <rect width={width} height={height} fill="#080b14" rx="20" />

        {cells.map((cell) => {
          const keyIndex = CAMELOT_KEYS.indexOf(cell.camelotKey)
          const x = xScale(keyIndex)
          const y = yScale(cell.bandIndex)
          const cellWidth = xScale(keyIndex + 1) - xScale(keyIndex) - 2
          const cellHeight = yScale(cell.bandIndex + 1) - yScale(cell.bandIndex) - 2

          return (
            <rect
              key={cell.id}
              x={x + 1}
              y={y + 1}
              width={cellWidth}
              height={cellHeight}
              rx={8}
              fill={cell.count === 0 ? 'rgba(255,255,255,0.05)' : colorScale(cell.count)}
              stroke={selectedCellId === cell.id ? '#fff' : 'rgba(255,255,255,0.06)'}
              strokeWidth={selectedCellId === cell.id ? 2.5 : 1}
              className="chart-region"
              onClick={() => onSelect(cell.id)}
            >
              <title>{`${cell.camelotKey} / ${cell.bandLabel}: ${cell.count} track${cell.count === 1 ? '' : 's'}\n${cell.tracks
                .slice(0, 4)
                .map((track) => `${track.artist} — ${track.title}`)
                .join('\n')}`}</title>
            </rect>
          )
        })}

        {CAMELOT_KEYS.map((camelotKey, index) => {
          const x = xScale(index + 0.5)
          return (
            <text
              key={camelotKey}
              x={x}
              y={height - margin.bottom + 28}
              textAnchor="middle"
              className="chart-label"
            >
              {camelotKey}
            </text>
          )
        })}

        {bands.map((band, index) => {
          const y = yScale(index + 0.5)
          return (
            <text
              key={band.label}
              x={margin.left - 14}
              y={y + 5}
              textAnchor="end"
              className="chart-label"
            >
              {band.label}
            </text>
          )
        })}
      </svg>
    )
  },
)

HeatmapChart.displayName = 'HeatmapChart'

export default HeatmapChart
