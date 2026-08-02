// Test setup — runs once before each test file.
// Registers @testing-library/jest-dom DOM matchers (toBeInTheDocument,
// toBeDisabled, toHaveClass, toHaveAttribute, toBeVisible, …) on Vitest's
// global `expect`, so component tests can assert on rendered DOM state.
import "@testing-library/jest-dom/vitest";
