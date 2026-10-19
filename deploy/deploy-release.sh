#!/usr/bin/env bash
set -euo pipefail
umask 077
cd /srv/duranki
exec 9>.deploy.lock
flock -n 9 || { echo 'Another deployment is running.'; exit 1; }
image=${1:?Immutable image required}
[[ -f image-repository ]] || { echo 'An approved image repository is required.'; exit 1; }
repository=$(cat image-repository)
[[ "$repository" =~ ^[a-z0-9][a-z0-9.:/_-]+$ ]] || exit 1
[[ "$image" == "$repository@sha256:"* ]] || exit 1
digest=${image##*@sha256:}
[[ "$digest" =~ ^[a-f0-9]{64}$ ]] || exit 1
[[ -f production-ready && -f production.env && -x backup-before-release ]] || {
  echo 'Readiness approval, production.env and tested backup hook are required.'; exit 1;
}
previous=''
if [[ -f current-image ]]; then previous=$(cat current-image); fi
if [[ "$previous" == "$image" ]]; then echo 'Release already installed.'; exit 0; fi
docker pull "$image"
./backup-before-release
# No seed, database restore or automatic schema migration is run here.
# Schema changes require a reviewed, backward-compatible migration first.
export DURANKI_IMAGE="$image"
if docker compose -f compose.yml up -d --no-deps --wait --wait-timeout 180 app; then
  printf '%s\n' "$previous" > previous-image
  printf '%s\n' "$image" > current-image
  printf '%s %s\n' "$(date -u +%FT%TZ)" "$image" >> releases.log
  echo 'Release healthy.'
else
  echo 'Release failed its health check.'
  if [[ -n "$previous" ]]; then
    export DURANKI_IMAGE="$previous"
    docker compose -f compose.yml up -d --no-deps --wait --wait-timeout 180 app
    echo 'Previous application image restored; database was not reverted.'
  else
    docker compose -f compose.yml stop app
    echo 'Failed first release stopped; no prior release exists.'
  fi
  exit 1
fi
