from hashlib import sha256
from urllib.parse import urlsplit


STAGING_URL = "https://staging.analisis.sistemas.mec.gob.ar"
STAGING_DATABASE_NAME = "hub_staging"
STAGING_APPLICATION_UUID = "j3zm0co4bi9iy0c70nv3vinf"


class StagingReleaseGuardError(ValueError):
    pass


def _database_identity(connection_string):
    try:
        parsed = urlsplit(connection_string)
        host = parsed.hostname
        port = parsed.port or 5432
    except (AttributeError, ValueError):
        raise StagingReleaseGuardError("STAGING DATABASE_URL is invalid") from None

    database = parsed.path.removeprefix("/")
    if parsed.scheme not in ("postgres", "postgresql") or not host or not database:
        raise StagingReleaseGuardError("STAGING DATABASE_URL is invalid")
    return host.rstrip(".").lower(), port, database


def _https_host(value, field):
    try:
        parsed = urlsplit(value)
        if parsed.scheme != "https" or not parsed.hostname:
            raise ValueError
    except (AttributeError, ValueError):
        raise StagingReleaseGuardError(f"{field} must use HTTPS") from None
    return parsed.hostname.rstrip(".").lower()


def _host_id(host):
    return sha256(host.encode()).hexdigest()[:12]


def validate_staging_release(application, application_uuid, runtime_env):
    if application_uuid != STAGING_APPLICATION_UUID or application.get("uuid") != STAGING_APPLICATION_UUID:
        raise StagingReleaseGuardError("Coolify target is not the configured STAGING application")
    if (application.get("fqdn") or "").rstrip("/") != STAGING_URL:
        raise StagingReleaseGuardError("Coolify application URL is not the configured STAGING URL")
    if runtime_env.get("APP_ENV") != "staging":
        raise StagingReleaseGuardError("APP_ENV must be staging")
    if (runtime_env.get("BETTER_AUTH_URL") or "").rstrip("/") != STAGING_URL:
        raise StagingReleaseGuardError("BETTER_AUTH_URL must point to the configured STAGING URL")
    if runtime_env.get("DATABASE_SSL") != "require":
        raise StagingReleaseGuardError("DATABASE_SSL must be require")

    db_host, db_port, db_name = _database_identity(runtime_env.get("DATABASE_URL", ""))
    if db_name != STAGING_DATABASE_NAME:
        raise StagingReleaseGuardError("STAGING database name must be hub_staging")

    bucket = runtime_env.get("OBS_BUCKET", "").strip().lower()
    if not bucket or not any(label in bucket for label in ("stage", "staging", "qa")):
        raise StagingReleaseGuardError("OBS_BUCKET must identify an isolated STAGING/QA bucket")
    endpoint_host = _https_host(runtime_env.get("OBS_ENDPOINT", ""), "OBS_ENDPOINT")
    if endpoint_host == "obs-dev.analisis.sistemas.mec.gob.ar":
        raise StagingReleaseGuardError("OBS_ENDPOINT must not point to DEV media")
    if not runtime_env.get("OBS_ACCESS_KEY_ID", "").strip() or not runtime_env.get("OBS_SECRET_ACCESS_KEY", "").strip():
        raise StagingReleaseGuardError("STAGING media credentials are missing")

    # Return only a redacted allowlist; never include URLs, bucket credentials, or secrets.
    return {
        "applicationId": STAGING_APPLICATION_UUID,
        "url": STAGING_URL,
        "appEnv": "staging",
        "authUrlMatches": True,
        "database": {"hostId": _host_id(db_host), "port": db_port, "name": db_name, "sslRequired": True},
        "media": {
            "endpointId": _host_id(endpoint_host),
            "bucketIsStagingScoped": True,
            "credentialsPresent": True,
        },
    }
