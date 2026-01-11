"""
Database module for testing
"""

from typing import Optional, List
from .utils import generate_id


class User:
    """User model for DB"""
    def __init__(self, id: str, email: str, password_hash: str):
        self.id = id
        self.email = email
        self.password_hash = password_hash


# In-memory storage
_users: List[User] = []


def find_user_by_email(email: str) -> Optional[User]:
    """Find a user by email"""
    for user in _users:
        if user.email == email:
            return user
    return None


def create_user(email: str, password_hash: str) -> User:
    """Create a new user"""
    user = User(
        id=generate_id(),
        email=email,
        password_hash=password_hash
    )
    _users.append(user)
    return user


def delete_user(user_id: str) -> bool:
    """Delete a user by ID"""
    global _users
    for i, user in enumerate(_users):
        if user.id == user_id:
            _users.pop(i)
            return True
    return False
