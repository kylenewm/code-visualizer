#!/usr/bin/env python3
"""
check_invariants.py - Deterministic invariant violation checker

Reads .council/invariants.yaml and checks git diff against forbidden/protected paths.
Exit 0 = clean, Exit 1 = violations found.

Usage:
    python scripts/check_invariants.py --diff HEAD~1
    python scripts/check_invariants.py --diff main --invariants .council/invariants.yaml
    python scripts/check_invariants.py --diff HEAD~1 --allow-protected  # override protected
"""

import argparse
import fnmatch
import subprocess
import sys
from dataclasses import dataclass, field
from pathlib import Path
from typing import List, Optional

try:
    import yaml
except ImportError:
    # Fallback to basic YAML parsing if PyYAML not installed
    yaml = None


@dataclass
class Violation:
    path: str
    violation_type: str  # "FORBIDDEN" or "PROTECTED"
    pattern: str  # The pattern that matched


@dataclass
class InvariantsResult:
    exit_code: int
    violations: List[Violation] = field(default_factory=list)
    changed_files: List[str] = field(default_factory=list)

    @property
    def output(self) -> str:
        lines = []
        if self.exit_code == 0:
            lines.append("✅ No invariant violations")
            lines.append(f"   Checked {len(self.changed_files)} changed files")
        else:
            lines.append("❌ Invariant violations found:")
            for v in self.violations:
                if v.violation_type == "FORBIDDEN":
                    lines.append(f"   ❌ FORBIDDEN: {v.path}")
                    lines.append(f"      matched pattern: {v.pattern}")
                else:
                    lines.append(f"   ⚠️  PROTECTED: {v.path}")
                    lines.append(f"      matched pattern: {v.pattern}")
                    lines.append(f"      (use --allow-protected to override)")
        return "\n".join(lines)


def parse_yaml_simple(content: str) -> dict:
    """Simple YAML parser for basic key: value and lists."""
    result = {"forbidden_paths": [], "protected_paths": [], "notes": ""}
    current_key = None

    for line in content.split("\n"):
        line = line.rstrip()
        if not line or line.startswith("#"):
            continue

        # Check for key
        if line.endswith(":") and not line.startswith(" ") and not line.startswith("-"):
            current_key = line[:-1].strip()
            continue

        # Check for list item
        if line.strip().startswith("- "):
            if current_key:
                item = line.strip()[2:].strip().strip('"').strip("'")
                if current_key not in result:
                    result[current_key] = []
                if isinstance(result[current_key], list):
                    result[current_key].append(item)
            continue

        # Check for key: value on same line
        if ":" in line and not line.startswith(" "):
            key, value = line.split(":", 1)
            key = key.strip()
            value = value.strip().strip('"').strip("'")
            if value:
                result[key] = value

    return result


def load_invariants(path: Path) -> dict:
    """Load invariants from YAML file."""
    if not path.exists():
        return {"forbidden_paths": [], "protected_paths": []}

    content = path.read_text()

    if yaml:
        return yaml.safe_load(content) or {}
    else:
        return parse_yaml_simple(content)


def get_changed_files(diff_ref: str, repo_path: Optional[Path] = None) -> List[str]:
    """Get list of changed files from git diff."""
    cmd = ["git", "diff", "--name-only", diff_ref]

    try:
        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            cwd=repo_path,
            timeout=10
        )
        if result.returncode != 0:
            # Try as commit range
            cmd = ["git", "diff", "--name-only", f"{diff_ref}..HEAD"]
            result = subprocess.run(
                cmd,
                capture_output=True,
                text=True,
                cwd=repo_path,
                timeout=10
            )

        return [f.strip() for f in result.stdout.strip().split("\n") if f.strip()]
    except subprocess.TimeoutExpired:
        print("Error: git diff timed out", file=sys.stderr)
        return []
    except Exception as e:
        print(f"Error running git diff: {e}", file=sys.stderr)
        return []


def match_patterns(file_path: str, patterns: List[str]) -> Optional[str]:
    """Check if file matches any pattern. Returns matched pattern or None."""
    for pattern in patterns:
        # Handle glob patterns
        if fnmatch.fnmatch(file_path, pattern):
            return pattern
        # Handle directory patterns (e.g., "credentials/*")
        if pattern.endswith("/*"):
            dir_pattern = pattern[:-2]
            if file_path.startswith(dir_pattern + "/") or file_path == dir_pattern:
                return pattern
        # Handle exact matches
        if file_path == pattern:
            return pattern
    return None


def check_invariants(
    invariants_path: Path,
    diff_ref: str,
    repo_path: Optional[Path] = None,
    allow_protected: bool = False
) -> InvariantsResult:
    """Check changed files against invariants."""
    invariants = load_invariants(invariants_path)
    forbidden_paths = invariants.get("forbidden_paths", []) or []
    protected_paths = invariants.get("protected_paths", []) or []

    changed_files = get_changed_files(diff_ref, repo_path)
    violations = []

    for file_path in changed_files:
        # Check forbidden (always block)
        pattern = match_patterns(file_path, forbidden_paths)
        if pattern:
            violations.append(Violation(
                path=file_path,
                violation_type="FORBIDDEN",
                pattern=pattern
            ))
            continue

        # Check protected (block unless --allow-protected)
        if not allow_protected:
            pattern = match_patterns(file_path, protected_paths)
            if pattern:
                violations.append(Violation(
                    path=file_path,
                    violation_type="PROTECTED",
                    pattern=pattern
                ))

    exit_code = 1 if violations else 0
    return InvariantsResult(
        exit_code=exit_code,
        violations=violations,
        changed_files=changed_files
    )


def main():
    parser = argparse.ArgumentParser(
        description="Check git diff against project invariants"
    )
    parser.add_argument(
        "--diff",
        required=True,
        help="Git ref to diff against (e.g., HEAD~1, main, abc123)"
    )
    parser.add_argument(
        "--invariants",
        default=".council/invariants.yaml",
        help="Path to invariants YAML file (default: .council/invariants.yaml)"
    )
    parser.add_argument(
        "--repo",
        help="Path to git repository (default: current directory)"
    )
    parser.add_argument(
        "--allow-protected",
        action="store_true",
        help="Allow changes to protected paths (still blocks forbidden)"
    )
    parser.add_argument(
        "--json",
        action="store_true",
        help="Output as JSON"
    )

    args = parser.parse_args()

    invariants_path = Path(args.invariants)
    repo_path = Path(args.repo) if args.repo else None

    result = check_invariants(
        invariants_path=invariants_path,
        diff_ref=args.diff,
        repo_path=repo_path,
        allow_protected=args.allow_protected
    )

    if args.json:
        import json
        output = {
            "status": "PASS" if result.exit_code == 0 else "FAIL",
            "violations": [
                {"path": v.path, "type": v.violation_type, "pattern": v.pattern}
                for v in result.violations
            ],
            "changed_files": result.changed_files
        }
        print(json.dumps(output, indent=2))
    else:
        print(result.output)

    sys.exit(result.exit_code)


if __name__ == "__main__":
    main()
