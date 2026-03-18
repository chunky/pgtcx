FROM python:3.12-slim

# Install PostgreSQL
RUN apt-get update && apt-get install -y \
    postgresql \
    postgresql-client \
    && rm -rf /var/lib/apt/lists/*

# Install Python dependencies
WORKDIR /app
COPY vis/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt gunicorn

# Copy app and SQL schema
COPY vis/ .
COPY setup.sql /setup.sql

# Prepare postgres data directory
ENV PGDATA=/var/lib/postgresql/data
RUN mkdir -p $PGDATA && chown postgres:postgres $PGDATA

COPY docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh

EXPOSE 5000

VOLUME ["/var/lib/postgresql/data"]

ENTRYPOINT ["/docker-entrypoint.sh"]
