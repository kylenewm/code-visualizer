"""
Report generation for SaaS platform.
Builds dashboards, exports, and scheduled reports.
"""

from datetime import datetime, timedelta
from typing import Dict, List, Optional, Any
import uuid

from .metrics import (
    get_events,
    count_events,
    get_counter,
    get_gauge,
    get_daily_active_users,
)


# Report storage
_saved_reports: Dict[str, Dict[str, Any]] = {}
_scheduled_reports: Dict[str, Dict[str, Any]] = {}


def generate_usage_report(team_id: str, days: int = 30) -> Dict[str, Any]:
    """Generate a comprehensive usage report for a team."""
    since = datetime.utcnow() - timedelta(days=days)

    report = {
        "team_id": team_id,
        "period_days": days,
        "generated_at": datetime.utcnow().isoformat(),
        "metrics": {
            "daily_active_users": get_daily_active_users(team_id),
            "api_calls": get_counter("api_calls", team_id),
            "storage_used_mb": get_gauge("storage_mb", team_id) or 0,
            "projects_created": count_events(team_id, "project.created", since),
            "team_members_added": count_events(team_id, "team.member_added", since),
        },
    }

    return report


def generate_activity_summary(team_id: str, user_id: Optional[str] = None) -> Dict[str, Any]:
    """Generate activity summary for a team or specific user."""
    since = datetime.utcnow() - timedelta(days=7)
    events = get_events(team_id, since=since, limit=1000)

    if user_id:
        events = [e for e in events if e.get("user_id") == user_id]

    # Group by event type
    by_type: Dict[str, int] = {}
    for event in events:
        name = event["name"]
        by_type[name] = by_type.get(name, 0) + 1

    return {
        "team_id": team_id,
        "user_id": user_id,
        "period": "7_days",
        "total_events": len(events),
        "events_by_type": by_type,
        "generated_at": datetime.utcnow().isoformat(),
    }


def export_report_csv(report: Dict[str, Any]) -> str:
    """Export a report to CSV format."""
    lines = []

    # Header
    lines.append(f"Report for Team: {report['team_id']}")
    lines.append(f"Generated: {report['generated_at']}")
    lines.append("")

    # Metrics
    if "metrics" in report:
        lines.append("Metric,Value")
        for key, value in report["metrics"].items():
            lines.append(f"{key},{value}")

    # Events by type
    if "events_by_type" in report:
        lines.append("")
        lines.append("Event Type,Count")
        for event_type, count in report["events_by_type"].items():
            lines.append(f"{event_type},{count}")

    return "\n".join(lines)


def save_report(team_id: str, report: Dict[str, Any], name: str) -> Dict[str, Any]:
    """Save a generated report for later access."""
    saved = {
        "id": str(uuid.uuid4()),
        "team_id": team_id,
        "name": name,
        "report": report,
        "saved_at": datetime.utcnow().isoformat(),
    }

    _saved_reports[saved["id"]] = saved
    return saved


def get_saved_reports(team_id: str) -> List[Dict[str, Any]]:
    """Get all saved reports for a team."""
    return [
        r for r in _saved_reports.values()
        if r["team_id"] == team_id
    ]


def schedule_report(
    team_id: str,
    report_type: str,
    schedule: str,  # "daily", "weekly", "monthly"
    recipients: List[str]
) -> Dict[str, Any]:
    """Schedule a recurring report."""
    scheduled = {
        "id": str(uuid.uuid4()),
        "team_id": team_id,
        "report_type": report_type,
        "schedule": schedule,
        "recipients": recipients,
        "created_at": datetime.utcnow().isoformat(),
        "last_sent_at": None,
        "is_active": True,
    }

    _scheduled_reports[scheduled["id"]] = scheduled
    return scheduled


def get_scheduled_reports(team_id: str) -> List[Dict[str, Any]]:
    """Get all scheduled reports for a team."""
    return [
        r for r in _scheduled_reports.values()
        if r["team_id"] == team_id and r["is_active"]
    ]


def cancel_scheduled_report(report_id: str) -> bool:
    """Cancel a scheduled report."""
    report = _scheduled_reports.get(report_id)
    if not report:
        return False

    report["is_active"] = False
    report["canceled_at"] = datetime.utcnow().isoformat()
    return True
