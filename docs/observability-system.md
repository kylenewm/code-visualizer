# CodeFlow Observability System

How semantic annotations, drift detection, and rules work together.

## Order of Operations

```
1. CODE ANALYSIS (tree-sitter)
   ├── Parse source files
   ├── Extract functions, classes, methods
   ├── Compute contentHash = sha256(body + params + return)
   └── Build call graph (who calls who)

2. ANNOTATION (manual or Claude)
   ├── User/Claude writes: "This function validates email format"
   ├── Store: annotation.text + annotation.contentHash (snapshot of code at time)
   └── Persisted in SQLite

3. DRIFT DETECTION (on code change)
   ├── File changes → re-analyze → new contentHash
   ├── Compare: current.contentHash vs annotation.contentHash
   ├── If different → DRIFT detected
   └── Classify severity: low (<20%), medium (20-50%), high (>50%)

4. CONCEPT SHIFT CHECK (on re-annotation)
   ├── User re-annotates after drift
   ├── Compare: old annotation text vs new annotation text
   ├── Ask Claude: "Did the PURPOSE change, or just wording?"
   └── Store: conceptShifted = true/false + reason

5. RULE EVALUATION (on demand / commit / etc)
   ├── Check enabled rules against current state
   ├── Conditions: missing_annotation, stale, high_drift, uncovered_module, concept_shifted
   └── Return violations for review
```

## Data Flow

```
Code Change
    ↓
tree-sitter parse → contentHash computed
    ↓
Hash mismatch? → Drift Event created
    ↓
Re-annotate → Concept shift check (Claude)
    ↓
Rules evaluate → Violations surfaced
```

## MCP Tools

| Tool | What it does |
|------|--------------|
| `search_functions` | Find functions by name |
| `get_callers` | Who calls this function? |
| `get_callees` | What does this function call? |
| `get_call_chain` | Full call tree from entry point |
| `get_file_functions` | List functions in a file |
| `get_touched_functions` | Recently changed, may need annotation |
| `get_stats` | Codebase stats |
| `evaluate_rules` | Check for violations |

## Rule Conditions

| Condition | Description | Default Action |
|-----------|-------------|----------------|
| `missing_annotation` | Functions without annotations | Coverage tracking |
| `stale` | Annotation hash ≠ current code hash | Outdated docs |
| `high_drift` | >50% code change | "Re-annotate suggested" |
| `uncovered_module` | Modules without summaries | Coverage tracking |
| `concept_shifted` | Purpose changed (Claude detected) | "Review needed" |

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     YOUR CODEBASE                           │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│  ANALYSIS LAYER (tree-sitter)                               │
│  - Parses code → nodes (functions, classes)                 │
│  - Computes contentHash per function                        │
│  - Builds call graph edges                                  │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│  STORAGE LAYER (SQLite)                                     │
│  - annotation_versions: annotation history                  │
│  - drift_events: detected changes                           │
│  - module_annotations: directory-level summaries            │
│  - observability_rules: what to check                       │
│  - rule_evaluations: check history                          │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│  API LAYER (REST + WebSocket)                               │
│  - CRUD for annotations, rules                              │
│  - Real-time updates via WebSocket                          │
│  - Evaluate rules endpoint                                  │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│  INTEGRATION LAYER                                          │
│  - MCP Server → Claude Code can query/evaluate              │
│  - /commit skill → checks rules before commit               │
│  - Web UI → visualize graph, drift, annotations             │
└─────────────────────────────────────────────────────────────┘
```

## The Key Insight

**contentHash is the bridge** between code and documentation:
- Code changes → hash changes → drift detected → annotation may be stale
- Concept shift = not just "code changed" but "purpose changed"
- Rules = automated checks that this bridge stays intact

## API Endpoints

### Rules
```
GET    /api/rules              # List all rules
GET    /api/rules/stats        # Rule statistics
GET    /api/rules/violations   # Recent violations
GET    /api/rules/:id          # Get single rule
POST   /api/rules              # Create rule
PATCH  /api/rules/:id          # Update rule
DELETE /api/rules/:id          # Delete rule
GET    /api/rules/:id/evaluations  # Evaluation history
POST   /api/rules/evaluate     # Evaluate all enabled rules
POST   /api/rules/:id/evaluate # Evaluate single rule
```

## Default Rules

Two rules are set up by default:
1. **Concept Shift Alert** - Alerts when function purpose changes
2. **High Drift Notification** - Notifies when code changes significantly

These are informational (warn action), not blocking.
