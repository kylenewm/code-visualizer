"""
Team management for SaaS platform.
Handles team creation, membership, and team settings.
"""

from datetime import datetime
from typing import Dict, Optional, Any, List
import uuid


# Storage
_teams: Dict[str, Dict[str, Any]] = {}
_team_members: Dict[str, List[Dict[str, Any]]] = {}  # team_id -> members
_team_invitations: Dict[str, Dict[str, Any]] = {}


def create_team(name: str, owner_id: str, slug: Optional[str] = None) -> Dict[str, Any]:
    """Create a new team with the given user as owner."""
    team_id = str(uuid.uuid4())

    team = {
        "id": team_id,
        "name": name,
        "slug": slug or name.lower().replace(" ", "-"),
        "owner_id": owner_id,
        "created_at": datetime.utcnow().isoformat(),
        "settings": {},
    }

    _teams[team_id] = team
    _team_members[team_id] = [{
        "user_id": owner_id,
        "role": "owner",
        "joined_at": team["created_at"],
    }]

    return team


def get_team(team_id: str) -> Optional[Dict[str, Any]]:
    """Get a team by ID."""
    return _teams.get(team_id)


def get_team_by_slug(slug: str) -> Optional[Dict[str, Any]]:
    """Look up a team by its URL slug."""
    for team in _teams.values():
        if team["slug"] == slug:
            return team
    return None


def update_team(team_id: str, updates: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    """Update team details."""
    team = _teams.get(team_id)
    if not team:
        return None

    forbidden = {"id", "owner_id", "created_at"}
    safe_updates = {k: v for k, v in updates.items() if k not in forbidden}

    team.update(safe_updates)
    team["updated_at"] = datetime.utcnow().isoformat()

    return team


def delete_team(team_id: str) -> bool:
    """Delete a team and all associated data."""
    if team_id not in _teams:
        return False

    del _teams[team_id]
    _team_members.pop(team_id, None)

    # Remove invitations for this team
    to_remove = [k for k, v in _team_invitations.items() if v["team_id"] == team_id]
    for key in to_remove:
        del _team_invitations[key]

    return True


def add_team_member(team_id: str, user_id: str, role: str = "member") -> Dict[str, Any]:
    """Add a user to a team."""
    if team_id not in _team_members:
        raise ValueError(f"Team {team_id} not found")

    # Check if already a member
    for member in _team_members[team_id]:
        if member["user_id"] == user_id:
            raise ValueError(f"User {user_id} is already a member")

    member = {
        "user_id": user_id,
        "role": role,
        "joined_at": datetime.utcnow().isoformat(),
    }

    _team_members[team_id].append(member)
    return member


def remove_team_member(team_id: str, user_id: str) -> bool:
    """Remove a user from a team."""
    members = _team_members.get(team_id, [])

    for i, member in enumerate(members):
        if member["user_id"] == user_id:
            # Can't remove owner
            if member["role"] == "owner":
                raise ValueError("Cannot remove team owner")
            members.pop(i)
            return True

    return False


def get_team_members(team_id: str) -> List[Dict[str, Any]]:
    """Get all members of a team."""
    return _team_members.get(team_id, [])


def get_user_teams(user_id: str) -> List[Dict[str, Any]]:
    """Get all teams a user belongs to."""
    teams = []
    for team_id, members in _team_members.items():
        for member in members:
            if member["user_id"] == user_id:
                team = get_team(team_id)
                if team:
                    teams.append({**team, "role": member["role"]})
                break
    return teams


def create_invitation(team_id: str, email: str, role: str, invited_by: str) -> Dict[str, Any]:
    """Create an invitation to join a team."""
    invitation = {
        "id": str(uuid.uuid4()),
        "team_id": team_id,
        "email": email,
        "role": role,
        "invited_by": invited_by,
        "created_at": datetime.utcnow().isoformat(),
        "expires_at": None,  # Set expiration in production
        "accepted_at": None,
    }

    _team_invitations[invitation["id"]] = invitation
    return invitation


def accept_invitation(invitation_id: str, user_id: str) -> Dict[str, Any]:
    """Accept a team invitation."""
    invitation = _team_invitations.get(invitation_id)
    if not invitation:
        raise ValueError("Invitation not found")

    if invitation["accepted_at"]:
        raise ValueError("Invitation already accepted")

    # Add user to team
    add_team_member(invitation["team_id"], user_id, invitation["role"])

    invitation["accepted_at"] = datetime.utcnow().isoformat()
    return invitation
