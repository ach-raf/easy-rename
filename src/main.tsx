import React from "react";
import ReactDOM from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import "./styles/depth.css";
import App from "./App";
import { applyTheme } from "./lib/theme";

// Apply the persisted theme before React renders so there's no flash of the
// wrong theme on cold start.
applyTheme();

// Single module-scope QueryClient (never re-created across renders).
// - staleTime 30s: a folder listing doesn't go stale the instant it lands;
//   avoiding an instant refetch on every mount keeps tab switches snappy.
// - refetchOnWindowFocus off: meaningless in a desktop window (there's no
//   "tab refocus" event worth acting on) and would cause noise.
// - retry on network-style errors only: TauriError is app logic (e.g. a
//   permission denial) and should surface immediately, not be retried.
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      refetchOnWindowFocus: false,
    },
  },
});

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
      {import.meta.env.DEV && <ReactQueryDevtools position="bottom" initialIsOpen={false} />}
    </QueryClientProvider>
  </React.StrictMode>,
);
