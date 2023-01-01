#!/bin/bash
set -e

mkdir -p /etc/ssl
echo "$TLS_CERT" >> /etc/ssl/public.key
echo "$TLS_KEY" >> /etc/ssl/private.key

exec "$@"