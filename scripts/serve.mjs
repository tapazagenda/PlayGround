import { createReadStream, statSync } from 'node:fs'
import { createServer } from 'node:http'
import { extname, join, normalize, resolve, sep } from 'node:path'

const root = resolve(process.cwd(), 'dist')
const port = Number(process.env.PORT || process.env.APP_PORT || 3000)
const host = '0.0.0.0'

const types = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.wasm': 'application/wasm'
}

const server = createServer((request, response) => {
  const started = performance.now()
  try {
    const url = new URL(request.url || '/', 'http://localhost')
    let pathname = decodeURIComponent(url.pathname)
    if (pathname.endsWith('/')) pathname += 'index.html'
    let file = resolve(join(root, normalize(pathname)))
    if (file !== root && !file.startsWith(root + sep)) {
      response.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' })
      response.end('Forbidden')
      return
    }
    try {
      if (statSync(file).isDirectory()) file = join(file, 'index.html')
    } catch {
      file = join(root, 'index.html')
    }
    if (!statSync(file).isFile()) throw new Error('Not a file')
    response.writeHead(200, {
      'Content-Type': types[extname(file).toLowerCase()] || 'application/octet-stream',
      'Cache-Control': 'no-cache',
      'X-Content-Type-Options': 'nosniff'
    })
    createReadStream(file).pipe(response)
  } catch {
    response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' })
    response.end('Not found')
  } finally {
    response.on('finish', () => {
      console.log(`[timing] ${request.method} ${request.url}: ${Math.round(performance.now() - started)} ms`)
    })
  }
})

server.listen(port, host, () => {
  console.log(`Serving ${root} on http://${host}:${port}`)
})

for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP']) {
  process.on(signal, () => {
    server.close(() => process.exit(0))
    setTimeout(() => process.exit(0), 3000).unref()
  })
}
