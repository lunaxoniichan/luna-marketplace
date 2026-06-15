---
name: kwb-python
description: Use when writing or reviewing Python — idiomatic patterns, type hints, error handling, context managers, dataclasses, concurrency, and anti-patterns
---

# kwb-python — Pythonic patterns

Knowledge base for robust, idiomatic Python. Testing is `kwb-python-testing`. Adapted (trimmed) from
ECC `python-patterns`. Principles: readability counts · explicit > implicit · **EAFP** (try/except,
not check-first).

## Type hints

```python
from typing import Protocol, TypeVar

def process(items: list[str]) -> dict[str, int]:      # 3.9+ built-in generics
    return {i: len(i) for i in items}

T = TypeVar("T")
def first(items: list[T]) -> T | None: return items[0] if items else None

class Renderable(Protocol):                            # structural/duck typing
    def render(self) -> str: ...
```

## Error handling

```python
try:
    return Config.from_json(open(path).read())
except FileNotFoundError as e:
    raise ConfigError(f"Config not found: {path}") from e   # chain with `from`
except json.JSONDecodeError as e:
    raise ConfigError(f"Invalid JSON: {path}") from e
```
Catch **specific** exceptions (never bare `except`). Build a hierarchy: `AppError` → `ValidationError`,
`NotFoundError`.

## Context managers

```python
from contextlib import contextmanager
@contextmanager
def timer(name):
    start = time.perf_counter(); yield
    print(f"{name}: {time.perf_counter() - start:.4f}s")

class Tx:                                  # class form: commit on success, rollback on error
    def __enter__(self): self.conn.begin(); return self
    def __exit__(self, exc_type, *_): self.conn.commit() if exc_type is None else self.conn.rollback(); return False
```

## Comprehensions, generators, dataclasses

```python
names = [u.name for u in users if u.is_active]      # simple transform → comprehension
total = sum(x * x for x in range(1_000_000))        # generator expr: no intermediate list
def read(path):                                      # generator fn: stream large files
    with open(path) as f:
        for line in f: yield line.strip()

from dataclasses import dataclass, field
@dataclass
class User:
    id: str; name: str
    is_active: bool = True
    def __post_init__(self):                         # validation hook
        if "@" not in self.email: raise ValueError(self.email)
```
`NamedTuple` for immutable value objects; `__slots__ = ["x", "y"]` to cut per-instance memory.

## Decorators

```python
import functools
def timer(fn):
    @functools.wraps(fn)                # preserve __name__/__doc__
    def wrap(*a, **kw): return fn(*a, **kw)
    return wrap
```
Parameterized: `def repeat(n): def deco(fn): … return deco`.

## Concurrency — match the tool to the work

```python
# I/O-bound → threads
with concurrent.futures.ThreadPoolExecutor(max_workers=10) as ex: ...
# CPU-bound → processes
with concurrent.futures.ProcessPoolExecutor() as ex: ex.map(work, datasets)
# async I/O → asyncio.gather
results = await asyncio.gather(*[fetch(u) for u in urls], return_exceptions=True)
```

## Anti-patterns → fix

- Mutable default arg `def f(x, items=[])` → use `items=None`; create inside.
- `type(obj) == list` → `isinstance(obj, list)`.
- `value == None` → `value is None`.
- `from module import *` → explicit imports.
- Bare `except:` → specific exception + log.
- `result += s` in a loop (O(n²)) → `"".join(...)`.

## Tooling

`black .` · `isort .` · `ruff check .` · `mypy .` (`disallow_untyped_defs`) ·
`pytest --cov` · `bandit -r .` · `pip-audit`. Config in `pyproject.toml`. Layout: `src/pkg/`, `tests/`
with `conftest.py`. Import order: stdlib → third-party → local.
