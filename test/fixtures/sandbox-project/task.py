"""Task model and core operations."""

import uuid
from datetime import datetime
from validators import validate_priority, sanitize_input


class Task:
    """Represents a single task item."""

    def __init__(self, title: str, priority: str = "medium"):
        self.id = str(uuid.uuid4())[:8]
        self.title = sanitize_input(title)
        self.priority = priority.lower()
        self.completed = False
        self.created_at = datetime.now().isoformat()


def create_task(title: str, priority: str = "medium") -> Task:
    """Create a new task with validation."""
    if not validate_priority(priority):
        raise ValueError(f"Invalid priority: {priority}")
    return Task(title, priority)


def mark_complete(task: Task) -> Task:
    """Mark a task as completed."""
    task.completed = True
    return task


def update_priority(task: Task, new_priority: str) -> Task:
    """Update task priority with validation."""
    if not validate_priority(new_priority):
        raise ValueError(f"Invalid priority: {new_priority}")
    task.priority = new_priority.lower()
    return task
