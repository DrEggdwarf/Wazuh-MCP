# Reverse-proxy nginx : dashboard Wazuh en page principale + bouton MCP injecté (sub_filter,
# module intégré, AUCUN plugin). Cert auto-signé généré au build (lab).
FROM nginx:alpine
RUN apk add --no-cache openssl && \
    openssl req -x509 -newkey rsa:2048 -nodes -days 3650 \
      -keyout /etc/nginx/cert.key -out /etc/nginx/cert.crt -subj "/CN=localhost"
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY fab.js /srv/fab.js
EXPOSE 8443
