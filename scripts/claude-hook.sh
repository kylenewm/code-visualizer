#!/bin/bash
# Claude Code PostToolUse Hook
# Install: Add to ~/.claude/hooks/PostToolUse
#
# This script receives JSON on stdin from Claude Code and forwards
# file change events to the CodeFlow Visualizer server.

# Read stdin
INPUT=$(cat)

# Forward to the Node.js processor
# The processor will emit JSON events that can be consumed by the server
node "$(dirname "$0")/../dist/hooks/adapter.js" <<< "$INPUT"
