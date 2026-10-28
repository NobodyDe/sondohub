-- 1. Cria a coluna com '' para os apps que já existem
ALTER TABLE "applications" ADD COLUMN "description" VARCHAR(144) NOT NULL DEFAULT '';

-- 2. Tira o default: daqui em diante quem grava precisa mandar a descrição
ALTER TABLE "applications" ALTER COLUMN "description" DROP DEFAULT;