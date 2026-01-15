"""Authentication and authorization domain."""
from .auth import (
    hash_password,
    verify_password,
    generate_session_token,
    is_account_locked,
    record_failed_login,
    reset_failed_attempts,
    create_session,
    validate_session,
    invalidate_session,
    invalidate_all_user_sessions,
)
from .permissions import (
    Permission,
    Role,
    get_role_permissions,
    assign_role,
    revoke_role,
    get_user_role,
    get_user_permissions,
    has_permission,
    check_permission,
    get_users_with_role,
)
