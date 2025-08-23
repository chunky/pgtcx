\timing

DROP INDEX IF EXISTS idx_tp_id_ord;

REFRESH MATERIALIZED VIEW activity;
REFRESH MATERIALIZED VIEW trackpoint;

CREATE INDEX idx_tp_id_ord ON trackpoint (tcxid, ordinality);
