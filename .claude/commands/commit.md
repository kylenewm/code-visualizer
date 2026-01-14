# Commit Changes

Commit staged and unstaged changes with a good message.

## Steps

1. Run `git status` and `git diff` to see what changed
2. **Evaluate observability rules** using MCP tool `evaluate_rules` - show any violations as warnings (informational, don't block)
3. Write a concise commit message (1-2 sentences) focusing on WHY not WHAT
4. Stage all changes and commit with:

```bash
git add -A && git commit -m "$(cat <<'EOF'
Your message here.

Co-Authored-By: Claude <noreply@anthropic.com>
EOF
)"
```

5. Run `git status` to verify

Do NOT push unless explicitly asked.
