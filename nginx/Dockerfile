FROM nginx:1.23.3

COPY 'docker-nginx-certs.sh' '~/docker-nginx-certs.sh'
ENTRYPOINT [ "~/docker-nginx-certs.sh" ]
CMD ["nginx", "-g", "daemon off;"]
