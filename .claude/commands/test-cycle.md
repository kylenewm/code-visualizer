# Test Cycle

Generate and run tests progressively.

## Steps

1. **Check what changed**
```bash
git diff --name-only
```

2. **Detect test framework** — Same as `/test` (auto-detect)

3. **Check test coverage for changed files:**
   - For each changed source file, look for corresponding test file
   - If tests exist: run them
   - If no tests and change is clear: generate tests for key behaviors
   - If no tests and unclear what to test: ask user

4. **If generating tests:**
   - Infer test cases from the code (inputs, outputs, edge cases)
   - Only ask user if multiple valid approaches or unclear scope

5. **Run existing tests first**
   - Unit tests (if available)
   - Stop if fails. Fix before continuing.

6. **Run new/generated tests**
   - Stop if fails.

7. **Run integration tests** (if available and unit passes)

8. **Report summary**
```
Files changed: X
Tests generated: Y (if any)
Unit tests: PASS/FAIL
Integration tests: PASS/FAIL (if run)
```

## If Tests Fail

1. Analyze the failure
2. Determine: bug in code or bug in test?
3. Ask user if unclear which
4. Fix the actual problem
5. Re-run

## Do NOT

- Generate tests without asking
- Skip to integration without unit passing
- Mark anything done if tests fail
- Write weak tests just to pass
