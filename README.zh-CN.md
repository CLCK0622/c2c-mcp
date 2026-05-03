<div align="center">

# c2c

**让你的 Claude Code 实例互相对话。**

c2c 是一个 [MCP](https://modelcontextprotocol.io/) 服务器，通过局域网连接多个 Claude Code 会话。
当一个 Agent 修改了 API，另一个 Agent 立刻知道。当一个 Agent 有问题，它可以直接问。

无需云服务。无需配置中心。只有 mDNS 发现和局域网 WebSocket。

[快速开始](#快速开始) | [工具列表](#工具列表) | [工作原理](#工作原理) | [English](./README.md)

</div>

---

## 快速开始

```bash
npx c2c-mcp init
```

就这一行。在每个使用 Claude Code 的项目目录下运行，两个实例会自动发现对方。

---

## 配对流程

当两个 c2c 节点在网络上发现彼此后，你会看到配对提示：

```
设备 "backend-bob" 想要与你的 Claude 实例配对。
如果同意，对方将能够读取你当前的任务计划、查看你近期的文件改动，
并与你交换消息。请只同意你认识且信任的设备。
```

确认配对后，两个 Agent 就连接上了。已信任的设备会被记住，下次自动连接。

---

## 你的 Agent 能做什么

### 共享意图

每个 Agent 会广播自己正在做什么。在前端 Agent 修改一个 fetch 请求之前，它可以先看看后端 Agent 是不是正在改那个接口。

### 查看文件变化

文件改动被实时追踪。当后端 Agent 重构了一个路由，前端 Agent 能直接看到 diff，不需要从 git 拉取。

### 发送消息

Agent 之间可以异步提问：

> "你在改 /users 的响应结构吗？我这边正准备更新 TypeScript 的 interface。"

另一个 Agent 会在下一轮对话中看到消息并回复。

---

## 工具列表

c2c 激活后，Claude Code 会获得以下工具：

| 工具 | 功能 |
|------|------|
| `set_plan` | 向所有连接的 peer 广播你当前的任务 |
| `ask_peer` | 向另一个 Agent 发送消息 |
| `check_messages` | 读取收到的消息 |
| `sync_with_peer` | 拉取 peer 的当前计划和近期文件改动 |
| `list_peers` | 查看谁在线 |
| `approve_peer` | 接受配对请求 |
| `reject_peer` | 拒绝配对请求 |
| `list_trusted` | 查看所有已信任的 peer |
| `untrust_peer` | 撤销信任并断开连接 |

---

## 配置方式

### 一行命令（推荐）

```bash
npx c2c-mcp init
```

自动检测项目目录、选择可用端口、注册 MCP 服务器到 Claude Code。每个项目只需运行一次。

### 手动配置

如果需要更多控制：

```bash
claude mcp add c2c -s project -- npx c2c-mcp serve \
  --project /path/to/your/project \
  --name "frontend-alice" \
  --port 9100
```

| 参数 | 说明 | 默认值 |
|------|------|--------|
| `--project` | 监听文件变化的项目目录 | 当前目录 |
| `--name` | 当前节点的可读名称 | 目录名 |
| `--port` | WebSocket 端口 | 9100 |
| `--ignore` | 额外的忽略模式（可重复使用） | -- |

### 移除

```bash
npx c2c-mcp remove
```

### 协作 Skill（可选）

将 `skill/c2c-protocol.md` 复制到你的 Claude Code skills 目录。这会教 Claude 在每轮对话开始时自动检查消息、在开始工作前声明计划、在修改共享 API 前先同步对端状态。

---

## 工作原理

```
机器 A                                 机器 B
┌──────────────┐                       ┌──────────────┐
│  Claude Code │                       │  Claude Code │
│      ▲       │                       │      ▲       │
│      │ stdio │                       │      │ stdio │
│      ▼       │                       │      ▼       │
│  ┌────────┐  │    mDNS 自动发现      │  ┌────────┐  │
│  │  c2c   │◄─┼───────────────────────┼─►│  c2c   │  │
│  │ server │  │    WebSocket 连接     │  │ server │  │
│  └────────┘  │                       │  └────────┘  │
└──────────────┘                       └──────────────┘
```

1. 每个 c2c 服务器通过 **mDNS** 广播自身（`_c2c._tcp.local`）
2. 发现 peer 后，建立 **WebSocket** 连接
3. 首次连接的 peer 需要通过**配对审批**
4. 已审批的 peer 保存到 `~/.c2c/trusted_peers.json`，下次自动重连
5. 状态按需拉取，不做持续同步

支持同一局域网内的不同机器，也支持同一台机器上的两个终端（使用不同端口即可）。

---

## 安全机制

- **首次连接审批**：新 peer 必须经过用户明确确认
- **信任持久化**：已审批的 peer 会被记住，随时可通过 `untrust_peer` 撤销
- **仅限局域网**：mDNS 发现范围限于本地网络
- **无云端中继**：所有流量都在你的网络内

---

## 开发

```bash
git clone https://github.com/CLCK0622/c2c-mcp.git
cd c2c-mcp
pnpm install
pnpm build
pnpm test
```

---

## 许可证

MIT
