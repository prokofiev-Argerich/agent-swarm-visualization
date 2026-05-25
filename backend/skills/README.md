# Runtime Skills

This directory contains runtime-loadable skills for the agent framework.

Each skill should follow the structure:

```
skills/<skill-name>/SKILL.md
```

## Skill format

A `SKILL.md` must include YAML frontmatter with at least `name` and `description`:

```yaml
---
name: my-skill
description: What this skill does
auto-load: true
---
```

## Loading order

The runtime searches for skills in this order:

1. `AGENT_SKILLS_DIR` environment variable
2. `./skills` (relative to CWD)
3. `./backend/skills`

## vs spells/

`spells/` contains design-pattern notes for multi-agent orchestration (not loaded by runtime).
This directory (`backend/skills/`) is the official runtime skill entry point.
