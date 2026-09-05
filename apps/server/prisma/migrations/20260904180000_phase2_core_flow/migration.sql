PRAGMA foreign_keys=OFF;

CREATE TABLE "User" (
  "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
  "username" TEXT NOT NULL,
  "passwordHash" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "role" TEXT NOT NULL DEFAULT 'USER',
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL
);
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");

CREATE TABLE "WorkshopLayout" (
  "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
  "name" TEXT NOT NULL,
  "imagePath" TEXT NOT NULL,
  "originalWidth" INTEGER,
  "originalHeight" INTEGER,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL
);

CREATE TABLE "Process" (
  "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "sort" INTEGER NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL
);
CREATE UNIQUE INDEX "Process_code_key" ON "Process"("code");
CREATE INDEX "Process_sort_idx" ON "Process"("sort");

CREATE TABLE "Workstation" (
  "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
  "layoutId" INTEGER NOT NULL,
  "processId" INTEGER,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "x" REAL NOT NULL,
  "y" REAL NOT NULL,
  "width" REAL,
  "height" REAL,
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "sort" INTEGER NOT NULL DEFAULT 0,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL,
  CONSTRAINT "Workstation_layoutId_fkey" FOREIGN KEY ("layoutId") REFERENCES "WorkshopLayout" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "Workstation_processId_fkey" FOREIGN KEY ("processId") REFERENCES "Process" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "Workstation_code_key" ON "Workstation"("code");
CREATE INDEX "Workstation_layoutId_idx" ON "Workstation"("layoutId");
CREATE INDEX "Workstation_processId_idx" ON "Workstation"("processId");

CREATE TABLE "ProductionOrder" (
  "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
  "orderNo" TEXT NOT NULL,
  "model" TEXT NOT NULL,
  "customer" TEXT NOT NULL,
  "quantity" INTEGER NOT NULL,
  "dueDate" DATETIME,
  "status" TEXT NOT NULL DEFAULT 'UNSCHEDULED',
  "remark" TEXT,
  "createdById" INTEGER NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL,
  CONSTRAINT "ProductionOrder_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "ProductionOrder_orderNo_key" ON "ProductionOrder"("orderNo");
CREATE INDEX "ProductionOrder_status_idx" ON "ProductionOrder"("status");
CREATE INDEX "ProductionOrder_model_idx" ON "ProductionOrder"("model");
CREATE INDEX "ProductionOrder_customer_idx" ON "ProductionOrder"("customer");
CREATE INDEX "ProductionOrder_dueDate_idx" ON "ProductionOrder"("dueDate");

CREATE TABLE "Batch" (
  "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
  "orderId" INTEGER NOT NULL,
  "startProcessId" INTEGER NOT NULL,
  "batchNo" TEXT NOT NULL,
  "quantity" INTEGER NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'UNSCHEDULED',
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL,
  CONSTRAINT "Batch_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "ProductionOrder" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "Batch_startProcessId_fkey" FOREIGN KEY ("startProcessId") REFERENCES "Process" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "Batch_orderId_batchNo_key" ON "Batch"("orderId", "batchNo");
CREATE INDEX "Batch_startProcessId_idx" ON "Batch"("startProcessId");
CREATE INDEX "Batch_status_idx" ON "Batch"("status");

CREATE TABLE "ProcessTask" (
  "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
  "batchId" INTEGER NOT NULL,
  "processId" INTEGER NOT NULL,
  "workstationId" INTEGER,
  "plannedQuantity" INTEGER NOT NULL,
  "completedQuantity" INTEGER NOT NULL DEFAULT 0,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "startedAt" DATETIME,
  "completedAt" DATETIME,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL,
  CONSTRAINT "ProcessTask_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "Batch" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ProcessTask_processId_fkey" FOREIGN KEY ("processId") REFERENCES "Process" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "ProcessTask_workstationId_fkey" FOREIGN KEY ("workstationId") REFERENCES "Workstation" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX "ProcessTask_batchId_processId_idx" ON "ProcessTask"("batchId", "processId");
CREATE INDEX "ProcessTask_workstationId_status_idx" ON "ProcessTask"("workstationId", "status");
CREATE INDEX "ProcessTask_status_idx" ON "ProcessTask"("status");

CREATE TABLE "Transfer" (
  "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
  "requestId" TEXT NOT NULL,
  "batchId" INTEGER NOT NULL,
  "fromTaskId" INTEGER NOT NULL,
  "toTaskId" INTEGER NOT NULL,
  "quantity" INTEGER NOT NULL,
  "operatorId" INTEGER NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Transfer_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "Batch" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "Transfer_fromTaskId_fkey" FOREIGN KEY ("fromTaskId") REFERENCES "ProcessTask" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "Transfer_toTaskId_fkey" FOREIGN KEY ("toTaskId") REFERENCES "ProcessTask" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "Transfer_operatorId_fkey" FOREIGN KEY ("operatorId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "Transfer_requestId_key" ON "Transfer"("requestId");
CREATE INDEX "Transfer_fromTaskId_idx" ON "Transfer"("fromTaskId");
CREATE INDEX "Transfer_toTaskId_idx" ON "Transfer"("toTaskId");
CREATE INDEX "Transfer_batchId_idx" ON "Transfer"("batchId");

CREATE TABLE "OperationLog" (
  "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
  "userId" INTEGER NOT NULL,
  "action" TEXT NOT NULL,
  "entityType" TEXT NOT NULL,
  "entityId" INTEGER,
  "payload" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "OperationLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "OperationLog_entityType_entityId_idx" ON "OperationLog"("entityType", "entityId");
CREATE INDEX "OperationLog_createdAt_idx" ON "OperationLog"("createdAt");

PRAGMA foreign_key_check;
PRAGMA foreign_keys=ON;
