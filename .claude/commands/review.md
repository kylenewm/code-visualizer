# Code Review (Subagent)

Spawn a fresh agent to review work with no context bias.

## What This Does

Launches a separate agent via Task tool to review the current changes. Fresh eyes catch issues the working agent missed.

## Steps

1. Get the diff:
```bash
git diff HEAD
```

2. **Spawn review subagent** — Call the Task tool with:

```
Task tool parameters:
  subagent_type: "Explore"
  description: "Review code changes"
  prompt: |
    Review this diff for:
    1. Bugs or logic errors
    2. Missing edge cases
    3. Code that doesn't match the stated intent
    4. Security issues
    5. Unnecessary complexity

    Be critical. List specific issues with file:line references.

    Diff:
    <paste the git diff output here>
```

3. Wait for subagent to complete

4. Report findings back to user with specific file:line references

## When to Use

- Before `/ship`
- After complex changes
- When unsure if solution is correct
