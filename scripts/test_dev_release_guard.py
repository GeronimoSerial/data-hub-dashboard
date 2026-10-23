import unittest

from dev_release_guard import DevReleaseGuardError, validate_dev_release


class DevReleaseGuardTest(unittest.TestCase):
    def setUp(self):
        self.application = {
            "name": "data-hub-dashboard-dev",
            "fqdn": "https://dev.analisis.sistemas.mec.gob.ar",
        }
        self.database_url = "postgresql://dev_user:secret-value@dev-db.internal:5432/hub_dev?sslmode=require"
        self.runtime_env = {
            "APP_ENV": "dev",
            "BETTER_AUTH_URL": "https://dev.analisis.sistemas.mec.gob.ar",
            "DATABASE_SSL": "require",
            "DATABASE_URL": self.database_url,
        }

    def test_accepts_matching_dev_application_database_and_auth_origin(self):
        identity = validate_dev_release(self.application, self.runtime_env, self.database_url)
        self.assertEqual(
            identity,
            {"dbHost": "dev-db.internal", "dbPort": 5432, "dbName": "hub_dev", "appEnv": "dev"},
        )
        self.assertNotIn("secret-value", repr(identity))

    def test_rejects_non_dev_application(self):
        self.application["name"] = "data-hub-dashboard-prod"
        with self.assertRaises(DevReleaseGuardError):
            validate_dev_release(self.application, self.runtime_env, self.database_url)

    def test_rejects_wrong_public_origin(self):
        self.application["fqdn"] = "https://analisis.sistemas.mec.gob.ar"
        with self.assertRaises(DevReleaseGuardError):
            validate_dev_release(self.application, self.runtime_env, self.database_url)

    def test_rejects_non_dev_app_environment(self):
        self.runtime_env["APP_ENV"] = "production"
        with self.assertRaises(DevReleaseGuardError):
            validate_dev_release(self.application, self.runtime_env, self.database_url)

    def test_rejects_non_dev_auth_url(self):
        self.runtime_env["BETTER_AUTH_URL"] = "https://analisis.sistemas.mec.gob.ar"
        with self.assertRaises(DevReleaseGuardError):
            validate_dev_release(self.application, self.runtime_env, self.database_url)

    def test_rejects_non_dev_database_name(self):
        production_url = self.database_url.replace("/hub_dev", "/hub_prod")
        self.runtime_env["DATABASE_URL"] = production_url
        with self.assertRaises(DevReleaseGuardError):
            validate_dev_release(self.application, self.runtime_env, production_url)

    def test_rejects_database_host_mismatch_without_exposing_urls(self):
        self.runtime_env["DATABASE_URL"] = self.database_url.replace("dev-db", "prod-db")
        with self.assertRaises(DevReleaseGuardError) as error:
            validate_dev_release(self.application, self.runtime_env, self.database_url)
        self.assertNotIn("secret-value", str(error.exception))

    def test_rejects_database_ssl_downgrade(self):
        self.runtime_env["DATABASE_SSL"] = "disable"
        with self.assertRaises(DevReleaseGuardError):
            validate_dev_release(self.application, self.runtime_env, self.database_url)


if __name__ == "__main__":
    unittest.main()
