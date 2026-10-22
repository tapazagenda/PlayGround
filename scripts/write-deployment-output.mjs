import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'

const project = resolve(process.env.PROJECT_DIR || process.cwd())
const directory = resolve(project, 'dist')
const target = resolve(process.env.OPENCODE_WEB_DIR || '/home/runner/work/_temp/omgithub-web', 'deployment-output.json')

mkdirSync(dirname(target), { recursive: true })
writeFileSync(target, JSON.stringify({ project, directory }))
mkdirSync(directory, { recursive: true })
console.log(`Wrote ${target}`)
console.log(JSON.stringify({ project, directory }))
