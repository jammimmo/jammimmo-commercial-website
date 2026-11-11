"""Local extractor adversarial tests. No capture fetch or external services."""
import copy
import hashlib
import html
import importlib.util
import json
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('extract', ROOT / 'scripts' / 'extract-public-catalogue.py')
extract = importlib.util.module_from_spec(spec)
spec.loader.exec_module(extract)
SNAPSHOT = json.loads((ROOT / 'src/data/public-catalogue-20261031.json').read_text())


def tuple_value(value):
    if isinstance(value, list):
        return [1, [tuple_value(item) for item in value]]
    if isinstance(value, dict):
        return [0, {key: tuple_value(item) for key, item in value.items()}]
    return [0, value]


def capture(properties=None):
    rows = properties if properties is not None else copy.deepcopy(SNAPSHOT['properties'])
    hrefs = {row['reference']: '/biens/' + row['reference'].lower() for row in rows}
    props = {key: tuple_value(value) for key, value in {'properties': rows, 'cities': [], 'hrefByRef': hrefs, 'lang': 'fr'}.items()}
    ld = {'@type': 'CollectionPage', 'mainEntity': {'numberOfItems': len(rows), 'itemListElement': [{'url': 'https://jammimmo.com' + value} for value in hrefs.values()]}}
    source = '<!-- <astro-island component-url="/ListingsView.fake.js"> -->'
    source += '<astro-island component-url="/_astro/ListingsView.actual.js" props="' + html.escape(json.dumps(props), quote=True) + '"></astro-island>'
    source += '<script type="application/ld+json">' + json.dumps(ld) + '</script>'
    return source.encode()


def extract_fixture(data):
    return extract.extract_capture(data, hashlib.sha256(data).hexdigest())


class CaptureTests(unittest.TestCase):
    def test_preserves_all_rows_and_historical_encoded_references(self):
        snapshot, facts, report = extract_fixture(capture())
        self.assertEqual(len(snapshot['properties']), 97)
        self.assertEqual(len(report['legacyReferences']), 3)
        self.assertEqual(len(facts['listings']), 97)
        self.assertTrue(any('%F0%9F' in href for href in snapshot['hrefByRef'].values()))
        self.assertTrue(any('_' in href for href in snapshot['hrefByRef'].values()))

    def test_rejects_missing_hash_and_duplicate_islands(self):
        data = capture()
        with self.assertRaisesRegex(ValueError, 'hash mismatch'):
            extract.extract_capture(data)
        with self.assertRaisesRegex(ValueError, 'exactly one'):
            extract_fixture(data + b'<astro-island component-url="/ListingsView.fake.js"></astro-island>')

    def test_rejects_duplicate_keys_prototype_tags_and_depth(self):
        for text in ('{"a":1,"a":2}', '{"__proto__":[0,{}]}'):
            with self.assertRaises(ValueError):
                extract.parse_json(text)
        for tag in (2, 3, 4, 6, 7, 11):
            with self.assertRaisesRegex(ValueError, 'unsupported'):
                extract.decode_tuple([tag, 'nothing is evaluated'])
        value = [0, 'x']
        for unused in range(30):
            value = [1, [value]]
        with self.assertRaisesRegex(ValueError, 'budget'):
            extract.decode_tuple(value)

    def test_drops_private_bags_and_only_uses_public_period_evidence(self):
        rows = copy.deepcopy(SNAPSHOT['properties'])
        rows[0]['transaction_type'] = 'Location'
        rows[0]['attributes'].update({'tour': {'review': 'private'}, 'meuble_commission': {'ownerMonth': 1},
                                     'pricing': {'night': rows[0]['price'], 'month': 2}})
        snapshot, facts, report = extract_fixture(capture(rows))
        self.assertNotIn('tour', snapshot['properties'][0]['attributes'])
        self.assertNotIn('ownerMonth', json.dumps(facts))
        self.assertEqual(facts['listings'][0]['rentalPeriod'], 'night')
        self.assertEqual(report['droppedAttributeKeysAndCounts']['meuble_commission'], 1)
        rows[0]['attributes']['pricing']['month'] = rows[0]['price']
        self.assertIsNone(extract_fixture(capture(rows))[1]['listings'][0]['rentalPeriod'])

    def test_rejects_incomplete_duplicate_and_unsafe_catalogues(self):
        with self.assertRaisesRegex(ValueError, 'incomplete'):
            extract_fixture(capture(SNAPSHOT['properties'][:-1]))
        rows = copy.deepcopy(SNAPSHOT['properties']); rows[1]['id'] = rows[0]['id']
        with self.assertRaisesRegex(ValueError, 'duplicate id'):
            extract_fixture(capture(rows))
        rows = copy.deepcopy(SNAPSHOT['properties']); rows[0]['reference'] = '../../admin'
        with self.assertRaisesRegex(ValueError, 'unsafe reference'):
            extract_fixture(capture(rows))
        rows = copy.deepcopy(SNAPSHOT['properties']); rows[0]['images'] = ['javascript:alert(1)']
        with self.assertRaisesRegex(ValueError, 'unapproved public media'):
            extract_fixture(capture(rows))


if __name__ == '__main__':
    unittest.main()
