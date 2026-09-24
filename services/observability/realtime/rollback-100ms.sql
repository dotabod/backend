BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '15s';

DO $trial$
DECLARE
  previous_interval jsonb;
BEGIN
  SELECT settings->'poll_interval_ms' INTO STRICT previous_interval
  FROM _realtime.extensions
  WHERE tenant_external_id = 'realtime-dev' AND type = 'postgres_cdc_rls'
  FOR UPDATE;

  IF previous_interval IS DISTINCT FROM '100'::jsonb
     AND previous_interval IS DISTINCT FROM '250'::jsonb THEN
    RAISE EXCEPTION 'Unexpected polling interval; inspect the tenant before rolling back this trial';
  END IF;

  UPDATE _realtime.extensions
  SET settings = jsonb_set(settings, '{poll_interval_ms}', '100'::jsonb, false),
      updated_at = now()
  WHERE tenant_external_id = 'realtime-dev' AND type = 'postgres_cdc_rls'
    AND settings->'poll_interval_ms' = '250'::jsonb;
END
$trial$;

COMMIT;
