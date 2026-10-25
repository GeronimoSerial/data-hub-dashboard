from urllib.parse import urlsplit


DEV_URL = "https://dev.analisis.sistemas.mec.gob.ar"
DEV_DATABASE_NAME = "hub_dev"
DEV_APPLICATION_NAME = "data-hub-dashboard-dev"


class DevReleaseGuardError(ValueError):
    pass


def _postgres_identity(connection_string):
    try:
        parsed = urlsplit(connection_string)
        host = parsed.hostname
        port = parsed.port or 5432
    except (AttributeError, ValueError):
        raise DevReleaseGuardError("A valid PostgreSQL connection URL is required") from None

    database = parsed.path.removeprefix("/")
    if parsed.scheme not in ("postgres", "postgresql") or not host or not database:
        raise DevReleaseGuardError("A valid PostgreSQL connection URL is required")
    return host.rstrip(".").lower(), port, database


def validate_dev_release(application, runtime_env, configured_database_url):
    if application.get("name") != DEV_APPLICATION_NAME:
        raise DevReleaseGuardError("Coolify application is not the configured DEV application")
    if (application.get("fqdn") or "").rstrip("/") != DEV_URL:
        raise DevReleaseGuardError("Coolify application URL is not the configured DEV URL")

    if runtime_env.get("APP_ENV") != "dev":
        raise DevReleaseGuardError("APP_ENV must be dev")
    if (runtime_env.get("BETTER_AUTH_URL") or "").rstrip("/") != DEV_URL:
        raise DevReleaseGuardError("BETTER_AUTH_URL must point to the configured DEV URL")
    if runtime_env.get("DATABASE_SSL") != "require":
        raise DevReleaseGuardError("DATABASE_SSL must be require")

    expected = _postgres_identity(configured_database_url)
    actual = _postgres_identity(runtime_env.get("DATABASE_URL", ""))
    if expected[2] != DEV_DATABASE_NAME or actual[2] != DEV_DATABASE_NAME:
        raise DevReleaseGuardError("DEV database name must be hub_dev")
    if expected != actual:
        raise DevReleaseGuardError("Coolify DEV DATABASE_URL does not match the DEV database secret")

    # Deliberately return only non-credential identity fields. Never log either URL.
    return {"dbHost": actual[0], "dbPort": actual[1], "dbName": actual[2], "appEnv": "dev"}
