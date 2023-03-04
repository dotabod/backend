FROM debian:stable-slim

ARG AWS_ACCESS_KEY_ID
ARG AWS_SECRET_ACCESS_KEY
ARG AWS_REGION

RUN echo "${AWS_REGION}"

# Install necessary packages
RUN apt-get update && apt-get install -y gnupg wget && \
    sh -c 'echo "deb http://apt.postgresql.org/pub/repos/apt bullseye-pgdg main" > /etc/apt/sources.list.d/pgdg.list' && \
    wget -qO - https://www.postgresql.org/media/keys/ACCC4CF8.asc | apt-key add - && \
    wget -qO - https://www.mongodb.org/static/pgp/server-6.0.asc | apt-key add - && \
    echo "deb http://repo.mongodb.org/apt/debian bullseye/mongodb-org/6.0 main" | tee /etc/apt/sources.list.d/mongodb-org-6.0.list && \
    apt-get update && apt-get install -y mongodb-org-tools \
    postgresql-client-14 \
    awscli \
    cron \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Configure AWS CLI
RUN aws configure set aws_access_key_id "$AWS_ACCESS_KEY_ID" && \
    aws configure set aws_secret_access_key "$AWS_SECRET_ACCESS_KEY" && \
    aws configure set region "$AWS_REGION"

# Copy the backup script and crontab file to the container
COPY cron.sh /app/cron.sh
COPY crontab /etc/cron.d/backup-cron

# Make the backup script executable
RUN chmod +x /app/cron.sh

# Give execution rights on the cron job
RUN chmod 0644 /etc/cron.d/backup-cron

# Apply cron job
RUN crontab /etc/cron.d/backup-cron

# Add entrypoint to set environment variables and start cron in the foreground
ENTRYPOINT printenv | grep -v "no_proxy" >> /etc/environment && cron -f