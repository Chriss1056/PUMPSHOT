docker stop pumpshot
docker ps -a
docker container remove pumpshot
docker image remove pumpshot:v<OLD_VERSION_NUMBER>
docker builder prune
cd PUMPSHOT/
ll
git fetch
git pull
ll
docker build -t pumpshot:v<NEW_VERSION_NUMBER> .
docker run --name=pumpshot --restart unless-stopped -p3000:3000 -d pumpshot:v<NEW_VERSION_NUMBER>