import importlib.util
import pathlib
import unittest

spec = importlib.util.spec_from_file_location('secret_scan', pathlib.Path(__file__).resolve().parents[2] / 'scripts/enterprise/secret_scan.py')
scan = importlib.util.module_from_spec(spec)
spec.loader.exec_module(scan)

class SecretScanTests(unittest.TestCase):
    def test_recognizes_sensitive_families_without_returning_values(self):
        # Construct synthetic tokens so the test file does not itself look like
        # committed credentials. These are never sent to a provider.
        samples = [prefix + b'x' * 40 for prefix in [b'sk_' + b'live_', b'rk_' + b'test_', b'rkcs_' + b'test_', b'wh' + b'sec_', b'sb_' + b'secret_', b'gh' + b'p_']]
        for sample in samples:
            result = scan.findings(b'line one\n' + sample)
            self.assertTrue(result)
            self.assertEqual(result[0]['line'], 2)
            self.assertEqual(set(result[0]), {'rule', 'line'})
            self.assertNotIn(sample.decode(), str(result))
    def test_public_keys_and_documentation_placeholders_are_not_secrets(self):
        self.assertEqual(scan.findings(b'sb_publishable_example pk_live_example sk_live_example rk_test_example'), [])
    def test_private_key_headers_are_found(self):
        self.assertTrue(scan.findings(b'-----BEGIN ' + b'PRIVATE KEY-----'))

if __name__ == '__main__': unittest.main()
