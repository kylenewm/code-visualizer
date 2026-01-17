"""
User management for SaaS platform.
Handles user profiles, preferences, and account settings.
"""

from datetime import datetime
from typing import Dict, Optional, Any, List
import uuid


# User storage
_users: Dict[str, Dict[str, Any]] = {}
_user_preferences: Dict[str, Dict[str, Any]] = {}


def create_user(
    email: str,
    name: str,
    password_hash: str,
    password_salt: str
) -> Dict[str, Any]:
    """Create a new user account."""
    user_id = str(uuid.uuid4())

    user = {
        "id": user_id,
        "email": email,
        "name": name,
        "password_hash": password_hash,
        "password_salt": password_salt,
        "created_at": datetime.utcnow().isoformat(),
        "last_login_at": None,
        "is_active": True,
        "email_verified": False,
    }

    _users[user_id] = user
    return sanitize_user(user)


def get_user(user_id: str) -> Optional[Dict[str, Any]]:
    """Get a user by ID (excludes sensitive fields)."""
    user = _users.get(user_id)
    return sanitize_user(user) if user else None


def get_user_by_email(email: str) -> Optional[Dict[str, Any]]:
    """Look up a user by email address."""
    for user in _users.values():
        if user["email"].lower() == email.lower():
            return user  # Return full user for auth purposes
    return None


def sanitize_user(user: Dict[str, Any]) -> Dict[str, Any]:
    """Remove sensitive fields from user data."""
    sensitive_fields = {"password_hash", "password_salt"}
    return {k: v for k, v in user.items() if k not in sensitive_fields}


def update_user(user_id: str, updates: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    """Update user profile fields."""
    user = _users.get(user_id)
    if not user:
        return None

    # Prevent updating sensitive/system fields
    forbidden = {"id", "password_hash", "password_salt", "created_at"}
    safe_updates = {k: v for k, v in updates.items() if k not in forbidden}

    user.update(safe_updates)
    user["updated_at"] = datetime.utcnow().isoformat()

    return sanitize_user(user)


def deactivate_user(user_id: str) -> bool:
    """Deactivate a user account (soft delete)."""
    user = _users.get(user_id)
    if not user:
        return False

    user["is_active"] = False
    user["deactivated_at"] = datetime.utcnow().isoformat()
    return True


def reactivate_user(user_id: str) -> bool:
    """Reactivate a deactivated user account."""
    user = _users.get(user_id)
    if not user:
        return False

    user["is_active"] = True
    user["reactivated_at"] = datetime.utcnow().isoformat()
    return True


def record_login(user_id: str) -> None:
    """Record a successful login timestamp."""
    user = _users.get(user_id)
    if user:
        user["last_login_at"] = datetime.utcnow().isoformat()


def set_user_preferences(user_id: str, preferences: Dict[str, Any]) -> Dict[str, Any]:
    """Set user preferences (notifications, theme, etc.)."""
    existing = _user_preferences.get(user_id, {})
    existing.update(preferences)
    _user_preferences[user_id] = existing
    return existing


def get_user_preferences(user_id: str) -> Dict[str, Any]:
    """Get user preferences with defaults."""
    defaults = {
        "theme": "system",
        "email_notifications": True,
        "timezone": "UTC",
        "language": "en",
    }
    stored = _user_preferences.get(user_id, {})
    return {**defaults, **stored}


def search_users(query: str, limit: int = 20) -> List[Dict[str, Any]]:
    """Search users by name or email."""
    query_lower = query.lower()
    matches = []

    for user in _users.values():
        if not user["is_active"]:
            continue
        if query_lower in user["name"].lower() or query_lower in user["email"].lower():
            matches.append(sanitize_user(user))
            if len(matches) >= limit:
                break

    return matches
