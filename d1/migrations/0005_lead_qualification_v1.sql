-- NULL means an unqualified legacy lead. The source UUID is already the PK;
-- qualified initial submissions use their original UUIDv4 without another ledger.
ALTER TABLE leads ADD COLUMN property_reference TEXT CHECK (property_reference IS NULL OR length(property_reference) BETWEEN 3 AND 100);
ALTER TABLE leads ADD COLUMN qualification_json TEXT CHECK (qualification_json IS NULL OR (
  json_valid(qualification_json) AND json_type(qualification_json) IS 'object'
  AND json_type(qualification_json, '$.version') IS 'integer' AND json_extract(qualification_json, '$.version') IS 1
  AND length(CAST(qualification_json AS BLOB)) <= 4096
));
ALTER TABLE leads ADD COLUMN business_fingerprint TEXT CHECK (
  (business_fingerprint IS NULL AND qualification_json IS NULL) OR
  (qualification_json IS NOT NULL AND business_fingerprint IS NOT NULL AND property_id IS NULL
    AND length(business_fingerprint) = 64 AND business_fingerprint NOT GLOB '*[^0-9a-f]*')
);
