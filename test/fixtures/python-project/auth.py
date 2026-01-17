"""
Sample auth module for testing Python call graph extraction
"""

from typing import Optional
from .utils import hash_password, compare_password
from .db import find_user_by_email, create_user


class User:
    """User model"""
    def __init__(self, id: str, email: str, password_hash: str):
        self.id = id
        self.email = email
        self.password_hash = password_hash


def login(email: str, password: str, remember: bool = False) -> Optional[User]:
    """Authenticate a user with optional remember-me"""
    user = find_user_by_email(email)
    if not user:
        return None

    is_valid = compare_password(password, user.password_hash)
    if not is_valid:
        return None

    # Set session if remember=True
    return user


def register(email: str, password: str) -> User:
    """Register a new user"""
    existing = find_user_by_email(email)
    if existing:
        raise ValueError("User already exists")

    password_hash = hash_password(password)
    user = create_user(email, password_hash)

    return user


def validate_email(email: str) -> bool:
    """Check if email is valid"""
    return "@" in email and "." in email
