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

