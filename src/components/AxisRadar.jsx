/**
 * Kiviat (radar) chart over the score axes, with the reason each axis landed where it did.
 *
 * Hand-rolled SVG rather than a charting dependency. The chart is never shown on its own: a radar makes a 90
 * look like a 100 to the eye, so every vertex is repeated as a number in the legend beside it, together with
 * the findings that produced it. The picture is the summary; the legend is the claim.
 */

const SIZE = 260
const CENTRE = SIZE / 2
const RADIUS = SIZE / 2 - 42
const RINGS = [25, 50, 75, 100]
// Room around the plot so the axis labels are never clipped.
const PAD_X = 80

const SEVERITY_ORDER = ['critical', 'high', 'medium', 'low', 'info']

// Scores run 0-100 and the eye reads a dented polygon far better than it reads a colour,
// so the palette only has to separate "fine" from "not".
const bandFor = (score) => {
  if (score >= 90) return 'good'
  if (score >= 70) return 'fair'
  if (score >= 40) return 'poor'
  return 'bad'
}

const BAND_COLOUR = {
  good: '#3f8f4f',
  fair: '#c99a1e',
  poor: '#d9720c',
  bad: '#c0392b',
}

function point(index, count, value) {
  // Start at 12 o'clock and go clockwise, which is how these are read.
  const angle = (Math.PI * 2 * index) / count - Math.PI / 2
  const r = (Math.max(0, Math.min(130, value)) / 100) * RADIUS
  return [CENTRE + r * Math.cos(angle), CENTRE + r * Math.sin(angle)]
}

export default function AxisRadar({ scores, findings, overall }) {
  const axes = Object.keys(scores)
  if (axes.length < 3) return null

  const worst = Math.min(...axes.map((a) => scores[a]))
  const colour = BAND_COLOUR[bandFor(worst)]

  const polygon = axes
    .map((axis, i) => point(i, axes.length, scores[axis]).join(','))
    .join(' ')

  return (
    <section className="radar-block">
      <div className="radar-chart">
        <svg viewBox={`${-PAD_X} 0 ${SIZE + PAD_X * 2} ${SIZE}`} role="img" aria-label="Score by axis">
          {RINGS.map((ring) => (
            <polygon
              key={ring}
              className={ring === 100 ? 'radar-ring radar-ring-outer' : 'radar-ring'}
              points={axes.map((_, i) => point(i, axes.length, ring).join(',')).join(' ')}
            />
          ))}

          {axes.map((axis, i) => {
            const [x, y] = point(i, axes.length, 100)
            return <line key={axis} className="radar-spoke" x1={CENTRE} y1={CENTRE} x2={x} y2={y} />
          })}

          <polygon className="radar-area" points={polygon} fill={colour} stroke={colour} />

          {axes.map((axis, i) => {
            const [x, y] = point(i, axes.length, scores[axis])
            return <circle key={axis} className="radar-dot" cx={x} cy={y} r={3.5} fill={colour} />
          })}

          {axes.map((axis, i) => {
            const [x, y] = point(i, axes.length, 118)
            return (
              <text
                key={axis}
                className="radar-label"
                x={x}
                y={y}
                textAnchor={x > CENTRE + 4 ? 'start' : x < CENTRE - 4 ? 'end' : 'middle'}
                dominantBaseline={y > CENTRE ? 'hanging' : 'auto'}
              >
                {axis}
                <tspan className="radar-label-score" dx="4">{scores[axis].toFixed(0)}</tspan>
              </text>
            )
          })}
        </svg>

        <div className="radar-caption">
          Overall <strong>{overall.toFixed(1)}</strong>/100 · weakest axis{' '}
          <strong>{worst.toFixed(1)}</strong>
        </div>
      </div>

      <ul className="radar-legend">
        {axes.map((axis) => (
          <AxisReason
            key={axis}
            axis={axis}
            score={scores[axis]}
            findings={findings.filter((f) => f.axis === axis)}
          />
        ))}
      </ul>
    </section>
  )
}

function AxisReason({ axis, score, findings }) {
  const counts = SEVERITY_ORDER.map((s) => [s, findings.filter((f) => f.severity === s).length])
    .filter(([, n]) => n > 0)
    .map(([s, n]) => `${n} ${s}`)
    .join(', ')

  // Sorted so the rule quoted is the one that cost the axis the most, not
  // whichever happened to come back first.
  const driver = [...findings].sort(
    (a, b) => SEVERITY_ORDER.indexOf(a.severity) - SEVERITY_ORDER.indexOf(b.severity)
  )[0]

  return (
    <li className={`radar-reason band-${bandFor(score)}`}>
      <div className="radar-reason-head">
        <span className="radar-reason-axis">{axis}</span>
        <span className="radar-reason-score">{score.toFixed(1)}</span>
      </div>
      {findings.length === 0 ? (
        <p className="radar-reason-why">
          No rule fired on this axis. The rules that cover it ran and declined on the evidence present.
        </p>
      ) : (
        <p className="radar-reason-why">
          {findings.length} finding{findings.length === 1 ? '' : 's'} ({counts}). Worst:{' '}
          <code>{driver.rule_id}</code> — {driver.title}.
        </p>
      )}
    </li>
  )
}
