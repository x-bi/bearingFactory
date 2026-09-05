# 轴承加工厂生产流转管理 H5

Mobile First 的轻量生产流转管理系统。Phase 2/3 功能闭环已完成，当前进入现场试用与质量收口阶段。

## 当前结构

```text
apps/web       Vue 3 + Vite + TypeScript + Vant + UnoCSS
apps/server    NestJS + Prisma + SQLite
packages/shared  前后端共享常量和类型
nginx          Web 静态资源和 /api 反向代理
```

## 环境要求

- Node.js 24
- pnpm 11.19+
- Docker Compose（仅容器部署需要）

## 本地启动

安装依赖：

```powershell
pnpm install
```

生成 Prisma Client、初始化数据库并写入基础数据：

```powershell
$env:DATABASE_URL = 'file:./dev.db'
pnpm --filter @bearing-factory/server prisma:generate
pnpm --filter @bearing-factory/server prisma:bootstrap
pnpm --filter @bearing-factory/server prisma:seed
```

启动前后端：

```powershell
$env:DATABASE_URL = 'file:./dev.db'
pnpm dev
```

- Web: `http://localhost:5173`
- Health API: `http://localhost:3000/api/health`

Web 开发服务器会把 `/api` 代理到 NestJS 的 `3000` 端口。

试运行账号：`admin / admin123`。

当前可操作链路：

```text
登录 -> 新建生产单 -> 分配/开始任务 -> 更新完成数量 -> 部分转序 -> 下一工序开始
```

车间地图支持查看工作位置详情、在制任务和待加工队列，并可从任务直达生产单继续现场操作。

## 验证

```powershell
pnpm typecheck
pnpm test
pnpm build
```

运行 SQLite 在线备份：

```powershell
pnpm db:backup
```

部署、备份和恢复步骤见 `docs/operations.md`。

## Docker Compose

从 `.env.example` 创建部署环境文件并设置随机 `JWT_SECRET`，然后执行：

```powershell
docker compose up --build -d
```

容器入口：`http://localhost:8080`。SQLite 数据持久化在宿主机 `data/` 目录。

## 产品与设计基线

- 开发规格：`bearing-factory-mvp-development-spec.md`
- 初版功能原型：`初版原型.png`
- 前端视觉方向：车间调度台风格，使用工程铭牌、状态信号和工序轨道作为核心视觉语言。
- 原 Figma 流程已停止使用，当前样式以项目内设计令牌和实际页面实现为准。

真实车间布局图尚未提供，地图阶段会先使用可替换占位布局，不把占位坐标作为最终验收结果。
