"""
Payment processing for SaaS platform.
Handles invoices, payment methods, and transaction processing.
"""

from datetime import datetime
from typing import Dict, List, Optional, Any
from enum import Enum
import uuid


class PaymentStatus(Enum):
    """Payment transaction states."""
    PENDING = "pending"
    SUCCEEDED = "succeeded"
    FAILED = "failed"
    REFUNDED = "refunded"


class PaymentMethod(Enum):
    """Supported payment methods."""
    CREDIT_CARD = "credit_card"
    BANK_TRANSFER = "bank_transfer"
    PAYPAL = "paypal"


# Storage
_payment_methods: Dict[str, List[Dict[str, Any]]] = {}
_invoices: Dict[str, Dict[str, Any]] = {}
_transactions: Dict[str, Dict[str, Any]] = {}


def add_payment_method(
    team_id: str,
    method_type: PaymentMethod,
    details: Dict[str, Any],
    is_default: bool = False
) -> Dict[str, Any]:
    """Add a payment method for a team."""
    method = {
        "id": str(uuid.uuid4()),
        "team_id": team_id,
        "type": method_type.value,
        "last_four": details.get("last_four", "****"),
        "is_default": is_default,
        "created_at": datetime.utcnow().isoformat(),
    }

    if team_id not in _payment_methods:
        _payment_methods[team_id] = []

    # If this is default, unset other defaults
    if is_default:
        for existing in _payment_methods[team_id]:
            existing["is_default"] = False

    _payment_methods[team_id].append(method)
    return method


def get_payment_methods(team_id: str) -> List[Dict[str, Any]]:
    """Get all payment methods for a team."""
    return _payment_methods.get(team_id, [])


def get_default_payment_method(team_id: str) -> Optional[Dict[str, Any]]:
    """Get the default payment method for a team."""
    methods = get_payment_methods(team_id)
    for method in methods:
        if method["is_default"]:
            return method
    return methods[0] if methods else None


def remove_payment_method(team_id: str, method_id: str) -> bool:
    """Remove a payment method."""
    methods = _payment_methods.get(team_id, [])
    for i, method in enumerate(methods):
        if method["id"] == method_id:
            methods.pop(i)
            return True
    return False


def create_invoice(
    team_id: str,
    amount_cents: int,
    description: str,
    line_items: List[Dict[str, Any]]
) -> Dict[str, Any]:
    """Create an invoice for a team."""
    invoice = {
        "id": str(uuid.uuid4()),
        "team_id": team_id,
        "amount_cents": amount_cents,
        "description": description,
        "line_items": line_items,
        "status": "open",
        "created_at": datetime.utcnow().isoformat(),
        "due_date": None,
        "paid_at": None,
    }

    _invoices[invoice["id"]] = invoice
    return invoice


def get_invoice(invoice_id: str) -> Optional[Dict[str, Any]]:
    """Get an invoice by ID."""
    return _invoices.get(invoice_id)


def get_team_invoices(team_id: str) -> List[Dict[str, Any]]:
    """Get all invoices for a team."""
    return [inv for inv in _invoices.values() if inv["team_id"] == team_id]


def process_payment(
    team_id: str,
    amount_cents: int,
    invoice_id: Optional[str] = None
) -> Dict[str, Any]:
    """
    Process a payment for a team.
    Uses the default payment method.
    """
    payment_method = get_default_payment_method(team_id)
    if not payment_method:
        raise ValueError(f"No payment method on file for team {team_id}")

    # Simulate payment processing
    transaction = {
        "id": str(uuid.uuid4()),
        "team_id": team_id,
        "amount_cents": amount_cents,
        "payment_method_id": payment_method["id"],
        "invoice_id": invoice_id,
        "status": PaymentStatus.SUCCEEDED.value,
        "processed_at": datetime.utcnow().isoformat(),
    }

    _transactions[transaction["id"]] = transaction

    # Mark invoice as paid if provided
    if invoice_id and invoice_id in _invoices:
        _invoices[invoice_id]["status"] = "paid"
        _invoices[invoice_id]["paid_at"] = transaction["processed_at"]

    return transaction


def refund_payment(transaction_id: str, reason: str) -> Dict[str, Any]:
    """Process a refund for a previous transaction."""
    transaction = _transactions.get(transaction_id)
    if not transaction:
        raise ValueError(f"Transaction {transaction_id} not found")

    if transaction["status"] == PaymentStatus.REFUNDED.value:
        raise ValueError("Transaction already refunded")

    transaction["status"] = PaymentStatus.REFUNDED.value
    transaction["refunded_at"] = datetime.utcnow().isoformat()
    transaction["refund_reason"] = reason

    return transaction


def get_transaction_history(team_id: str, limit: int = 50) -> List[Dict[str, Any]]:
    """Get recent transactions for a team."""
    team_transactions = [
        t for t in _transactions.values()
        if t["team_id"] == team_id
    ]
    return sorted(
        team_transactions,
        key=lambda t: t["processed_at"],
        reverse=True
    )[:limit]
