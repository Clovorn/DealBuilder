/**
 * 50 US states + DC. Hardcoded because:
 *   - This set effectively never changes
 *   - No round-trip to the DB on every form open
 *   - Avoids polluting the lookup_lists table with 51 rows of static data
 *
 * If at any point Ronnoco needs to support Canadian provinces or territories,
 * we'd extend this file — not migrate to a DB list.
 */
export const US_STATES = [
  ['AL', 'Alabama'],        ['AK', 'Alaska'],         ['AZ', 'Arizona'],        ['AR', 'Arkansas'],
  ['CA', 'California'],     ['CO', 'Colorado'],       ['CT', 'Connecticut'],    ['DE', 'Delaware'],
  ['DC', 'District of Columbia'],
  ['FL', 'Florida'],        ['GA', 'Georgia'],        ['HI', 'Hawaii'],         ['ID', 'Idaho'],
  ['IL', 'Illinois'],       ['IN', 'Indiana'],        ['IA', 'Iowa'],           ['KS', 'Kansas'],
  ['KY', 'Kentucky'],       ['LA', 'Louisiana'],      ['ME', 'Maine'],          ['MD', 'Maryland'],
  ['MA', 'Massachusetts'],  ['MI', 'Michigan'],       ['MN', 'Minnesota'],      ['MS', 'Mississippi'],
  ['MO', 'Missouri'],       ['MT', 'Montana'],        ['NE', 'Nebraska'],       ['NV', 'Nevada'],
  ['NH', 'New Hampshire'],  ['NJ', 'New Jersey'],     ['NM', 'New Mexico'],     ['NY', 'New York'],
  ['NC', 'North Carolina'], ['ND', 'North Dakota'],   ['OH', 'Ohio'],           ['OK', 'Oklahoma'],
  ['OR', 'Oregon'],         ['PA', 'Pennsylvania'],   ['RI', 'Rhode Island'],   ['SC', 'South Carolina'],
  ['SD', 'South Dakota'],   ['TN', 'Tennessee'],      ['TX', 'Texas'],          ['UT', 'Utah'],
  ['VT', 'Vermont'],        ['VA', 'Virginia'],       ['WA', 'Washington'],     ['WV', 'West Virginia'],
  ['WI', 'Wisconsin'],      ['WY', 'Wyoming'],
];
