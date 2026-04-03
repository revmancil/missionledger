-- Production DBs may have gl_source_type without values added in application code.
-- Opening balance finalize inserts source_type = 'OPENING_BALANCE'.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_enum e
    JOIN pg_type t ON e.enumtypid = t.oid
    JOIN pg_namespace n ON t.typnamespace = n.oid
    WHERE n.nspname = 'public'
      AND t.typname = 'gl_source_type'
      AND e.enumlabel = 'OPENING_BALANCE'
  ) THEN
    ALTER TYPE "public"."gl_source_type" ADD VALUE 'OPENING_BALANCE';
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_enum e
    JOIN pg_type t ON e.enumtypid = t.oid
    JOIN pg_namespace n ON t.typnamespace = n.oid
    WHERE n.nspname = 'public'
      AND t.typname = 'gl_source_type'
      AND e.enumlabel = 'MANUAL_JE'
  ) THEN
    ALTER TYPE "public"."gl_source_type" ADD VALUE 'MANUAL_JE';
  END IF;
END
$$;
