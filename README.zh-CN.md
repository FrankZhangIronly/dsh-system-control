# dsh-system-control

> [DeepSeek Harness (DSH)](https://github.com/deepseek-ai) Web 插件:在侧边栏底部新增一个 **「系统」** 菜单,提供 **重启** 与 **关闭** 控件。重启会循环启动器(`dsh web` 以退出码 `42` 退出,然后由 `DSH Web.ps1` 重新拉起);关闭会干净退出(`0`)。两者都通过 loopback RPC 通道完成,非本机访问会被自动拒绝。

插件为**双面 DSH 插件**:宿主(Node)侧持有 `/system` RPC 通道,复用宿主已有的 `appExit` 钩子;浏览器侧渲染侧边栏按钮与中央模态框。

---

## 功能特性

- **侧边栏触发器**,形态对齐官方设置按钮(宽栏全宽条 / 窄栏圆形两种形态)。
- **中央模态框**:左「重启服务」、右「关闭服务」并排两按钮。关闭操作需二次确认(4 秒未操作自动撤销)。
- **Loopback 权限**,从其他网络打到宿主端口的请求会被 DSH 自带的权限校验直接 `403`。
- **先 ack 后退出**:handler 先返回响应,再用 `80 ms` 定时器触发 `appExit()`,保证浏览器收到干净的 ack。
- **零修改 DSH 主干**,作为普通插件安装,`@deepseek-ai/dsh` 升级不影响。

---

## 安装

```sh
dsh plugin --profile web add dsh-system-control
```

重启 `dsh web`,侧边栏底部会出现 **系统** 按钮。

从本地 checkout 安装:

```sh
dsh plugin --profile web add /path/to/dsh-system-control
```

---

## 退出码协议

| 操作     | 退出码 | 启动器行为                                       |
| -------- | ------ | ------------------------------------------------ |
| Shutdown | `0`    | 启动器循环退出,关闭窗口。                       |
| Restart  | `42`   | 启动器循环重新拉起 `dsh web`。                   |
| Status   | n/a    | 探针端点,返回 `{ exitAvailable, exitType }`。    |

配套启动器 `DSH Web.ps1` 已实现这套协议:

- `0` → 关窗;
- `42` → 重启;
- 其他 → 写日志后退出。

如果用其他方式启动 DSH(systemd unit、裸跑 `dsh web` 等),请确保启动器认这两个码——否则会被当成硬崩溃。

---

## 工作原理

```
┌────────────────────┐  connection.rpc.call('/system', 'restart', {})   ┌──────────────────────────┐
│  侧边栏按钮         │ ───────────────────────────────────────────────▶ │  HostConnectionService   │
│  + 模态框(浏览器)   │                                                │  → loopback 权限校验      │
└────────────────────┘                                                │  → /system handler       │
                                                                      │  → ctx.get('appExit')(42)│
                                                                      └──────────────────────────┘
```

1. bundle patch 向宿主组合树插入一行 `system-control`,声明 `inject: [connection]`。`appExit` 由 cmdline 启动器在树挂载之前注册,这里通过 `connection` 启动的传递依赖被消费,无需在 `inject` 中显式列出。
2. 宿主半在通道 `/system` 上注册 RPC handler,权限为 `loopback`。任何非 loopback 调用被自动拒绝。
3. 浏览器半向 `sidebar.footer.action` slot 注册一条 order `20` 的渲染项,触发按钮 + 模态框。
4. `appExit(code)` 通过 `ctx.get('timer').timeout(..., 80)` 异步触发,确保 ack 先于进程退出刷回浏览器。

---

## RPC 协议(宿主侧)

通道:`/system` · 权限:`loopback`(非本机调用方自动 403)。

| 端点          | 返回                                                                                                |
| ------------- | --------------------------------------------------------------------------------------------------- |
| `status`      | `{ ok: true, value: { exitAvailable: <is function>, exitType: <typeof> } }`                         |
| `restart`     | `{ ok: true, value: { accepted: true, code: 42 } }`,约 80 ms 后 `appExit(42)`。                     |
| `shutdown`    | `{ ok: true, value: { accepted: true, code: 0 } }`,约 80 ms 后 `appExit(0)`。                      |
| 其他端点       | `{ ok: false, error: { code: 'internal', message: 'unknown endpoint …' } }`                        |

`status` 是模态框头部用来展示「退出通道:可用 / 不可用」的健康检查端点。

---

## 仓库结构

```
system-control/
├── cordis.patch.yml       # 宿主 bundle patch:插入 system-control 行
├── lib/
│   ├── index.js           # 宿主半(Node):/system RPC + appExit 桥接
│   └── client.js          # 浏览器半:侧边栏按钮 + 模态框
├── package.json
└── README.md / README.zh-CN.md
```

`cordis.patch.yml` 向宿主组合树插入一行,声明 `inject: [connection]`。`appExit` 由 cmdline 启动器在树挂载之前注入,因此插件只消费 `connection`。

---

## 兼容性

- `@deepseek-ai/dsh` 当前 web profile(消费 `connection`、`slots`、`timer`)。
- Node ≥ 18(与 DSH 宿主运行时一致)。
- 浏览器:Chromium 内核(标准 React + `KeyboardEvent` / `document` API)。

---

## 许可证

MIT