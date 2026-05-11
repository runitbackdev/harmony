# Web App Patterns (apps/web)

This directory contains the React 19 frontend for Harmony.

## Technical Stack
- **Routing**: TanStack Router (File-based).
- **State Management**: 
  - Server State: TanStack Query.
  - Reactive Local State: Valtio.
- **Forms**: TanStack Form + Valibot.
- **Components**: Skeleton Labs (React) + Tailwind 4.

## Core Patterns

### 1. Thin UI
The UI should be a thin rendering layer. Complex logic, especially Matrix-related data processing, belongs in the SharedWorker (`packages/core`) or Rust.

### 2. Authentication
Authenticated routes must be nested under the `_authenticated` layout in `src/routes/`. This layout ensures session restoration before rendering.

### 3. Data Access
Use hooks from `packages/react` (e.g., `useHarmony`, `useSyncStatus`) to interact with the core client. Avoid direct `postMessage` calls from components.

### 4. Styling
Always prefer Skeleton design tokens (e.g., `bg-surface-100`, `text-primary-500`) over hardcoded Tailwind colors to ensure theme compatibility.
