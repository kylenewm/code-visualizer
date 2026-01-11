# Summarize Changes

Explain what changed in plain English.

## Steps

1. Get the diff:
```bash
git diff
```

2. Summarize in this format:

### What Changed
- Bullet points of actual changes (not file names, actual logic changes)

### Why (if apparent)
- Intent behind changes

### Risk Areas
- Anything that might break
- Files that need testing

### In One Sentence
- "This change does X to achieve Y"

## Keep it short
- 5-10 bullets max
- Skip boilerplate changes (imports, formatting)
- Focus on logic and behavior changes
