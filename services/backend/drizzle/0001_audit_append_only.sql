-- Enforce append-only semantics on audit_log: reject UPDATE and DELETE at the DB level.
-- Corrections must INSERT a new row and set superseded_by on the prior row.
CREATE OR REPLACE FUNCTION field_iq_audit_log_append_only()
RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'audit_log is append-only; % is not permitted', TG_OP;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER audit_log_no_update_delete
BEFORE UPDATE OR DELETE ON audit_log
FOR EACH ROW EXECUTE FUNCTION field_iq_audit_log_append_only();
