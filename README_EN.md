# Ding Agent Hub

Enterprise AI Agent management platform for DingTalk — A turnkey solution built on [OpenClaw](https://github.com/nicepkg/openclaw) for managing users, departments, and per-user agent workspaces.

## Features

- **User Management**: CRUD, Excel batch import, batch enable/disable
- **Department Management**: Department CRUD with automatic AnythingLLM workspace creation
- **Agent Sync**: One-click sync to OpenClaw with automatic workspace creation/backup/restore
- **DingTalk Integration**: Manage bot allowlist, per-user agent isolation
- **AI Card Streaming**: Configure DingTalk AI Card for real-time streaming responses
- **Container Monitoring**: Real-time Docker container status
- **Audit Logging**: Complete sync operation logs

## Architecture

```
+-------------------+     +-------------------+     +-------------------+
|                   |     |                   |     |                   |
|   React Frontend  +---->+  Fastify Backend  +---->+  OpenClaw Bot     |
|   (Ant Design)    |     |  (SQLite)         |     |  (Docker)         |
|                   |     |                   |     |                   |
+-------------------+     +--------+----------+     +-------------------+
                                   |
                                   v
                          +-------------------+
                          |                   |
                          |   AnythingLLM     |
                          |   (Knowledge Base)|
                          |                   |
                          +-------------------+
```

**Tech Stack:**
- **Frontend**: React 19 + TypeScript + Vite + Ant Design
- **Backend**: Node.js + Fastify 5 + SQLite (better-sqlite3)
- **Deployment**: Docker + Docker Compose

## Quick Start

### Prerequisites

- Docker & Docker Compose
- A running OpenClaw bot container
- (Optional) AnythingLLM instance

### 1. Clone

```bash
git clone https://github.com/yourname/ding-agent-hub.git
cd ding-agent-hub
```

### 2. Configure

```bash
cp .env.example .env
# Edit .env with your credentials and container settings
```

### 3. Run

```bash
docker compose up -d --build
```

Visit `http://localhost:8088` and log in with the credentials from `.env`.

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `JWT_SECRET` | JWT signing secret | `change-me-to-a-random-string` |
| `ADMIN_USERNAME` | Admin username | `admin` |
| `ADMIN_PASSWORD` | Admin password | `admin123` |
| `DB_PATH` | SQLite database path | `/app/data/admin.db` |
| `DOCKER_SOCKET` | Docker socket path | `/var/run/docker.sock` |
| `OPENCLAW_CONTAINER` | OpenClaw bot container name | `bot-openclaw-1` |
| `OPENCLAW_CONFIG_PATH` | Config file path inside bot container | `/home/claworc/.openclaw/openclaw.json` |
| `OPENCLAW_WORKSPACES_PATH` | Workspaces path inside bot container | `/home/claworc/.openclaw/workspaces` |
| `ANYTHINGLLM_URL` | AnythingLLM URL | `http://anythingllm:3001` |
| `ANYTHINGLLM_API_KEY` | AnythingLLM API key | (empty) |
| `MONITOR_CONTAINERS` | Containers to monitor (comma-separated) | `bot-openclaw-1` |

## Workspace Templates

The `workspace-templates/` directory contains template files for new user workspaces. Customize them to match your organization's needs.

## Sync Mechanism

When a user's status changes, the admin panel automatically:

1. **Updates allowList** — modifies `channels.dingtalk.allowFrom` in OpenClaw config
2. **Syncs Agents** — creates agent bindings for active users, removes bindings for disabled users
3. **Manages Workspaces** — creates workspaces for new users, backs up on disable, restores on re-enable

## Security Notes

- Always change the default `JWT_SECRET` and `ADMIN_PASSWORD`
- Docker socket mount gives the container full access to the host's Docker daemon
- Deploy behind a reverse proxy with HTTPS in production

## License

[MIT](LICENSE)
