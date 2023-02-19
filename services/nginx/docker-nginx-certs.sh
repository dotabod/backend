#!/bin/bash
set -e

echo "$TLS_CERT" > ./public.key
echo "$TLS_KEY" > ./private.key
