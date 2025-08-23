#!/bin/sh

. ./postgres_connection.sh

TCXDIR="./tcx"

psql \
	--host=${PGHOST} \
	--port=${PGPORT} \
	--username=${PGUSER} \
	--dbname=${PGDB} \
	--file=setup.sql 

for f in ${TCXDIR}/*.tcx
do
	echo "Reading $f"

	cat ${f} |
	psql \
		--host=${PGHOST} \
		--port=${PGPORT} \
		--username=${PGUSER} \
		--dbname=${PGDB} \
		--command="\\COPY tcx(body) from stdin"
done

# Several views are marked as materialized. This materializes them
#
psql \
	--host=${PGHOST} \
	--port=${PGPORT} \
	--username=${PGUSER} \
	--dbname=${PGDB} \
	--file=materialize.sql 

