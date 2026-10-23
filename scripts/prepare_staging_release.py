import json
import os
import sys
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

from staging_release_guard import StagingReleaseGuardError, validate_staging_release
from verify_staging_release import COOLIFY_API, _api_get, _runtime_environment


def _set_database_ssl(application_uuid, token):
    path = f"/applications/{application_uuid}/envs/bulk"
    payload = {
        "data": [{
            "key": "DATABASE_SSL",
            "value": "require",
            "is_runtime": True,
            "is_buildtime": False,
            "is_preview": False,
            "is_literal": True,
        }],
    }
    request = Request(
        f"{COOLIFY_API}{path}",
        method="PATCH",
        headers={
            "Authorization": f"Bearer {token}",
            "Accept": "application/json",
            "Content-Type": "application/json",
        },
        data=json.dumps(payload).encode(),
    )
    try:
        with urlopen(request, timeout=30):
            return
    except HTTPError as error:
        raise RuntimeError(f"Coolify STAGING TLS update {path}: HTTP {error.code}") from None
    except URLError:
        raise RuntimeError(f"Coolify STAGING TLS update {path}: API unreachable") from None


def prepare_from_environment(environment):
    token = environment.get("COOLIFY_TOKEN")
    application_uuid = environment.get("COOLIFY_STAGING_APP_UUID")
    if not token or not application_uuid:
        raise StagingReleaseGuardError("Missing STAGING verification configuration")

    application = _api_get(f"/applications/{application_uuid}", token)
    runtime_env = _runtime_environment(application_uuid, token)
    # Validate the complete app, database, and media isolation before any write.
    identity = validate_staging_release(
        application,
        application_uuid,
        runtime_env,
        allow_database_ssl_upgrade=True,
    )
    ssl_updated = not identity["database"]["sslRequired"]
    if ssl_updated:
        _set_database_ssl(application_uuid, token)
        runtime_env = _runtime_environment(application_uuid, token)
        identity = validate_staging_release(application, application_uuid, runtime_env)

    return {**identity, "databaseSslUpdated": ssl_updated}


if __name__ == "__main__":
    try:
        print(json.dumps(prepare_from_environment(os.environ), sort_keys=True))
    except (StagingReleaseGuardError, RuntimeError) as error:
        print(f"STAGING release preparation failed: {error}", file=sys.stderr)
        raise SystemExit(1)
