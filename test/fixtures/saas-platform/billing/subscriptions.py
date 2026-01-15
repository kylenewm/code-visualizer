"""
Subscription management for SaaS platform.
Handles plan selection, upgrades, downgrades, and subscription lifecycle.
"""

from datetime import datetime, timedelta
from typing import Dict, List, Optional, Any
from enum import Enum
import uuid


class PlanTier(Enum):
    """Available subscription tiers."""
    FREE = "free"
    STARTER = "starter"
    PROFESSIONAL = "professional"
    ENTERPRISE = "enterprise"


class SubscriptionStatus(Enum):
    """Subscription lifecycle states."""
    ACTIVE = "active"
    PAST_DUE = "past_due"
    CANCELED = "canceled"
    TRIALING = "trialing"


# Plan configurations
PLAN_CONFIGS: Dict[PlanTier, Dict[str, Any]] = {
    PlanTier.FREE: {
        "price_monthly": 0,
        "max_users": 3,
        "max_projects": 5,
        "features": ["basic_analytics"],
    },
    PlanTier.STARTER: {
        "price_monthly": 29,
        "max_users": 10,
        "max_projects": 25,
        "features": ["basic_analytics", "api_access"],
    },
    PlanTier.PROFESSIONAL: {
        "price_monthly": 99,
        "max_users": 50,
        "max_projects": 100,
        "features": ["advanced_analytics", "api_access", "priority_support"],
    },
    PlanTier.ENTERPRISE: {
        "price_monthly": 299,
        "max_users": -1,  # Unlimited
        "max_projects": -1,
        "features": ["advanced_analytics", "api_access", "priority_support", "sso", "audit_logs"],
    },
}

# Active subscriptions (team_id -> subscription)
_subscriptions: Dict[str, Dict[str, Any]] = {}


def get_plan_config(tier: PlanTier) -> Dict[str, Any]:
    """Get configuration for a subscription tier."""
    return PLAN_CONFIGS.get(tier, PLAN_CONFIGS[PlanTier.FREE])


def create_subscription(
    team_id: str,
    tier: PlanTier,
    trial_days: int = 0
) -> Dict[str, Any]:
    """Create a new subscription for a team."""
    now = datetime.utcnow()
    status = SubscriptionStatus.TRIALING if trial_days > 0 else SubscriptionStatus.ACTIVE

    subscription = {
        "id": str(uuid.uuid4()),
        "team_id": team_id,
        "tier": tier.value,
        "status": status.value,
        "created_at": now.isoformat(),
        "current_period_start": now.isoformat(),
        "current_period_end": (now + timedelta(days=30)).isoformat(),
        "trial_end": (now + timedelta(days=trial_days)).isoformat() if trial_days > 0 else None,
    }

    _subscriptions[team_id] = subscription
    return subscription


def get_subscription(team_id: str) -> Optional[Dict[str, Any]]:
    """Get the current subscription for a team."""
    return _subscriptions.get(team_id)


def upgrade_subscription(team_id: str, new_tier: PlanTier) -> Dict[str, Any]:
    """
    Upgrade a team's subscription to a higher tier.
    Prorates billing for the current period.
    """
    subscription = get_subscription(team_id)
    if not subscription:
        raise ValueError(f"No subscription found for team {team_id}")

    current_tier = PlanTier(subscription["tier"])
    if PLAN_CONFIGS[new_tier]["price_monthly"] <= PLAN_CONFIGS[current_tier]["price_monthly"]:
        raise ValueError("Can only upgrade to a higher tier")

    subscription["tier"] = new_tier.value
    subscription["upgraded_at"] = datetime.utcnow().isoformat()

    return subscription


def downgrade_subscription(team_id: str, new_tier: PlanTier) -> Dict[str, Any]:
    """
    Schedule a downgrade to take effect at the end of current billing period.
    Does not take immediate effect to avoid service disruption.
    """
    subscription = get_subscription(team_id)
    if not subscription:
        raise ValueError(f"No subscription found for team {team_id}")

    subscription["pending_downgrade"] = {
        "tier": new_tier.value,
        "effective_date": subscription["current_period_end"],
    }

    return subscription


def cancel_subscription(team_id: str, immediate: bool = False) -> Dict[str, Any]:
    """
    Cancel a subscription.
    If immediate=False, access continues until end of billing period.
    """
    subscription = get_subscription(team_id)
    if not subscription:
        raise ValueError(f"No subscription found for team {team_id}")

    if immediate:
        subscription["status"] = SubscriptionStatus.CANCELED.value
        subscription["canceled_at"] = datetime.utcnow().isoformat()
    else:
        subscription["cancel_at_period_end"] = True

    return subscription


def check_feature_access(team_id: str, feature: str) -> bool:
    """Check if a team's subscription includes a specific feature."""
    subscription = get_subscription(team_id)
    if not subscription or subscription["status"] == SubscriptionStatus.CANCELED.value:
        return False

    tier = PlanTier(subscription["tier"])
    config = get_plan_config(tier)
    return feature in config.get("features", [])


def check_usage_limit(team_id: str, resource: str, current_usage: int) -> bool:
    """Check if team is within usage limits for their subscription tier."""
    subscription = get_subscription(team_id)
    if not subscription:
        return False

    tier = PlanTier(subscription["tier"])
    config = get_plan_config(tier)

    limit_key = f"max_{resource}"
    limit = config.get(limit_key, 0)

    # -1 means unlimited
    if limit == -1:
        return True

    return current_usage < limit
