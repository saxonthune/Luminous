#!/usr/bin/env node

import { cpSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const template = join(__dirname, '..', 'templates', 'claude-skill', 'SKILL.md')
const dest = join(process.cwd(), '.claude', 'skills', 'luminous')

mkdirSync(dest, { recursive: true })
cpSync(template, join(dest, 'SKILL.md'))

console.log('Installed Luminous skill → .claude/skills/luminous/SKILL.md')
