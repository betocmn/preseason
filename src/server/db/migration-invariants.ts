import type postgres from 'postgres'

export async function applyMigrationInvariants(sql: postgres.Sql): Promise<void> {
  await sql.unsafe(`
    CREATE OR REPLACE FUNCTION prevent_season_id_update()
    RETURNS TRIGGER AS $$
    BEGIN
      IF NEW.season_id IS DISTINCT FROM OLD.season_id THEN
        RAISE EXCEPTION 'season_id is immutable on %', TG_TABLE_NAME;
      END IF;
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;

    CREATE OR REPLACE FUNCTION check_case_result_season_consistency()
    RETURNS TRIGGER AS $$
    DECLARE
      run_season_id uuid;
      case_season_id uuid;
    BEGIN
      SELECT season_id INTO run_season_id
      FROM public.preseason_benchmark_run
      WHERE id = NEW.run_id;

      SELECT season_id INTO case_season_id
      FROM public.preseason_benchmark_case
      WHERE id = NEW.case_id;

      IF NEW.season_id != run_season_id OR NEW.season_id != case_season_id THEN
        RAISE EXCEPTION 'case_result season_id (%) must match run season_id (%) and case season_id (%)',
          NEW.season_id, run_season_id, case_season_id;
      END IF;

      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;

    DROP TRIGGER IF EXISTS trg_immutable_season_id_run ON public.preseason_benchmark_run;
    CREATE TRIGGER trg_immutable_season_id_run
      BEFORE UPDATE ON public.preseason_benchmark_run
      FOR EACH ROW
      EXECUTE FUNCTION prevent_season_id_update();

    DROP TRIGGER IF EXISTS trg_immutable_season_id_case ON public.preseason_benchmark_case;
    CREATE TRIGGER trg_immutable_season_id_case
      BEFORE UPDATE ON public.preseason_benchmark_case
      FOR EACH ROW
      EXECUTE FUNCTION prevent_season_id_update();

    DROP TRIGGER IF EXISTS trg_immutable_season_id_case_result ON public.preseason_benchmark_case_result;
    CREATE TRIGGER trg_immutable_season_id_case_result
      BEFORE UPDATE ON public.preseason_benchmark_case_result
      FOR EACH ROW
      EXECUTE FUNCTION prevent_season_id_update();

    DROP TRIGGER IF EXISTS trg_case_result_season_consistency ON public.preseason_benchmark_case_result;
    CREATE TRIGGER trg_case_result_season_consistency
      BEFORE INSERT OR UPDATE ON public.preseason_benchmark_case_result
      FOR EACH ROW
      EXECUTE FUNCTION check_case_result_season_consistency();
  `)
}
