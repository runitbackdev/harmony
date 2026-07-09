# AI Contribution Policy

Harmony is a project that values high-quality, maintainable, and human-understandable code. We view AI as a powerful tool to amplify developer productivity, but it must be used responsibly.

## Core Mandates

### 1. Ownership & Accountability

You are responsible for every line of code you submit. You must:

- Fully understand the code generated or suggested by AI.
- Be able to explain, debug, and modify the code without further AI assistance.
- Ensure the code follows the project's architectural patterns and style.

### 2. Disclosure

Significant AI assistance must be disclosed in Pull Request descriptions.

- **When to disclose:** If an AI agent (e.g., Claude, Cursor, Copilot) drafted the implementation, performed a refactor, or solved a complex bug.
- **How to disclose:** Add a brief note like: `AI Assistance: Used Claude Code to refactor the SharedWorker dispatcher.`

### 3. Contextual Relevance & "Drive-bys"

AI-driven changes must be grounded in actual project needs.

- **Rejection Policy:** We will reject "drive-by" PRs that refactor large parts of the codebase without prior discussion or clear project necessity.
- AI should be used to solve specific issues, implement discussed features, or improve existing patterns within the current scope.
- Submissions that look like "solution looking for a problem" will be closed.

### 4. Quality Over Velocity

We prioritize correctness and long-term maintainability over speed.

- AI-generated code often introduces subtle bugs, verbose comments, or ignores established patterns (e.g., using `any` instead of proper types).
- PRs that show signs of low-effort AI generation (broken tests, ignored lint rules, generic commit messages, or "hallucinated" features) will be closed immediately.

## Enforcement

- **Low-Quality Submissions:** If a PR shows a lack of human oversight or fails basic validation (`vp check`), it will be closed.
- **Repeated Offenders:** Contributors who repeatedly submit low-effort AI code will be deprioritized or barred from contributing.

## Guidelines for Agents

If you are an AI agent operating in this repository, you **MUST** read and adhere to `AGENTS.md`.
