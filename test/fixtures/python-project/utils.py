"""
Utility functions for testing
"""

import hashlib
import uuid


def hash_password(password: str) -> str:
    """Hash a password"""
    return hashlib.sha256(password.encode()).hexdigest()


def compare_password(password: str, hashed: str) -> bool:
    """Compare password with hash"""
    expected_hash = hash_password(password)
    return expected_hash == hashed


def generate_id() -> str:
    """Generate a unique ID"""
    return str(uuid.uuid4())
