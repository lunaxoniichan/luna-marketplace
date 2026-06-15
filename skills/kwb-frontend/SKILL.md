---
name: kwb-frontend
description: Use when building or reviewing React/Next.js UI — component composition, hooks, state, performance, forms, error boundaries, and accessibility
---

# kwb-frontend — React/Next.js patterns

Knowledge base for performant, accessible UIs. TS baseline is `kwb-typescript`; Next.js/Turbopack
specifics are `kwb-nextjs`. Adapted (trimmed) from ECC `frontend-patterns`.

## Components

- **Composition over inheritance** — small pieces (`<Card><CardHeader/><CardBody/></Card>`).
- **Compound components** share state via Context (`Tabs` → `TabsContext` → `Tab` reads `activeTab`);
  throw if a child renders outside its provider.

## Custom hooks (key gotcha included)

```typescript
// Async query hook — keep fetcher/options in refs so `refetch` is referentially
// stable. Without refs, inline fn/object props make a new refetch each render →
// the effect re-runs after every state update → INFINITE FETCH LOOP.
export function useQuery<T>(key: string, fetcher: () => Promise<T>, options?: UseQueryOptions<T>) {
  const [state, setState] = useState({ data: null as T | null, error: null as Error | null, loading: false });
  const fetcherRef = useRef(fetcher); const optionsRef = useRef(options);
  useEffect(() => { fetcherRef.current = fetcher; optionsRef.current = options; });
  const refetch = useCallback(async () => {
    setState(s => ({ ...s, loading: true, error: null }));
    try { const data = await fetcherRef.current(); setState({ data, error: null, loading: false }); optionsRef.current?.onSuccess?.(data); }
    catch (e) { setState(s => ({ ...s, error: e as Error, loading: false })); optionsRef.current?.onError?.(e as Error); }
  }, []);
  useEffect(() => { if (options?.enabled !== false) refetch(); }, [key, refetch]);
  return { ...state, refetch };
}

// useDebounce — setTimeout + cleanup on [value, delay]; drive search off the debounced value.
```

## State

Local: `useState`. Cross-component: **Context + `useReducer`** (typed `Action` union; reducer returns
`{ ...state, … }`; expose a `useMarkets()` that throws outside its provider). Reach for Zustand/Query
only when Context churn or server-cache needs justify it.

## Performance

```typescript
const sorted = useMemo(() => [...markets].sort((a,b) => b.volume - a.volume), [markets]); // copy! sort mutates
const onSearch = useCallback((q: string) => setQuery(q), []);
export const MarketCard = React.memo<Props>(({ market }) => /* … */);
const Heavy = lazy(() => import('./Heavy'));   // + <Suspense fallback={<Skeleton/>}>
```
Long lists → virtualize (`@tanstack/react-virtual`: `count`, `estimateSize`, `overscan`; absolutely
position rows by `virtualRow.start`).

## Forms

Controlled inputs (`value` + `onChange` with functional update `prev => ({ ...prev, name })`);
validate on submit (or via a Zod schema → see `kwb-api` error shape); render field errors inline;
`e.preventDefault()` then guard on `validate()`.

## Error boundary

Class component with `getDerivedStateFromError` (set `hasError`) + `componentDidCatch` (log); render a
fallback with a retry that resets state. Wrap risky subtrees: `<ErrorBoundary><App/></ErrorBoundary>`.

## Accessibility

- **Keyboard nav** — handle `ArrowUp/Down/Enter/Escape`; `role="combobox"`/`listbox`,
  `aria-expanded`, `aria-haspopup`.
- **Focus management** — on open, save `document.activeElement`, focus the dialog; on close, restore.
  `role="dialog"`, `aria-modal="true"`, `tabIndex={-1}`, Escape closes.
