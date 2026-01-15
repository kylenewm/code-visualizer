"""
Metrics collection and tracking for SaaS platform.
Records usage data, events, and business metrics.
"""

from datetime import datetime, timedelta
from typing import Dict, List, Optional, Any
from collections import defaultdict


# Metrics storage (in production, use time-series DB)
_events: List[Dict[str, Any]] = []
_counters: Dict[str, Dict[str, int]] = defaultdict(lambda: defaultdict(int))
_gauges: Dict[str, Dict[str, float]] = defaultdict(dict)


def track_event(
    event_name: str,
    team_id: str,
    user_id: Optional[str] = None,
    properties: Optional[Dict[str, Any]] = None
) -> Dict[str, Any]:
    """Track a user/system event for analytics."""
    event = {
        "name": event_name,
        "team_id": team_id,
        "user_id": user_id,
        "properties": properties or {},
        "timestamp": datetime.utcnow().isoformat(),
    }

    _events.append(event)
    return event


def increment_counter(metric_name: str, team_id: str, amount: int = 1) -> int:
    """Increment a counter metric (e.g., API calls, page views)."""
    _counters[metric_name][team_id] += amount
    return _counters[metric_name][team_id]


def set_gauge(metric_name: str, team_id: str, value: float) -> None:
    """Set a gauge metric (e.g., current active users, storage used)."""
    _gauges[metric_name][team_id] = value


def get_counter(metric_name: str, team_id: str) -> int:
    """Get current value of a counter."""
    return _counters[metric_name].get(team_id, 0)


def get_gauge(metric_name: str, team_id: str) -> Optional[float]:
    """Get current value of a gauge."""
    return _gauges[metric_name].get(team_id)


def get_events(
    team_id: str,
    event_name: Optional[str] = None,
    since: Optional[datetime] = None,
    limit: int = 100
) -> List[Dict[str, Any]]:
    """Query events with optional filtering."""
    filtered = []

    for event in reversed(_events):  # Most recent first
        if event["team_id"] != team_id:
            continue
        if event_name and event["name"] != event_name:
            continue
        if since:
            event_time = datetime.fromisoformat(event["timestamp"])
            if event_time < since:
                continue

        filtered.append(event)
        if len(filtered) >= limit:
            break

    return filtered


def count_events(
    team_id: str,
    event_name: str,
    since: Optional[datetime] = None
) -> int:
    """Count occurrences of an event type."""
    count = 0
    for event in _events:
        if event["team_id"] != team_id:
            continue
        if event["name"] != event_name:
            continue
        if since:
            event_time = datetime.fromisoformat(event["timestamp"])
            if event_time < since:
                continue
        count += 1
    return count


def get_daily_active_users(team_id: str) -> int:
    """Calculate unique users active in the last 24 hours."""
    since = datetime.utcnow() - timedelta(hours=24)
    user_ids = set()

    for event in _events:
        if event["team_id"] != team_id:
            continue
        if not event.get("user_id"):
            continue

        event_time = datetime.fromisoformat(event["timestamp"])
        if event_time >= since:
            user_ids.add(event["user_id"])

    return len(user_ids)


def calculate_retention(team_id: str, cohort_date: datetime, days: int = 7) -> float:
    """
    Calculate retention rate for users who signed up on cohort_date.
    Returns percentage of users active within the given days.
    """
    cohort_end = cohort_date + timedelta(days=1)
    retention_end = cohort_date + timedelta(days=days)

    # Find users in cohort (signed up on that day)
    cohort_users = set()
    retained_users = set()

    for event in _events:
        if event["team_id"] != team_id:
            continue
        if not event.get("user_id"):
            continue

        event_time = datetime.fromisoformat(event["timestamp"])

        # User in signup cohort
        if event["name"] == "user.signup" and cohort_date <= event_time < cohort_end:
            cohort_users.add(event["user_id"])

        # User active in retention window
        if cohort_end <= event_time <= retention_end:
            retained_users.add(event["user_id"])

    if not cohort_users:
        return 0.0

    retained = cohort_users & retained_users
    return len(retained) / len(cohort_users) * 100
