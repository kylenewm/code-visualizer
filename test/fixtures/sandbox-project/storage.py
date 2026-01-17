"""JSON file persistence for tasks."""

import json
import os
from typing import List, Optional
from task import Task

STORAGE_FILE = "tasks.json"


def load_tasks() -> List[dict]:
    """Load all tasks from storage file."""
    if not os.path.exists(STORAGE_FILE):
        return []
    with open(STORAGE_FILE, "r") as f:
        return json.load(f)


def save_tasks(tasks: List[dict]) -> None:
    """Save all tasks to storage file."""
    with open(STORAGE_FILE, "w") as f:
        json.dump(tasks, f, indent=2)


def find_task(task_id: str) -> Optional[dict]:
    """Find a task by its ID."""
    tasks = load_tasks()
    for task in tasks:
        if task.get("id") == task_id:
            return task
    return None


def delete_task(task_id: str) -> bool:
    """Delete a task by ID. Returns True if found and deleted."""
    tasks = load_tasks()
    original_len = len(tasks)
    tasks = [t for t in tasks if t.get("id") != task_id]
    if len(tasks) < original_len:
        save_tasks(tasks)
        return True
    return False
