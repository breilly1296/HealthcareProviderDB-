# Frontend Data Fetching & State Management

## Summary

Data fetching is centralized around `apiFetch` (`lib/api.ts:391`) which provides retry-with-backoff, CSRF double-submit, transparent 401 refresh, and typed `ApiError`. Server state lives in React Query with a shared `QueryClient` (`lib/queryClient.ts:3`) and is wrapped at layout level via `QueryProvider`. Feature hooks (`useProviderSearch`, `useCities`, `useHealthSystems`, `useInsuranceCard`) implement disciplined query-key factories and per-filter caching, with one outlier — `useInsurancePlans` uses a hand-rolled module-level cache instead of React Query. Client state is minimal and context-based (Compare, Error, Theme, Auth). Maturity: production-ready, but missing devtools, optimistic mutations for verifications/votes, and consistent React Query adoption for plans.

## Findings

### CRITICAL

- None observed.

### HIGH

- `useInsurancePlans` bypasses React Query entirely and uses a module-level `Map` cache (`hooks/useInsurancePlans.ts:14-23`). This diverges from the rest of the data layer: no devtools visibility, no invalidation via `queryClient.invalidateQueries`, no coordinated cache busting on login/logout. `clearInsurancePlansCache` is manual and only callers aware of it benefit.

### MEDIUM

- `providerApi.getPlans` (`lib/api.ts:561-574`) calls `/providers/:npi/plans` — the prompt file lists this as "no backend route — will 404", but backend actually exposes it at `packages/backend/src/routes/providers.ts:405` (`GET /:npi/plans`). The prompt doc is out of date; the endpoint works.
- `QueryProvider` does not mount `<ReactQueryDevtools />` even in development (`components/providers/QueryProvider.tsx:1-13`). Hard to debug cache state.
- Global retry default is `retry: 2` for all queries (`lib/queryClient.ts:8`). Combined with `fetchWithRetry`'s own 2-attempt inner retry loop (`lib/api.ts:46-51, 255-315`), a single failing request can trigger up to `3 × 3 = 9` network attempts before surfacing to UI.
- `apiFetch` recurses on CSRF (`lib/api.ts:428-435`) and on 401 refresh (`:439-444`). Recursion is bounded by `_skipAuthRetry`/`_skipCsrfRetry` flags, but if both trip (refresh succeeds but new token also gets 403 CSRF), the flow will re-enter once more. Consider flattening to a single retry loop.

### LOW

- `CompareContext` uses `sessionStorage` rather than `localStorage` (`context/CompareContext.tsx:40`). Prompt-10 and prompt-33 both list persistence as TBD; actual persistence exists but only per-tab.
- `useInsuranceCard` scan mutation does `fetch()` directly to `/api/insurance-card/extract` (`hooks/useInsuranceCard.ts:49-54`) instead of going through `apiFetch`, so it skips the retry/CSRF/401 logic. This is intentional (Next.js route, not backend) but the behavioral difference is not documented.
- `providerKeys.plans/colocated` include `params` in the key (`hooks/useProviderSearch.ts:14-17`) but pass `{}` as default, serialized to the same string each time — OK, just noting.
- `buildQueryString` emits arrays as comma-joined strings (`lib/api.ts:228-231`). Backend must parse accordingly for `cities`; if not, multi-borough NYC search would break silently.

## Checklist Verification

### API Client
- [x] Centralized `apiFetch()` with retry — `lib/api.ts:391`, retry loop at `:255-315`
- [x] `ApiError` typed — `lib/api.ts:63-103`
- [x] Rate-limit + `Retry-After` parsing — `lib/api.ts:145-162, 456-462`
- [x] Exponential backoff — `lib/api.ts:167-185`
- [x] Network error detection — `lib/api.ts:126-139`
- [x] Abort support — `lib/api.ts:119-121, 293-296`
- [x] API namespaces typed — `providers`, `plans`, `verify`, `auth`, `savedProviders`, `insuranceCard`, `locations` in `lib/api.ts`

### React Query
- [x] `QueryClientProvider` in layout — `app/layout.tsx:127-150`
- [x] Query key factory — `hooks/useProviderSearch.ts:8-18`, `hooks/useCities.ts:131-134`, `hooks/useHealthSystems.ts:10-14`
- [x] Provider search/detail/plans/colocated hooks — `useProviderSearch.ts:43-128`
- [partial] Dropdown data hooks with caching — `useCities.ts` and `useHealthSystems.ts` use React Query; `useInsurancePlans.ts:22-23` uses its own `Map` cache
- [x] Prefetch utilities — `prefetchCities` (`useCities.ts:165-171`), `prefetchHealthSystems` (`useHealthSystems.ts:42-51`)
- [x] Cache clear utilities — `clearCitiesCache` (`useCities.ts:158`), `clearHealthSystemsCache` (`useHealthSystems.ts:35`), `clearInsurancePlansCache` (in `useInsurancePlans`)

### Search State
- [x] URL parameter sync — `hooks/search/useSearchParams.ts` (bi-directional)
- [x] Filter state w/ defaults — `hooks/search/useFilterState.ts:10-21`, `isFilterActive` at `:30-35`
- [x] Search execution via React Query — `hooks/search/useSearchExecution.ts:1-50` (invokes `api.providers.search` and posts analytics)
- [x] Form state orchestration — `hooks/useSearchForm.ts` (root)

### Client State
- [x] CompareContext — `context/CompareContext.tsx:32-148`; persists to sessionStorage
- [x] ErrorContext — `context/ErrorContext.tsx`
- [x] ThemeContext — `context/ThemeContext.tsx`
- (also present) AuthContext — `context/AuthContext.tsx`

### Missing / Future
- [ ] Optimistic updates for verifications/votes — only `BookmarkButton` has optimistic flow (`components/BookmarkButton.tsx:33-40`). Verification submit/vote does not use `onMutate` optimistic pattern.
- [ ] Infinite scroll / virtual list — uses classic pagination via `PaginationState`
- [ ] Service worker for offline — no `sw.js` or workbox config found
- [ ] React Query devtools — not imported anywhere under `packages/frontend`

## Recommendations (ranked)

1. Migrate `useInsurancePlans` to React Query (`hooks/useInsurancePlans.ts`), sharing `queryClient` so plans participate in global invalidation/devtools. Keep the 10-minute `staleTime` by passing it to `useQuery` options.
2. Conditionally mount `<ReactQueryDevtools />` in `QueryProvider` when `process.env.NODE_ENV === 'development'` to speed up debugging — prompt's "Missing / Future" item 4.
3. Disable React Query's built-in retry (`retry: 0` on `queryClient` since `fetchWithRetry` already retries), OR remove the inner retry loop in `apiFetch`. Today the two layers compound (up to 9 attempts per failed request).
4. Add optimistic updates for `verificationApi.submit` and `verificationApi.vote` using `useMutation({ onMutate, onError rollback })`, mirroring `BookmarkButton` (`components/BookmarkButton.tsx:33-45`). Gives instant UI feedback and closes prompt item "Optimistic updates for verifications/votes".
5. Update the prompt's stale note about `GET /providers/:npi/plans` returning 404 — backend route is at `packages/backend/src/routes/providers.ts:405`.
6. Document the `buildQueryString` array-joining convention (`lib/api.ts:228-231`) or replace with `params.append(k, v)` for each element, so backend expectations are explicit.

## Open Questions

1. Should we add optimistic updates for verification submissions? (recommended above)
2. Is the retry logic appropriate for expected traffic? Double-retry (React Query + apiFetch) may be over-aggressive under load — consider collapsing to one layer.
3. Should dropdown data (cities, plans) be prefetched on app load or on-demand? Today: on-demand via hooks. App-load prefetch would warm cache but add TTFI cost.
4. Should we add React Query devtools in development? Yes — see recommendation 2.
5. Is the max-4 (actual: 3, `constants.ts:10`) provider comparison limit sufficient? See prompt 33 — doc drift.
