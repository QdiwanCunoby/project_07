-- CreateEnum
CREATE TYPE "customer_status" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateEnum
CREATE TYPE "account_type" AS ENUM ('CHECKING', 'SAVINGS', 'BUSINESS');

-- CreateEnum
CREATE TYPE "account_status" AS ENUM ('ACTIVE', 'BLOCKED', 'CLOSED');

-- CreateEnum
CREATE TYPE "transfer_status" AS ENUM ('PENDING', 'COMPLETED', 'FAILED');

-- CreateTable
CREATE TABLE "customers" (
    "id" UUID NOT NULL,
    "fiscal_code" VARCHAR(16) NOT NULL,
    "first_name" VARCHAR(100) NOT NULL,
    "last_name" VARCHAR(100) NOT NULL,
    "email" TEXT NOT NULL,
    "phone" VARCHAR(25) NOT NULL,
    "status" "customer_status" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "customers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "accounts" (
    "id" UUID NOT NULL,
    "iban" VARCHAR(27) NOT NULL,
    "balance" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "type" "account_type" NOT NULL,
    "status" "account_status" NOT NULL DEFAULT 'ACTIVE',
    "owner_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "transfers" (
    "id" UUID NOT NULL,
    "from_account_id" UUID NOT NULL,
    "to_account_id" UUID NOT NULL,
    "amount" DECIMAL(15,2) NOT NULL,
    "description" VARCHAR(140),
    "status" "transfer_status" NOT NULL DEFAULT 'PENDING',
    "executed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "transfers_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "customers_fiscal_code_key" ON "customers"("fiscal_code");

-- CreateIndex
CREATE UNIQUE INDEX "customers_email_key" ON "customers"("email");

-- CreateIndex
CREATE UNIQUE INDEX "accounts_iban_key" ON "accounts"("iban");

-- CreateIndex
CREATE INDEX "accounts_owner_id_status_idx" ON "accounts"("owner_id", "status");

-- CreateIndex
CREATE INDEX "transfers_from_account_id_idx" ON "transfers"("from_account_id");

-- CreateIndex
CREATE INDEX "transfers_to_account_id_idx" ON "transfers"("to_account_id");

-- AddForeignKey
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transfers" ADD CONSTRAINT "transfers_from_account_id_fkey" FOREIGN KEY ("from_account_id") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transfers" ADD CONSTRAINT "transfers_to_account_id_fkey" FOREIGN KEY ("to_account_id") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
