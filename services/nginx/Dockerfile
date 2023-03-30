FROM nginx:1.23.3

RUN echo "$TLS_CERT" > public.key
RUN echo "$TLS_KEY" > private.key
COPY ./*.key /etc/ssl/
COPY extras/*.conf /etc/nginx/conf.d/
