DROP TABLE IF EXISTS tcx CASCADE;
CREATE TABLE tcx (tcxid SERIAL PRIMARY KEY,
	body XML,
	bodyhash VARCHAR(64),
	UNIQUE(bodyhash));

CREATE OR REPLACE FUNCTION generate_body_hash()
RETURNS TRIGGER AS $$
BEGIN
    NEW.bodyhash := md5(NEW.body::text);
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER trigger_generate_body_hash
    BEFORE INSERT OR UPDATE ON tcx
    FOR EACH ROW
    EXECUTE FUNCTION generate_body_hash();

DROP VIEW IF EXISTS activity CASCADE;
CREATE VIEW activity AS
SELECT tcx.tcxid AS tcxid,
    (XPATH('/tcx:TrainingCenterDatabase/tcx:Activities/tcx:Activity/tcx:Id/text()', body,
            ARRAY[ARRAY['tcx', 'http://www.garmin.com/xmlschemas/TrainingCenterDatabase/v2']]))[1] AS activityid,
    (XPATH('/tcx:TrainingCenterDatabase/tcx:Activities/tcx:Activity/@Sport', body,
            ARRAY[ARRAY['tcx', 'http://www.garmin.com/xmlschemas/TrainingCenterDatabase/v2']]))[1] AS Sport,
    (XPATH('/tcx:TrainingCenterDatabase/tcx:Activities/tcx:Activity/tcx:Notes/text()', body,
            ARRAY[ARRAY['tcx', 'http://www.garmin.com/xmlschemas/TrainingCenterDatabase/v2']]))[1] AS Notes,
    (XPATH('/tcx:TrainingCenterDatabase/tcx:Activities/tcx:Activity/tcx:Lap/@StartTime', body,
            ARRAY[ARRAY['tcx', 'http://www.garmin.com/xmlschemas/TrainingCenterDatabase/v2']]))[1] AS LapStartTime
  FROM tcx;

DROP TABLE IF EXISTS trackpoint CASCADE;
CREATE TABLE trackpoint (trackpointid SERIAL PRIMARY KEY,
	tcxid INTEGER NOT NULL REFERENCES tcx(tcxid),
	activityid TEXT NOT NULL,
	ordinality INTEGER NOT NULL,
	DistanceMeters REAL,
	AltitudeMeters REAL,
	Calories REAL,
	Cadence REAL,
	Watts REAL,
	Resistance REAL,
	heart_rate INTEGER,
	Time TIMESTAMPTZ);

DROP INDEX IF EXISTS idx_tp_id_ord;
CREATE INDEX idx_tp_id_ord ON trackpoint (tcxid, ordinality);

CREATE OR REPLACE FUNCTION insert_trackpoint_from_tcx()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO trackpoint (
        tcxid,
        activityid,
        ordinality,
        distancemeters,
        altitudemeters,
        calories,
        cadence,
        watts,
        resistance,
        heart_rate,
        time
    )
    SELECT NEW.tcxid AS tcxid,
           (XPATH('/tcx:TrainingCenterDatabase/tcx:Activities/tcx:Activity/tcx:Id/text()', NEW.body,
                  ARRAY[ARRAY['tcx', 'http://www.garmin.com/xmlschemas/TrainingCenterDatabase/v2']]))[1] AS activityid,
           xmltable.*
    FROM XMLTABLE(XMLNAMESPACES('http://www.garmin.com/xmlschemas/TrainingCenterDatabase/v2' AS tcx),
                  '/tcx:TrainingCenterDatabase/tcx:Activities/tcx:Activity/tcx:Lap/tcx:Track/tcx:Trackpoint'
                  PASSING NEW.body
                  COLUMNS ordinality FOR ORDINALITY,
                          DistanceMeters REAL PATH 'tcx:DistanceMeters',
                          AltitudeMeters REAL PATH 'tcx:AltitudeMeters' DEFAULT 0,
                          Calories REAL PATH 'tcx:Calories',
                          Cadence REAL PATH 'tcx:Cadence',
                          Watts REAL PATH 'tcx:Watts',
                          Resistance REAL PATH 'tcx:Resistance',
                          heart_rate INTEGER PATH 'tcx:HeartRateBpm/tcx:Value',
                          Time TIMESTAMPTZ PATH 'tcx:Time') AS xmltable;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER tcx_trackpoint_insert_trigger
    AFTER INSERT ON tcx
    FOR EACH ROW
    EXECUTE FUNCTION insert_trackpoint_from_tcx();

-- Treadmill works in increments of tenths of <speed units> or whole number gradient. Compute and round accordingly
DROP VIEW IF EXISTS speeds_dists;
CREATE VIEW speeds_dists AS
    SELECT B.*,
        B.distancemeters-A.distancemeters AS delta_dist_m,
        B.altitudemeters-A.altitudemeters AS delta_alt_m,
        (B.heart_rate+A.heart_rate)/2.0 AS avg_heartrate_bpm,
        B.time-A.time AS delta_t,
        (B.distancemeters-A.distancemeters)/EXTRACT(EPOCH FROM (B.time-A.time)) AS speed_ms,
        ROUND(CAST(2.23694*(B.distancemeters-A.distancemeters)/EXTRACT(EPOCH FROM (B.time-A.time)) AS NUMERIC), 2) AS speed_mph,
        ROUND(CAST(3.6*(B.distancemeters-A.distancemeters)/EXTRACT(EPOCH FROM (B.time-A.time)) AS NUMERIC), 2) AS speed_kph,
        (B.altitudemeters-A.altitudemeters)/EXTRACT(EPOCH FROM (B.time-A.time)) AS alt_rate_ms,
        ROUND(CAST(100.0*(B.altitudemeters-A.altitudemeters)/NULLIF(B.distancemeters-A.distancemeters, 0) AS NUMERIC), 1) AS gradient
    FROM trackpoint A
        INNER JOIN trackpoint B ON B.tcxid=A.tcxid AND B.ordinality=A.ordinality+1;

