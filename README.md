# OpenClaw Admin Panel

OpenClaw 用户管理面板 — 为 [OpenClaw](https://github.com/nicepkg/openclaw) AI Agent 平台提供可视化的用户管理、部门管理和工作空间同步功能。

## 功能特性

- **用户管理**: 增删改查、批量导入(Excel)、批量启用/停用
- **部门管理**: 部门 CRUD，自动创建 AnythingLLM 工作空间
- **Agent 同步**: 一键同步用户到 OpenClaw，自动创建/备份/恢复工作空间
- **DingTalk 集成**: 管理钉钉机器人 allowlist，per-user Agent 隔离
- **AI 卡片流式输出**: 配置钉钉 AI Card 实时流式回复
- **容器监控**: 实时查看 Docker 容器运行状态
- **同步日志**: 完整的操作审计日志

## 架构

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

**技术栈:**
- **前端**: React 19 + TypeScript + Vite + Ant Design
- **后端**: Node.js + Fastify 5 + SQLite (better-sqlite3)
- **部署**: Docker + Docker Compose

## 快速开始

### 前置条件

- Docker & Docker Compose
- 运行中的 OpenClaw bot 容器
- (可选) AnythingLLM 实例

### 1. 克隆项目

```bash
git clone https://github.com/yourname/openclaw-admin.git
cd openclaw-admin
```

### 2. 配置环境变量

```bash
cp .env.example .env
# 编辑 .env，修改密码和容器配置
```

### 3. 启动

```bash
docker compose up -d --build
```

访问 `http://localhost:8088`，使用 `.env` 中配置的账号密码登录。

## 环境变量

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `JWT_SECRET` | JWT 签名密钥 | `change-me-to-a-random-string` |
| `ADMIN_USERNAME` | 管理员用户名 | `admin` |
| `ADMIN_PASSWORD` | 管理员密码 | `admin123` |
| `DB_PATH` | SQLite 数据库路径 | `/app/data/admin.db` |
| `DOCKER_SOCKET` | Docker socket 路径 | `/var/run/docker.sock` |
| `OPENCLAW_CONTAINER` | OpenClaw bot 容器名 | `bot-openclaw-1` |
| `OPENCLAW_CONFIG_PATH` | bot 容器内配置文件路径 | `/home/claworc/.openclaw/openclaw.json` |
| `OPENCLAW_WORKSPACES_PATH` | bot 容器内工作空间路径 | `/home/claworc/.openclaw/workspaces` |
| `ANYTHINGLLM_URL` | AnythingLLM 地址 | `http://anythingllm:3001` |
| `ANYTHINGLLM_API_KEY` | AnythingLLM API Key | (空) |
| `MONITOR_CONTAINERS` | 监控的容器名(逗号分隔) | `bot-openclaw-1` |

## 工作空间模板

`workspace-templates/` 目录包含新用户工作空间的模板文件：

| 文件 | 用途 |
|------|------|
| `AGENTS.md` | Agent 角色和协作机制 |
| `BOOTSTRAP.md` | 系统初始化工作流 |
| `HEARTBEAT.md` | 监控和告警配置 |
| `IDENTITY.md` | Agent 身份定义 |
| `SOUL.md` | 核心原则和风格 |
| `TOOLS.md` | 工具栈和集成 |
| `USER.md` | 用户上下文信息 |

可自定义这些模板以匹配你的组织需求。在 `openclaw-sync.js` 中修改 `mkdirScript` 内的模板内容。

## API 接口

| 方法 | 路径 | 说明 |
|------|------|------|
| `POST` | `/api/auth/login` | 登录 |
| `GET` | `/api/users` | 用户列表(支持分页、搜索、部门筛选) |
| `POST` | `/api/users` | 创建用户 |
| `PUT` | `/api/users/:id` | 更新用户 |
| `DELETE` | `/api/users/:id` | 删除用户 |
| `POST` | `/api/users/import` | Excel 批量导入 |
| `POST` | `/api/users/batch-update` | 批量启用/停用 |
| `POST` | `/api/users/sync` | 全量同步到 OpenClaw |
| `GET` | `/api/departments` | 部门列表 |
| `GET` | `/api/status` | 仪表盘状态 |
| `GET` | `/api/sync-logs` | 同步日志 |

## 同步机制

当用户状态变更时，Admin Panel 会自动：

1. **更新 allowList** — 修改 OpenClaw 配置中的 `channels.dingtalk.allowFrom`
2. **同步 Agent** — 为活跃用户创建 agent binding，移除停用用户的 binding
3. **管理工作空间** — 新用户创建工作空间，停用用户备份工作空间，重新启用时恢复

```
启用用户 → 创建 Agent + Binding → 创建/恢复工作空间 → 加入 allowList
停用用户 → 移除 Agent + Binding → 备份工作空间 → 移出 allowList
```

## 安全注意事项

- 务必修改默认的 `JWT_SECRET` 和 `ADMIN_PASSWORD`
- Docker socket 挂载赋予了容器对宿主机 Docker 的完全访问权限
- 建议在内网环境部署，或配置反向代理 + HTTPS

## License

[MIT](LICENSE)
