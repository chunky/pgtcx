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

CREATE TRIGGER trigger_generate_body_hash
    BEFORE INSERT OR UPDATE ON tcx
    FOR EACH ROW
    EXECUTE FUNCTION generate_body_hash();

DROP VIEW IF EXISTS activity;
CREATE MATERIALIZED VIEW activity AS
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

DROP VIEW IF EXISTS trackpoint;
CREATE MATERIALIZED VIEW trackpoint AS
SELECT tcx.tcxid AS tcxid,
        (XPATH('/tcx:TrainingCenterDatabase/tcx:Activities/tcx:Activity/tcx:Id/text()', body,
       ARRAY[ARRAY['tcx', 'http://www.garmin.com/xmlschemas/TrainingCenterDatabase/v2']]))[1] AS activityid,
        xmltable.*
  FROM tcx,
       XMLTABLE(XMLNAMESPACES('http://www.garmin.com/xmlschemas/TrainingCenterDatabase/v2' AS tcx),
                '/tcx:TrainingCenterDatabase/tcx:Activities/tcx:Activity/tcx:Lap/tcx:Track/tcx:Trackpoint'
                PASSING body
                COLUMNS ordinality FOR ORDINALITY,
                        DistanceMeters REAL PATH 'tcx:DistanceMeters',
                        AltitudeMeters REAL PATH 'tcx:AltitudeMeters' DEFAULT 0,
                        Calories REAL PATH 'tcx:Calories',
                        Cadence REAL PATH 'tcx:Cadence',
                        Watts REAL PATH 'tcx:Watts',
                        Resistance REAL PATH 'tcx:Resistance',
                        heart_rate INTEGER PATH 'tcx:HeartRateBpm/tcx:Value',
                        Time TIMESTAMPTZ PATH 'tcx:Time');

