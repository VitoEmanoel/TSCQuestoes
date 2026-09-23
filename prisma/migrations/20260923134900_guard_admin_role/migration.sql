CREATE OR REPLACE FUNCTION guard_admin_role() RETURNS trigger AS $$
BEGIN
  IF NEW."role" = 'ADMIN'
     AND (TG_OP = 'INSERT' OR OLD."role" IS DISTINCT FROM 'ADMIN')
     AND coalesce(current_setting('app.allow_admin', true), '') <> 'on' THEN
    RAISE EXCEPTION 'Criar ou promover ADMIN só é permitido pelo seed'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER user_guard_admin_role
BEFORE INSERT OR UPDATE OF "role" ON "User"
FOR EACH ROW EXECUTE FUNCTION guard_admin_role();
