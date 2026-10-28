-- AlterTable
ALTER TABLE "users" ALTER COLUMN "updated_at" SET DEFAULT CURRENT_TIMESTAMP;

-- A data da edição vem do relógio do banco, não do relógio da API.
CREATE FUNCTION set_users_updated_at() RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Só dispara quando o perfil muda. Login errado (failed_login_count) não conta como edição.
CREATE TRIGGER users_updated_at
BEFORE UPDATE OF name, avatar_url ON users
FOR EACH ROW EXECUTE FUNCTION set_users_updated_at();