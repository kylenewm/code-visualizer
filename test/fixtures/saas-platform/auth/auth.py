"""
Authentication module for SaaS platform.
Handles user login, token management, and session validation.
"""

from datetime import datetime, timedelta
from typing import Optional, Dict, Any
import hashlib
import secrets

# In-memory session store (would be Redis in production)
_sessions: Dict[str, Dict[str, Any]] = {}
_failed_attempts: Dict[str, int] = {}

MAX_FAILED_ATTEMPTS = 5
SESSION_DURATION_HOURS = 24


def hash_password(password: str, salt: str) -> str:
    """Hash a password with the given salt using SHA-256."""
    combined = f"{salt}:{password}"
    return hashlib.sha256(combined.encode()).hexdigest()


def verify_password(password: str, salt: str, password_hash: str) -> bool:
    """Verify a password matches the stored hash."""
    return hash_password(password, salt) == password_hash


def generate_session_token() -> str:
    """Generate a cryptographically secure session token."""
    return secrets.token_urlsafe(32)


def is_account_locked(user_id: str) -> bool:
    """Check if account is locked due to too many failed login attempts."""
    attempts = _failed_attempts.get(user_id, 0)
    return attempts >= MAX_FAILED_ATTEMPTS


def record_failed_login(user_id: str) -> int:
    """Record a failed login attempt and return the new count."""
    current = _failed_attempts.get(user_id, 0)
    _failed_attempts[user_id] = current + 1
    return _failed_attempts[user_id]


def reset_failed_attempts(user_id: str) -> None:
    """Reset failed login attempts after successful login."""
    if user_id in _failed_attempts:
        del _failed_attempts[user_id]


def create_session(user_id: str, metadata: Optional[Dict[str, Any]] = None) -> str:
    """
    Create a new session for an authenticated user.
    Returns the session token.
    """
    token = generate_session_token()
    expires_at = datetime.utcnow() + timedelta(hours=SESSION_DURATION_HOURS)

    _sessions[token] = {
        "user_id": user_id,
        "created_at": datetime.utcnow().isoformat(),
        "expires_at": expires_at.isoformat(),
        "metadata": metadata or {},
    }

    return token


def validate_session(token: str) -> Optional[Dict[str, Any]]:
    """
    Validate a session token and return session data if valid.
    Returns None if session is invalid or expired.
    """
    session = _sessions.get(token)
    if not session:
        return None

    expires_at = datetime.fromisoformat(session["expires_at"])
    if datetime.utcnow() > expires_at:
        invalidate_session(token)
        return None

    return session


def invalidate_session(token: str) -> bool:
    """Invalidate a session token (logout)."""
    if token in _sessions:
        del _sessions[token]
        return True
    return False


def invalidate_all_user_sessions(user_id: str) -> int:
    """Invalidate all sessions for a user. Returns count of invalidated sessions."""
    tokens_to_remove = [
        token for token, session in _sessions.items()
        if session["user_id"] == user_id
    ]
    for token in tokens_to_remove:
        del _sessions[token]
    return len(tokens_to_remove)
