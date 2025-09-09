/*
  Warnings:

  - You are about to drop the column `test` on the `project` table. All the data in the column will be lost.

*/
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_project" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL,
    "script" BLOB
);
INSERT INTO "new_project" ("active", "id", "name", "script") SELECT "active", "id", "name", "script" FROM "project";
DROP TABLE "project";
ALTER TABLE "new_project" RENAME TO "project";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
