"""Exercise the workflow shell with curl/sleep mocks; never contact Coolify."""
from pathlib import Path
import subprocess
import tempfile
import textwrap
import unittest

WORKFLOW = Path(__file__).resolve().parents[2] / '.github/workflows/links-cadm.yml'
LINKS_APP = 'mock-links'


def deploy_script():
    step = WORKFLOW.read_text().split('      - name: Trigger Coolify deploy\n', 1)[1]
    return textwrap.dedent(step.split('        run: |\n', 1)[1])


MOCKS = r'''
curl() {
  local url="${!#}" data="" uuid="" bearer_ok=false
  while [ "$#" -gt 0 ]; do
    if [ "$1" = "-H" ] && [ "$2" = "Authorization: Bearer mock-only" ]; then bearer_ok=true; fi
    if [ "$1" = "--data" ]; then data="$2"; shift; fi
    shift
  done
  if [ "$bearer_ok" != "true" ]; then return 98; fi
  case "$url" in
    */api/v1/deploy)
      jq -e '.force == false' <<< "$data" >/dev/null || return 97
      uuid=$(jq -r '.uuid' <<< "$data")
      echo "$uuid" >> requests
      if [ "$uuid" = "mock-links" ] && [ "${MOCK_POST_FAIL:-0}" = "1" ]; then return 22; fi
      if [ "$uuid" = "mock-links" ] && [ "${MOCK_NO_UUID:-0}" = "1" ]; then echo '{}'; return 0; fi
      jq -n --arg uuid "$uuid" '{deployments: [{deployment_uuid: $uuid}]}'
      ;;
    */api/v1/deployments/*)
      local status=finished code=200
      uuid="${url##*/}"
      echo "$uuid" >> polls
      if [ "$uuid" = "mock-links" ]; then
        status="${MOCK_LINKS_STATUS:-finished}"
        code="${MOCK_LINKS_CODE:-200}"
      else
        code="${MOCK_HUB_CODE:-200}"
      fi
      jq -n --arg status "$status" '{status: $status}' > deployment.json
      printf '%s' "$code"
      ;;
    *) echo 'Unexpected mock request' >&2; return 97 ;;
  esac
}
sleep() { :; }
'''


class LinksReleaseTests(unittest.TestCase):
    def run_deploy(self, branch='prod', **extra):
        with tempfile.TemporaryDirectory(prefix='links-release-test-') as directory:
            config = {
                'PATH': '/usr/bin:/bin', 'HOME': directory,
                'GITHUB_REF': f'refs/heads/{branch}',
                'GITHUB_EVENT_NAME': 'push',
                'COOLIFY_URL': 'https://example.invalid',
                'COOLIFY_TOKEN': 'mock-only',
                'COOLIFY_LINKS_APP_UUID': LINKS_APP,
                **extra,
            }
            result = subprocess.run(
                ['bash', '--noprofile', '--norc', '-e', '-o', 'pipefail', '-c', MOCKS + deploy_script()],
                cwd=directory, env=config, capture_output=True, text=True, timeout=10,
            )
            def read(name):
                path = Path(directory) / name
                return path.read_text().splitlines() if path.exists() else []
            return result, read('requests'), read('polls')

    def test_bash_syntax(self):
        result = subprocess.run(['bash', '-n'], input=deploy_script(), text=True, capture_output=True, env={'PATH': '/usr/bin:/bin'})
        self.assertEqual(result.returncode, 0)

    def test_prod_deploys_and_waits_for_links_only(self):
        result, requests, polls = self.run_deploy()
        self.assertEqual(result.returncode, 0)
        self.assertEqual(requests, [LINKS_APP])
        self.assertEqual(polls, requests)

    def test_dev_staging_and_pr_cannot_deploy(self):
        for branch in ['dev', 'staging']:
            with self.subTest(branch=branch):
                result, requests, _ = self.run_deploy(branch)
                self.assertNotEqual(result.returncode, 0)
                self.assertEqual(requests, [])
        result, requests, _ = self.run_deploy(GITHUB_EVENT_NAME='pull_request')
        self.assertNotEqual(result.returncode, 0)
        self.assertEqual(requests, [])

    def test_links_failure_or_cancellation_fails_job(self):
        for status in ['failed', 'cancelled-by-user']:
            with self.subTest(status=status):
                result, requests, _ = self.run_deploy(MOCK_LINKS_STATUS=status)
                self.assertNotEqual(result.returncode, 0)
                self.assertEqual(requests, [LINKS_APP])

    def test_links_post_failure_or_missing_uuid_fails_job(self):
        for flag in ['MOCK_POST_FAIL', 'MOCK_NO_UUID']:
            with self.subTest(flag=flag):
                result, _, _ = self.run_deploy(**{flag: '1'})
                self.assertNotEqual(result.returncode, 0)

    def test_links_poll_permission_failure_fails_job(self):
        for code in ['401', '403']:
            with self.subTest(code=code):
                result, _, _ = self.run_deploy(MOCK_LINKS_CODE=code)
                self.assertNotEqual(result.returncode, 0)

    def test_links_timeout_fails_job(self):
        result, _, polls = self.run_deploy(MOCK_LINKS_STATUS='in_progress')
        self.assertNotEqual(result.returncode, 0)
        self.assertEqual(polls.count(LINKS_APP), 60)

    def test_missing_credentials_or_target_fails(self):
        for variable in ['COOLIFY_TOKEN', 'COOLIFY_LINKS_APP_UUID']:
            with self.subTest(variable=variable):
                result, requests, _ = self.run_deploy(**{variable: ''})
                self.assertNotEqual(result.returncode, 0)
                self.assertEqual(requests, [])
                self.assertIn('::error::Falta el secret COOLIFY_TOKEN/COOLIFY_LINKS_APP_UUID', result.stdout)

    def test_poll_http_error_cannot_count_as_finished(self):
        result, _, polls = self.run_deploy(MOCK_LINKS_CODE='500')
        self.assertNotEqual(result.returncode, 0)
        self.assertEqual(polls.count(LINKS_APP), 60)

    def test_unknown_branch_cannot_deploy(self):
        result, requests, _ = self.run_deploy('main')
        self.assertNotEqual(result.returncode, 0)
        self.assertEqual(requests, [])


if __name__ == '__main__':
    unittest.main()
