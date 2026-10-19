#!/usr/bin/env bash
set -euo pipefail
[[ "${BITBUCKET_BRANCH:-}" == main ]] || { echo 'Production releases require main.'; exit 1; }
[[ "${PRODUCTION_READY:-false}" == true ]] || { echo 'Production readiness has not been approved.'; exit 1; }
: "${REGISTRY_HOST:?Registry hostname required}"
: "${IMAGE_REPOSITORY:?Full registry/repository required}"
: "${REGISTRY_USER:?Registry user required}"
: "${REGISTRY_PASSWORD:?Secured registry token required}"
: "${SERVER_HOST:?Server hostname required}"
: "${SERVER_USER:?Deployment user required}"
: "${SERVER_SSH_KEY_BASE64:?Secured base64 OpenSSH private key required}"
: "${SERVER_KNOWN_HOSTS:?Verified SSH known_hosts entry required}"
[[ "$REGISTRY_HOST" =~ ^[a-z0-9][a-z0-9.-]*(:[0-9]+)?$ ]]
[[ "$IMAGE_REPOSITORY" == "$REGISTRY_HOST/"* ]]
[[ "$IMAGE_REPOSITORY" =~ ^[a-z0-9][a-z0-9.:/_-]+$ ]]
[[ "$BITBUCKET_COMMIT" =~ ^[a-f0-9]{40}$ ]]
[[ "$SERVER_HOST" =~ ^[a-zA-Z0-9][a-zA-Z0-9.-]*$ ]]
[[ "$SERVER_USER" =~ ^[a-zA-Z_][a-zA-Z0-9_-]*$ ]]
port=${SERVER_SSH_PORT:-22}
[[ "$port" =~ ^[0-9]+$ ]]
umask 077
secrets=$(mktemp -d)
trap 'rm -rf "$secrets"' EXIT
export DOCKER_CONFIG="$secrets/docker"
printf '%s' "$REGISTRY_PASSWORD" | docker login "$REGISTRY_HOST" -u "$REGISTRY_USER" --password-stdin
tag="$IMAGE_REPOSITORY:$BITBUCKET_COMMIT"
docker build -f Dockerfile.release -t "$tag" .
docker push "$tag"
reference=$(docker inspect --format='{{index .RepoDigests 0}}' "$tag")
[[ "$reference" == "$IMAGE_REPOSITORY@sha256:"* ]]
digest=${reference##*@sha256:}
[[ "$digest" =~ ^[a-f0-9]{64}$ ]]
printf '%s' "$SERVER_SSH_KEY_BASE64" | base64 -d > "$secrets/key"
printf '%s\n' "$SERVER_KNOWN_HOSTS" > "$secrets/known_hosts"
ssh -i "$secrets/key" -o IdentitiesOnly=yes -o BatchMode=yes \
  -o StrictHostKeyChecking=yes -o "UserKnownHostsFile=$secrets/known_hosts" \
  -o ConnectTimeout=20 -p "$port" "$SERVER_USER@$SERVER_HOST" \
  "bash /srv/duranki/deploy-release.sh '$reference'"
