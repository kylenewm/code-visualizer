"""
Project management for SaaS platform.
Handles project CRUD, status tracking, and project settings.
"""

from datetime import datetime
from typing import Dict, Optional, Any, List
from enum import Enum
import uuid


class ProjectStatus(Enum):
    """Project lifecycle states."""
    ACTIVE = "active"
    PAUSED = "paused"
    ARCHIVED = "archived"
    COMPLETED = "completed"


# Storage
_projects: Dict[str, Dict[str, Any]] = {}


def create_project(
    team_id: str,
    name: str,
    description: Optional[str] = None,
    created_by: Optional[str] = None
) -> Dict[str, Any]:
    """Create a new project within a team."""
    project_id = str(uuid.uuid4())

    project = {
        "id": project_id,
        "team_id": team_id,
        "name": name,
        "description": description,
        "status": ProjectStatus.ACTIVE.value,
        "created_by": created_by,
        "created_at": datetime.utcnow().isoformat(),
        "settings": {},
        "metadata": {},
    }

    _projects[project_id] = project
    return project


def get_project(project_id: str) -> Optional[Dict[str, Any]]:
    """Get a project by ID."""
    return _projects.get(project_id)


def get_team_projects(team_id: str, include_archived: bool = False) -> List[Dict[str, Any]]:
    """Get all projects for a team."""
    projects = []
    for project in _projects.values():
        if project["team_id"] != team_id:
            continue
        if not include_archived and project["status"] == ProjectStatus.ARCHIVED.value:
            continue
        projects.append(project)

    return sorted(projects, key=lambda p: p["created_at"], reverse=True)


def update_project(project_id: str, updates: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    """Update project details."""
    project = _projects.get(project_id)
    if not project:
        return None

    forbidden = {"id", "team_id", "created_by", "created_at"}
    safe_updates = {k: v for k, v in updates.items() if k not in forbidden}

    project.update(safe_updates)
    project["updated_at"] = datetime.utcnow().isoformat()

    return project


def archive_project(project_id: str) -> bool:
    """Archive a project (soft delete)."""
    project = _projects.get(project_id)
    if not project:
        return False

    project["status"] = ProjectStatus.ARCHIVED.value
    project["archived_at"] = datetime.utcnow().isoformat()
    return True


def restore_project(project_id: str) -> bool:
    """Restore an archived project."""
    project = _projects.get(project_id)
    if not project:
        return False

    if project["status"] != ProjectStatus.ARCHIVED.value:
        return False

    project["status"] = ProjectStatus.ACTIVE.value
    project["restored_at"] = datetime.utcnow().isoformat()
    return True


def delete_project(project_id: str) -> bool:
    """Permanently delete a project."""
    if project_id in _projects:
        del _projects[project_id]
        return True
    return False


def set_project_status(project_id: str, status: ProjectStatus) -> Optional[Dict[str, Any]]:
    """Update project status."""
    project = _projects.get(project_id)
    if not project:
        return None

    project["status"] = status.value
    project["status_changed_at"] = datetime.utcnow().isoformat()
    return project


def search_projects(team_id: str, query: str) -> List[Dict[str, Any]]:
    """Search projects by name or description within a team."""
    query_lower = query.lower()
    matches = []

    for project in _projects.values():
        if project["team_id"] != team_id:
            continue
        if project["status"] == ProjectStatus.ARCHIVED.value:
            continue

        name_match = query_lower in project["name"].lower()
        desc_match = project.get("description") and query_lower in project["description"].lower()

        if name_match or desc_match:
            matches.append(project)

    return matches


def get_project_count(team_id: str) -> int:
    """Get count of active projects for a team (for quota checking)."""
    count = 0
    for project in _projects.values():
        if project["team_id"] == team_id and project["status"] != ProjectStatus.ARCHIVED.value:
            count += 1
    return count
