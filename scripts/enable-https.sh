#!/bin/bash
# Run after brdpilot.com DNS points to 39.105.75.242
set -euo pipefail

DOMAIN="brdpilot.com"
WEBROOT="/usr/share/nginx/html"
SSL_DIR="/etc/nginx/ssl/brdpilot"

mkdir -p "$SSL_DIR"

if ! command -v acme.sh >/dev/null 2>&1; then
  curl -fsSL https://get.acme.sh | sh -s email=admin@brdpilot.com
  export PATH="$HOME/.acme.sh:$PATH"
fi

~/.acme.sh/acme.sh --issue -d "$DOMAIN" -d "www.$DOMAIN" -w "$WEBROOT" --force

~/.acme.sh/acme.sh --install-cert -d "$DOMAIN" \
  --key-file "$SSL_DIR/$DOMAIN.key" \
  --fullchain-file "$SSL_DIR/$DOMAIN.pem" \
  --reloadcmd "systemctl reload nginx"

cat > /etc/nginx/conf.d/brdpilot.conf <<'NGINX'
server {
    listen 80;
    listen [::]:80;
    server_name brdpilot.com www.brdpilot.com;
    return 301 https://brdpilot.com$request_uri;
}

server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name brdpilot.com www.brdpilot.com;

    ssl_certificate     /etc/nginx/ssl/brdpilot/brdpilot.com.pem;
    ssl_certificate_key /etc/nginx/ssl/brdpilot/brdpilot.com.key;
    ssl_session_cache   shared:SSL:10m;
    ssl_session_timeout 10m;
    ssl_protocols       TLSv1.2 TLSv1.3;

    client_max_body_size 16m;

    location / {
        proxy_pass http://127.0.0.1:4173;
        proxy_http_version 1.1;
        include proxy_params;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 120s;
        proxy_send_timeout 120s;
    }
}
NGINX

nginx -t && systemctl reload nginx
echo "HTTPS ready: https://brdpilot.com"
