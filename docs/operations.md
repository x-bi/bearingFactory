# 部署、备份与恢复

## Docker 部署

1. 将 `.env.example` 复制为 `.env`。
2. 将 `JWT_SECRET` 改为足够长的随机字符串。
3. 执行 `docker compose up --build -d`。
4. 执行 `docker compose ps`，确认 `server` 和 `nginx` 均为 healthy。
5. 访问 `http://服务器地址:8080/api/health` 验证反向代理。

生产数据库位于宿主机 `data/production.db`。不要将 `data/` 放在临时目录。

## SQLite 备份

备份使用 SQLite Online Backup API，可以在服务运行期间生成一致性快照。

本地数据库：

```powershell
pnpm db:backup
```

Docker 生产数据库：

```powershell
$env:DATABASE_URL = 'file:D:/bearingFactory/data/production.db'
pnpm db:backup -- D:/bearingFactory/backups
```

建议每天至少备份一次，并将备份复制到与服务器不同的存储位置。定期抽查备份文件能否打开且包含 `User`、`ProductionOrder`、`ProcessTask`、`Transfer` 表。

## 恢复

恢复会覆盖当前生产数据，应在停服并确认目标路径后执行：

1. 执行 `docker compose stop server`。
2. 将当前 `data/production.db` 重命名保留，不要直接删除。
3. 将选定备份复制为 `data/production.db`。
4. 执行 `docker compose start server`。
5. 等待 server healthy，然后验证登录、生产单数量和最近一条转序记录。

若恢复后校验失败，停止 server，将步骤 2 保留的原数据库改回原名。
