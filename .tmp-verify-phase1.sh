#!/bin/bash
echo '=== 1) /api/version ==='
curl -s https://travel-notes.yuanabd.cn/api/version
echo ''

echo '=== 2) login with clientType=app (check Set-Cookie) ==='
cat > /tmp/login.json <<'EOF'
{"username":"admin","password":"Tiantu@2026","clientType":"app"}
EOF
curl -s -D - -o /dev/null -X POST https://travel-notes.yuanabd.cn/api/login -H 'Content-Type: application/json' --data-binary @/tmp/login.json | grep -i 'set-cookie' | sed 's/admin_session=[^;]*/admin_session=<jwt>/'
echo ''

echo '=== 3) CORS preflight (OPTIONS from http://localhost) ==='
curl -s -D - -o /dev/null -X OPTIONS https://travel-notes.yuanabd.cn/api/login -H 'Origin: http://localhost' -H 'Access-Control-Request-Method: POST' -H 'Access-Control-Request-Headers: content-type' | grep -iE 'HTTP/|access-control'
echo ''

echo '=== 4) GET with Origin (expect Access-Control-Allow-Origin echo) ==='
curl -s -D - -o /dev/null https://travel-notes.yuanabd.cn/api/version -H 'Origin: http://localhost' | grep -iE 'HTTP/|access-control'
