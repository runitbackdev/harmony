<a id="readme-top"></a>
[![Stars][stars-shield]][stars-url]
[![Forks][forks-shield]][forks-url]
[![Issues][issues-shield]][issues-url]
[![MIT License][license-shield]][license-url]

<br />
<div align="center">
  <img src="assets/logo.svg" alt="Harmony logo" width="40" height="40" />
  <h3 align="center">Harmony</h3>

  <p align="center">
    A modern, open-source chat client built with React, Rust, and WebAssembly.
    <br />
    <a href="https://codeberg.org/harmonychat/harmony/wiki"><strong>Explore the docs &raquo;</strong></a>
    <br />
  </p>
</div>

<details>
  <summary>Table of Contents</summary>
  <ol>
    <li>
      <a href="#about-the-project">About The Project</a>
      <ul>
        <li><a href="#built-with">Built With</a></li>
      </ul>
    </li>
    <li>
      <a href="#getting-started">Getting Started</a>
      <ul>
        <li><a href="#prerequisites">Prerequisites</a></li>
        <li><a href="#setup">Setup</a></li>
      </ul>
    </li>
    <li><a href="#usage">Usage</a></li>
    <li><a href="#local-synapse">Local Synapse</a></li>
    <li><a href="#project-structure">Project Structure</a></li>
    <li><a href="#contributing">Contributing</a></li>
<li><a href="#license">License</a></li>
  </ol>
</details>

## About The Project

A community chat app that feels like Discord but runs on [Matrix](https://matrix.org). Open source, self-hostable, yours to own.

Matrix has a UX problem — most clients feel like they were built for protocol enthusiasts, not people. Harmony is designed for communities: onboarding, channels, roles, moderation, and voice should just work. No one should have to know what Matrix is to use Harmony.

<p align="right">(<a href="#readme-top">back to top</a>)</p>

### Built With

[![Matrix][Matrix-badge]][Matrix-url]
[![React][React.js]][React-url]
[![Rust][Rust-badge]][Rust-url]
[![Vite][Vite-badge]][Vite-url]
[![Tailwind CSS][Tailwind-badge]][Tailwind-url]

<p align="right">(<a href="#readme-top">back to top</a>)</p>

## Getting Started

### Prerequisites

- [mise](https://mise.jdx.dev) — pins Rust, Node, pnpm, Ruby, `just`, `wasm-pack`, `hivemind`, and other dev tools
- A container runtime — [Docker](https://docs.docker.com/get-docker/) or [Podman](https://podman.io). Only required if running a local Synapse (the default frontend dev path uses a hosted homeserver).

> **Atomic desktops (Bazzite, Silverblue, Bluefin, NixOS):** install `mise` via Homebrew (`brew install mise`) — no `rpm-ostree` layering required. Podman ships out of the box; the justfile auto-detects it.

### Setup

```sh
git clone ssh://git@codeberg.org/harmonychat/harmony.git
cd harmony
mise install        # installs every pinned tool
pnpm install        # node deps
pnpm lefthook install  # git hooks
just build-wasm-dev    # initial WASM build
```

That's it. `mise install` reads `.mise.toml` and provisions `rust`, `node`, `pnpm`, `ruby`, `just`, `wasm-pack`, `typos`, `committed`, `watchexec`, and `hivemind` — all into `~/.local/share/mise`, no system package manager involved.

<p align="right">(<a href="#readme-top">back to top</a>)</p>

## Usage

Three modes, pick what you need:

```sh
just web        # frontend only — points at hosted homeserver, no local backend
just dev        # frontend + local synapse + herald (full local stack)
just build      # production build
```

| Command      | Description                            |
| ------------ | -------------------------------------- |
| `just web`   | Vite only, hosted homeserver           |
| `just dev`   | Synapse (detached) + herald + web      |
| `just build` | Production build (WASM + web)          |
| `just check` | Run cargo check, clippy, eslint, typos |
| `just fmt`   | Format Rust and TypeScript files       |
| `just clean` | Remove build artifacts                 |

### Why two dev commands?

- `just web` is for UI work. It runs the Vite dev server only and points at our hosted dev homeserver (`chat.lycanthropy.dev` by default). No container runtime, no Ruby, no supervisor.
- `just dev` is for protocol/backend work. It spins up Synapse via `compose` (detached, so Ctrl-C on the dev server doesn't tear it down) and then runs Herald + web under [hivemind](https://github.com/DarthSim/hivemind).

Override the homeserver any time:

```sh
VITE_HOMESERVER_URL=http://localhost:8008 just web
```

<p align="right">(<a href="#readme-top">back to top</a>)</p>

## Local Synapse

A local [Synapse](https://github.com/element-hq/synapse) homeserver is included for development and testing. Requires Docker or Podman — the justfile picks whichever is installed.

Start Synapse:

```sh
just synapse
```

Seed test users:

```sh
just setup-users
```

| Command              | Description                            |
| -------------------- | -------------------------------------- |
| `just synapse`       | Start local Synapse (port 8008)        |
| `just setup-users`   | Create test users                      |
| `just synapse-stop`  | Stop Synapse                           |
| `just synapse-reset` | Stop Synapse, delete all data, reseed  |

### Test Accounts

| User  | Password | Role  |
| ----- | -------- | ----- |
| admin | admin    | Admin |
| alice | alice    | User  |
| bob   | bob      | User  |

<p align="right">(<a href="#readme-top">back to top</a>)</p>

## Project Structure

```
harmony/
├── apps/web/          # React web application
├── crates/wasm/       # Rust WASM crate
├── packages/
│   ├── composer/      # Lexical-based message composer
│   ├── core/          # Core client logic
│   ├── profiler/      # Performance profiling
│   ├── protocol/      # Protocol types and definitions
│   ├── react/         # React bindings and hooks
│   ├── ui/            # Design system components
│   └── wasm/          # WASM build output (generated)
├── justfile           # Task runner commands
└── lefthook.yml       # Git hooks config
```

<p align="right">(<a href="#readme-top">back to top</a>)</p>

## Contributing

1. Fork the repo on [Codeberg](https://codeberg.org/harmonychat/harmony)
2. Create a feature branch (`git checkout -b feature/my-feature`)
3. Commit your changes using [Conventional Commits](https://www.conventionalcommits.org) (e.g. `feat: add voice channels`)
4. Push to the branch and open a Pull Request

### AI Usage

We use AI tools during development and welcome contributions that do too. What we don't welcome is slop — auto-generated code dumped without understanding, review, or care. If you use AI, treat it like any other tool: understand what it produces, clean it up, and make sure it meets the same quality bar as everything else.

### Git Hooks

Running `just` sets up [Lefthook](https://github.com/evilmartians/lefthook) git hooks that run automatically:

- **Pre-commit:** formatting (cargo fmt, prettier), linting (clippy, eslint), and spell checking via [typos](https://github.com/crate-ci/typos)
- **Commit message:** validated by [committed](https://github.com/crate-ci/committed) — must follow conventional commit format

Allowed commit types: `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `build`, `ci`, `chore`

<p align="right">(<a href="#readme-top">back to top</a>)</p>

## License

<p align="right">(<a href="#readme-top">back to top</a>)</p>

<!-- MARKDOWN LINKS & IMAGES -->

[stars-shield]: https://img.shields.io/gitea/stars/harmonychat/harmony?gitea_url=https%3A%2F%2Fcodeberg.org&style=for-the-badge
[stars-url]: https://codeberg.org/harmonychat/harmony
[forks-shield]: https://img.shields.io/gitea/forks/harmonychat/harmony?gitea_url=https%3A%2F%2Fcodeberg.org&style=for-the-badge
[forks-url]: https://codeberg.org/harmonychat/harmony
[issues-shield]: https://img.shields.io/gitea/issues/open/harmonychat/harmony?gitea_url=https%3A%2F%2Fcodeberg.org&style=for-the-badge
[issues-url]: https://codeberg.org/harmonychat/harmony/issues
[license-shield]: https://img.shields.io/badge/license-MIT-green?style=for-the-badge
[license-url]: https://codeberg.org/harmonychat/harmony/src/branch/main/LICENSE.txt
[Matrix-badge]: https://img.shields.io/badge/Matrix-protocol-51bb9c?style=for-the-badge&logo=matrix&logoColor=white
[Matrix-url]: https://matrix.org
[React.js]: https://img.shields.io/badge/React_19-20232A?style=for-the-badge&logo=react&logoColor=61DAFB
[React-url]: https://react.dev
[Rust-badge]: https://img.shields.io/badge/Rust-000000?style=for-the-badge&logo=rust&logoColor=white
[Rust-url]: https://www.rust-lang.org
[Vite-badge]: https://img.shields.io/badge/Vite-646CFF?style=for-the-badge&logo=vite&logoColor=white
[Vite-url]: https://vite.dev
[Tailwind-badge]: https://img.shields.io/badge/Tailwind_CSS_4-06B6D4?style=for-the-badge&logo=tailwindcss&logoColor=white
[Tailwind-url]: https://tailwindcss.com
