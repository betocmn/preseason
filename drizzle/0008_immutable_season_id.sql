CREATE OR REPLACE FUNCTION prevent_season_id_update()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.season_id IS DISTINCT FROM OLD.season_id THEN
    RAISE EXCEPTION 'season_id is immutable on %', TG_TABLE_NAME;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;--> statement-breakpoint
CREATE TRIGGER trg_immutable_season_id_run
  BEFORE UPDATE ON preseason_benchmark_run
  FOR EACH ROW
  EXECUTE FUNCTION prevent_season_id_update();--> statement-breakpoint
CREATE TRIGGER trg_immutable_season_id_case
  BEFORE UPDATE ON preseason_benchmark_case
  FOR EACH ROW
  EXECUTE FUNCTION prevent_season_id_update();--> statement-breakpoint
CREATE TRIGGER trg_immutable_season_id_case_result
  BEFORE UPDATE ON preseason_benchmark_case_result
  FOR EACH ROW
  EXECUTE FUNCTION prevent_season_id_update();
