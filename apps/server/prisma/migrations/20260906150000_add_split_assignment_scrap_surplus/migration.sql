ALTER TABLE "Process" ADD COLUMN "executionMode" TEXT NOT NULL DEFAULT 'AREA';
ALTER TABLE "Workstation" ADD COLUMN "terminalKind" TEXT;
ALTER TABLE "ProcessTask" ADD COLUMN "scrappedQuantity" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Transfer" ADD COLUMN "kind" TEXT NOT NULL DEFAULT 'NEXT_PROCESS';
ALTER TABLE "Transfer" ADD COLUMN "remark" TEXT;

UPDATE "Process"
SET "executionMode" = 'MACHINE'
WHERE "code" IN ('ROUGH_TURNING', 'FINISH_TURNING', 'BORING');

UPDATE "Process" SET "name" = '镗加工' WHERE "code" = 'BORING';
UPDATE "Workstation" SET "terminalKind" = 'SHIPPED' WHERE "code" = 'SHIPPING_AREA';

CREATE INDEX "Transfer_kind_createdAt_idx" ON "Transfer"("kind", "createdAt");

CREATE TABLE "ScrapRecord" (
  "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
  "requestId" TEXT NOT NULL,
  "batchId" INTEGER NOT NULL,
  "taskId" INTEGER NOT NULL,
  "processId" INTEGER NOT NULL,
  "workstationId" INTEGER,
  "quantity" INTEGER NOT NULL,
  "reason" TEXT NOT NULL,
  "remark" TEXT,
  "operatorId" INTEGER NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ScrapRecord_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "Batch" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ScrapRecord_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "ProcessTask" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "ScrapRecord_processId_fkey" FOREIGN KEY ("processId") REFERENCES "Process" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "ScrapRecord_workstationId_fkey" FOREIGN KEY ("workstationId") REFERENCES "Workstation" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "ScrapRecord_operatorId_fkey" FOREIGN KEY ("operatorId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "ScrapRecord_requestId_key" ON "ScrapRecord"("requestId");
CREATE INDEX "ScrapRecord_batchId_createdAt_idx" ON "ScrapRecord"("batchId", "createdAt");
CREATE INDEX "ScrapRecord_taskId_idx" ON "ScrapRecord"("taskId");
CREATE INDEX "ScrapRecord_processId_idx" ON "ScrapRecord"("processId");
CREATE INDEX "ScrapRecord_workstationId_idx" ON "ScrapRecord"("workstationId");
