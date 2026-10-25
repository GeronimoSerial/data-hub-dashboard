import json
import os
import sys
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

from staging_release_guard import StagingReleaseGuardError, validate_staging_release


COOLIFY_API = "https://coolify.sistemas.mec.gob.ar/api/v1"


def _api_get(path, token):
    request = Request(
        f"{COOLIFY_API}{path}",
        headers={"Authorization": f"Bearer {token}", "Accept": "application/json"},
    )
    try:
        with urlopen(request, timeout=30) as response:
            return json.load(response)
    except HTTPError as error:
        raise RuntimeError(f"Coolify read-only STAGING verification {path}: HTTP {error.code}") from None
    except URLError:
        raise RuntimeError(f"Coolify read-only STAGING verification {path}: API unreachable") from None


def _runtime_environment(application_uuid, token):
    values = {}
    for entry in _api_get(f"/applications/{application_uuid}/envs", token):
        if entry.get("is_preview") or not entry.get("is_runtime"):
            continue
        value = entry.get("real_value") or entry.get("value") or ""
        if isinstance(value, str) and len(value) >= 2 and value[0] == value[-1] and value[0] in "\"'":
            value = value[1:-1]
        values[entry.get("key")] = value
    return values


def verify_from_environment(environment):
    token = environment.get("COOLIFY_TOKEN")
    application_uuid = environment.get("COOLIFY_STAGING_APP_UUID")
    if not token or not application_uuid:
        raise StagingReleaseGuardError("Missing STAGING verification configuration")

    application = _api_get(f"/applications/{application_uuid}", token)
    runtime_env = _runtime_environment(application_uuid, token)
    return validate_staging_release(application, application_uuid, runtime_env)


if __name__ == "__main__":
    try:
        print(json.dumps(verify_from_environment(os.environ), sort_keys=True))
    except (StagingReleaseGuardError, RuntimeError) as error:
        print(f"STAGING release preflight failed: {error}", file=sys.stderr)
        raise SystemExit(1)
