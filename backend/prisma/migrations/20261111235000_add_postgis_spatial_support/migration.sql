CREATE EXTENSION IF NOT EXISTS postgis;

ALTER TABLE "complaint_locations"
ADD COLUMN IF NOT EXISTS "location_geom" geometry(Point, 4326);

UPDATE "complaint_locations"
SET "location_geom" = ST_SetSRID(
  ST_MakePoint("longitude"::double precision, "latitude"::double precision),
  4326
)
WHERE "location_geom" IS NULL;

CREATE INDEX IF NOT EXISTS "complaint_locations_location_geom_gix"
ON "complaint_locations" USING GIST ("location_geom");

CREATE INDEX IF NOT EXISTS "complaint_locations_location_geog_gix"
ON "complaint_locations" USING GIST (("location_geom"::geography));

CREATE OR REPLACE FUNCTION sync_complaint_location_geom()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW."location_geom" := ST_SetSRID(
    ST_MakePoint(NEW."longitude"::double precision, NEW."latitude"::double precision),
    4326
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS "complaint_locations_sync_geom" ON "complaint_locations";

CREATE TRIGGER "complaint_locations_sync_geom"
BEFORE INSERT OR UPDATE OF "latitude", "longitude"
ON "complaint_locations"
FOR EACH ROW
EXECUTE FUNCTION sync_complaint_location_geom();
