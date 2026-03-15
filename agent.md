# BY-DOWNLOADER Agent Guide

本文件面向在该仓库内工作的开发者与 AI agent，目的是让修改尽量贴合现有结构，而不是重新发明一套实现方式。

## 项目定位

- 这是一个本地 / 自托管的 YouTube 与 Bilibili 下载管理器
- 前端负责解析链接、展示任务、管理历史与设置
- 后端负责下载调度、状态持久化、WebSocket 推送和工具集成

## 仓库结构

### 前端：`frontend/`

- 框架：Next.js 16 App Router + React 19 + TypeScript
- UI 与页面主要位于 `frontend/src/app/`、`frontend/src/components/`
- 国际化文案位于 `frontend/src/messages/en/` 与 `frontend/src/messages/zh-CN/`
- API 封装位于 `frontend/src/lib/api.ts`
- 类型定义位于 `frontend/src/lib/types.ts`
- 状态管理使用 Zustand，位于 `frontend/src/stores/`
- WebSocket 任务流逻辑位于 `frontend/src/hooks/use-task-stream.ts`

### 后端：`backend/`

- 框架：FastAPI
- 路由位于 `backend/app/api/`
- 核心下载逻辑位于 `backend/app/core/`
- 数据库模型位于 `backend/app/db/models.py`
- 数据库初始化位于 `backend/app/db/database.py`
- 请求 / 响应 schema 位于 `backend/app/schemas/`
- 应用入口为 `backend/app/main.py`

## 关键行为约定

### 前端改动时

- 新页面优先放在 `frontend/src/app/`
- 新复用组件优先放在 `frontend/src/components/`
- 所有用户可见文案应同时更新中英文消息文件
- 请求后端时优先复用 `frontend/src/lib/api.ts` 中的统一调用方式
- 访问 API / WebSocket 地址时不要硬编码，统一使用 `frontend/src/lib/constants.ts`
- 与任务状态相关的前端状态优先复用 `task-store`

### 后端改动时

- 新 API 路由优先落在 `backend/app/api/`，并在 `backend/app/main.py` 注册
- 与下载行为有关的逻辑优先收敛到 `backend/app/core/download_manager.py` 或 `backend/app/core/ytdlp_wrapper.py`
- 持久化字段变更通常需要同步修改 `backend/app/db/models.py` 与相关 schema
- 配置项优先走 `backend/app/core/config.py`，环境变量前缀保持 `BY_DL_`
- 面向前端的字段变更要同步检查 `frontend/src/lib/types.ts`

## 常用命令

### 根目录

```bash
docker compose up --build
```

### 后端

在 `backend/` 目录：

```bash
pip install -r requirements.txt
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

### 前端

在 `frontend/` 目录：

```bash
corepack enable pnpm
pnpm install
pnpm dev
pnpm lint
pnpm build
```

## 运行时默认值

- 前端默认地址：`http://localhost:3000`
- 后端默认地址：`http://localhost:8000`
- API 前缀：`/api`
- WebSocket 地址：`/ws/progress`
- 前端默认 API 地址由 `NEXT_PUBLIC_API_URL` 控制
- 后端默认并发由 `BY_DL_MAX_CONCURRENT_DOWNLOADS` 控制

## 数据流速记

1. 首页调用 `/api/parse` 获取视频与格式信息
2. 前端调用 `/api/download/batch` 创建任务
3. `DownloadManager` 入队并调度下载
4. `connection_manager` 通过 WebSocket 广播进度与状态
5. 前端 store 更新任务列表，并在完成时触发浏览器下载

## 修改时的注意点

- 任务状态枚举要保持前后端一致：`queued`、`downloading`、`processing`、`merging`、`completed`、`failed`、`paused`、`cancelled`
- 如果新增平台支持，至少同时检查 URL 识别、解析结果、文案展示和 Cookies 文件命名
- 如果新增设置项，通常需要同时修改配置、数据库设置、后端 schema、前端类型和设置页表单
- 如果新增用户可见页面或组件，请保持中英文文案同步
- 如果改动下载完成行为，请注意前端存在“自动触发浏览器下载”的逻辑

## 推荐工作方式

- 小改动：先查相邻模块的既有写法，再做最小修改
- 多文件改动：先梳理受影响链路，避免只改接口不改类型
- 文案改动：优先检查 `frontend/src/messages/zh-CN/` 和 `frontend/src/messages/en/`
- 下载逻辑排查：优先看 `backend/app/core/download_manager.py`、`backend/app/core/ytdlp_wrapper.py`、`backend/app/api/websocket.py`

## 当前仓库缺口

- 根目录尚未提供统一测试命令
- 暂未看到 CI 配置
- 前端自带 README 仍是 Next.js 默认模板，如需清理可后续处理
