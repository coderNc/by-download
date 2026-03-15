# BY-DOWNLOADER

一个基于 `yt-dlp` 的本地 / 自托管视频下载管理器，当前面向 YouTube 与 Bilibili 场景。项目采用前后端分离架构：前端负责链接解析、任务展示与设置管理，后端负责下载调度、状态持久化和 WebSocket 进度推送。

## 功能概览

- 批量粘贴链接并解析视频 / 合集信息
- 支持视频下载、音频提取、字幕下载
- 支持任务排队、暂停、继续、重试、删除
- 自动记录下载历史，并提供筛选与分页
- 支持通过 WebSocket 实时同步下载进度
- 支持导入站点 Cookies、更新 `yt-dlp`、调整并发与下载目录
- 内置中英文界面、主题切换与浏览器通知

## 技术栈

### 前端

- Next.js 16 + React 19 + TypeScript
- Tailwind CSS 4
- `next-intl` 用于国际化
- Zustand 用于本地状态管理
- `ky` 用于 HTTP 请求

### 后端

- FastAPI
- SQLAlchemy + SQLite
- `yt-dlp`
- WebSocket 实时推送

## 目录结构

```text
.
|-- backend/                # FastAPI 下载服务
|   |-- app/
|   |   |-- api/            # 路由层
|   |   |-- core/           # 下载管理、配置、yt-dlp 封装
|   |   |-- db/             # 数据库初始化与模型
|   |   `-- schemas/        # Pydantic schema
|   `-- requirements.txt
|-- frontend/               # Next.js Web 界面
|   |-- src/app/            # 页面与布局
|   |-- src/components/     # 组件
|   |-- src/hooks/          # 业务 hooks
|   |-- src/lib/            # API、常量、工具函数
|   |-- src/messages/       # 国际化文案
|   `-- src/stores/         # Zustand store
|-- docker-compose.yml      # 一键启动前后端
|-- pyrightconfig.json      # Python 类型检查配置
|-- readme.md
`-- agent.md
```

## 页面说明

- `/`：粘贴链接、解析资源、选择格式并创建下载任务
- `/downloads`：查看当前下载队列、操作任务状态
- `/downloads/[id]`：查看任务详情、日志、文件路径和错误信息
- `/history`：查看历史下载记录，支持检索、筛选、分页
- `/settings`：管理默认格式、并发、代理、Cookies、主题与语言

## 快速开始

### 方式一：使用 Docker Compose（推荐）

在仓库根目录执行：

```bash
docker compose up --build
```

启动后默认访问：

- 前端：`http://localhost:3000`
- 后端 API：`http://localhost:8000/api`
- WebSocket：`ws://localhost:8000/ws/progress`

说明：

- 前端容器名称：`by-downloader-web`
- 后端容器名称：`by-downloader-api`
- 下载文件默认写入 Docker volume `downloads_data`

### 方式二：本地开发

#### 1. 启动后端

在 `backend/` 目录执行：

```bash
python -m venv ../.venv
source ../.venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

后端默认会：

- 自动创建下载目录、Cookies 目录和日志目录
- 自动初始化 SQLite 数据库
- 启动下载调度器并恢复中断任务

#### 2. 启动前端

在 `frontend/` 目录执行：

```bash
corepack enable pnpm
pnpm install
pnpm dev
```

默认开发地址为 `http://localhost:3000`。

## 环境变量

### 后端

后端配置使用 `BY_DL_` 前缀环境变量覆盖默认值。

| 变量名 | 默认值 | 说明 |
| --- | --- | --- |
| `BY_DL_DOWNLOAD_DIR` | `backend/downloads` | 下载文件保存目录 |
| `BY_DL_DATABASE_URL` | `sqlite+aiosqlite:///./data/by_downloader.db` | 数据库连接字符串 |
| `BY_DL_MAX_CONCURRENT_DOWNLOADS` | `3` | 最大并发下载数 |
| `BY_DL_DEFAULT_FORMAT` | `mp4` | 默认格式 |
| `BY_DL_DEFAULT_QUALITY` | `best` | 默认质量策略 |
| `BY_DL_RATE_LIMIT` | `0` | 限速，单位 KB/s，`0` 表示不限速 |
| `BY_DL_PROXY` | 空 | 下载代理 |
| `BY_DL_AUTO_DELETE_DAYS` | `7` | 自动清理天数 |
| `BY_DL_LOG_LEVEL` | `INFO` | 日志级别 |
| `BY_DL_PORT` | `8000` | 后端监听端口 |

### 前端

| 变量名 | 默认值 | 说明 |
| --- | --- | --- |
| `NEXT_PUBLIC_API_URL` | `http://localhost:8000/api` | API 基础地址 |
| `NEXT_PUBLIC_WS_URL` | `ws://localhost:8000/ws/progress` | 任务流 WebSocket 地址 |

## 开发命令

### 前端

```bash
pnpm dev
pnpm build
pnpm start
pnpm lint
```

### 后端

```bash
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

## 数据与持久化

- 任务信息保存在 SQLite 数据库表 `tasks`
- 下载设置保存在 SQLite 数据库表 `settings`
- 下载日志会附加写入任务的 `log_text`
- 下载完成后的文件路径和字幕路径会写入任务记录
- 已下载历史支持按关键字、平台、状态筛选

## 已实现的核心流程

1. 用户在首页粘贴一个或多个链接
2. 前端调用 `/api/parse` 解析视频信息与可选格式
3. 前端调用 `/api/download/batch` 创建下载任务
4. 后端通过 `DownloadManager` 调度 `yt-dlp` 执行下载
5. 前端通过 WebSocket 接收进度、状态和队列变化
6. 下载完成后可在详情页或列表页直接下载文件

## 适合扩展的方向

- 增加更多站点的识别与适配
- 补充任务统计面板或仪表盘
- 引入更完整的测试与 CI 流程
- 为 Cookies 管理增加导入校验与到期提示

## 注意事项

- 音频提取依赖 `ffmpeg`，Docker 镜像已内置安装
- 站点受限内容可能需要在设置页导入 Cookies
- 前端默认会在下载完成后触发浏览器下载并发送通知
- 项目当前根目录没有统一测试脚本，主要依赖前端 `lint` 与手动联调
