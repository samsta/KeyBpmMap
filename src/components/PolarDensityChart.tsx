import { arc, scaleSequential } from 'd3'
import { interpolatePlasma } from 'd3-scale-chromatic'
import { forwardRef, useMemo } from 'react'
import type { BpmBand, DensityCell } from '../types'

interface PolarDensityChartProps {
  bands: BpmBand[]
  cells: DensityCell[]
  keys: string[]
  selectedCellId: string | null
  onSelect: (cellId: string) => void
}

const width = 620
const height = 620
const outerRadius = 240
const innerRadius = 64

const PolarDensityChart = forwardRef<SVGSVGElement, PolarDensityChartProps>(
  ({ bands, cells, keys, selectedCellId, onSelect }, ref) => {
    const maximum = Math.max(1, ...cells.map((cell) => cell.count))
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
            const ringSize = (outerRadius - innerRadius) / bands.length
            const path = arc()({
              innerRadius: innerRadius + ringSize * cell.bandIndex,
              outerRadius: innerRadius + ringSize * (cell.bandIndex + 1) - 3,
              startAngle,
              endAngle,
              padAngle: 0.01,
            })

            return (
              <path
                key={cell.id}
                d={path ?? undefined}
                fill={cell.count === 0 ? 'rgba(255,255,255,0.05)' : colorScale(cell.count)}
                stroke={selectedCellId === cell.id ? '#fff' : 'rgba(255,255,255,0.08)'}
                strokeWidth={selectedCellId === cell.id ? 2.5 : 1}
                className="chart-region"
                onClick={() => onSelect(cell.id)}
              >
                <title>{`${cell.camelotKey} / ${cell.bandLabel}: ${cell.count} track${cell.count === 1 ? '' : 's'}\n${cell.tracks
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
              y={-bandRadii[index] + 14}
              textAnchor="middle"
              className="chart-label muted"
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
                {camelotKey}
              </text>
            )
          })}
        </g>
      </svg>
    )
  },
)

PolarDensityChart.displayName = 'PolarDensityChart'

export default PolarDensityChart
