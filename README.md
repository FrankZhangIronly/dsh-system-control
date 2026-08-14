# dsh-system-control

> A [DeepSeek Harness (DSH)](https://github.com/deepseek-ai) web plugin that adds a **System** menu to the sidebar footer with **Restart** and **Shutdown** controls. Restart cycles the launcher (`dsh web` exits with code `42` and is relaunched); Shutdown exits cleanly (`0`). Both are routed over a loopback RPC channel so non-local callers are rejected automatically.

The plugin is shipped as a **two-sided DSH plugin**: a host (Node) half that owns the `/system` RPC channel and calls the existing `appExit` exit hook, and a browser half that renders the sidebar button + the centered modal dialog.

> 🌏 **[中文版本 / Chinese version](./README.zh-CN.md)** is also available.

---

## Features

- **Sidebar trigger** in the sidebar footer mirroring the official settings button shape (wide-bar / collapsed-circle variants).
- **Centered modal** with two side-by-side actions: *Restart service* and *Shutdown service*. Shutdown asks for a second confirmation (auto-reverts after 4 s).
- **Loopback-only RPC** so anyone hitting the host port from another network is blocked with `403` by DSH's existing authority check.
- **Ack-before-exit**: the response is flushed before `appExit()` is invoked (80 ms timer), so the browser receives a clean acknowledgement.
- **Zero changes to DSH core** — installed as an ordinary plugin, survives `@deepseek-ai/dsh` updates.

---

## Installation

```sh
dsh plugin --profile web add dsh-system-control
```

Restart `dsh web`. The new **系统 / System** button appears at the bottom of the sidebar.

To install from a local checkout:

```sh
dsh plugin --profile web add /path/to/dsh-system-control
```

---

## Exit-code protocol

| Action    | Exit code | Launcher behavior                              |
| --------- | --------- | ---------------------------------------------- |
| Shutdown  | `0`       | The launcher loop exits and the window closes. |
| Restart   | `42`      | The launcher loop relaunches `dsh web`.        |
| Status    | n/a       | Probe: returns `{ exitAvailable, exitType }`.  |

The companion launcher `DSH Web.ps1` already implements this contract:

- exit `0` → close window,
- exit `42` → relaunch,
- any other code → log and exit.

If you launch DSH through a different mechanism (systemd unit, plain `dsh web`, etc.) make sure it understands these codes. Anything else will be treated as a hard crash.

---

## How it works

```
┌────────────────────┐  connection.rpc.call('/system', 'restart', {})   ┌──────────────────────────┐
│  Sidebar button    │ ───────────────────────────────────────────────▶ │  HostConnectionService   │
│  + modal (browser) │                                                │  → loopback authority    │
└────────────────────┘                                                │  → /system handler       │
                                                                      │  → ctx.get('appExit')(42)│
                                                                      └──────────────────────────┘
```

1. The bundle patch inserts a single host row `system-control` that injects `connection` and (transitively, via `connection` startup) `appExit` (which the cmdline launcher registers before any plugin mounts).
2. The host half registers an RPC handler on channel `/system` with `authority: 'loopback'`. Anything not bound to loopback is automatically rejected.
3. The browser half registers a slot entry under `sidebar.footer.action` with order `20` and renders the trigger + modal component.
4. `appExit(code)` is invoked through `ctx.get('timer').timeout(..., 80)` so the `200 OK` response can flush first.

---

## RPC contract (host half)

Channel: `/system` · authority: `loopback` (non-local callers get `403`).

| Endpoint   | Returns                                                                                     |
| ---------- | ------------------------------------------------------------------------------------------- |
| `status`   | `{ ok: true, value: { exitAvailable: <is function>, exitType: <typeof> } }`                |
| `restart`  | `{ ok: true, value: { accepted: true, code: 42 } }` then `appExit(42)` after ~80 ms.         |
| `shutdown` | `{ ok: true, value: { accepted: true, code: 0 } }` then `appExit(0)` after ~80 ms.          |
| anything else | `{ ok: false, error: { code: 'internal', message: 'unknown endpoint …' } }`              |

The `status` endpoint is purely a sanity probe used by the modal to display *"退出通道：可用 / 不可用"* in the dialog header.

---

## Repository layout

```
system-control/
├── cordis.patch.yml       # bundle patch: insert the system-control row
├── lib/
│   ├── index.js           # host half (Node): /system RPC + appExit bridge
│   └── client.js          # browser half: sidebar trigger + modal
├── package.json
└── README.md
```

The `cordis.patch.yml` adds a single row to the host composition tree that injects `connection`. `appExit` is provided by the cmdline launcher before the tree mounts, so it is consumed implicitly rather than declared in `inject: [...]`.

---

## Compatibility

- `@deepseek-ai/dsh` ≥ current web profile (consumes `connection`, `slots`, `timer`).
- Node ≥ 18 (matches DSH host runtime).
- Browser: Chromium-based (uses standard React + `KeyboardEvent` / `document` APIs).

---

## License

MIT