ALTER TABLE "preseason_benchmark_case_decision" DROP CONSTRAINT "benchmark_decision_tool_check";--> statement-breakpoint
ALTER TABLE "preseason_benchmark_case_result" ADD COLUMN "season_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "preseason_benchmark_case_result" ADD CONSTRAINT "preseason_benchmark_case_result_season_id_preseason_benchmark_season_id_fk" FOREIGN KEY ("season_id") REFERENCES "public"."preseason_benchmark_season"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "benchmark_case_result_season_id_idx" ON "preseason_benchmark_case_result" USING btree ("season_id");--> statement-breakpoint
ALTER TABLE "preseason_benchmark_case_decision" ADD CONSTRAINT "benchmark_decision_tool_check" CHECK (decision_type != 'tool' OR tool_id IS NOT NULL OR resolution_status = 'unresolved_tool');--> statement-breakpoint
CREATE OR REPLACE FUNCTION check_case_result_season_consistency()
RETURNS TRIGGER AS $$
DECLARE
  run_season_id uuid;
  case_season_id uuid;
BEGIN
  SELECT season_id INTO run_season_id FROM preseason_benchmark_run WHERE id = NEW.run_id;
  SELECT season_id INTO case_season_id FROM preseason_benchmark_case WHERE id = NEW.case_id;
  IF NEW.season_id != run_season_id OR NEW.season_id != case_season_id THEN
    RAISE EXCEPTION 'case_result season_id (%) must match run season_id (%) and case season_id (%)',
      NEW.season_id, run_season_id, case_season_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;--> statement-breakpoint
CREATE TRIGGER trg_case_result_season_consistency
  BEFORE INSERT OR UPDATE ON preseason_benchmark_case_result
  FOR EACH ROW
  EXECUTE FUNCTION check_case_result_season_consistency();