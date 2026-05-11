# Core & Worker Patterns (packages/core)

This package contains the SharedWorker logic and the primary `Harmony` client class.

## Architecture
- **SharedWorker**: A single worker shared across all browser tabs. It maintains the persistent connection to Matrix.
- **Dispatcher**: Routes incoming `postMessage` calls to specific handlers in `lib/worker/handlers/`.
- **PortRegistry**: Tracks connected tabs and handles broadcasting stream updates.

## Message Protocol
Every message crossing the worker boundary must have a definition in `packages/protocol`.

- **Requests**: Handlers must return a response with a matching `id`.
- **Streams**: Used for real-time updates (sync, room list changes).
- **Commands**: Fire-and-forget actions.

## Guidelines
- Handlers should be lightweight, delegating heavy protocol or crypto tasks to the WASM engine.
- Ensure all worker-side errors are caught and communicated back to the UI thread via the protocol to avoid silent failures.
