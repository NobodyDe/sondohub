-- 1. Cria o tipo
CREATE TYPE "UserRole" AS ENUM ('MASTER', 'ADMIN', 'USER');

-- 2. Cria a coluna nova (todos começam como USER)
ALTER TABLE "users" ADD COLUMN "role" "UserRole" NOT NULL DEFAULT 'USER';

-- 3. Quem era admin do hub vira MASTER
UPDATE "users" SET "role" = 'MASTER' WHERE "is_admin" = true;

-- 4. Só agora apaga a coluna antiga
ALTER TABLE "users" DROP COLUMN "is_admin";