"""
Permission and role-based access control for SaaS platform.
Manages user roles, permissions, and authorization checks.
"""

from typing import Set, Dict, List, Optional
from enum import Enum


class Permission(Enum):
    """Available permissions in the system."""
    READ_PROJECTS = "read:projects"
    WRITE_PROJECTS = "write:projects"
    DELETE_PROJECTS = "delete:projects"
    MANAGE_TEAM = "manage:team"
    VIEW_BILLING = "view:billing"
    MANAGE_BILLING = "manage:billing"
    VIEW_ANALYTICS = "view:analytics"
    ADMIN_SETTINGS = "admin:settings"


class Role(Enum):
    """Predefined roles with associated permissions."""
    VIEWER = "viewer"
    MEMBER = "member"
    ADMIN = "admin"
    OWNER = "owner"


# Role to permissions mapping
ROLE_PERMISSIONS: Dict[Role, Set[Permission]] = {
    Role.VIEWER: {Permission.READ_PROJECTS, Permission.VIEW_ANALYTICS},
    Role.MEMBER: {
        Permission.READ_PROJECTS,
        Permission.WRITE_PROJECTS,
        Permission.VIEW_ANALYTICS,
    },
    Role.ADMIN: {
        Permission.READ_PROJECTS,
        Permission.WRITE_PROJECTS,
        Permission.DELETE_PROJECTS,
        Permission.MANAGE_TEAM,
        Permission.VIEW_BILLING,
        Permission.VIEW_ANALYTICS,
    },
    Role.OWNER: set(Permission),  # All permissions
}

# User role assignments (user_id -> team_id -> role)
_user_roles: Dict[str, Dict[str, Role]] = {}


def get_role_permissions(role: Role) -> Set[Permission]:
    """Get all permissions associated with a role."""
    return ROLE_PERMISSIONS.get(role, set())


def assign_role(user_id: str, team_id: str, role: Role) -> None:
    """Assign a role to a user within a team."""
    if user_id not in _user_roles:
        _user_roles[user_id] = {}
    _user_roles[user_id][team_id] = role


def revoke_role(user_id: str, team_id: str) -> bool:
    """Revoke a user's role in a team."""
    if user_id in _user_roles and team_id in _user_roles[user_id]:
        del _user_roles[user_id][team_id]
        return True
    return False


def get_user_role(user_id: str, team_id: str) -> Optional[Role]:
    """Get a user's role in a specific team."""
    return _user_roles.get(user_id, {}).get(team_id)


def get_user_permissions(user_id: str, team_id: str) -> Set[Permission]:
    """Get all permissions a user has in a team."""
    role = get_user_role(user_id, team_id)
    if not role:
        return set()
    return get_role_permissions(role)


def has_permission(user_id: str, team_id: str, permission: Permission) -> bool:
    """Check if a user has a specific permission in a team."""
    permissions = get_user_permissions(user_id, team_id)
    return permission in permissions


def check_permission(user_id: str, team_id: str, permission: Permission) -> None:
    """
    Check permission and raise exception if not authorized.
    Use this for guarding sensitive operations.
    """
    if not has_permission(user_id, team_id, permission):
        raise PermissionError(
            f"User {user_id} lacks {permission.value} permission in team {team_id}"
        )


def get_users_with_role(team_id: str, role: Role) -> List[str]:
    """Get all users with a specific role in a team."""
    return [
        user_id for user_id, teams in _user_roles.items()
        if teams.get(team_id) == role
    ]
