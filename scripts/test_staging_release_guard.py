import unittest

from staging_release_guard import (
    STAGING_APPLICATION_UUID,
    StagingReleaseGuardError,
    validate_staging_release,
)


class StagingReleaseGuardTest(unittest.TestCase):
    def setUp(self):
        self.application = {
            "uuid": STAGING_APPLICATION_UUID,
            "fqdn": "https://staging.analisis.sistemas.mec.gob.ar",
        }
        self.runtime_env = {
            "APP_ENV": "staging",
            "BETTER_AUTH_URL": "https://staging.analisis.sistemas.mec.gob.ar",
            "DATABASE_SSL": "require",
            "DATABASE_URL": "postgresql://stage_user:secret-value@stage-db.internal:5432/hub_staging?sslmode=require",
            "OBS_BUCKET": "reportes-staging",
            "OBS_ENDPOINT": "https://obs.analisis.sistemas.mec.gob.ar",
            "OBS_ACCESS_KEY_ID": "stage-key",
            "OBS_SECRET_ACCESS_KEY": "stage-secret",
        }

    def test_accepts_isolated_staging_application_database_and_media(self):
        identity = validate_staging_release(self.application, STAGING_APPLICATION_UUID, self.runtime_env)
        self.assertEqual(identity["database"]["name"], "hub_staging")
        self.assertTrue(identity["media"]["bucketIsStagingScoped"])
        self.assertNotIn("secret-value", repr(identity))
        self.assertNotIn("stage-secret", repr(identity))
        self.assertNotIn("stage-db.internal", repr(identity))

    def test_rejects_wrong_application_uuid(self):
        with self.assertRaises(StagingReleaseGuardError):
            validate_staging_release(self.application, "wrong-uuid", self.runtime_env)

    def test_rejects_production_url(self):
        self.application["fqdn"] = "https://analisis.sistemas.mec.gob.ar"
        with self.assertRaises(StagingReleaseGuardError):
            validate_staging_release(self.application, STAGING_APPLICATION_UUID, self.runtime_env)

    def test_rejects_wrong_runtime_environment_or_auth_origin(self):
        self.runtime_env["APP_ENV"] = "production"
        with self.assertRaises(StagingReleaseGuardError):
            validate_staging_release(self.application, STAGING_APPLICATION_UUID, self.runtime_env)
        self.runtime_env["APP_ENV"] = "staging"
        self.runtime_env["BETTER_AUTH_URL"] = "https://analisis.sistemas.mec.gob.ar"
        with self.assertRaises(StagingReleaseGuardError):
            validate_staging_release(self.application, STAGING_APPLICATION_UUID, self.runtime_env)

    def test_rejects_non_staging_database_or_ssl_downgrade(self):
        self.runtime_env["DATABASE_URL"] = self.runtime_env["DATABASE_URL"].replace("hub_staging", "hub_prod")
        with self.assertRaises(StagingReleaseGuardError):
            validate_staging_release(self.application, STAGING_APPLICATION_UUID, self.runtime_env)
        self.runtime_env["DATABASE_URL"] = "postgresql://stage_user:secret-value@stage-db.internal:5432/hub_staging"
        self.runtime_env["DATABASE_SSL"] = "disable"
        with self.assertRaises(StagingReleaseGuardError):
            validate_staging_release(self.application, STAGING_APPLICATION_UUID, self.runtime_env)
        identity = validate_staging_release(
            self.application,
            STAGING_APPLICATION_UUID,
            self.runtime_env,
            allow_database_ssl_upgrade=True,
        )
        self.assertFalse(identity["database"]["sslRequired"])

    def test_rejects_unscoped_or_dev_media(self):
        self.runtime_env["OBS_BUCKET"] = "reportes"
        with self.assertRaises(StagingReleaseGuardError):
            validate_staging_release(self.application, STAGING_APPLICATION_UUID, self.runtime_env)
        self.runtime_env["OBS_BUCKET"] = "reportes-staging"
        self.runtime_env["OBS_ENDPOINT"] = "https://obs-dev.analisis.sistemas.mec.gob.ar"
        with self.assertRaises(StagingReleaseGuardError):
            validate_staging_release(self.application, STAGING_APPLICATION_UUID, self.runtime_env)


if __name__ == "__main__":
    unittest.main()
