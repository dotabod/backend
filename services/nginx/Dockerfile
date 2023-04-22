FROM nginx:1.23.3

RUN echo "$TLS_CERT" > public.key
RUN echo "$TLS_KEY" > private.key
COPY ./*.key /etc/ssl/

# Copy extra config files if they exist
RUN if [ -d extras ] && [ "$(ls -A extras/*.conf)" ]; then \
  cp --no-target-directory extras/*.conf /etc/nginx/conf.d/; \
  fi

# Move the default conf out of the way
RUN mv /etc/nginx/nginx.conf /etc/nginx/nginx.conf_orig
# Copy in your project's new nginx conf
RUN cp ./nginx.conf /etc/nginx/nginx.conf
