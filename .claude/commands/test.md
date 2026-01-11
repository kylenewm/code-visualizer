# Run Tests

Run the project's test suite.

## Steps

1. **Detect test framework** — Look for:
   - `pytest.ini`, `pyproject.toml` with pytest, `tests/` dir → pytest
   - `package.json` with jest/vitest/mocha → npm test
   - `Makefile` with test target → make test
   - `Cargo.toml` → cargo test
   - If unclear, ask user

2. **Find the test command** — Check for:
   - Virtual env: `./venv/bin/pytest`, `poetry run pytest`
   - Package.json scripts
   - Makefile targets
   - If multiple options exist, ask user which to run

3. **Run tests**
   - Start with unit tests if available
   - Report results clearly

4. **On failure**
   - Analyze the failure
   - Suggest specific fix
   - Do NOT mark any todo complete until tests pass
