import { useState, useRef, useEffect } from 'react'
import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { ReviewSourceTabs, ReviewOptions, ReviewSubmission, ReviewProgress, SOURCE_HINT } from './ReviewPanel.jsx'
import ReviewResult from './ReviewResult.jsx'

const COPILOT_URL = '/api/chat'
const DIAGRAM_URL = '/api/diagram'
const REVIEW_URL = '/api/review'
const REVIEW_UPLOAD_URL = '/api/review/upload'
const REVIEW_GITHUB_URL = '/api/review/github'
const GATEWAY_KEY = 'sk-arch-bot-gateway-key'

// Static catalog of models confirmed to work against /v1/chat/completions
// (same ids as opencode.json) - hardcoded so the frontend does not depend on
// a /v1/models call on every load. Models that return 502 "unsupported_api_for_model"
// are not included here.
const MODEL_CATALOG = {
  'gpt-4o-mini': 'GPT-4o mini',
  'gpt-4o-mini-2024-07-18': 'GPT-4o mini (2024-07-18)',
  'gpt-3.5-turbo': 'GPT-3.5 Turbo',
  'gpt-3.5-turbo-0613': 'GPT-3.5 Turbo (0613)',
  'gpt-5-mini': 'GPT-5 mini',
  'claude-haiku-4.5': 'Claude Haiku 4.5',
  'gemini-3.7-flash': 'Gemini 3.7 Flash',
  'gemini-3.8-flash': 'Gemini 3.8 Flash',
  'gpt-4o': 'GPT-4o',
  'gpt-4o-2024-05-13': 'GPT-4o (2024-05-13)',
  'gpt-4o-2024-08-06': 'GPT-4o (2024-08-06)',
  'gpt-4o-2024-11-20': 'GPT-4o (2024-11-20)',
  'gpt-4.1': 'GPT-4.1',
  'gpt-4.1-2025-04-14': 'GPT-4.1 (2025-04-14)',
  'gpt-4': 'GPT-4',
  'gpt-4-0613': 'GPT-4 (0613)',
  'gpt-4-0125-preview': 'GPT-4 (0125 Preview)',
  'gpt-4-o-preview': 'GPT-4o (Preview)',
  'kimi-k2.7-code': 'Kimi K2.7 Code',
  'claude-sonnet-5': 'Claude Sonnet 5',
  'claude-opus-4.7': 'Claude Opus 4.7',
  'claude-opus-4.8': 'Claude Opus 4.8',
  'claude-opus-5': 'Claude Opus 5',
  'claude-opus-5.5': 'Claude Opus 5.5',
}

// No real per-model price in the catalog, so an explicit cost tier per model
// family is defined (1 = cheapest, 3 = premium). Main sort key of the selector.
const MODEL_COST_TIER = {
  'gpt-4o-mini': 1, 'gpt-4o-mini-2024-07-18': 1, 'gpt-3.5-turbo': 1, 'gpt-3.5-turbo-0613': 1,
  'gpt-5-mini': 1, 'claude-haiku-4.5': 1, 'gemini-3.7-flash': 1, 'gemini-3.8-flash': 1,
  'gpt-4o': 2, 'gpt-4o-2024-05-13': 2, 'gpt-4o-2024-08-06': 2, 'gpt-4o-2024-11-20': 2,
  'gpt-4.1': 2, 'gpt-4.1-2025-04-14': 2, 'gpt-4': 2, 'gpt-4-0613': 2,
  'gpt-4-0125-preview': 2, 'gpt-4-o-preview': 2, 'kimi-k2.7-code': 2,
  'claude-sonnet-5': 3, 'claude-opus-4.7': 3, 'claude-opus-4.8': 3, 'claude-opus-5': 3, 'claude-opus-5.5': 3,
}
const TIER_LABEL = { 1: 'Low cost', 2: 'Standard', 3: 'Premium' }

// Attachment support: text-only files (code/markdown/config), read client-side
// and appended as fenced code blocks to the user's message. No backend/gateway
// changes needed - the combined text is sent as a normal string `content`.
const MAX_FILE_SIZE = 200 * 1024 // 200 KB per file
const MAX_TOTAL_SIZE = 500 * 1024 // 500 KB combined per message
const MAX_ZIP_SIZE = 25 * 1024 * 1024 // 25 MB for a Terraform .zip / .tf in review mode
const ALLOWED_EXTENSIONS = [
  '.txt', '.md', '.markdown', '.json', '.yaml', '.yml', '.csv', '.log',
  '.py', '.js', '.jsx', '.ts', '.tsx', '.java', '.xml', '.sql', '.sh',
  '.bat', '.ini', '.conf', '.cfg', '.toml', '.html', '.css', '.env',
]
const EXT_TO_LANG = {
  '.py': 'python', '.js': 'javascript', '.jsx': 'jsx', '.ts': 'typescript',
  '.tsx': 'tsx', '.java': 'java', '.json': 'json', '.yaml': 'yaml',
  '.yml': 'yaml', '.xml': 'xml', '.sql': 'sql', '.sh': 'bash', '.bat': 'bat',
  '.html': 'html', '.css': 'css', '.md': 'markdown', '.markdown': 'markdown',
  '.csv': 'csv', '.toml': 'toml',
}

const STARTERS = [
  { label: 'Generate diagram', icon: 'diagram', diagram: true, prompt: '' },
  { label: 'Review design', icon: 'review', review: true, prompt: '' },
  { label: 'Explain pattern', icon: 'explain', prompt: 'Explain when to use the circuit breaker pattern between a service and the LLM gateway.' },
  { label: 'Analyse document', icon: 'analyse', prompt: 'Analyse this architecture document and list the components, dependencies and risks:\n\n' },
]

function getExtension(filename) {
  const idx = filename.lastIndexOf('.')
  return idx === -1 ? '' : filename.slice(idx).toLowerCase()
}

function buildMessageWithAttachments(text, attachments) {
  if (attachments.length === 0) return text
  const blocks = attachments.map((a) => {
    const lang = EXT_TO_LANG[getExtension(a.name)] || ''
    return `--- Attached file: ${a.name} ---\n\`\`\`${lang}\n${a.content}\n\`\`\``
  })
  return [text, ...blocks].filter(Boolean).join('\n\n')
}

const Icon = {
  plus: <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M8 2v12M2 8h12" /></svg>,
  diagram: <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"><rect x="1.5" y="1.5" width="5" height="4" rx="1" /><rect x="9.5" y="10.5" width="5" height="4" rx="1" /><path d="M4 5.5V8h8v2.5" /></svg>,
  review: <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M8 1.5 13 3.5v3.7c0 3-2.1 5-5 5.8-2.9-.8-5-2.8-5-5.8V3.5Z" /><path d="m5.8 8 1.6 1.6L10.4 6.5" /></svg>,
  explain: <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M6 12.5h4M6.5 14.5h3M8 1.5a4.5 4.5 0 0 0-2.6 8.2c.4.3.6.8.6 1.3h4c0-.5.2-1 .6-1.3A4.5 4.5 0 0 0 8 1.5Z" /></svg>,
  analyse: <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M9 1.5H4.5a1 1 0 0 0-1 1v11a1 1 0 0 0 1 1H8M9 1.5l3.5 3.5V7M9 1.5V5h3.5" /><circle cx="11.5" cy="11.5" r="2.2" /><path d="m13.2 13.2 1.5 1.5" /></svg>,
  caret: <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><path d="m2.5 4.5 3.5 3.5 3.5-3.5" /></svg>,
  stop: <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><rect x="3" y="3" width="10" height="10" rx="2" /></svg>,
  up: <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 15V3M3.5 8.5 9 3l5.5 5.5" /></svg>,
  clip: <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><path d="M13.5 7.5 8 13a3.5 3.5 0 0 1-5-5l6-6a2.4 2.4 0 0 1 3.4 3.4l-6 6a1.2 1.2 0 0 1-1.7-1.7L9.5 4.5" /></svg>,
}

function AttachmentChips({ attachments, onRemove, disabled }) {
  if (attachments.length === 0) return null
  return (
    <div className="attachment-chips">
      {attachments.map((a) => (
        <span className="attachment-chip" key={a.id}>
          {Icon.clip} {a.name} <span className="attachment-size">({Math.ceil(a.size / 1024)} KB)</span>
          <button type="button" className="attachment-remove" onClick={() => onRemove(a.id)} disabled={disabled} aria-label={`Remove ${a.name}`}>×</button>
        </span>
      ))}
    </div>
  )
}

function TypingIndicator() {
  return (
    <div className="msg bot">
      <span className="who">Architecture Bot</span>
      <div className="body"><span className="typing"><i /><i /><i /></span></div>
    </div>
  )
}

const mdComponents = { a: (props) => <a {...props} target="_blank" rel="noreferrer" /> }

export default function ChatBot() {
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [streaming, setStreaming] = useState(false)
  const [error, setError] = useState(null)
  const [availableModels, setAvailableModels] = useState([])
  const [model, setModel] = useState('')
  const [menuOpen, setMenuOpen] = useState(false)
  const [diagramLoading, setDiagramLoading] = useState(false)
  const [diagramMode, setDiagramMode] = useState(false)
  const [reviewMode, setReviewMode] = useState(false)
  const [reviewSource, setReviewSource] = useState('paste')
  const [reviewEnv, setReviewEnv] = useState('unknown')
  const [reviewMarket, setReviewMarket] = useState('')
  const [reviewInvalid, setReviewInvalid] = useState({ env: false, market: false })
  const [optionsSignal, setOptionsSignal] = useState(0)
  const [reviewZip, setReviewZip] = useState(null)
  const [reviewRepo, setReviewRepo] = useState('')
  const [reviewLoading, setReviewLoading] = useState(false)
  const [attachments, setAttachments] = useState([])
  const [attachmentError, setAttachmentError] = useState(null)
  const bottomRef = useRef(null)
  const textareaRef = useRef(null)
  const revealTimerRef = useRef(null)
  const fileInputRef = useRef(null)
  const abortRef = useRef(null)
  const zipInputRef = useRef(null)
  const threadRef = useRef(null)
  const stickRef = useRef(true)
  const draftsRef = useRef({ chat: '', diagram: '', review: '' })
  const stopRevealRef = useRef(null)

  const busy = loading || streaming || diagramLoading || reviewLoading
  const started = messages.length > 0 || busy

  useEffect(() => {
    // cleanup on unmount: avoid a dangling interval calling setState on an unmounted component
    return () => {
      if (revealTimerRef.current) clearInterval(revealTimerRef.current)
    }
  }, [])

  useEffect(() => {
    // Hardcoded models (MODEL_CATALOG above) - /v1/models is no longer queried,
    // they are only sorted by MODEL_COST_TIER (cheapest first) and then alphabetically.
    const ids = Object.keys(MODEL_CATALOG).sort((a, b) => {
      const tierA = MODEL_COST_TIER[a] ?? Infinity
      const tierB = MODEL_COST_TIER[b] ?? Infinity
      if (tierA !== tierB) return tierA - tierB
      return a.localeCompare(b)
    })
    setAvailableModels(ids)
    setModel((current) => current || ids[0] || '')
  }, [])

  useEffect(() => {
    // While the typewriter effect is running, `messages` updates on every tick (every 30ms).
    // Smooth-scrolling on each tick keeps restarting the animation and reads as jitter,
    // so use instant scrolling during streaming and animate only for discrete events.
    //
    // A finished review is the exception: it is a long report, so show it from its first line
    // (the headline numbers) instead of dropping the reader at the bottom of it.
    if (messages.at(-1)?.reviewResult) {
      stickRef.current = false
      const results = threadRef.current?.querySelectorAll('[data-result]')
      results?.[results.length - 1]?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      return
    }
    bottomRef.current?.scrollIntoView({ behavior: streaming ? 'auto' : 'smooth', block: 'end' })
  }, [messages, loading, streaming])

  useEffect(() => {
    textareaRef.current?.focus()
  }, [])

  useEffect(() => {
    // The dock grows and shrinks (review panel, tall textarea) and squeezes the thread. If the user was
    // reading the latest message, keep it in view instead of letting the dock cover the last lines.
    const el = threadRef.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(() => {
      if (stickRef.current) el.scrollTop = el.scrollHeight
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  useEffect(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = el.scrollHeight + 'px' // CSS max-height caps it, then the textarea scrolls
    // reviewMode / reviewSource swap the textarea for a new element, so its height must be recalculated too
  }, [input, reviewMode, reviewSource])

  useEffect(() => {
    if (!menuOpen) return
    const close = () => setMenuOpen(false)
    document.addEventListener('click', close)
    return () => document.removeEventListener('click', close)
  }, [menuOpen])

  const handleKeyDown = (e) => {
    if (e.key === 'Backspace' && (diagramMode || reviewMode) && !input) switchMode('chat')
    if (e.key === 'Enter' && reviewMode && reviewSource === 'paste') {
      // Terraform is multi-line: plain Enter stays a newline, Ctrl/Cmd+Enter runs the review.
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault()
        runReview()
      }
      return
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      diagramMode ? sendDiagram() : reviewMode ? runReview() : send()
    }
  }

  const handleAttachClick = () => fileInputRef.current?.click()

  const handleFilesSelected = async (e) => {
    const files = Array.from(e.target.files || [])
    e.target.value = '' // allow re-selecting the same file name later
    if (files.length === 0) return

    setAttachmentError(null)
    const rejected = []
    const accepted = []
    let runningTotal = attachments.reduce((sum, a) => sum + a.size, 0)

    for (const file of files) {
      const ext = getExtension(file.name)
      if (!ALLOWED_EXTENSIONS.includes(ext)) {
        rejected.push(`${file.name} (unsupported type: ${ext || 'no extension'})`)
        continue
      }
      if (file.size > MAX_FILE_SIZE) {
        rejected.push(`${file.name} (exceeds ${MAX_FILE_SIZE / 1024} KB)`)
        continue
      }
      if (runningTotal + file.size > MAX_TOTAL_SIZE) {
        rejected.push(`${file.name} (would exceed ${MAX_TOTAL_SIZE / 1024} KB total)`)
        continue
      }

      try {
        const content = await file.text()
        // eslint-disable-next-line no-control-regex
        if (/\u0000/.test(content)) {
          rejected.push(`${file.name} (looks like a binary file, not text)`)
          continue
        }
        accepted.push({ id: `${Date.now()}-${Math.random().toString(36).slice(2)}`, name: file.name, content, size: file.size })
        runningTotal += file.size
      } catch {
        rejected.push(`${file.name} (could not be read as text)`)
      }
    }

    if (accepted.length > 0) {
      setAttachments((prev) => [...prev, ...accepted])
    }
    if (rejected.length > 0) {
      setAttachmentError(`Some files were skipped: ${rejected.join(', ')}`)
    }
  }

  const removeAttachment = (id) => {
    setAttachments((prev) => prev.filter((a) => a.id !== id))
  }

  // Dedicated endpoint (bypasses the chat/guardrail path entirely): the LLM
  // plans a sequence of drawio-mcp tool calls following the AWS containment
  // hierarchy skill, poc_server executes them against drawio-mcp.exe and
  // returns a .drawio file ready to download/open.
  const sendDiagram = async () => {
    const prompt = input.trim()
    if (!prompt || loading || streaming || diagramLoading) return

    const userMsg = { role: 'user', content: `📐 Diagram: ${prompt}` }
    const history = [...messages, userMsg]
    setMessages(history)
    setInput('')
    setDiagramLoading(true)
    setError(null)

    try {
      const res = await fetch(DIAGRAM_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt }),
      })
      const body = await res.json().catch(() => null)

      if (!res.ok) {
        const detail = body?.detail || res.statusText
        setMessages([...history, { role: 'assistant', content: `Could not generate the diagram: ${detail}`, refusal: true }])
        return
      }

      // body.download_url is the raw backend path (/v1/diagram/download/...),
      // which the vite dev server doesn't know how to route (only /api/* is
      // proxied) -> build the proxied path instead, or a 404 on click.
      const fileUrl = `${DIAGRAM_URL}/download/${body.filename}`

      // Fetch the bytes ourselves and trigger the browser's native "Save As"
      // instead of relying on the user clicking a link (an <a href> to a
      // .drawio file may just navigate/render as text instead of downloading,
      // depending on the browser's mime-type handling).
      try {
        const fileRes = await fetch(fileUrl)
        const blob = await fileRes.blob()
        const objectUrl = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = objectUrl
        a.download = body.filename
        document.body.appendChild(a)
        a.click()
        a.remove()
        URL.revokeObjectURL(objectUrl)
      } catch {
        // ignore: the manual link below still works as a fallback
      }

      setMessages([
        ...history,
        {
          role: 'assistant',
          content: `📐 Diagram ready and downloaded: **${body.filename}**\n\nIf the download didn't start, [click here](${fileUrl}) to get it, then open it with [draw.io](https://app.diagrams.net/).`,
        },
      ])
    } catch (err) {
      setError(err.message)
    } finally {
      setDiagramLoading(false)
    }
  }

  const send = async () => {
    const text = input.trim()
    if ((!text && attachments.length === 0) || loading || streaming) return

    const combinedContent = buildMessageWithAttachments(text, attachments)
    // Keep the chat bubble readable: show the typed text plus a compact list
    // of attached filenames, instead of dumping the full file contents into
    // the UI (the full content still goes to the model via `content` below).
    const displayContent = [text, ...attachments.map((a) => `📎 ${a.name}`)].filter(Boolean).join('\n')

    const userMsg = { role: 'user', content: combinedContent, displayContent }
    const history = [...messages, userMsg]
    setMessages(history)
    setInput('')
    setAttachments([])
    setAttachmentError(null)
    setLoading(true)
    setError(null)

    const controller = new AbortController()
    abortRef.current = controller
    let fullText = ''
    let revealed = 0

    try {
      const res = await fetch(COPILOT_URL, {
        method: 'POST',
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${GATEWAY_KEY}`,
        },
        body: JSON.stringify({
          model,
          stream: true,
          messages: history.map(({ role, content }) => ({ role, content })),
        }),
      })

      if (!res.ok) {
        const body = await res.json().catch(() => null)
        const detail = body?.error?.message || body?.detail || res.statusText
        setMessages([...history, { role: 'assistant', content: detail, refusal: true }])
        return
      }

      // guardrail + RAG first token can take a moment: keep the typing dots
      // until content starts arriving, then reveal it with a typewriter effect.
      // The underlying gateway may deliver the whole answer in one chunk instead
      // of true token-by-token streaming, so the reveal speed is decoupled from
      // network arrival - this keeps the "in progress" preview visible either way.
      //
      // Reveal amount is computed from REAL elapsed time (chars/sec), not a
      // fixed amount per timer tick. This matters because browsers throttle
      // setInterval heavily in background tabs (often to ~1 tick/sec or
      // less) - a fixed-per-tick approach would look "frozen" while the tab
      // is unfocused and only crawl forward on the few ticks that do fire.
      // With a time-based reveal, switching back to the tab immediately
      // catches the text up to where it should be, instead of resuming from
      // wherever the throttled ticks left it.
      const REVEAL_CHARS_PER_SECOND = 220
      const REVEAL_TICK_MS = 30

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      let doneReading = false
      let revealTimer = null
      let revealStartedAt = null

      const finalize = () => {
        if (revealTimer) {
          clearInterval(revealTimer)
          revealTimer = null
          revealTimerRef.current = null
        }
        setMessages([...history, { role: 'assistant', content: fullText || '(no response)' }])
        setStreaming(false)
      }

      // Stop during the typewriter phase: the network read may already be done
      // (so abort() has nothing to reject), hence stop the reveal loop directly.
      stopRevealRef.current = () => {
        if (revealTimer) {
          clearInterval(revealTimer)
          revealTimer = null
          revealTimerRef.current = null
        }
        const partial = fullText.slice(0, revealed)
        setMessages(partial ? [...history, { role: 'assistant', content: partial }] : history)
        setStreaming(false)
      }

      const startReveal = () => {
        if (revealTimer) return
        revealStartedAt = performance.now()
        revealTimer = setInterval(() => {
          const elapsedSeconds = (performance.now() - revealStartedAt) / 1000
          const target = Math.min(fullText.length, Math.floor(elapsedSeconds * REVEAL_CHARS_PER_SECOND))
          if (target > revealed) {
            revealed = target
            setMessages([...history, { role: 'assistant', content: fullText.slice(0, revealed), streaming: true }])
          }
          if (revealed >= fullText.length && doneReading) {
            finalize()
          }
        }, REVEAL_TICK_MS)
        revealTimerRef.current = revealTimer
      }

      while (true) {
        const { done, value } = await reader.read()
        if (done) {
          doneReading = true
          break
        }
        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop()

        for (const line of lines) {
          const trimmed = line.trim()
          if (!trimmed.startsWith('data:')) continue
          const payload = trimmed.slice(5).trim()
          if (payload === '[DONE]') continue

          let json
          try {
            json = JSON.parse(payload)
          } catch {
            continue
          }
          const delta = json.choices?.[0]?.delta?.content
          if (!delta) continue

          if (fullText.length === 0) {
            setLoading(false)
            setStreaming(true)
            startReveal()
          }
          fullText += delta
        }
      }

      // reading finished: if the whole answer arrived before the reveal loop
      // had a chance to start (or catch up), make sure it still plays out.
      // If the reveal had already caught up with fullText by the time the
      // fetch finished, finalize() only fires on its *next* tick, so we must
      // finalize explicitly here too, otherwise `streaming` stays true forever
      // and the input locks up.
      if (fullText && revealed < fullText.length) {
        startReveal()
      } else if (fullText) {
        finalize()
      } else {
        setMessages([...history, { role: 'assistant', content: '(no response)' }])
        setStreaming(false)
      }
    } catch (err) {
      if (revealTimerRef.current) {
        clearInterval(revealTimerRef.current)
        revealTimerRef.current = null
      }
      if (err.name === 'AbortError') {
        // user pressed Stop: keep whatever was already revealed as a finished message
        const partial = fullText.slice(0, revealed)
        setMessages(partial ? [...history, { role: 'assistant', content: partial }] : history)
      } else {
        setError(err.message)
      }
      setStreaming(false)
    } finally {
      abortRef.current = null
      setLoading(false)
    }
  }

  const reviewReady =
    reviewSource === 'paste' ? Boolean(input.trim()) : reviewSource === 'zip' ? Boolean(reviewZip) : Boolean(reviewRepo.trim())

  const handleZipSelected = (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    if (!/\.(zip|tf)$/i.test(file.name)) return setAttachmentError(`${file.name} is not a .zip or .tf file`)
    if (file.size > MAX_ZIP_SIZE) return setAttachmentError(`${file.name} exceeds ${MAX_ZIP_SIZE / 1024 / 1024} MB`)
    setAttachmentError(null)
    setReviewZip(file)
  }

  // Architecture review (ArchLint). Three sources, one result shape:
  //   paste  -> POST /api/review         JSON { files: { 'main.tf': ... }, env, default_region }
  //   zip    -> POST /api/review/upload  multipart 'file', env / default_region as query params
  //   github -> POST /api/review/github  JSON { url, env, default_region }
  const runReview = async () => {
    if (!reviewReady || busy) return
    // Environment and market start unset on purpose: make the user choose them before anything is sent.
    const missing = { env: reviewEnv === 'unknown', market: !reviewMarket }
    if (missing.env || missing.market) {
      setReviewInvalid(missing)
      setOptionsSignal((n) => n + 1)
      return
    }
    setReviewInvalid({ env: false, market: false })
    const envValue = reviewEnv === 'unknown' ? null : reviewEnv
    const region = reviewMarket || null
    const what =
      reviewSource === 'paste'
        ? `Terraform pasted (${input.trim().split('\n').length} lines)`
        : reviewSource === 'zip'
          ? reviewZip.name
          : reviewRepo.trim()
    const review = {
      source: reviewSource,
      env: reviewEnv,
      market: reviewMarket,
      what,
      code: reviewSource === 'paste' ? input : undefined,
    }
    const history = [...messages, { role: 'user', content: `Review: ${what}`, review }]
    const zip = reviewZip
    const repo = reviewRepo.trim()
    const terraform = input
    setMessages(history)
    setInput('')
    setReviewZip(null)
    setReviewRepo('')
    setReviewLoading(true)
    setError(null)

    try {
      let res
      if (reviewSource === 'zip') {
        const params = new URLSearchParams()
        if (envValue) params.set('env', envValue)
        if (region) params.set('default_region', region)
        const body = new FormData()
        body.append('file', zip)
        res = await fetch(`${REVIEW_UPLOAD_URL}?${params}`, { method: 'POST', body })
      } else if (reviewSource === 'github') {
        res = await fetch(REVIEW_GITHUB_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: repo, env: envValue, default_region: region }),
        })
      } else {
        res = await fetch(REVIEW_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ files: { 'main.tf': terraform }, env: envValue, default_region: region }),
        })
      }
      const body = await res.json().catch(() => null)
      if (!res.ok) {
        const detail = body?.detail
        throw new Error(typeof detail === 'string' ? detail : detail ? JSON.stringify(detail) : `HTTP ${res.status}`)
      }
      setMessages([...history, { role: 'assistant', reviewResult: body }])
    } catch (err) {
      setMessages([...history, { role: 'assistant', content: `Could not run the review: ${err.message}`, refusal: true }])
    } finally {
      setReviewLoading(false)
    }
  }

  // Each mode keeps its own draft: leaving a mode stores the text, entering one restores it.
  const switchMode = (next) => {
    const current = diagramMode ? 'diagram' : reviewMode ? 'review' : 'chat'
    if (next === current) return
    draftsRef.current[current] = input
    setInput(draftsRef.current[next])
    setDiagramMode(next === 'diagram')
    setReviewMode(next === 'review')
  }

  const stop = () => {
    stopRevealRef.current?.()
    abortRef.current?.abort()
  }

  const pickStarter = (s) => {
    if (s.diagram) {
      switchMode(diagramMode ? 'chat' : 'diagram') // same chip again turns the mode off
    } else if (s.review) {
      switchMode(reviewMode ? 'chat' : 'review')
    } else {
      switchMode('chat') // picking another starter leaves diagram / review mode
      setInput(s.prompt)
    }
    textareaRef.current?.focus()
  }

  const generating = loading || streaming
  const sendDisabled = reviewMode
    ? busy || !reviewReady
    : diagramLoading || (!generating && !input.trim() && attachments.length === 0)


  const gutterRef = useRef(null)
  const lineCount = input.split('\n').length
  const lineNumbers = Array.from({ length: lineCount }, (_, i) => i + 1).join('\n')
  const syncGutter = (e) => {
    if (gutterRef.current) gutterRef.current.scrollTop = e.target.scrollTop
  }

  const promptField = (
        <textarea
          id="prompt"
          className={reviewMode ? 'code-input' : undefined}
          spellCheck={reviewMode ? false : undefined}
          wrap={reviewMode ? 'off' : undefined}
          ref={textareaRef}
          onScroll={syncGutter}
          value={input}
          onChange={(e) => {
            setInput(e.target.value)
          }}
          onKeyDown={handleKeyDown}
          disabled={streaming}
          placeholder={
            diagramMode
              ? 'Describe the AWS architecture to diagram (e.g. EKS cluster, Multi-AZ, RDS)'
              : reviewMode
                ? 'Paste your Terraform here…'
                : 'Paste your architecture document or type your question'
          }
          rows={2}
        />
  )

  return (
    <div className={'chat' + (started ? ' has-thread' : '')}>
      <main className="stage">
        <section className="hero">
          <p className="eyebrow">Architecture Bot</p>
          <h1>What are we <b>designing</b> today?</h1>
        </section>

        <section
          className="thread"
          aria-live="polite"
          ref={threadRef}
          onScroll={(e) => {
            const el = e.currentTarget
            stickRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80
          }}
        >
          {messages.map((m, i) => (
            <div key={i} data-result={m.reviewResult ? '1' : undefined} className={`msg ${m.role === 'user' ? 'user' : 'bot'}`}>
              <span className="who">{m.role === 'user' ? 'You' : 'Architecture Bot'}</span>
              <div className={`body${m.refusal ? ' refusal' : ''}${m.streaming ? ' streaming' : ''}${m.review ? ' has-card' : ''}${m.reviewResult ? ' wide' : ''}`}>
                {m.role === 'assistant' ? (
                  m.reviewResult ? (
                    <ReviewResult result={m.reviewResult} />
                  ) : m.streaming ? (
                    // While the typewriter reveal is mid-flight, `m.content` is incomplete
                    // markdown (an unclosed ``` code fence, a half-written heading, etc.).
                    // Re-parsing that on every tick makes react-markdown flip the DOM
                    // structure unpredictably and the page "jumps". Render plain text
                    // during streaming, and switch to full Markdown once the message is complete.
                    <span className="streaming-plain-text">{m.content}</span>
                  ) : (
                    <Markdown remarkPlugins={[remarkGfm]} components={mdComponents}>{m.content}</Markdown>
                  )
                ) : (
                  m.review ? <ReviewSubmission review={m.review} /> : m.displayContent || m.content
                )}
              </div>
            </div>
          ))}
          {(loading || diagramLoading) && <TypingIndicator />}
          {reviewLoading && messages.at(-1)?.review && <ReviewProgress review={messages.at(-1).review} />}
          <div ref={bottomRef} />
        </section>

        <div className="dock">
          <div className="chips">
            {STARTERS.map((s) => (
              <button key={s.label} type="button" className={`chip${(s.diagram && diagramMode) || (s.review && reviewMode) ? ' on' : ''}`} aria-pressed={s.diagram ? diagramMode : s.review ? reviewMode : undefined} onClick={() => pickStarter(s)}>{Icon[s.icon]}{s.label}</button>
            ))}
          </div>

          <div className="composer">
            {reviewMode && <ReviewSourceTabs source={reviewSource} onSource={setReviewSource} onClose={() => switchMode('chat')} disabled={busy} />}
            <AttachmentChips attachments={attachments} onRemove={removeAttachment} disabled={busy} />
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept={ALLOWED_EXTENSIONS.join(',')}
              style={{ display: 'none' }}
              onChange={handleFilesSelected}
            />
            <input ref={zipInputRef} type="file" accept=".zip,.tf" style={{ display: 'none' }} onChange={handleZipSelected} />
            {reviewMode && reviewSource === 'zip' && (
              <button type="button" className="dropzone" onClick={() => zipInputRef.current?.click()} disabled={busy}>
                {reviewZip ? (
                  <><b>{reviewZip.name}</b><span>{Math.ceil(reviewZip.size / 1024)} KB · click to replace</span></>
                ) : (
                  <><b>Choose a .zip or .tf file</b><span>Up to {MAX_ZIP_SIZE / 1024 / 1024} MB</span></>
                )}
              </button>
            )}
            {reviewMode && reviewSource === 'zip' && reviewZip && (
              <button type="button" className="mini remove-file" onClick={() => setReviewZip(null)} disabled={busy}>
                Remove {reviewZip.name}
              </button>
            )}
            {reviewMode && reviewSource === 'github' && (
              <>
                <label htmlFor="review-repo" className="sr">GitHub repository URL</label>
                <input
                  id="review-repo"
                  className="repo-input"
                  type="url"
                  value={reviewRepo}
                  onChange={(e) => setReviewRepo(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') runReview() }}
                  placeholder="https://github.com/owner/repo/tree/main/infra/prod"
                  disabled={busy}
                />
              </>
            )}
            {(!reviewMode || reviewSource === 'paste') && (
              <>
              <label htmlFor="prompt" className="sr">Message</label>
            {reviewMode ? (
              <div className="code-wrap">
                <div className="gutter" ref={gutterRef} aria-hidden="true" style={{ width: `calc(${String(lineCount).length}ch + 26px)` }}>
                  {lineNumbers}
                </div>
                {promptField}
              </div>
            ) : (
              promptField
            )}
            <div className={`hint${reviewMode && (reviewInvalid.env || reviewInvalid.market) ? ' hint-error' : ''}`} role={reviewMode && (reviewInvalid.env || reviewInvalid.market) ? 'alert' : undefined}>
              {reviewMode && (reviewInvalid.env || reviewInvalid.market)
                ? `Choose ${reviewInvalid.env && reviewInvalid.market ? 'an Environment and a Default market' : reviewInvalid.env ? 'an Environment' : 'a Default market'} to run the review.`
                : !reviewMode
                ? 'Enter to send · Shift + Enter starts a new line'
                : reviewSource === 'paste'
                  ? reviewReady ? 'Ctrl/⌘ + Enter to run the review' : 'Paste your Terraform to enable the review'
                  : SOURCE_HINT[reviewSource]}
            </div>
              </>
            )}
            <div className="tools">
              <button
                type="button"
                className="icon-btn"
                onClick={handleAttachClick}
                disabled={busy || diagramMode || reviewMode}
                aria-label="Attach file"
                title={diagramMode || reviewMode ? 'Attachments are only available in chat mode' : 'Attach text/code files'}
              >
                {Icon.plus}
              </button>
              {diagramMode && (
                <button
                  type="button"
                  className="ghost diagram-btn active"
                  onClick={() => switchMode('chat')}
                  disabled={busy}
                  aria-label="Turn off diagram mode"
                  title="Turn off diagram mode"
                >
                  {Icon.diagram}
                  <span>Diagram mode</span>
                  <span className="pill-x" aria-hidden="true">×</span>
                </button>
              )}
              {reviewMode && (
                <ReviewOptions
                  env={reviewEnv}
                  onEnv={(v) => { setReviewEnv(v); if (v !== 'unknown') setReviewInvalid((m) => ({ ...m, env: false })) }}
                  market={reviewMarket}
                  onMarket={(v) => { setReviewMarket(v); if (v) setReviewInvalid((m) => ({ ...m, market: false })) }}
                  disabled={busy}
                  invalid={reviewInvalid}
                  signal={optionsSignal}
                />
              )}
              <span className="spacer" />
              {!reviewMode && (
                <div className="mode">
                  <button
                    type="button"
                    className="ghost"
                    aria-haspopup="menu"
                    aria-expanded={menuOpen}
                    disabled={busy || availableModels.length === 0}
                    onClick={(e) => { e.stopPropagation(); setMenuOpen((o) => !o) }}
                  >
                    <span style={{ display: 'inline' }}>{MODEL_CATALOG[model] || model || 'Model'}</span>{Icon.caret}
                  </button>
                  <div className="menu" role="menu" hidden={!menuOpen}>
                    {availableModels.map((m) => (
                      <button key={m} role="menuitemradio" aria-checked={m === model} onClick={() => setModel(m)}>
                        <b>{MODEL_CATALOG[m] || m}</b>
                        <span>{TIER_LABEL[MODEL_COST_TIER[m]] || ''}</span>
                        <em>{m === model ? '✓' : ''}</em>
                      </button>
                    ))}
                  </div>
                </div>
              )}
              <button
                type="button"
                className={`send${diagramMode || reviewMode ? ' diagram-active' : ''}${reviewMode && !generating ? ' run' : ''}${generating ? ' stop' : ''}`}
                onClick={generating ? stop : diagramMode ? sendDiagram : reviewMode ? runReview : send}
                disabled={sendDisabled}
                aria-label={generating ? 'Stop generating' : diagramMode ? 'Generate diagram' : reviewMode ? 'Run review' : 'Send'}
                title={generating ? 'Stop generating' : diagramMode ? 'Generate diagram' : reviewMode ? 'Run review' : 'Send'}
              >
                {generating ? Icon.stop : diagramLoading || reviewLoading ? <span className="spin" aria-hidden="true" /> : diagramMode ? Icon.diagram : reviewMode ? <>{Icon.review}<span>Run review</span></> : Icon.up}
              </button>
            </div>
          </div>
        </div>
      </main>

      <footer className="foot">
        {attachmentError && <div className="foot-error">{attachmentError}</div>}
        {error && <div className="foot-error">{error}</div>}
        {!error && (
          <>Connected to Copilot · <b>{model}</b> · Shift+Enter for new line</>
        )}
      </footer>
    </div>
  )
}
