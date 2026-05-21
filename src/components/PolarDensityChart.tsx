import { arc, scaleSequential } from 'd3'
import { interpolatePlasma } from 'd3-scale-chromatic'
import { forwardRef, useMemo } from 'react'
import type { BpmBand, DensityCell } from '../types'

interface PolarDensityChartProps {
  bands: BpmBand[]
  cells: DensityCell[]
  keys: string[]
  formatKeyLabel: (camelotKey: string) => string
  selectedCellId: string | null
  onSelect: (cellId: string) => void
}

const width = 620
const height = 620
const outerRadius = 240
const innerRadius = 64
const UNSELECTED_STROKE_BASE = 12
const SELECTED_STROKE_BASE = 30
const UNSELECTED_STROKE_MIN = 0.1
const UNSELECTED_STROKE_MAX = 1
const SELECTED_STROKE_MIN = 0.5
const SELECTED_STROKE_MAX = 2.5
const BAND_LABEL_FONT_MIN = 4
const BAND_LABEL_FONT_MAX = 12.5
const BAND_LABEL_REFERENCE_RING_HEIGHT = 18

const PolarDensityChart = forwardRef<SVGSVGElement, PolarDensityChartProps>(
  ({ bands, cells, keys, formatKeyLabel, selectedCellId, onSelect }, ref) => {
    const maximum = Math.max(1, ...cells.map((cell) => cell.count))
    const ringSize = (outerRadius - innerRadius) / bands.length
    const bandLabelFontSize = clampValue(
      BAND_LABEL_FONT_MAX * (ringSize / BAND_LABEL_REFERENCE_RING_HEIGHT),
      BAND_LABEL_FONT_MIN,
      BAND_LABEL_FONT_MAX,
    )
    const unselectedStrokeWidth = clampStrokeWidth(
      UNSELECTED_STROKE_BASE / bands.length,
      UNSELECTED_STROKE_MIN,
      UNSELECTED_STROKE_MAX,
    )
    const selectedStrokeWidth = clampStrokeWidth(
      SELECTED_STROKE_BASE / bands.length,
      SELECTED_STROKE_MIN,
      SELECTED_STROKE_MAX,
    )
    const bandRadii = useMemo(
      () =>
        bands.map(
          (_, index) => innerRadius + ((outerRadius - innerRadius) / bands.length) * (index + 1),
        ),
      [bands],
    )
    const colorScale = useMemo(
      () => scaleSequential(interpolatePlasma).domain([0, maximum]),
      [maximum],
    )

    return (
      <svg
        ref={ref}
        className="chart-svg"
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label="Polar harmonic density map"
      >
        <rect width={width} height={height} fill="#080b14" rx="20" />
        <g transform={`translate(${width / 2}, ${height / 2})`}>
          {bands.map((band, index) => (
            <circle
              key={band.label}
              r={bandRadii[index]}
              fill="none"
              stroke="rgba(255,255,255,0.12)"
            />
          ))}

          {cells.map((cell) => {
            const keyIndex = keys.indexOf(cell.camelotKey)
            const startAngle = (keyIndex / keys.length) * Math.PI * 2 - Math.PI / 2
            const endAngle = ((keyIndex + 1) / keys.length) * Math.PI * 2 - Math.PI / 2
            const path = arc()({
              innerRadius: innerRadius + ringSize * cell.bandIndex,
              outerRadius: innerRadius + ringSize * (cell.bandIndex + 1),
              startAngle,
              endAngle,
              padAngle: 0,
            })

            return (
              <path
                key={cell.id}
                d={path ?? undefined}
                fill={cell.count === 0 ? 'rgba(255,255,255,0.05)' : colorScale(cell.count)}
                stroke={selectedCellId === cell.id ? '#fff' : 'rgba(255,255,255,0.08)'}
                strokeWidth={selectedCellId === cell.id ? selectedStrokeWidth : unselectedStrokeWidth}
                className="chart-region"
                onClick={() => onSelect(cell.id)}
              >
                <title>{`${formatKeyLabel(cell.camelotKey)} / ${cell.bandLabel}: ${cell.count} track${cell.count === 1 ? '' : 's'}\n${cell.tracks
                  .slice(0, 4)
                  .map((track) => `${track.artist} — ${track.title}`)
                  .join('\n')}`}</title>
              </path>
            )
          })}

          {bands.map((band, index) => (
            <text
              key={`${band.label}-label`}
              x={0}
              y={ringSize / 2 - bandRadii[index]}
              textAnchor="middle"
              className="chart-label muted"
              dominantBaseline="middle"
              style={{ fontSize: `${bandLabelFontSize}px` }}
            >
              {band.label}
            </text>
          ))}

          {keys.map((camelotKey, index) => {
            const angle = ((index + 0.5) / keys.length) * Math.PI * 2 - Math.PI / 2
            const labelRadius = outerRadius + 24
            const x = Math.cos(angle) * labelRadius
            const y = Math.sin(angle) * labelRadius

            return (
              <text key={camelotKey} x={x} y={y} textAnchor="middle" className="chart-label">
                {formatKeyLabel(camelotKey)}
              </text>
            )
          })}
        </g>
      </svg>
    )
  },
)

PolarDensityChart.displayName = 'PolarDensityChart'

/**
 * Keeps inverse band-count stroke scaling within readable visual bounds.
 */
function clampStrokeWidth(value: number, minimum: number, maximum: number): number {
  return clampValue(value, minimum, maximum)
}

function clampValue(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value))
}

export default PolarDensityChart
