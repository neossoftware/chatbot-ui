import AxisRadar from './AxisRadar.jsx'

const SEVERITY_ORDER = ['critical', 'high', 'medium', 'low', 'info']

const money = (value) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 }).format(value ?? 0)

const number = (value, digits = 2) =>
  new Intl.NumberFormat('en-US', { maximumFractionDigits: digits }).format(value ?? 0)

export default function ReviewResult({ result }) {
  const cost = result.run_cost
  const coverage = Math.round(cost.coverage * 100)
  const totalComponents = cost.lines.length + cost.unpriced.length
  const pricedComponents = cost.priced_components ?? cost.lines.length
  const rulesSkipped = result.rules_skipped.length

  return (
    <div className="review-result">
      {result.source?.kind === 'github' && (
        <div className="review-source">
          Reviewed{' '}
          <a href={result.source.url} target="_blank" rel="noreferrer noopener">
            {result.source.owner}/{result.source.repo}
            {result.source.path ? `/${result.source.path}` : ''}
          </a>{' '}
          at <code>{result.source.ref}</code> · {result.component_count} components parsed
        </div>
      )}

      <div className="review-headline">
        <div className="headline-card">
          <span className="headline-label">Committed monthly run cost</span>
          <span className="headline-value">{money(cost.monthly_usd)}</span>
          {/* Coverage sits against the total, never in a footnote: an amount priced at 33% coverage
              and one priced at 100% are different claims even when the figure is identical. */}
          <span className={`headline-note${coverage < 100 ? ' warn' : ''}`}>
            {coverage}% of the estate priced · {pricedComponents} of {totalComponents} components
          </span>
        </div>

        <div className="headline-card">
          <span className="headline-label">Design health score</span>
          <span className="headline-value">{result.overall_score.toFixed(1)}<small>/100</small></span>
          <span className={`headline-note${result.is_partial ? ' warn' : ''}`}>
            {result.is_partial ? `partial · ${rulesSkipped} rule(s) not executed` : 'full rule catalogue executed'}
          </span>
        </div>

        <div className="headline-card">
          <span className="headline-label">Quantified saving</span>
          <span className="headline-value">{money(result.total_monthly_saving_usd)}</span>
          <span className="headline-note">
            {result.findings.length} open finding{result.findings.length === 1 ? '' : 's'}
          </span>
        </div>
      </div>

      {result.findings.length === 0 && (
        <div className="review-clean">
          No rule fired against this design. That is a verdict, not a gap: the catalogue ran
          {rulesSkipped > 0 ? ` except for ${rulesSkipped} rule(s) listed below` : ' in full'}, and every rule
          declined on the evidence present.
        </div>
      )}

      <AxisRadar scores={result.scores} findings={result.findings} overall={result.overall_score} />

      <CostBreakdown cost={cost} />

      <section>
        <h3>Findings ({result.findings.length})</h3>
        {[...result.findings]
          .sort((a, b) => SEVERITY_ORDER.indexOf(a.severity) - SEVERITY_ORDER.indexOf(b.severity))
          .map((f) => (
            <article key={f.fingerprint} className="finding">
              <header>
                <span className={`sev sev-${f.severity}`}>{f.severity}</span>
                <span className="axis">{f.axis}</span>
                <code className="rule">{f.rule_id}</code>
                <strong>{f.title}</strong>
                {f.estimated_monthly_saving_usd != null && (
                  <span className="saving">{money(f.estimated_monthly_saving_usd)}/mo</span>
                )}
              </header>
              <p>{f.rationale}</p>
              {f.remediation && (
                <p className="remediation"><strong>Remediation:</strong> {f.remediation}</p>
              )}
              <ul className="evidence">
                {f.evidence.map((e, i) => (
                  <li key={i}>
                    <code>{e.locator}</code> — {e.source}
                    {e.line ? `:${e.line}` : ''}
                    {e.snippet && <pre>{e.snippet}</pre>}
                  </li>
                ))}
              </ul>
            </article>
          ))}
      </section>

      {rulesSkipped > 0 && (
        <details className="review-skipped">
          <summary>Rules not executed ({rulesSkipped})</summary>
          <ul>
            {result.rules_skipped.map(([ruleId, reason]) => (
              <li key={ruleId}><code>{ruleId}</code> — {reason}</li>
            ))}
          </ul>
        </details>
      )}

      {result.notes.length > 0 && (
        <details className="review-skipped">
          <summary>Caveats ({result.notes.length})</summary>
          <ul>
            {result.notes.map((note, i) => <li key={i}>{note}</li>)}
          </ul>
        </details>
      )}
    </div>
  )
}

/**
 * The cost lines, as rows rather than a table.
 *
 * A table forces the basis and its citation into one cell, where the longest string on the screen sits beside
 * the most important number and wins. Here each line leads with the component and its monthly amount, the
 * arithmetic sits underneath as one readable sentence, and the citations are collected once at the end.
 */
function CostBreakdown({ cost }) {
  const largest = Math.max(1, ...cost.lines.map((l) => l.monthly_usd || 0))
  const citations = [...new Set(cost.lines.map((l) => l.citation).filter(Boolean))]

  return (
    <section>
      <h3>Cost breakdown</h3>

      {cost.lines.length === 0 && (
        <p className="review-empty">
          Nothing in this design matches a published rate. The total is $0 because nothing could be priced, not
          because nothing will be billed.
        </p>
      )}

      <ul className="cost-lines">
        {cost.lines.map((line) => (
          <li key={line.component_id} className="cost-line">
            <div className="cost-line-head">
              <code className="cost-line-id">{line.component_id}</code>
              {line.assumed && (
                <span className="tag assumed" title="Priced against an assumed market, because the component declares no region of its own.">
                  assumed
                </span>
              )}
              {line.driver && <span className="cost-line-driver">billed on {line.driver}</span>}
              <span className="cost-line-amount">{money(line.monthly_usd)}</span>
            </div>

            <div className="cost-line-bar" aria-hidden="true">
              <span style={{ width: `${((line.monthly_usd || 0) / largest) * 100}%` }} />
            </div>

            <div className="cost-line-maths">
              {number(line.quantity)} {line.unit} × {number(line.unit_price, 6)} USD
            </div>

            <div className="cost-line-basis">{line.basis}</div>
          </li>
        ))}
      </ul>

      {cost.lines.length > 0 && (
        <div className="cost-total">
          <span>Total of priced components</span>
          <strong>{money(cost.monthly_usd)}</strong>
        </div>
      )}

      {cost.unpriced.length > 0 && (
        <details className="review-unpriced" open>
          <summary>No published rate ({cost.unpriced.length}) — excluded from the total</summary>
          <ul>
            {cost.unpriced.map((item) => (
              <li key={item.component_id}><code>{item.component_id}</code> — {item.reason}</li>
            ))}
          </ul>
        </details>
      )}

      {citations.length > 0 && <p className="cost-sources">Price sources: {citations.join(' · ')}</p>}
    </section>
  )
}
