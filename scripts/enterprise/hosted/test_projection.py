import hashlib
import unittest
from project_sources import strip_outer_transactions, project

class Projection(unittest.TestCase):
 def test_quotes_and_nested_comments_keep_transaction_words(self):
  s="-- header\nBEGIN;\ncreate function f() returns text language plpgsql as $body$ begin return 'commit;'; end $body$;\n/* outer /* commit; */ keep */ select 'begin;', \"commit;\";\nCOMMIT;\n"
  t=strip_outer_transactions(s)
  self.assertIn('-- header',t);self.assertIn("return 'commit;'",t);self.assertIn("select 'begin;', \"commit;\"",t)
  self.assertNotIn('\nBEGIN;',t);self.assertNotIn('\nCOMMIT;',t)
 def test_rejects_partial_or_rollback_controls(self):
  for sql in ['begin; select 1;', 'select 1; commit;', 'begin; rollback;']:
   with self.assertRaises(ValueError): strip_outer_transactions(sql)
 def test_checksum_and_same_transaction_suffix(self):
  source='begin; select 1; commit;'
  item={'filename':'fixture.sql','sha256':hashlib.sha256(source.encode()).hexdigest(),'sql':source}
  sql=project(item)
  self.assertLess(sql.index('select 1;'),sql.index('deactivate_jobs()'))
  self.assertNotIn('commit;',sql.lower())
  item['sql']='select 2;'
  with self.assertRaises(ValueError): project(item)
 def test_plain_source_preserved(self):
  s='-- comment\nselect 1;\n';self.assertEqual(strip_outer_transactions(s),s)

if __name__=='__main__': unittest.main()
