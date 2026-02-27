export interface StateInfo {
  fips: string;
  name: string;
  abbreviation: string;
}

// Only states with facility data in the SAWGraph knowledge graph (fiokg)
export const US_STATES: StateInfo[] = [
  { fips: '01', name: 'Alabama', abbreviation: 'AL' },
  { fips: '04', name: 'Arizona', abbreviation: 'AZ' },
  { fips: '05', name: 'Arkansas', abbreviation: 'AR' },
  { fips: '17', name: 'Illinois', abbreviation: 'IL' },
  { fips: '18', name: 'Indiana', abbreviation: 'IN' },
  { fips: '20', name: 'Kansas', abbreviation: 'KS' },
  { fips: '23', name: 'Maine', abbreviation: 'ME' },
  { fips: '25', name: 'Massachusetts', abbreviation: 'MA' },
  { fips: '27', name: 'Minnesota', abbreviation: 'MN' },
  { fips: '33', name: 'New Hampshire', abbreviation: 'NH' },
  { fips: '39', name: 'Ohio', abbreviation: 'OH' },
  { fips: '45', name: 'South Carolina', abbreviation: 'SC' },
  { fips: '50', name: 'Vermont', abbreviation: 'VT' },
];
