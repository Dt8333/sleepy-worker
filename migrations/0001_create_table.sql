-- CreateTable
CREATE TABLE "main" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT DEFAULT 0,
    "status" INTEGER NOT NULL DEFAULT 0,
    "private_mode" BOOLEAN NOT NULL DEFAULT false,
    "last_updated" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "device_status" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "show_name" TEXT NOT NULL,
    "using" BOOLEAN,
    "status" TEXT,
    "fields" JSONB NOT NULL,
    "last_updated" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "metrics_meta" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT DEFAULT 0,
    "today" TEXT NOT NULL DEFAULT '',
    "week" TEXT NOT NULL DEFAULT '',
    "month" TEXT NOT NULL DEFAULT '',
    "year" TEXT NOT NULL DEFAULT ''
);

-- CreateTable
CREATE TABLE "metrics" (
    "path" TEXT NOT NULL PRIMARY KEY,
    "daily" INTEGER NOT NULL DEFAULT 0,
    "weekly" INTEGER NOT NULL DEFAULT 0,
    "monthly" INTEGER NOT NULL DEFAULT 0,
    "yearly" INTEGER NOT NULL DEFAULT 0,
    "total" INTEGER NOT NULL DEFAULT 0
);

-- CreateTable
CREATE TABLE "plugins" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "data" JSONB NOT NULL
);
