---
description: Start, stop, or check the local usdx-bridge stack (no image builds)
argument-hint: up | down [--infra] | status
allowed-tools: Bash(scripts/stack.sh:*)
---

Run the local stack launcher and report what it found.

1. Run `scripts/stack.sh $ARGUMENTS` from the repo root (use `up` if no argument was given) in a **single** foreground Bash call with a 300000 ms timeout.
   - Do not spawn agents, background tasks, or one call per service — the script starts and supervises every process itself (pids and logs in `.logs/stack/`).
   - Do not build images (`--build`, `docker build`, `make docker-build`). If the script reports a missing image, tell the user and stop there.
2. Summarise the status table: which services are up, which are down, and the URLs (portal :5173, ops console :5174, gateway :8082/api, Keycloak :8080).
3. For any service that failed to listen, quote the log tail the script printed, give the likely cause, and suggest the fix. Do not edit code or `.env` files without asking.
