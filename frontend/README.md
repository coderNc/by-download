# Frontend

这是 BY-DOWNLOADER 的前端应用，基于 Next.js 16、React 19 与 TypeScript 构建，负责链接解析入口、下载队列展示、历史记录检索和设置管理。

## 主要能力

- 粘贴一个或多个链接并调用后端解析媒体信息
- 选择默认格式、批量下载策略、音频提取与字幕下载
- 实时展示下载进度、排队状态和任务详情
- 管理历史记录、Cookies、主题模式与语言切换
- 通过 WebSocket 接收后端推送的任务状态变化

## 目录说明

```text
frontend/
|-- src/app/              # 页面、布局与全局样式
|-- src/components/       # 复用组件与布局组件
|-- src/hooks/            # 业务 hooks，如任务流、主题、语言
|-- src/lib/              # API、常量、工具函数、类型依赖
|-- src/messages/         # 中英文文案
`-- src/stores/           # Zustand 状态管理
```

## 本地开发

建议使用 pnpm，与仓库中的 `pnpm-lock.yaml` 保持一致。

```bash
corepack enable pnpm
pnpm install
pnpm dev
```

启动后访问 `http://localhost:3000`。

## 可用命令

```bash
pnpm dev
pnpm build
pnpm start
pnpm lint
```

## 环境变量

前端会读取以下公开环境变量：

| 变量名 | 默认值 | 说明 |
| --- | --- | --- |
| `NEXT_PUBLIC_API_URL` | `http://localhost:8000/api` | 后端 API 地址 |
| `NEXT_PUBLIC_WS_URL` | `ws://localhost:8000/ws/progress` | WebSocket 任务流地址 |

如果你在仓库根目录维护统一配置，可以参考 `../.env.example`。

## 开发约定

- 页面入口放在 `src/app/`
- 通用请求统一收敛到 `src/lib/api.ts`
- 用户可见文案需要同时更新 `src/messages/en/` 和 `src/messages/zh-CN/`
- API / WebSocket 地址不要硬编码，统一走 `src/lib/constants.ts`
- 与下载任务相关的状态优先复用 `src/stores/task-store.ts`

## 相关页面

- `/`：首页，负责解析链接与创建下载任务
- `/downloads`：下载队列与任务操作
- `/downloads/[id]`：任务详情、日志与文件信息
- `/history`：历史记录查询
- `/settings`：下载设置、Cookies、工具状态、主题和语言

更多项目背景、后端说明和完整启动方式见仓库根目录 `readme.md`。
