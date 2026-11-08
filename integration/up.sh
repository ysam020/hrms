#!/bin/sh
# Isolated dependencies for the integration suites: 127.0.0.1 only, own names.
set -e
docker network create praesto-it-net >/dev/null 2>&1 || true
docker rm -f praesto-it-mongo praesto-it-redis >/dev/null 2>&1 || true
docker run -d --name praesto-it-mongo --network praesto-it-net -p 127.0.0.1:37017:27017 mongo:7 --replSet rs0 --bind_ip_all >/dev/null
docker run -d --name praesto-it-redis --network praesto-it-net -p 127.0.0.1:36379:6379 redis:7-alpine redis-server --appendonly yes >/dev/null
until docker exec praesto-it-mongo mongosh --quiet --eval "db.runCommand({ping:1}).ok" 2>/dev/null | grep -q 1; do sleep 1; done
docker exec praesto-it-mongo mongosh --quiet --eval 'try{rs.status().ok}catch(e){rs.initiate({_id:"rs0",members:[{_id:0,host:"localhost:27017"}]})}' >/dev/null
sleep 3
for db in it_master hrms-it-acme hrms-it-beta; do
  DEV_MONGODB_URI="mongodb://127.0.0.1:37017/$db?replicaSet=rs0&directConnection=true" \
    npx --prefix packages/database prisma db push --skip-generate --schema packages/database/src/prisma/schema.prisma >/dev/null
done
echo "isolated stack ready"
