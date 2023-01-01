FROM nginx:1.23.3

COPY 'docker-nginx-certs.sh' '/usr/local/bin/docker-nginx-certs.sh'
ENTRYPOINT [ "/usr/local/bin/docker-nginx-certs.sh" ]
CMD ["nginx", "-g", "daemon off;"]
