import unittest
from unittest.mock import patch

from prepare_staging_release import prepare_from_environment
from staging_release_guard import STAGING_APPLICATION_UUID, StagingReleaseGuardError


class PrepareStagingReleaseTest(unittest.TestCase):
    def setUp(self):
        self.environment = {
            "COOLIFY_TOKEN": "not-logged",
            "COOLIFY_STAGING_APP_UUID": STAGING_APPLICATION_UUID,
        }
        self.application = {
            "uuid": STAGING_APPLICATION_UUID,
            "fqdn": "https://staging.analisis.sistemas.mec.gob.ar",
        }
        self.runtime_env = {
            "APP_ENV": "staging",
            "BETTER_AUTH_URL": "https://staging.analisis.sistemas.mec.gob.ar",
            "DATABASE_SSL": "disable",
            "DATABASE_URL": "postgresql://user:password@stage-db.internal:5432/hub_staging",
            "OBS_BUCKET": "reportes-staging",
            "OBS_ENDPOINT": "https://obs.analisis.sistemas.mec.gob.ar",
            "OBS_ACCESS_KEY_ID": "not-logged",
            "OBS_SECRET_ACCESS_KEY": "not-logged",
        }

    @patch("prepare_staging_release._set_database_ssl")
    @patch("prepare_staging_release._runtime_environment")
    @patch("prepare_staging_release._api_get")
    def test_updates_only_ssl_after_isolation_checks_pass(self, api_get, get_env, set_ssl):
        api_get.return_value = self.application
        secured = {**self.runtime_env, "DATABASE_SSL": "require"}
        get_env.side_effect = [self.runtime_env, secured]

        result = prepare_from_environment(self.environment)

        set_ssl.assert_called_once_with(STAGING_APPLICATION_UUID, "not-logged")
        self.assertTrue(result["databaseSslUpdated"])
        self.assertTrue(result["database"]["sslRequired"])
        self.assertNotIn("password", repr(result))

    @patch("prepare_staging_release._set_database_ssl")
    @patch("prepare_staging_release._runtime_environment")
    @patch("prepare_staging_release._api_get")
    def test_does_not_mutate_if_database_is_not_staging(self, api_get, get_env, set_ssl):
        api_get.return_value = self.application
        self.runtime_env["DATABASE_URL"] = self.runtime_env["DATABASE_URL"].replace("hub_staging", "hub_prod")
        get_env.return_value = self.runtime_env

        with self.assertRaises(StagingReleaseGuardError):
            prepare_from_environment(self.environment)

        set_ssl.assert_not_called()


if __name__ == "__main__":
    unittest.main()
