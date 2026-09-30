import { useEffect, useState } from 'react'

const svg = { width: 15, height: 15, viewBox: '0 0 16 16', 'aria-hidden': true }
const SOURCE_ICON = {
  paste: (
    <svg {...svg} fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="m5.5 4.5-3.5 3.5 3.5 3.5M10.5 4.5 14 8l-3.5 3.5" />
    </svg>
  ),
  zip: (
    <svg {...svg} fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2.5 5.5h11v7.5a1 1 0 0 1-1 1h-9a1 1 0 0 1-1-1ZM2 2.5h12v3H2ZM8 8v1.5M8 11.5V13" />
    </svg>
  ),
  github: (
    // Octicons "mark-github" (MIT)
    <svg {...svg} fill="currentColor">
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0 0 16 8c0-4.42-3.58-8-8-8Z" />
    </svg>
  ),
}

export const REVIEW_SOURCES = [
  { id: 'paste', label: 'Paste Terraform' },
  { id: 'zip', label: 'Upload .zip' },
  { id: 'github', label: 'GitHub repository' },
]
// The values are the engine's own `Environment` members; the labels are what an architect calls them.
// Sending a label the enum does not know is rejected as a malformed request, so the two travel together.
export const REVIEW_ENVIRONMENTS = [
  { value: 'unknown', label: 'Not stated' },
  { value: 'prod', label: 'Production' },
  { value: 'ppd', label: 'Pre-production' },
  { value: 'uat', label: 'UAT' },
  { value: 'sit', label: 'SIT' },
  { value: 'dev', label: 'Development' },
]
// The markets the internal rate card publishes. Not a list of cloud regions: the card bills per market.
export const REVIEW_MARKETS = ['', 'HK', 'UK', 'US', 'CN', 'MX']
export const marketLabel = (m) => m || 'None'
export const envLabel = (v) => REVIEW_ENVIRONMENTS.find((e) => e.value === v)?.label ?? v

export const SOURCE_HINT = {
  zip: 'A wrapping folder inside the zip is fine. Terraform spread across several directories is refused: reviewing one of them silently would understate both the cost and the risk.',
  github: 'Public repositories only; nothing is cloned and no credentials are sent. A real estate keeps Terraform in several directories, so paste the /tree/ URL of the one root module you mean. Given only owner/repo, the repository root is reviewed.',
}

// Source tabs sit on top of the input they control.
export function ReviewSourceTabs({ source, onSource, onClose, disabled }) {
  return (
    <div className="review-top">
      <div className="segmented" role="radiogroup" aria-label="Review source">
        {REVIEW_SOURCES.map((s) => (
          <button key={s.id} type="button" role="radio" aria-checked={source === s.id} disabled={disabled} onClick={() => onSource(s.id)}>
            {SOURCE_ICON[s.id]}
            {s.label}
          </button>
        ))}
      </div>
      <span className="review-tag">Deterministic · ARCHLINT</span>
      <button type="button" className="close-btn" onClick={onClose} disabled={disabled} aria-label="Exit review mode" title="Exit review mode">×</button>
    </div>
  )
}

// Environment and market: one compact chip next to the send button; the two selects and the
// explanation live in a popover so the toolbar stays calm.
export function ReviewOptions({ env, onEnv, market, onMarket, disabled, invalid = {}, signal = 0 }) {
  const [open, setOpen] = useState(false)

  // A failed submit bumps `signal`: open the popover and put the cursor on the first missing value.
  useEffect(() => {
    if (!signal) return
    setOpen(true)
    const id = invalid.env ? 'review-env' : 'review-market'
    const t = setTimeout(() => document.getElementById(id)?.focus(), 0)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signal])

  useEffect(() => {
    if (!open) return
    const close = () => setOpen(false)
    document.addEventListener('click', close)
    return () => document.removeEventListener('click', close)
  }, [open])

  return (
    <span className="opts-wrap">
      <button
        type="button"
        className={`opts-chip${invalid.env || invalid.market ? ' invalid' : ''}`}
        aria-haspopup="dialog"
        aria-expanded={open}
        disabled={disabled}
        onClick={(e) => { e.stopPropagation(); setOpen((o) => !o) }}
      >
        <span>{envLabel(env)}</span><i aria-hidden="true">·</i><span>{marketLabel(market)}</span>
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true"><path d="m2.5 4.5 3.5 3.5 3.5-3.5" /></svg>
      </button>
      {open && (
        <div className="opts-pop" role="dialog" aria-label="Review options" onClick={(e) => e.stopPropagation()}>
          <label className={`field${invalid.env ? ' invalid' : ''}`} htmlFor="review-env">
            <span>Environment</span>
            <select id="review-env" value={env} aria-invalid={invalid.env || undefined} onChange={(e) => onEnv(e.target.value)}>
              {REVIEW_ENVIRONMENTS.map((e) => <option key={e.value} value={e.value}>{e.label}</option>)}
            </select>
            {invalid.env && <em className="field-error">Choose an environment to run the review.</em>}
          </label>
          <label className={`field${invalid.market ? ' invalid' : ''}`} htmlFor="review-market">
            <span>Default market</span>
            <select id="review-market" value={market} aria-invalid={invalid.market || undefined} onChange={(e) => onMarket(e.target.value)}>
              {REVIEW_MARKETS.map((m) => <option key={m} value={m}>{marketLabel(m)}</option>)}
            </select>
            {invalid.market && <em className="field-error">Choose a default market to run the review.</em>}
          </label>
          <p>
            <b>Environment</b> selects which rules apply. Some fire only outside production. It does not change any price.
          </p>
          <p>
            <b>Market</b> prices only the components that do not declare a region of their own. Every line it enables is flagged as assumed. It does not change which rules run.
          </p>
        </div>
      )}
    </span>
  )
}

const SOURCE_LABEL = { paste: 'Pasted Terraform', zip: 'Uploaded .zip', github: 'GitHub repository' }
const MAX_SHOWN_LINES = 400

// What the user just sent to the analyzer, shown in the thread in place of a plain message bubble.
export function ReviewSubmission({ review }) {
  const lines = review.code ? review.code.replace(/\s+$/, '').split('\n') : []
  return (
    <div className="submission">
      <header>
        <span className="submission-title">Sent to ARCHLINT</span>
        <span className="review-tag">Deterministic</span>
      </header>
      <dl>
        <div><dt>Source</dt><dd>{SOURCE_LABEL[review.source]}</dd></div>
        <div><dt>Input</dt><dd>{review.what}</dd></div>
        <div><dt>Environment</dt><dd>{envLabel(review.env)}</dd></div>
        <div><dt>Market</dt><dd>{marketLabel(review.market)}</dd></div>
      </dl>
      {lines.length > 0 && (
        <details>
          <summary>View submitted Terraform ({lines.length} lines)</summary>
          <pre className="submitted-code"><code>
            {lines.slice(0, MAX_SHOWN_LINES).map((l, i) => <span key={i} className="cl">{l || ' '}</span>)}
          </code></pre>
          {lines.length > MAX_SHOWN_LINES && <p className="submission-more">+ {lines.length - MAX_SHOWN_LINES} more lines not shown</p>}
        </details>
      )}
    </div>
  )
}

// Step list shown while the analyzer runs. TODO(review backend): if the endpoint reports real progress,
// drive `done` from those events instead of this timer.
export function ReviewProgress({ review }) {
  const steps = [
    `Reading ${review.source === 'zip' ? 'the .zip' : review.source === 'github' ? 'the repository' : 'the Terraform'}`,
    `Applying ${envLabel(review.env)} rules`,
    review.market ? `Pricing with ${review.market} rates` : 'Pricing components with a declared region',
    'Building the report',
  ]
  const [done, setDone] = useState(0)

  useEffect(() => {
    const t = setInterval(() => setDone((d) => Math.min(d + 1, steps.length - 1)), 600)
    return () => clearInterval(t)
  }, [steps.length])

  return (
    <div className="msg bot">
      <span className="who">Architecture Bot</span>
      <div className="body">
        <div className="progress-card" role="status" aria-live="polite">
          <strong>Analyzing with ARCHLINT…</strong>
          <ol>
            {steps.map((label, i) => (
              <li key={label} className={i < done ? 'done' : i === done ? 'active' : ''}>
                <span className="step-mark" aria-hidden="true">{i < done ? '✓' : ''}</span>
                {label}
              </li>
            ))}
          </ol>
        </div>
      </div>
    </div>
  )
}
