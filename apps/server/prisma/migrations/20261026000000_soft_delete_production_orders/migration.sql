ALTER TABLE "ProductionOrder" ADD COLUMN "deletedAt" DATETIME;
ALTER TABLE "Batch" ADD COLUMN "deletedAt" DATETIME;
ALTER TABLE "ProcessTask" ADD COLUMN "deletedAt" DATETIME;
ALTER TABLE "Transfer" ADD COLUMN "deletedAt" DATETIME;
ALTER TABLE "ScrapRecord" ADD COLUMN "deletedAt" DATETIME;

CREATE INDEX "ProductionOrder_deletedAt_idx" ON "ProductionOrder"("deletedAt");
CREATE INDEX "Batch_deletedAt_idx" ON "Batch"("deletedAt");
CREATE INDEX "ProcessTask_deletedAt_idx" ON "ProcessTask"("deletedAt");
CREATE INDEX "Transfer_deletedAt_idx" ON "Transfer"("deletedAt");
CREATE INDEX "ScrapRecord_deletedAt_idx" ON "ScrapRecord"("deletedAt");
