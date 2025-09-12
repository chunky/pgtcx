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
WITH a(ns) AS (
    VALUES (ARRAY[ARRAY['tcx', 'http://www.garmin.com/xmlschemas/TrainingCenterDatabase/v2']])
)
SELECT tcx.tcxid AS tcxid,
    (XPATH('/tcx:TrainingCenterDatabase/tcx:Activities/tcx:Activity[1]/tcx:Id[1]/text()', body, ns))[1]::text AS activityid,
    (XPATH('/tcx:TrainingCenterDatabase/tcx:Activities/tcx:Activity[1]/@Sport', body, ns))[1]::text AS Sport,
    (XPATH('/tcx:TrainingCenterDatabase/tcx:Activities/tcx:Activity[1]/tcx:Notes[1]/text()', body, ns))[1]::text AS Notes,
    to_timestamp((XPATH('/tcx:TrainingCenterDatabase/tcx:Activities/tcx:Activity[1]/tcx:Lap[1]/@StartTime', body, ns))[1]::text,
            'YYYY-MM-DD"T"HH24:MI:SS"Z"')::timestamp AS LapStartTime,
    (XPATH('/tcx:TrainingCenterDatabase/tcx:Activities/tcx:Activity[1]/tcx:Lap[1]/tcx:TotalTimeSeconds/text()', body, ns))[1]::text::real AS TotalTimeSeconds,
    (XPATH('/tcx:TrainingCenterDatabase/tcx:Activities/tcx:Activity[1]/tcx:Lap[1]/tcx:DistanceMeters[1]/text()', body, ns))[1]::text::real AS DistanceMeters,
    (XPATH('/tcx:TrainingCenterDatabase/tcx:Activities/tcx:Activity[1]/tcx:Lap[1]/tcx:MaximumSpeed[1]/text()', body, ns))[1]::text::real AS MaximumSpeed,
    (XPATH('/tcx:TrainingCenterDatabase/tcx:Activities/tcx:Activity[1]/tcx:Lap[1]/tcx:Calories[1]/text()', body, ns))[1]::text::real AS Calories,
    (XPATH('/tcx:TrainingCenterDatabase/tcx:Activities/tcx:Activity[1]/tcx:Lap[1]/tcx:AverageHeartRateBpm[1]/tcx:Value[1]/text()', body, ns))[1]::text::real AS AverageHeartRateBpm,
    (XPATH('/tcx:TrainingCenterDatabase/tcx:Activities/tcx:Activity[1]/tcx:Lap[1]/tcx:MaximumHeartRateBpm[1]/tcx:Value[1]/text()', body, ns))[1]::text::real AS MaximumHeartRateBpm,
    (XPATH('/tcx:TrainingCenterDatabase/tcx:Activities/tcx:Activity[1]/tcx:Lap[1]/tcx:Intensity[1]/text()', body, ns))[1]::text AS Intensity
  FROM tcx, a;

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

DROP VIEW IF EXISTS speed_incline_vs_hr_lagged CASCADE;
CREATE VIEW speed_incline_vs_hr_lagged AS
WITH time_lagged_analysis AS (
    SELECT
        a.tcxid,
        a.ordinality,
        a.speed_kph,
        a.gradient,
        a.avg_heartrate_bpm,
        a.time as current_time,
        -- Find heart rate values at different time lags
        (SELECT avg_heartrate_bpm
         FROM speeds_dists b
         WHERE b.tcxid = a.tcxid
           AND b.time <= a.time - INTERVAL '30 seconds'
         ORDER BY b.time DESC
         LIMIT 1) as hr_30s_ago,
        (SELECT avg_heartrate_bpm
         FROM speeds_dists b
         WHERE b.tcxid = a.tcxid
           AND b.time <= a.time - INTERVAL '60 seconds'
         ORDER BY b.time DESC
         LIMIT 1) as hr_60s_ago,
        (SELECT avg_heartrate_bpm
         FROM speeds_dists b
         WHERE b.tcxid = a.tcxid
           AND b.time <= a.time - INTERVAL '120 seconds'
         ORDER BY b.time DESC
         LIMIT 1) as hr_120s_ago
    FROM speeds_dists a
    WHERE a.speed_kph > 0 AND a.avg_heartrate_bpm > 0
),
time_lag_correlations AS (
    SELECT
        tcxid,
        COUNT(*) as data_points,
        CORR(speed_kph, avg_heartrate_bpm) as current_corr,
        CORR(speed_kph, hr_30s_ago) as lag_30s_corr,
        CORR(speed_kph, hr_60s_ago) as lag_60s_corr,
        CORR(speed_kph, hr_120s_ago) as lag_120s_corr,
        -- Same for gradient
        CORR(gradient, avg_heartrate_bpm) as gradient_current_corr,
        CORR(gradient, hr_30s_ago) as gradient_lag_30s_corr,
        CORR(gradient, hr_60s_ago) as gradient_lag_60s_corr,
        CORR(gradient, hr_120s_ago) as gradient_lag_120s_corr
    FROM time_lagged_analysis
    WHERE hr_30s_ago IS NOT NULL
    GROUP BY tcxid
    HAVING COUNT(*) > 50
)
SELECT *,
    GREATEST(current_corr, lag_30s_corr, lag_60s_corr, lag_120s_corr) as best_speed_correlation,
    CASE
        WHEN current_corr = GREATEST(current_corr, lag_30s_corr, lag_60s_corr, lag_120s_corr) THEN 'No lag'
        WHEN lag_30s_corr = GREATEST(current_corr, lag_30s_corr, lag_60s_corr, lag_120s_corr) THEN '30s lag'
        WHEN lag_60s_corr = GREATEST(current_corr, lag_30s_corr, lag_60s_corr, lag_120s_corr) THEN '60s lag'
        WHEN lag_120s_corr = GREATEST(current_corr, lag_30s_corr, lag_60s_corr, lag_120s_corr) THEN '120s lag'
    END as optimal_speed_lag
FROM time_lag_correlations;

DROP VIEW IF EXISTS regression_speed_incline_vs_hr CASCADE;
CREATE VIEW regression_speed_incline_vs_hr AS
WITH regression_analysis AS (
    SELECT
        tcxid,
        COUNT(*) as observations,
        -- Speed vs Heart Rate regression
        REGR_SLOPE(avg_heartrate_bpm, speed_kph) as speed_hr_slope,
        REGR_INTERCEPT(avg_heartrate_bpm, speed_kph) as speed_hr_intercept,
        REGR_R2(avg_heartrate_bpm, speed_kph) as speed_hr_r_squared,
        -- Gradient vs Heart Rate regression
        REGR_SLOPE(avg_heartrate_bpm, gradient) as gradient_hr_slope,
        REGR_INTERCEPT(avg_heartrate_bpm, gradient) as gradient_hr_intercept,
        REGR_R2(avg_heartrate_bpm, gradient) as gradient_hr_r_squared,
        -- Multiple regression components (for manual calculation)
        REGR_SXX(avg_heartrate_bpm, speed_kph) as speed_sxx,
        REGR_SYY(avg_heartrate_bpm, speed_kph) as speed_syy,
        REGR_SXY(avg_heartrate_bpm, speed_kph) as speed_sxy
    FROM speeds_dists
    WHERE speed_kph > 0 AND avg_heartrate_bpm > 0 AND gradient IS NOT NULL
    GROUP BY tcxid
    HAVING COUNT(*) > 10
)
SELECT *,
    CASE
        WHEN speed_hr_r_squared > gradient_hr_r_squared THEN 'Speed explains HR better'
        WHEN gradient_hr_r_squared > speed_hr_r_squared THEN 'Gradient explains HR better'
        ELSE 'Similar explanatory power'
    END as better_predictor
FROM regression_analysis;
