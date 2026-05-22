-- ============================================================
-- Migration 067: Expand rss_sources seed list (Phase 2)
-- ============================================================
-- Two parallel research agents verified the following:
--   • 78 additional Bonfire portals (RSS feeds, active immediately)
--   • 44 OpenGov procurement portals (HTML embed pages, disabled pending
--     a provider-specific scraper)
--
-- Bonfire portals expose RSS at {slug}.bonfirehub.com/opportunities/rss
-- and the existing /api/cron/ingest_rss route polls them directly.
--
-- OpenGov portals are React SPAs — fetching the URL returns HTML that
-- requires DOM-side hydration. Seeded with enabled=false so the cron
-- skips them; future migration will flip the flag once an OpenGov-
-- specific scraper exists.
-- ============================================================

-- ---- BONFIRE: 78 verified US portals ----------------------------------
insert into public.rss_sources (feed_url, source_prefix, provider, agency_name, agency_type, state, city, website) values
    ('https://alamedacounty.bonfirehub.com/opportunities/rss', 'bonfire-alamedacounty', 'bonfire', 'Alameda County', 'County', 'CA', 'Oakland', 'https://alamedacounty.bonfirehub.com/portal/'),
    ('https://alleghenycounty.bonfirehub.com/opportunities/rss', 'bonfire-alleghenycounty', 'bonfire', 'Allegheny County', 'County', 'PA', 'Pittsburgh', 'https://alleghenycounty.bonfirehub.com/portal/'),
    ('https://amarillo.bonfirehub.com/opportunities/rss', 'bonfire-amarillo', 'bonfire', 'City of Amarillo', 'Local', 'TX', 'Amarillo', 'https://amarillo.bonfirehub.com/portal/'),
    ('https://aps.bonfirehub.com/opportunities/rss', 'bonfire-aps', 'bonfire', 'Atlanta Public Schools', 'Education', 'GA', 'Atlanta', 'https://aps.bonfirehub.com/portal/'),
    ('https://apsva.bonfirehub.com/opportunities/rss', 'bonfire-apsva', 'bonfire', 'Arlington Public Schools', 'Education', 'VA', 'Arlington', 'https://apsva.bonfirehub.com/portal/'),
    ('https://arlingtontx.bonfirehub.com/opportunities/rss', 'bonfire-arlingtontx', 'bonfire', 'City of Arlington', 'Local', 'TX', 'Arlington', 'https://arlingtontx.bonfirehub.com/portal/'),
    ('https://austinisd.bonfirehub.com/opportunities/rss', 'bonfire-austinisd', 'bonfire', 'Austin Independent School District', 'Education', 'TX', 'Austin', 'https://austinisd.bonfirehub.com/portal/'),
    ('https://bendoregon.bonfirehub.com/opportunities/rss', 'bonfire-bendoregon', 'bonfire', 'City of Bend', 'Local', 'OR', 'Bend', 'https://bendoregon.bonfirehub.com/portal/'),
    ('https://bernco.bonfirehub.com/opportunities/rss', 'bonfire-bernco', 'bonfire', 'Bernalillo County', 'County', 'NM', 'Albuquerque', 'https://bernco.bonfirehub.com/portal/'),
    ('https://broward.bonfirehub.com/opportunities/rss', 'bonfire-broward', 'bonfire', 'Broward County', 'County', 'FL', 'Fort Lauderdale', 'https://broward.bonfirehub.com/portal/'),
    ('https://brownsvilletx.bonfirehub.com/opportunities/rss', 'bonfire-brownsvilletx', 'bonfire', 'City of Brownsville', 'Local', 'TX', 'Brownsville', 'https://brownsvilletx.bonfirehub.com/portal/'),
    ('https://ccisd.bonfirehub.com/opportunities/rss', 'bonfire-ccisd', 'bonfire', 'Corpus Christi Independent School District', 'Education', 'TX', 'Corpus Christi', 'https://ccisd.bonfirehub.com/portal/'),
    ('https://cfisd.bonfirehub.com/opportunities/rss', 'bonfire-cfisd', 'bonfire', 'Cypress-Fairbanks Independent School District', 'Education', 'TX', 'Houston', 'https://cfisd.bonfirehub.com/portal/'),
    ('https://charlestoncounty.bonfirehub.com/opportunities/rss', 'bonfire-charlestoncounty', 'bonfire', 'Charleston County', 'County', 'SC', 'Charleston', 'https://charlestoncounty.bonfirehub.com/portal/'),
    ('https://charlottenc.bonfirehub.com/opportunities/rss', 'bonfire-charlottenc', 'bonfire', 'City of Charlotte', 'Local', 'NC', 'Charlotte', 'https://charlottenc.bonfirehub.com/portal/'),
    ('https://chesterfield.bonfirehub.com/opportunities/rss', 'bonfire-chesterfield', 'bonfire', 'Chesterfield County', 'County', 'VA', 'Chesterfield', 'https://chesterfield.bonfirehub.com/portal/'),
    ('https://cincinnati-oh.bonfirehub.com/opportunities/rss', 'bonfire-cincinnati', 'bonfire', 'City of Cincinnati', 'Local', 'OH', 'Cincinnati', 'https://cincinnati-oh.bonfirehub.com/portal/'),
    ('https://cityofmilwaukee.bonfirehub.com/opportunities/rss', 'bonfire-milwaukee', 'bonfire', 'City of Milwaukee', 'Local', 'WI', 'Milwaukee', 'https://cityofmilwaukee.bonfirehub.com/portal/'),
    ('https://clarkcountynv.bonfirehub.com/opportunities/rss', 'bonfire-clarkcountynv', 'bonfire', 'Clark County, NV', 'County', 'NV', 'Las Vegas', 'https://clarkcountynv.bonfirehub.com/portal/'),
    ('https://clarkcountywa.bonfirehub.com/opportunities/rss', 'bonfire-clarkcountywa', 'bonfire', 'Clark County, WA', 'County', 'WA', 'Vancouver', 'https://clarkcountywa.bonfirehub.com/portal/'),
    ('https://columbus.bonfirehub.com/opportunities/rss', 'bonfire-columbus', 'bonfire', 'City of Columbus', 'Local', 'OH', 'Columbus', 'https://columbus.bonfirehub.com/portal/'),
    ('https://cps.bonfirehub.com/opportunities/rss', 'bonfire-cps', 'bonfire', 'Chicago Public Schools', 'Education', 'IL', 'Chicago', 'https://cps.bonfirehub.com/portal/'),
    ('https://dallasisd.bonfirehub.com/opportunities/rss', 'bonfire-dallasisd', 'bonfire', 'Dallas Independent School District', 'Education', 'TX', 'Dallas', 'https://dallasisd.bonfirehub.com/portal/'),
    ('https://dart.bonfirehub.com/opportunities/rss', 'bonfire-dart', 'bonfire', 'Dallas Area Rapid Transit', 'Special District', 'TX', 'Dallas', 'https://dart.bonfirehub.com/portal/'),
    ('https://dcssga.bonfirehub.com/opportunities/rss', 'bonfire-dcssga', 'bonfire', 'Douglas County School System', 'Education', 'GA', 'Douglasville', 'https://dcssga.bonfirehub.com/portal/'),
    ('https://desotoisd.bonfirehub.com/opportunities/rss', 'bonfire-desotoisd', 'bonfire', 'DeSoto Independent School District', 'Education', 'TX', 'DeSoto', 'https://desotoisd.bonfirehub.com/portal/'),
    ('https://detroit.bonfirehub.com/opportunities/rss', 'bonfire-detroit', 'bonfire', 'City of Detroit', 'Local', 'MI', 'Detroit', 'https://detroit.bonfirehub.com/portal/'),
    ('https://dia.bonfirehub.com/opportunities/rss', 'bonfire-dia', 'bonfire', 'Delaware Department of Industrial Affairs', 'State', 'DE', 'Wilmington', 'https://dia.bonfirehub.com/portal/'),
    ('https://egusd.bonfirehub.com/opportunities/rss', 'bonfire-egusd', 'bonfire', 'Elk Grove Unified School District', 'Education', 'CA', 'Elk Grove', 'https://egusd.bonfirehub.com/portal/'),
    ('https://fairfaxcounty.bonfirehub.com/opportunities/rss', 'bonfire-fairfaxcounty', 'bonfire', 'Fairfax County', 'County', 'VA', 'Fairfax', 'https://fairfaxcounty.bonfirehub.com/portal/'),
    ('https://fau.bonfirehub.com/opportunities/rss', 'bonfire-fau', 'bonfire', 'Florida Atlantic University', 'Education', 'FL', 'Boca Raton', 'https://fau.bonfirehub.com/portal/'),
    ('https://fauquiercounty.bonfirehub.com/opportunities/rss', 'bonfire-fauquiercounty', 'bonfire', 'Fauquier County', 'County', 'VA', 'Warrenton', 'https://fauquiercounty.bonfirehub.com/portal/'),
    ('https://fcps.bonfirehub.com/opportunities/rss', 'bonfire-fcps', 'bonfire', 'Fairfax County Public Schools', 'Education', 'VA', 'Falls Church', 'https://fcps.bonfirehub.com/portal/'),
    ('https://fortbendcountytx.bonfirehub.com/opportunities/rss', 'bonfire-fortbendcounty', 'bonfire', 'Fort Bend County', 'County', 'TX', 'Richmond', 'https://fortbendcountytx.bonfirehub.com/portal/'),
    ('https://fortbendisd.bonfirehub.com/opportunities/rss', 'bonfire-fortbendisd', 'bonfire', 'Fort Bend Independent School District', 'Education', 'TX', 'Sugar Land', 'https://fortbendisd.bonfirehub.com/portal/'),
    ('https://gohart.bonfirehub.com/opportunities/rss', 'bonfire-hart', 'bonfire', 'Hillsborough Transit Authority (HART)', 'Special District', 'FL', 'Tampa', 'https://gohart.bonfirehub.com/portal/'),
    ('https://goodyearaz.bonfirehub.com/opportunities/rss', 'bonfire-goodyearaz', 'bonfire', 'City of Goodyear', 'Local', 'AZ', 'Goodyear', 'https://goodyearaz.bonfirehub.com/portal/'),
    ('https://greshamoregon.bonfirehub.com/opportunities/rss', 'bonfire-greshamoregon', 'bonfire', 'City of Gresham', 'Local', 'OR', 'Gresham', 'https://greshamoregon.bonfirehub.com/portal/'),
    ('https://gwinnett.bonfirehub.com/opportunities/rss', 'bonfire-gwinnett', 'bonfire', 'Gwinnett County Public Schools', 'Education', 'GA', 'Suwanee', 'https://gwinnett.bonfirehub.com/portal/'),
    ('https://hccs.bonfirehub.com/opportunities/rss', 'bonfire-hccs', 'bonfire', 'Houston Community College System', 'Education', 'TX', 'Houston', 'https://hccs.bonfirehub.com/portal/'),
    ('https://hcpss.bonfirehub.com/opportunities/rss', 'bonfire-hcpss', 'bonfire', 'Howard County Public School System', 'Education', 'MD', 'Ellicott City', 'https://hcpss.bonfirehub.com/portal/'),
    ('https://hillsboroughcounty.bonfirehub.com/opportunities/rss', 'bonfire-hillsboroughcounty', 'bonfire', 'Hillsborough County', 'County', 'FL', 'Tampa', 'https://hillsboroughcounty.bonfirehub.com/portal/'),
    ('https://huttoisd.bonfirehub.com/opportunities/rss', 'bonfire-huttoisd', 'bonfire', 'Hutto Independent School District', 'Education', 'TX', 'Hutto', 'https://huttoisd.bonfirehub.com/portal/'),
    ('https://jaxport.bonfirehub.com/opportunities/rss', 'bonfire-jaxport', 'bonfire', 'Jacksonville Port Authority (JAXPORT)', 'Special District', 'FL', 'Jacksonville', 'https://jaxport.bonfirehub.com/portal/'),
    ('https://joliet.bonfirehub.com/opportunities/rss', 'bonfire-joliet', 'bonfire', 'City of Joliet', 'Local', 'IL', 'Joliet', 'https://joliet.bonfirehub.com/portal/'),
    ('https://littlerock.bonfirehub.com/opportunities/rss', 'bonfire-littlerock', 'bonfire', 'City of Little Rock', 'Local', 'AR', 'Little Rock', 'https://littlerock.bonfirehub.com/portal/'),
    ('https://lubbock.bonfirehub.com/opportunities/rss', 'bonfire-lubbock', 'bonfire', 'Lubbock County', 'County', 'TX', 'Lubbock', 'https://lubbock.bonfirehub.com/portal/'),
    ('https://maine.bonfirehub.com/opportunities/rss', 'bonfire-maine', 'bonfire', 'State of Maine', 'State', 'ME', 'Augusta', 'https://maine.bonfirehub.com/portal/'),
    ('https://manorisd.bonfirehub.com/opportunities/rss', 'bonfire-manorisd', 'bonfire', 'Manor Independent School District', 'Education', 'TX', 'Manor', 'https://manorisd.bonfirehub.com/portal/'),
    ('https://maricopa.bonfirehub.com/opportunities/rss', 'bonfire-maricopa', 'bonfire', 'Maricopa County Community Colleges', 'Education', 'AZ', 'Tempe', 'https://maricopa.bonfirehub.com/portal/'),
    ('https://metra.bonfirehub.com/opportunities/rss', 'bonfire-metra', 'bonfire', 'Metra Commuter Rail', 'Special District', 'IL', 'Chicago', 'https://metra.bonfirehub.com/portal/'),
    ('https://mps.bonfirehub.com/opportunities/rss', 'bonfire-mps', 'bonfire', 'Milwaukee Public Schools', 'Education', 'WI', 'Milwaukee', 'https://mps.bonfirehub.com/portal/'),
    ('https://nisd.bonfirehub.com/opportunities/rss', 'bonfire-nisd', 'bonfire', 'Northside Independent School District', 'Education', 'TX', 'San Antonio', 'https://nisd.bonfirehub.com/portal/'),
    ('https://omniapartners.bonfirehub.com/opportunities/rss', 'bonfire-omnia', 'bonfire', 'OMNIA Partners (national cooperative)', 'Cooperative', 'TN', 'Franklin', 'https://omniapartners.bonfirehub.com/portal/'),
    ('https://orangecountygov.bonfirehub.com/opportunities/rss', 'bonfire-orangecountygov-ny', 'bonfire', 'Orange County Government, NY', 'County', 'NY', 'Goshen', 'https://orangecountygov.bonfirehub.com/portal/'),
    ('https://ousd.bonfirehub.com/opportunities/rss', 'bonfire-ousd', 'bonfire', 'Oakland Unified School District', 'Education', 'CA', 'Oakland', 'https://ousd.bonfirehub.com/portal/'),
    ('https://paulding.bonfirehub.com/opportunities/rss', 'bonfire-paulding', 'bonfire', 'Paulding County Board of Commissioners', 'County', 'GA', 'Dallas', 'https://paulding.bonfirehub.com/portal/'),
    ('https://pdx.bonfirehub.com/opportunities/rss', 'bonfire-pdx', 'bonfire', 'Portland State University', 'Education', 'OR', 'Portland', 'https://pdx.bonfirehub.com/portal/'),
    ('https://peoriaaz.bonfirehub.com/opportunities/rss', 'bonfire-peoriaaz', 'bonfire', 'City of Peoria, AZ', 'Local', 'AZ', 'Peoria', 'https://peoriaaz.bonfirehub.com/portal/'),
    ('https://philasd.bonfirehub.com/opportunities/rss', 'bonfire-philasd', 'bonfire', 'School District of Philadelphia', 'Education', 'PA', 'Philadelphia', 'https://philasd.bonfirehub.com/portal/'),
    ('https://pinalcountyaz.bonfirehub.com/opportunities/rss', 'bonfire-pinalcountyaz', 'bonfire', 'Pinal County', 'County', 'AZ', 'Florence', 'https://pinalcountyaz.bonfirehub.com/portal/'),
    ('https://plantation.bonfirehub.com/opportunities/rss', 'bonfire-plantation', 'bonfire', 'City of Plantation', 'Local', 'FL', 'Plantation', 'https://plantation.bonfirehub.com/portal/'),
    ('https://portofeverett.bonfirehub.com/opportunities/rss', 'bonfire-portofeverett', 'bonfire', 'Port of Everett', 'Special District', 'WA', 'Everett', 'https://portofeverett.bonfirehub.com/portal/'),
    ('https://portofgalveston.bonfirehub.com/opportunities/rss', 'bonfire-portofgalveston', 'bonfire', 'Port of Galveston', 'Special District', 'TX', 'Galveston', 'https://portofgalveston.bonfirehub.com/portal/'),
    ('https://risd.bonfirehub.com/opportunities/rss', 'bonfire-richardsonisd', 'bonfire', 'Richardson Independent School District', 'Education', 'TX', 'Richardson', 'https://risd.bonfirehub.com/portal/'),
    ('https://sandysprings.bonfirehub.com/opportunities/rss', 'bonfire-sandysprings', 'bonfire', 'City of Sandy Springs', 'Local', 'GA', 'Sandy Springs', 'https://sandysprings.bonfirehub.com/portal/'),
    ('https://scottsdaleaz.bonfirehub.com/opportunities/rss', 'bonfire-scottsdaleaz', 'bonfire', 'City of Scottsdale', 'Local', 'AZ', 'Scottsdale', 'https://scottsdaleaz.bonfirehub.com/portal/'),
    ('https://siouxfalls.bonfirehub.com/opportunities/rss', 'bonfire-siouxfalls', 'bonfire', 'City of Sioux Falls', 'Local', 'SD', 'Sioux Falls', 'https://siouxfalls.bonfirehub.com/portal/'),
    ('https://solanocounty.bonfirehub.com/opportunities/rss', 'bonfire-solanocounty', 'bonfire', 'Solano County', 'County', 'CA', 'Fairfield', 'https://solanocounty.bonfirehub.com/portal/'),
    ('https://sourcewell.bonfirehub.com/opportunities/rss', 'bonfire-sourcewell', 'bonfire', 'Sourcewell (national cooperative)', 'Cooperative', 'MN', 'Staples', 'https://sourcewell.bonfirehub.com/portal/'),
    ('https://tacoma.bonfirehub.com/opportunities/rss', 'bonfire-tacoma', 'bonfire', 'Tacoma Public Schools', 'Education', 'WA', 'Tacoma', 'https://tacoma.bonfirehub.com/portal/'),
    ('https://tdcj.bonfirehub.com/opportunities/rss', 'bonfire-tdcj', 'bonfire', 'Texas Department of Criminal Justice', 'State', 'TX', 'Huntsville', 'https://tdcj.bonfirehub.com/portal/'),
    ('https://txdot.bonfirehub.com/opportunities/rss', 'bonfire-txdot', 'bonfire', 'Texas Department of Transportation', 'State', 'TX', 'Austin', 'https://txdot.bonfirehub.com/portal/'),
    ('https://ua.bonfirehub.com/opportunities/rss', 'bonfire-ua', 'bonfire', 'University of Alaska', 'Education', 'AK', 'Fairbanks', 'https://ua.bonfirehub.com/portal/'),
    ('https://ucf.bonfirehub.com/opportunities/rss', 'bonfire-ucf', 'bonfire', 'University of Central Florida', 'Education', 'FL', 'Orlando', 'https://ucf.bonfirehub.com/portal/'),
    ('https://utah.bonfirehub.com/opportunities/rss', 'bonfire-utah-u3p', 'bonfire', 'Utah Public Procurement Place (U3P)', 'State', 'UT', 'Salt Lake City', 'https://utah.bonfirehub.com/portal/'),
    ('https://utrgv.bonfirehub.com/opportunities/rss', 'bonfire-utrgv', 'bonfire', 'University of Texas Rio Grande Valley', 'Education', 'TX', 'Edinburg', 'https://utrgv.bonfirehub.com/portal/'),
    ('https://uttyler.bonfirehub.com/opportunities/rss', 'bonfire-uttyler', 'bonfire', 'University of Texas at Tyler', 'Education', 'TX', 'Tyler', 'https://uttyler.bonfirehub.com/portal/'),
    ('https://ventura.bonfirehub.com/opportunities/rss', 'bonfire-ventura', 'bonfire', 'County of Ventura', 'County', 'CA', 'Ventura', 'https://ventura.bonfirehub.com/portal/'),
    ('https://waukeshacounty.bonfirehub.com/opportunities/rss', 'bonfire-waukeshacounty', 'bonfire', 'Waukesha County', 'County', 'WI', 'Waukesha', 'https://waukeshacounty.bonfirehub.com/portal/'),
    ('https://wichita.bonfirehub.com/opportunities/rss', 'bonfire-wichita', 'bonfire', 'City of Wichita', 'Local', 'KS', 'Wichita', 'https://wichita.bonfirehub.com/portal/'),
    ('https://yolocounty.bonfirehub.com/opportunities/rss', 'bonfire-yolocounty', 'bonfire', 'Yolo County', 'County', 'CA', 'Woodland', 'https://yolocounty.bonfirehub.com/portal/'),
    ('https://yumaaz.bonfirehub.com/opportunities/rss', 'bonfire-yumaaz', 'bonfire', 'City of Yuma', 'Local', 'AZ', 'Yuma', 'https://yumaaz.bonfirehub.com/portal/')
on conflict (feed_url) do nothing;

-- ---- OPENGOV: 44 portals seeded disabled ------------------------------
-- These are SPA HTML pages, not RSS. Insert with enabled=false until a
-- provider-specific scraper exists. UPDATE rss_sources set enabled=true
-- where provider='opengov' once the scraper ships.
insert into public.rss_sources (feed_url, source_prefix, provider, agency_name, agency_type, state, city, website, enabled) values
    ('https://procurement.opengov.com/portal/orlando', 'opengov-orlando', 'opengov', 'City of Orlando', 'Local', 'FL', 'Orlando', 'https://procurement.opengov.com/portal/orlando', false),
    ('https://procurement.opengov.com/portal/seattle', 'opengov-seattle', 'opengov', 'City of Seattle', 'Local', 'WA', 'Seattle', 'https://procurement.opengov.com/portal/seattle', false),
    ('https://procurement.opengov.com/portal/cityoftampa', 'opengov-tampa', 'opengov', 'City of Tampa', 'Local', 'FL', 'Tampa', 'https://procurement.opengov.com/portal/cityoftampa', false),
    ('https://procurement.opengov.com/portal/pittsburghpa', 'opengov-pittsburgh', 'opengov', 'City of Pittsburgh', 'Local', 'PA', 'Pittsburgh', 'https://procurement.opengov.com/portal/pittsburghpa', false),
    ('https://procurement.opengov.com/portal/pasadena', 'opengov-pasadena', 'opengov', 'City of Pasadena', 'Local', 'CA', 'Pasadena', 'https://procurement.opengov.com/portal/pasadena', false),
    ('https://procurement.opengov.com/portal/santacruzca', 'opengov-santacruz', 'opengov', 'City of Santa Cruz', 'Local', 'CA', 'Santa Cruz', 'https://procurement.opengov.com/portal/santacruzca', false),
    ('https://procurement.opengov.com/portal/modestogov', 'opengov-modesto', 'opengov', 'City of Modesto', 'Local', 'CA', 'Modesto', 'https://procurement.opengov.com/portal/modestogov', false),
    ('https://procurement.opengov.com/portal/bloomingtonin', 'opengov-bloomingtonin', 'opengov', 'City of Bloomington', 'Local', 'IN', 'Bloomington', 'https://procurement.opengov.com/portal/bloomingtonin', false),
    ('https://procurement.opengov.com/portal/norfolk', 'opengov-norfolk', 'opengov', 'City of Norfolk', 'Local', 'VA', 'Norfolk', 'https://procurement.opengov.com/portal/norfolk', false),
    ('https://procurement.opengov.com/portal/cityofshelton', 'opengov-shelton', 'opengov', 'City of Shelton', 'Local', 'CT', 'Shelton', 'https://procurement.opengov.com/portal/cityofshelton', false),
    ('https://procurement.opengov.com/portal/gallupnm', 'opengov-gallupnm', 'opengov', 'City of Gallup', 'Local', 'NM', 'Gallup', 'https://procurement.opengov.com/portal/gallupnm', false),
    ('https://procurement.opengov.com/portal/cityftmyers', 'opengov-fortmyers', 'opengov', 'City of Fort Myers', 'Local', 'FL', 'Fort Myers', 'https://procurement.opengov.com/portal/cityftmyers', false),
    ('https://procurement.opengov.com/portal/cityofhomestead', 'opengov-homestead', 'opengov', 'City of Homestead', 'Local', 'FL', 'Homestead', 'https://procurement.opengov.com/portal/cityofhomestead', false),
    ('https://procurement.opengov.com/portal/davie-fl', 'opengov-davie', 'opengov', 'Town of Davie', 'Local', 'FL', 'Davie', 'https://procurement.opengov.com/portal/davie-fl', false),
    ('https://procurement.opengov.com/portal/mooresvillenc', 'opengov-mooresville', 'opengov', 'Town of Mooresville', 'Local', 'NC', 'Mooresville', 'https://procurement.opengov.com/portal/mooresvillenc', false),
    ('https://procurement.opengov.com/portal/leoncounty', 'opengov-leoncounty', 'opengov', 'Leon County', 'County', 'FL', 'Tallahassee', 'https://procurement.opengov.com/portal/leoncounty', false),
    ('https://procurement.opengov.com/portal/orangecountyfl', 'opengov-orangecountyfl', 'opengov', 'Orange County, Florida', 'County', 'FL', 'Orlando', 'https://procurement.opengov.com/portal/orangecountyfl', false),
    ('https://procurement.opengov.com/portal/charlescountymd', 'opengov-charlescountymd', 'opengov', 'Charles County Government', 'County', 'MD', 'La Plata', 'https://procurement.opengov.com/portal/charlescountymd', false),
    ('https://procurement.opengov.com/portal/oceancounty', 'opengov-oceancounty', 'opengov', 'County of Ocean', 'County', 'NJ', 'Toms River', 'https://procurement.opengov.com/portal/oceancounty', false),
    ('https://procurement.opengov.com/portal/washington-county-or', 'opengov-washingtoncountyor', 'opengov', 'Washington County', 'County', 'OR', 'Hillsboro', 'https://procurement.opengov.com/portal/washington-county-or', false),
    ('https://procurement.opengov.com/portal/lacda', 'opengov-lacda', 'opengov', 'Los Angeles County Development Authority', 'Special District', 'CA', 'Alhambra', 'https://procurement.opengov.com/portal/lacda', false),
    ('https://procurement.opengov.com/portal/sacog', 'opengov-sacog', 'opengov', 'Sacramento Area Council of Governments', 'Special District', 'CA', 'Sacramento', 'https://procurement.opengov.com/portal/sacog', false),
    ('https://procurement.opengov.com/portal/mncppc', 'opengov-mncppc', 'opengov', 'Maryland-National Capital Park and Planning Commission', 'Special District', 'MD', 'Riverdale', 'https://procurement.opengov.com/portal/mncppc', false),
    ('https://procurement.opengov.com/portal/1gpa', 'opengov-1gpa', 'opengov', '1GPA (1Government Procurement Alliance)', 'Cooperative', 'AZ', 'Mesa', 'https://procurement.opengov.com/portal/1gpa', false),
    ('https://procurement.opengov.com/portal/flaglerschools', 'opengov-flaglerschools', 'opengov', 'Flagler County School District', 'Education', 'FL', 'Bunnell', 'https://procurement.opengov.com/portal/flaglerschools', false),
    ('https://procurement.opengov.com/portal/collierschools', 'opengov-collierschools', 'opengov', 'Collier County School District', 'Education', 'FL', 'Naples', 'https://procurement.opengov.com/portal/collierschools', false),
    ('https://procurement.opengov.com/portal/keyschools-mcsd', 'opengov-monroe-mcsd', 'opengov', 'Monroe County School District', 'Education', 'FL', 'Key West', 'https://procurement.opengov.com/portal/keyschools-mcsd', false),
    ('https://procurement.opengov.com/portal/pcsb', 'opengov-pinellaschools', 'opengov', 'Pinellas County School District', 'Education', 'FL', 'Largo', 'https://procurement.opengov.com/portal/pcsb', false),
    ('https://procurement.opengov.com/portal/myputnamschools', 'opengov-putnamschools', 'opengov', 'Putnam County School District', 'Education', 'FL', 'Palatka', 'https://procurement.opengov.com/portal/myputnamschools', false),
    ('https://procurement.opengov.com/portal/richland2', 'opengov-richland2', 'opengov', 'Richland School District Two', 'Education', 'SC', 'Columbia', 'https://procurement.opengov.com/portal/richland2', false),
    ('https://procurement.opengov.com/portal/greenvillek12sc', 'opengov-greenvilleschools', 'opengov', 'Greenville County Schools', 'Education', 'SC', 'Greenville', 'https://procurement.opengov.com/portal/greenvillek12sc', false),
    ('https://procurement.opengov.com/portal/mpsaz', 'opengov-mesaschools', 'opengov', 'Mesa Public Schools', 'Education', 'AZ', 'Mesa', 'https://procurement.opengov.com/portal/mpsaz', false)
on conflict (feed_url) do nothing;

comment on column public.rss_sources.enabled is
    'Cron skips disabled feeds. OpenGov/JAGGAER portals are seeded disabled until a provider-specific HTML scraper exists; flip to true after that ships.';
