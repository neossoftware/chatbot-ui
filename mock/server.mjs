// Local stand-ins for the on-prem services so the UI runs unchanged:
//   :4000  chat completions (OpenAI-style SSE)   <- /api/chat
//   :3030  models + drawio diagram generation    <- /api/models, /api/diagram
import http from 'node:http'
import { readFileSync } from 'node:fs'

const json = (res, status, body) => {
  res.writeHead(status, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify(body))
}
const readBody = (req) => new Promise((resolve) => {
  let raw = ''
  req.on('data', (c) => (raw += c))
  req.on('end', () => { try { resolve(JSON.parse(raw || '{}')) } catch { resolve({}) } })
})
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const ANSWERS = [
  [/eks|terraform|deploy/i, readFileSync(new URL('./eks-answer.md', import.meta.url), 'utf8')],
  [/pattern|circuit|breaker/i, `A **circuit breaker** stops a service from hammering a dependency that is already failing.

| State | Behaviour |
|---|---|
| Closed | Calls pass through, failures are counted |
| Open | Calls fail fast for a cool-down period |
| Half-open | A few trial calls decide whether to close again |

Use it between the frontend API and the LLM gateway, with a timeout shorter than the user's patience.`],
  [/review|risk|gap|spof/i, `Three things stand out in this design:

- **Single gateway.** One process carries every request. Add a health check and a restart policy.
- **No retry budget.** Wrap model calls in a circuit breaker with a timeout.
- **Prompt logging.** Redact customer data before it reaches \`server_3030.log\`.

\`\`\`yaml
gateway:
  timeout_ms: 20000
  retries: 1
  log_redaction: true
\`\`\``],
]
const FALLBACK = `Got it. Here is how I would read this:

1. List the components and what each one owns.
2. Trace the data flow from the browser to the model and back.
3. Flag single points of failure and unencrypted hops.

Paste the document, or switch on **Generate architecture diagram** to get a \`.drawio\` file.`

const DRAWIO = `<mxfile host="app.diagrams.net"><diagram name="AWS"><mxGraphModel><root>
<mxCell id="0"/><mxCell id="1" parent="0"/>
<mxCell id="vpc" value="VPC 10.0.0.0/16" style="rounded=1;fillColor=none;dashed=1;strokeColor=#147EBA;" vertex="1" parent="1"><mxGeometry x="40" y="40" width="560" height="260" as="geometry"/></mxCell>
<mxCell id="eks" value="EKS cluster" style="rounded=1;fillColor=#F58534;fontColor=#fff;" vertex="1" parent="1"><mxGeometry x="100" y="120" width="140" height="70" as="geometry"/></mxCell>
<mxCell id="rds" value="RDS Multi-AZ" style="rounded=1;fillColor=#3B48CC;fontColor=#fff;" vertex="1" parent="1"><mxGeometry x="400" y="120" width="140" height="70" as="geometry"/></mxCell>
<mxCell id="e1" style="endArrow=classic;" edge="1" parent="1" source="eks" target="rds"><mxGeometry relative="1" as="geometry"/></mxCell>
</root></mxGraphModel></diagram></mxfile>`

// ---- :4000 chat ----
http.createServer(async (req, res) => {
  if (req.method !== 'POST' || req.url !== '/v1/chat/completions') return json(res, 404, { detail: 'Not found' })
  const { messages = [], stream } = await readBody(req)
  const last = messages.filter((m) => m.role === 'user').at(-1)?.content ?? ''
  if (/password|secret|api[_-]?key/i.test(last)) {
    return json(res, 400, { error: { message: 'Blocked by guardrail: the request may contain credentials. Remove them and try again.' } })
  }
  const answer = (ANSWERS.find(([re]) => re.test(last)) ?? [, FALLBACK])[1]
  if (!stream) return json(res, 200, { choices: [{ message: { role: 'assistant', content: answer } }] })
  res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' })
  await sleep(700) // guardrail + RAG latency before the first token
  for (let i = 0; i < answer.length; i += 14) {
    res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: answer.slice(i, i + 14) } }] })}\n\n`)
    await sleep(25)
  }
  res.write('data: [DONE]\n\n')
  res.end()
}).listen(4000, '127.0.0.1', () => console.log('mock chat     http://127.0.0.1:4000'))

// ---- :3030 models + diagram ----
http.createServer(async (req, res) => {
  if (req.method === 'GET' && req.url === '/v1/models') {
    return json(res, 200, { data: ['claude-haiku-4.5', 'gpt-4o-mini', 'claude-sonnet-5'].map((id) => ({ id })) })
  }
  if (req.method === 'POST' && req.url === '/v1/diagram') {
    const { prompt } = await readBody(req)
    if (!prompt) return json(res, 422, { detail: 'prompt is required' })
    await sleep(1200)
    return json(res, 200, { filename: 'aws-architecture.drawio', download_url: '/v1/diagram/download/aws-architecture.drawio' })
  }
  if (req.method === 'GET' && req.url.startsWith('/v1/diagram/download/')) {
    res.writeHead(200, { 'Content-Type': 'application/xml', 'Content-Disposition': 'attachment; filename="aws-architecture.drawio"' })
    return res.end(DRAWIO)
  }
  json(res, 404, { detail: 'Not found' })
}).listen(3030, '127.0.0.1', () => console.log('mock services http://127.0.0.1:3030'))
