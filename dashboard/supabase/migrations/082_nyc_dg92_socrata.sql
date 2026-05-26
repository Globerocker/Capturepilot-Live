-- Add NYC City Record Online (dg92-zbpx) as a Socrata source.
--
-- Per docs/source-analysis/NYC.md: dg92-zbpx is the superset of the narrow
-- tf3b-tk9r dataset we already poll. 103,710 records vs ~3,366; back to 2011.
-- The dataset mixes procurement, personnel changes, public notices, and more
-- in one table — the section_name field discriminates. We pull only
-- "Procurement" rows via the extra_where field_map clause (new in the
-- ingest_socrata client).

insert into socrata_sources (
    portal_host, dataset_id, source_prefix, agency_name, state, city,
    jurisdiction_level, jurisdiction_code, website, field_map, notes
) values (
    'data.cityofnewyork.us', 'dg92-zbpx',
    'socrata-nyc-crol',
    'City of New York (City Record Online)', 'NY', 'New York', 'city', 'NYC',
    'https://data.cityofnewyork.us/d/dg92-zbpx',
    '{
      "title": "short_title",
      "description": "additional_description_1",
      "agency": "agency_name",
      "posted_date": "start_date",
      "response_deadline": "end_date",
      "key_field": "request_id",
      "notice_type_value": "type_of_notice_description",
      "psc_or_category": "category_description",
      "contact_name": "contact_name",
      "contact_phone": "contact_phone",
      "contact_email": "email",
      "extra_where": "section_name=''Procurement''"
    }'::jsonb,
    'NYC City Record Online — procurement subsection only. 103k historical + ongoing daily. Section filter applied via extra_where field-map clause.'
)
on conflict (source_prefix) do nothing;
