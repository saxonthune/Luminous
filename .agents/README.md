# Shared agent resources

This directory is the repository's tool-neutral source of agent context.

- [`../AGENTS.md`](../AGENTS.md) is the project-wide instruction file.
- `skills/` contains reusable, Markdown-based agent skills. Edit skills here.
- `hooks/` contains project hooks that are not intrinsically tied to a particular
  agent.

Compatibility paths intentionally point here:

- `.claude/skills` → `.agents/skills`
- `.claude/hooks` → `.agents/hooks`
- `.codex/skills` → `.agents/skills`

Keep tool-specific configuration in its tool directory (for example,
`.claude/settings.json`). Do not edit a compatibility path: edit `.agents/` instead.
Agents whose runtime does not auto-discover project skills should read the relevant
`SKILL.md` directly.
