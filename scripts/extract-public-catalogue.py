#!/usr/bin/env python3
"""Reproduce the approved public capture locally. No HTTP, DB or JS execution.

The tuple decoder follows Astro 4.16.19 runtime/server/{serialize,astro-island}.js.
Only Value (0) and Array (1) occur in this capture; every other tag is rejected.
Raw HTML stays outside the repository: it contains unprojected legacy metadata.
"""
import argparse
import hashlib
import json
import math
import re
from collections import Counter
from datetime import datetime
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import quote, urlsplit

SOURCE_SHA256 = '700e106adaf9d1cbcd466c551bda83d4873cfd045809678bf9c4579e74ce6f38'
SOURCE_URL = 'https://jammimmo.com/biens/'
CAPTURED_AT = '2026-10-31T09:29:04Z'
EXPECTED_COUNT = 97
ATTRIBUTES = {'toilettes', 'salles_de_bain', 'etage', 'niveaux', 'salons', 'cuisine',
              'parking', 'jardin', 'piscine', 'terrasse', 'balcon', 'ascenseur', 'climatisation'}
IMAGE_HOSTS = {'pub-15cb63d8148e4d51807e901562b85914.r2.dev', 'images.unsplash.com'}
FORBIDDEN_KEYS = {'__proto__', 'prototype', 'constructor'}
CONTROL = re.compile(r'[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]')


def require(condition, message):
    if not condition:
        raise ValueError(message)


def pairs(items):
    result = {}
    for key, value in items:
        require(key not in result and key not in FORBIDDEN_KEYS, 'duplicate/dangerous JSON key')
        result[key] = value
    return result


def parse_json(value):
    return json.loads(value, object_pairs_hook=pairs,
                      parse_constant=lambda value: (_ for _ in ()).throw(ValueError('non-finite JSON')))


def decode_tuple(raw, depth=0, budget=None):
    if budget is None:
        budget = [20000]
    budget[0] -= 1
    require(budget[0] >= 0 and depth <= 24, 'Astro tuple budget exceeded')
    require(type(raw) is list and len(raw) == 2 and type(raw[0]) is int, 'malformed Astro tuple')
    tag, value = raw
    require(tag in (0, 1), 'unsupported Astro tag')
    if tag == 1:
        require(type(value) is list and len(value) <= 1000, 'invalid Astro array')
        return [decode_tuple(child, depth + 1, budget) for child in value]
    if type(value) is dict:
        require(len(value) <= 200, 'Astro object too large')
        return {key: decode_tuple(child, depth + 1, budget) for key, child in value.items()}
    require(value is None or type(value) in (str, bool, int, float), 'invalid Astro value')
    require(type(value) not in (int, float) or math.isfinite(value), 'invalid Astro number')
    return value


class CaptureParser(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.islands, self.json_ld = [], []
        self.script = None

    def handle_starttag(self, tag, attributes):
        attrs = dict(attributes)
        if tag == 'astro-island' and '/ListingsView.' in (attrs.get('component-url') or ''):
            require(len(attrs) == len(attributes), 'duplicate island attribute')
            self.islands.append(attrs)
        if tag == 'script' and attrs.get('type') == 'application/ld+json':
            require(self.script is None, 'nested JSON-LD script')
            self.script = ''

    def handle_data(self, value):
        if self.script is not None:
            self.script += value

    def handle_endtag(self, tag):
        if tag == 'script' and self.script is not None:
            self.json_ld.append(parse_json(self.script))
            self.script = None


def string(value, maximum, empty=True):
    require(type(value) is str and len(value) <= maximum and not CONTROL.search(value), 'invalid text')
    require(empty or bool(value.strip()), 'empty required text')
    return value


def number(value, maximum):
    require(type(value) in (int, float) and math.isfinite(value) and 0 <= value <= maximum, 'invalid number')
    return value


def date(value, nullable=False):
    if value is None and nullable:
        return value
    string(value, 50, False)
    require('T' in value and re.search(r'(?:Z|[+-]\d\d:\d\d)$', value), 'date lacks timezone')
    datetime.fromisoformat(value.replace('Z', '+00:00'))
    return value


def urls(value, hosts, maximum):
    require(type(value) is list and len(value) <= maximum, 'invalid URL array')
    result = []
    for item in value:
        string(item, 2000, False)
        url = urlsplit(item)
        require(url.scheme == 'https' and url.hostname in hosts and not url.username and not url.password
                and url.port in (None, 443), 'unapproved public media URL')
        result.append(item)
    return result


def public_href(reference, captured):
    string(reference, 100, False)
    require(not re.search(r'[/\\?#%\x00-\x1f\x7f]', reference) and reference not in ('.', '..'), 'unsafe reference')
    require(captured == '/biens/' + reference.lower(), 'captured href/reference mismatch')
    # Encode exactly one path segment; historical emoji/space/underscore refs
    # are retained. This validates a path, not an HTTP response for that path.
    return 'https://jammimmo.com/biens/' + quote(reference.lower(), safe='-._~')


def project_property(row):
    require(type(row) is dict, 'invalid property')
    require(re.fullmatch(r'[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}', row.get('id', '')), 'invalid property id')
    require(row.get('status') == 'Disponible', 'capture includes a nonpublic listing status')
    require(row.get('transaction_type') in ('Vente', 'Location', 'Vente & Location'), 'invalid transaction')
    result = {key: string(row.get(key), maximum, key not in ('reference', 'title', 'type')) for key, maximum in {
        'id': 36, 'reference': 100, 'title': 200, 'type': 80, 'transaction_type': 30, 'status': 30,
        'city': 100, 'quartier': 100, 'commercial_message': 4000, 'description': 12000}.items()}
    result['address'] = None if row.get('address') is None else string(row['address'], 500)
    for key, maximum in {'price': 1_000_000_000_000, 'surface': 1_000_000_000, 'bedrooms': 1000}.items():
        result[key] = number(row.get(key), maximum)
    require(type(row.get('negotiable')) is bool, 'invalid negotiable flag')
    result['negotiable'] = row['negotiable']
    geo = row.get('geo')
    if geo is not None:
        require(type(geo) is dict and set(geo) == {'centerLat', 'centerLng', 'radiusM'}, 'invalid public zone')
        require(type(geo['centerLat']) in (int, float) and math.isfinite(geo['centerLat']) and -90 <= geo['centerLat'] <= 90, 'invalid latitude')
        require(type(geo['centerLng']) in (int, float) and math.isfinite(geo['centerLng']) and -180 <= geo['centerLng'] <= 180, 'invalid longitude')
        require(geo['radiusM'] == 500, 'zone is not the existing public 500m zone')
    result['geo'] = geo
    result['images'] = urls(row.get('images'), IMAGE_HOSTS, 100)
    result['video_links'] = urls(row.get('video_links'), {'www.youtube.com', 'youtube.com', 'youtu.be'}, 30)
    require(type(row.get('attributes')) is dict, 'invalid attributes')
    result['attributes'] = {}
    for key in sorted(ATTRIBUTES & row['attributes'].keys()):
        value = row['attributes'][key]
        require(value is None or type(value) in (bool, int, float, str), 'non-scalar visible attribute')
        if type(value) is str:
            string(value, 200)
        if type(value) in (int, float):
            number(value, 1000000)
        result['attributes'][key] = value
    for key in ('commodities', 'tags'):
        require(type(row.get(key)) is list and len(row[key]) <= 100, 'invalid text array')
        result[key] = [string(value, 200) for value in row[key]]
    require(type(row.get('nearby_commerce')) is list and len(row['nearby_commerce']) <= 100, 'invalid nearby commerce')
    result['nearby_commerce'] = []
    for item in row['nearby_commerce']:
        require(type(item) is dict and item.get('distance') in ('100m', '500m', '1km'), 'invalid nearby distance')
        result['nearby_commerce'].append({'name': string(item.get('name'), 200), 'distance': item['distance']})
    # None of the approved capture's document entries is a downloadable URL.
    # Fail if that changes, so a new capture requires explicit projection review.
    documents = row.get('documents')
    require(type(documents) in (dict, list), 'invalid documents')
    if type(documents) is dict:
        require(all(type(value) is str and not urlsplit(value).scheme for value in documents.values()), 'review new document URLs')
    result['documents'] = {}
    require(row.get('flux_passage') in (None, 'F1', 'F2', 'F3', 'F4', 'F5'), 'invalid foot traffic')
    result['flux_passage'] = row.get('flux_passage')
    result['published_at'] = date(row.get('published_at'), True)
    result['updated_at'] = date(row.get('updated_at'))
    return result


def extract_capture(data, expected_sha=SOURCE_SHA256):
    require(0 < len(data) <= 2_000_000, 'invalid capture byte size')
    require(hashlib.sha256(data).hexdigest() == expected_sha, 'capture hash mismatch')
    parser = CaptureParser()
    parser.feed(data.decode('utf-8', errors='strict'))
    parser.close()
    require(len(parser.islands) == 1, 'expected exactly one ListingsView island')
    raw = parse_json(parser.islands[0].get('props', ''))
    require(type(raw) is dict and set(raw) == {'properties', 'cities', 'hrefByRef', 'lang'}, 'unexpected props')
    budget = [20000]
    props = {key: decode_tuple(value, budget=budget) for key, value in raw.items()}
    rows = props['properties']
    require(props['lang'] == 'fr' and type(rows) is list and len(rows) == EXPECTED_COUNT < 200, 'incomplete/unexpected catalogue')
    require(type(props['hrefByRef']) is dict and len(props['hrefByRef']) == len(rows), 'href count mismatch')
    require(len({row.get('id') for row in rows}) == len(rows), 'duplicate id')
    require(len({row.get('reference', '').lower() for row in rows}) == len(rows), 'ambiguous folded reference')
    collections = [value for value in parser.json_ld if type(value) is dict and value.get('@type') == 'CollectionPage']
    require(len(collections) == 1, 'expected one CollectionPage')
    item_list = collections[0].get('mainEntity', {})
    items = item_list.get('itemListElement', [])
    require(item_list.get('numberOfItems') == len(rows) and len(items) == len(rows), 'JSON-LD count mismatch')
    require({item.get('url') for item in items} == {'https://jammimmo.com' + href for href in props['hrefByRef'].values()}, 'JSON-LD href mismatch')
    properties, facts, hrefs = [], [], {}
    dropped = Counter()
    for row in rows:
        prop = project_property(row)
        url = public_href(prop['reference'], props['hrefByRef'].get(prop['reference']))
        hrefs[prop['reference']] = url
        properties.append(prop)
        dropped.update(set(row['attributes']) - ATTRIBUTES)
        pricing = row['attributes'].get('pricing')
        periods = [key for key in ('month', 'night', 'week') if type(pricing) is dict
                   and type(pricing.get(key)) in (int, float) and pricing[key] > 0 and pricing[key] == prop['price']]
        facts.append({**{key: prop[key] for key in ('id', 'reference', 'title', 'type', 'transaction_type', 'city', 'quartier',
                     'price', 'surface', 'bedrooms', 'negotiable', 'description')}, 'url': url,
                      'features': prop['attributes'], 'rentalPeriod': periods[0] if len(periods) == 1 and prop['transaction_type'] == 'Location' else None})
    capture = {'url': SOURCE_URL, 'capturedAt': CAPTURED_AT, 'sha256': expected_sha, 'listingCount': len(rows)}
    snapshot = {'schemaVersion': 1, 'capture': capture, 'properties': properties, 'hrefByRef': hrefs}
    corpus = {'schemaVersion': 1, 'capture': capture, 'listings': facts}
    report = {'schemaVersion': 1, 'capture': capture, 'decoder': 'Astro 4.16.19 Value(0)/Array(1); strict JSON; no eval',
              'coverage': '97 entries below the published limit of 200; same 97 references in the captured JSON-LD. No database or individual detail URL verification.',
              'legacyReferences': [p['reference'] for p in properties if not re.fullmatch(r'[A-Z0-9]+(?:-[A-Z0-9]+)+', p['reference'])],
              'droppedAttributeKeysAndCounts': dict(sorted(dropped.items())),
              'documents': 'All projected to {}: 88 legacy arrays and 9 dictionaries of statuses, no downloadable URL.',
              'retainedAttributeKeys': sorted(ATTRIBUTES),
              'zeroPrice': sum(p['price'] == 0 for p in properties), 'zeroSurface': sum(p['surface'] == 0 for p in properties),
              'publicZoneCount': sum(p['geo'] is not None for p in properties),
              'rentalPeriodEvidence': 'Only a unique positive public pricing.month/night/week value equal to the displayed price establishes a period. No owner price or commission field is retained.',
              'availability': 'Captured status is historical publication metadata, never a live availability guarantee.'}
    return snapshot, corpus, report


def encoded(value):
    return (json.dumps(value, ensure_ascii=False, sort_keys=True, indent=2, allow_nan=False) + '\n').encode('utf-8')


def main():
    args = argparse.ArgumentParser(description=__doc__)
    args.add_argument('--input', required=True, type=Path)
    args.add_argument('--output-dir', type=Path, default=Path(__file__).resolve().parents[1] / 'src' / 'data')
    options = args.parse_args()
    snapshot, facts, report = extract_capture(options.input.read_bytes())
    options.output_dir.mkdir(parents=True, exist_ok=True)
    for name, value in [('public-catalogue-20261031.json', snapshot), ('public-property-facts-20261031.json', facts)]:
        content = encoded(value)
        (options.output_dir / name).write_bytes(content)
        report.setdefault('outputs', {})[name] = {'sha256': hashlib.sha256(content).hexdigest(), 'bytes': len(content)}
    (options.output_dir / 'public-catalogue-20261031.manifest.json').write_bytes(encoded(report))
    print(json.dumps({'count': len(snapshot['properties']), 'outputs': report['outputs']}))


if __name__ == '__main__':
    main()
