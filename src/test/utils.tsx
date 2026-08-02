/**
 * Shared test helpers for the React + TanStack Query stack.
 *
 * <App /> consumes TanStack Query, so it must render inside a
 * QueryClientProvider. `renderInApp` wraps `render` with a fresh, per-test
 * QueryClient (no cross-test cache leakage) and returns the usual Testing
 * Library queries plus the client for direct manipulation.
 *
 * (Tauri core mocking — `invoke` + the `Channel` stub — is done inline in each
 * App test via `vi.hoisted`, because `vi.mock` factories are hoisted above
 * imports and cannot reference an imported helper.)
 */
import React from 'react';
import { render, type RenderOptions, type RenderResult } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

/** Build an isolated QueryClient per test: `gcTime: 0` + no retries keeps
 *  tests fast and prevents state bleeding between cases. */
export function makeTestQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0, staleTime: 0, refetchOnWindowFocus: false },
      mutations: { retry: false },
    },
  });
}

/** Render `ui` inside a fresh QueryClientProvider. Use this instead of bare
 *  `render` for any component that calls `useQuery` / `useMutation`. */
export function renderInApp(
  ui: React.ReactElement,
  options?: RenderOptions & { queryClient?: QueryClient },
): RenderResult & { queryClient: QueryClient } {
  const queryClient = options?.queryClient ?? makeTestQueryClient();
  const result = render(
    <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>,
    options,
  );
  return { ...result, queryClient };
}
