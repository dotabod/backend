FROM nginx:1.23.3

RUN echo "$TLS_CERT" > public.key
RUN echo "$TLS_KEY" > private.key
COPY ./*.key /etc/ssl/

# Move the default conf out of the way
RUN mv /etc/nginx/nginx.conf /etc/nginx/nginx.conf_orig

# Copy in your project's new nginx conf
COPY ./nginx.conf /etc/nginx/nginx.conf
