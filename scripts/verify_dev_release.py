import json
import os
import sys
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

from dev_release_guard import DevReleaseGuardError, validate_dev_release


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
        raise RuntimeError(f"Coolify read-only verification returned HTTP {error.code}") from None
    except URLError:
        raise RuntimeError("Could not reach Coolify for read-only verification") from None


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
    application_uuid = environment.get("COOLIFY_DEV_APP_UUID")
    configured_database_url = environment.get("DEV_DATABASE_URL")
    if not token or not application_uuid or not configured_database_url:
        raise DevReleaseGuardError("Missing DEV verification configuration")

    application = _api_get(f"/applications/{application_uuid}", token)
    runtime_env = _runtime_environment(application_uuid, token)
    identity = validate_dev_release(application, runtime_env, configured_database_url)
    return {
        "application": application["name"],
        "url": application["fqdn"].rstrip("/"),
        **identity,
    }


if __name__ == "__main__":
    try:
        print(json.dumps(verify_from_environment(os.environ), sort_keys=True))
    except (DevReleaseGuardError, RuntimeError) as error:
        print(f"DEV release preflight failed: {error}", file=sys.stderr)
        raise SystemExit(1)
