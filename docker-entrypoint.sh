#!/bin/bash
set -e

export PATH="/usr/lib/postgresql/17/bin:$PATH"

# Initialise PostgreSQL data directory on first run
if [ ! -f "$PGDATA/PG_VERSION" ]; then
    echo "Initialising PostgreSQL data directory..."
    su postgres -c "initdb -D $PGDATA"
fi

# Start PostgreSQL
su postgres -c "pg_ctl -D $PGDATA -l /tmp/postgresql.log start"

# Wait for PostgreSQL to be ready
until su postgres -c "pg_isready -q"; do
    echo "Waiting for PostgreSQL..."
    sleep 1
done

# Create role and database on first run (check if tcx table exists as a proxy)
DB_READY=$(su postgres -c "psql -tAc \"SELECT 1 FROM pg_database WHERE datname='pgtcx'\"")
if [ "$DB_READY" != "1" ]; then
    echo "Creating database and schema..."
    su postgres -c "psql -c \"CREATE USER pgtcx WITH PASSWORD 'pgtcx'\""
    su postgres -c "psql -c \"CREATE DATABASE pgtcx OWNER pgtcx\""
    su postgres -c "psql -d pgtcx -f /setup.sql"
    su postgres -c "psql -d pgtcx -c \"GRANT ALL ON ALL TABLES IN SCHEMA public TO pgtcx; GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO pgtcx;\""
    echo "Database initialised."
else
    echo "Database already exists, skipping schema setup."
fi

# Run the Flask app via gunicorn
exec gunicorn --bind 0.0.0.0:5000 --workers 2 app:app
