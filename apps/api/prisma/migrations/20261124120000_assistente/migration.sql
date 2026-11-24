-- CreateTable
CREATE TABLE "assistente_config" (
    "id" SMALLINT NOT NULL DEFAULT 1,
    "api_key_enc" TEXT,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_by" UUID,

    CONSTRAINT "assistente_config_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assistente_chaves_usuario" (
    "user_id" UUID NOT NULL,
    "api_key_enc" TEXT NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "assistente_chaves_usuario_pkey" PRIMARY KEY ("user_id")
);

-- CreateTable
CREATE TABLE "assistente_usuario" (
    "user_id" UUID NOT NULL,
    "habilitado" BOOLEAN NOT NULL DEFAULT false,
    "voz" TEXT NOT NULL DEFAULT 'Charon',
    "internet" BOOLEAN NOT NULL DEFAULT false,
    "nome" TEXT NOT NULL DEFAULT '',
    "apelido" TEXT NOT NULL DEFAULT '',
    "modo_mic" TEXT NOT NULL DEFAULT 'aberto',
    "chat_texto" BOOLEAN NOT NULL DEFAULT true,
    "preferencia" TEXT NOT NULL DEFAULT 'voz',
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "assistente_usuario_pkey" PRIMARY KEY ("user_id")
);

-- CreateTable
CREATE TABLE "assistente_permissoes" (
    "user_id" UUID NOT NULL,
    "autorizado" BOOLEAN NOT NULL DEFAULT false,
    "updated_by" UUID,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "assistente_permissoes_pkey" PRIMARY KEY ("user_id")
);

-- CreateTable
CREATE TABLE "assistente_regras" (
    "id" UUID NOT NULL,
    "user_id" UUID,
    "nome" TEXT NOT NULL,
    "texto" TEXT NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "bloqueia" JSONB NOT NULL DEFAULT '[]',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_by" UUID,

    CONSTRAINT "assistente_regras_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assistente_memorias" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "texto" TEXT NOT NULL,
    "origem" TEXT NOT NULL DEFAULT 'usuario',
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "assistente_memorias_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assistente_perguntas" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "texto" TEXT NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "assistente_perguntas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assistente_auditoria" (
    "id" BIGSERIAL NOT NULL,
    "user_id" UUID NOT NULL,
    "ferramenta" TEXT NOT NULL,
    "argumentos" TEXT,
    "resultado" TEXT,
    "bloqueada" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "assistente_auditoria_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "assistente_regras_user_id_idx" ON "assistente_regras"("user_id");

-- CreateIndex
CREATE INDEX "assistente_memorias_user_id_created_at_idx" ON "assistente_memorias"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "assistente_perguntas_user_id_idx" ON "assistente_perguntas"("user_id");

-- CreateIndex
CREATE INDEX "assistente_auditoria_created_at_idx" ON "assistente_auditoria"("created_at" DESC);

-- AddForeignKey
ALTER TABLE "assistente_chaves_usuario" ADD CONSTRAINT "assistente_chaves_usuario_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assistente_usuario" ADD CONSTRAINT "assistente_usuario_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assistente_permissoes" ADD CONSTRAINT "assistente_permissoes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assistente_regras" ADD CONSTRAINT "assistente_regras_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assistente_memorias" ADD CONSTRAINT "assistente_memorias_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assistente_perguntas" ADD CONSTRAINT "assistente_perguntas_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assistente_auditoria" ADD CONSTRAINT "assistente_auditoria_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

