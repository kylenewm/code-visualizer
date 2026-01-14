"""Output formatting for task display."""

from typing import List
import json as json_lib


def format_table(tasks: List[dict]) -> str:
    """Format tasks as an ASCII table."""
    if not tasks:
        return "No tasks found."

    lines = ["ID       | Priority | Status    | Title"]
    lines.append("-" * 60)

    for task in tasks:
        status = "Done" if task.get("completed") else "Pending"
        line = f"{task['id']:8} | {task['priority']:8} | {status:9} | {task['title'][:30]}"
        lines.append(line)

    return "\n".join(lines)


def format_json(tasks: List[dict]) -> str:
    """Format tasks as JSON string."""
    return json_lib.dumps(tasks, indent=2)


def format_plain(tasks: List[dict]) -> str:
    """Format tasks as plain text list."""
    if not tasks:
        return "No tasks."

    lines = []
    for task in tasks:
        status = "[x]" if task.get("completed") else "[ ]"
        lines.append(f"{status} {task['title']} ({task['priority']})")

    return "\n".join(lines)


def format_summary(tasks: List[dict]) -> str:
    """Format a summary of task counts."""
    total = len(tasks)
    completed = sum(1 for t in tasks if t.get("completed"))
    pending = total - completed
    return f"Total: {total} | Completed: {completed} | Pending: {pending}"
