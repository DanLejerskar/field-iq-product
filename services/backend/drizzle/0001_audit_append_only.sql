-- Append-only audit_log enforcement.
-- DELETE is never permitted. UPDATE is permitted ONLY to set superseded_by once
-- (NULL -> value); every other column is immutable. Corrections therefore INSERT a new
-- row and then link the prior row via superseded_by.
CREATE OR REPLACE FUNCTION field_iq_audit_log_append_only()
RETURNS trigger AS $$
BEGIN
  IF (TG_OP = 'DELETE') THEN
    RAISE EXCEPTION 'audit_log is append-only; DELETE is not permitted';
  END IF;

  IF (OLD.superseded_by IS NOT NULL) THEN
    RAISE EXCEPTION 'audit_log row % is already superseded and immutable', OLD.id;
  END IF;

  IF (
    NEW.id, NEW.session_id, NEW.step_id, NEW.step_number, NEW.event_type, NEW.photo_url,
    NEW.photo_sha256, NEW.claude_request_id, NEW.claude_response, NEW.verified,
    NEW.confidence, NEW.message, NEW.detail, NEW.timestamp, NEW.latitude, NEW.longitude
  ) IS DISTINCT FROM (
    OLD.id, OLD.session_id, OLD.step_id, OLD.step_number, OLD.event_type, OLD.photo_url,
    OLD.photo_sha256, OLD.claude_request_id, OLD.claude_response, OLD.verified,
    OLD.confidence, OLD.message, OLD.detail, OLD.timestamp, OLD.latitude, OLD.longitude
  ) THEN
    RAISE EXCEPTION 'audit_log is append-only; only superseded_by may be set';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER audit_log_no_update_delete
BEFORE UPDATE OR DELETE ON audit_log
FOR EACH ROW EXECUTE FUNCTION field_iq_audit_log_append_only();
