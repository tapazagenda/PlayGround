import { cp, mkdir, rm, stat } from 'node:fs/promises'
import { join, resolve } from 'node:path'

const root = resolve(process.cwd())
const source = join(root, 'src')
const output = join(root, 'dist')

const started = performance.now()
await stat(join(source, 'index.html'))
await rm(output, { recursive: true, force: true })
await mkdir(output, { recursive: true })
await cp(source, output, { recursive: true })
console.log(`[timing] build static assets: ${Math.round(performance.now() - started)} ms`)
console.log(`Built ${output}`)
