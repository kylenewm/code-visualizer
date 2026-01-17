"""Input validation helpers for task management."""


def validate_title(title: str) -> bool:
    """Check if task title is valid (non-empty, max 100 chars)."""
    if not title or not title.strip():
        return False
    return len(title.strip()) <= 100


def validate_priority(priority: str) -> bool:
    """Check if priority is one of: low, medium, high."""
    valid_priorities = ["low", "medium", "high"]
    return priority.lower() in valid_priorities


def sanitize_input(text: str) -> str:
    """Remove dangerous characters from user input."""
    return text.strip().replace("<", "").replace(">", "")
