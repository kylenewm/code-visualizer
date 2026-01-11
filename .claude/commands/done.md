# Mark Work Done

Before marking any work complete, verify it actually works.

## Steps

1. **Run tests** — Use `/test` command (auto-detects framework)

2. **Run linter** — Detect linter:
   - Python: `ruff check`, `flake8`, `pylint`
   - JS/TS: `eslint`, `npm run lint`
   - Check pyproject.toml, package.json for lint scripts
   - If no linter found, skip with note

3. **Re-read the original request** — Scroll up, find what user asked for

4. **Check each requirement** — List requirements, verify each one:
   - If unclear whether requirement is met, ask user
   - If requirement is ambiguous, ask user to clarify

5. **Only if ALL pass:** Mark the task complete

## If anything fails

- Fix it first
- Re-run verification
- Do NOT mark done until it passes

## When uncertain

Use AskUserQuestion tool:
- "Does this meet your requirements?"
- "Should I also handle [edge case]?"
- "The tests pass but I'm unsure about [X]. Is this correct?"
