#!/usr/bin/env node

import { cpSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const template = join(__dirname, '..', 'templates', 'agent-skill', 'SKILL.md')
const dest = join(process.cwd(), '.agents', 'skills', 'luminous')

mkdirSync(dest, { recursive: true })
cpSync(template, join(dest, 'SKILL.md'))

console.log('Installed Luminous skill → .agents/skills/luminous/SKILL.md')
