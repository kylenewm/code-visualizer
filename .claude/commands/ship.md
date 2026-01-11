# Ship It

Full workflow: verify → commit → push → PR

## Prerequisites

Only run this when you believe work is complete.

## Steps

1. **Run verification** — Use `/done` command first
   - If tests fail, STOP and fix
   - If linter fails, STOP and fix

2. **Show diff to user**
```bash
git diff
```
Ask user: "Does this diff look correct? Any files that shouldn't be included?"

3. **Propose commit message**
   - Draft a concise message based on changes
   - Ask user: "Commit with this message? [message]"
   - Wait for confirmation before committing

4. **Commit**
```bash
git add -A && git commit -m "$(cat <<'EOF'
[user-approved message]

Co-Authored-By: Claude <noreply@anthropic.com>
EOF
)"
```

5. **Ask before push**
   - "Push to origin/[branch]?"
   - Wait for confirmation

6. **Push**
```bash
git push -u origin $(git branch --show-current)
```

7. **Ask before PR**
   - "Create PR with title: [title]?"
   - Wait for confirmation

8. **Create PR** using gh pr create

9. **Return PR URL**

## Key Principle

Ask before each destructive/public action. User should approve:
- Commit message
- Push to remote
- PR creation
