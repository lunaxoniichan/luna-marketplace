---
name: kwb-python-testing
description: Use when writing or reviewing Python tests — pytest fixtures, parametrization, mocking, async tests, markers, coverage, and TDD discipline
---

# kwb-python-testing — pytest patterns

Knowledge base for Python testing. Language idioms are `kwb-python`; the TDD discipline itself is the
`dev-tdd` skill. Adapted (trimmed) from ECC `python-testing`.

## TDD + coverage

RED (failing test) → GREEN (minimal code) → REFACTOR (keep green). Target **80%+**, critical paths
100%. `pytest --cov=pkg --cov-report=term-missing`.

## Assertions

```python
assert result == expected
assert item in collection
assert value is None                         # not == None
with pytest.raises(ValueError, match="invalid input"):   # exceptions
    validate("invalid")
with pytest.raises(CustomError) as exc:      # inspect attributes
    raise CustomError("x", code=400)
assert exc.value.code == 400
```

## Fixtures

```python
@pytest.fixture
def database():
    db = Database(":memory:"); db.create_tables()
    yield db          # setup before, teardown after
    db.close()

@pytest.fixture(scope="module")     # function (default) | module | session
def shared(): ...
@pytest.fixture(autouse=True)       # runs around every test without being requested
def reset(): Config.reset(); yield; Config.cleanup()
```
Shared fixtures go in `tests/conftest.py` (auto-discovered). Use `tmp_path` (a `pathlib.Path`) for
file tests — auto-cleaned: `(tmp_path / "f.txt").write_text("hi")`.

## Parametrize

```python
@pytest.mark.parametrize("inp,expected", [
    ("valid@email.com", True), ("invalid", False),
], ids=["valid", "missing-at"])
def test_email(inp, expected):
    assert is_valid_email(inp) is expected
```
Parametrized fixtures (`@pytest.fixture(params=[...])` + `request.param`) run every dependent test
once per param — e.g. across DB backends.

## Markers & selection

```python
@pytest.mark.slow
@pytest.mark.integration
def test_x(): ...
```
`pytest -m "not slow"` · `-m "integration or slow"`. Register markers in config (`--strict-markers`).

## Mocking (`unittest.mock`)

```python
@patch("pkg.external_api_call")
def test_it(api):
    api.return_value = {"status": "ok"}        # stub return
    api.side_effect = ConnectionError("net")   # raise instead
    api.assert_called_once_with("localhost")

@patch("builtins.open", new_callable=mock_open)            # mock file IO
@patch("pkg.DBConnection", autospec=True)                  # autospec catches API misuse
```
Mock **external dependencies**, not the code under test. Avoid over-specific mocks (brittle).

## Async (`pytest-asyncio`)

```python
@pytest.mark.asyncio
async def test_async(async_client):
    resp = await async_client.get("/api/users")
    assert resp.status_code == 200
# mocks: api.assert_awaited_once()
```

## DB session pattern

```python
@pytest.fixture
def db_session():
    s = Session(bind=engine); s.begin_nested()
    yield s
    s.rollback(); s.close()      # roll back so tests stay isolated
```

## DO / DON'T

- **DO:** test behavior not internals · one behavior per test · descriptive names
  (`test_login_with_invalid_credentials_fails`) · fixtures to dedupe · edge cases (empty/None/bounds)
  · keep tests fast + independent.
- **DON'T:** test third-party code · share state between tests · catch exceptions manually
  (use `pytest.raises`) · `print` (use asserts) · write brittle over-specified mocks.

## Run

```bash
pytest -v                     # verbose
pytest tests/t.py::test_fn    # one test
pytest -k "user"              # name pattern
pytest -x / --maxfail=3       # stop early
pytest --lf                   # last failed
pytest --cov=pkg              # coverage
```
Config in `pyproject.toml` `[tool.pytest.ini_options]` (`testpaths`, `addopts`, `markers`).
