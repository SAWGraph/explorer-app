export interface NaicsIndustry {
  code: string;
  label: string;
  groupCode?: string;
  groupLabel?: string;
}

// Fallback NAICS codes if discovery query fails
export const FALLBACK_NAICS: NaicsIndustry[] = [
  { code: '3253', label: 'Pesticide, Fertilizer, and Other Agricultural Chemical Manufacturing', groupCode: '3253', groupLabel: 'Agricultural Chemical Manufacturing' },
  { code: '5622', label: 'Waste Treatment and Disposal', groupCode: '5622', groupLabel: 'Waste Treatment and Disposal' },
  { code: '562212', label: 'Solid Waste Landfill', groupCode: '5622', groupLabel: 'Waste Treatment and Disposal' },
  { code: '562211', label: 'Hazardous Waste Treatment and Disposal', groupCode: '5622', groupLabel: 'Waste Treatment and Disposal' },
  { code: '928110', label: 'National Security', groupCode: '9281', groupLabel: 'National Security and International Affairs' },
  { code: '332812', label: 'Metal Coating, Engraving, and Allied Services to Manufacturers', groupCode: '3328', groupLabel: 'Coating, Engraving, Heat Treating, and Allied Activities' },
  { code: '322121', label: 'Paper (except Newsprint) Mills', groupCode: '3221', groupLabel: 'Pulp, Paper, and Paperboard Mills' },
  { code: '424690', label: 'Other Chemical and Allied Products Merchant Wholesalers', groupCode: '4246', groupLabel: 'Chemical and Allied Products Merchant Wholesalers' },
];

// Short, reader-friendly labels for the 20 NAICS 2-digit sectors. Used only by
// the Analysis Question renderer so multi-sector selections stay terse — the
// dropdowns still display official NAICS labels.
// Sectors that span multiple codes (Manufacturing 31/32/33, Retail Trade 44/45,
// Transportation 48/49) intentionally map to the same short label; the renderer
// dedupes them into a single entry.
export const NAICS_SECTOR_SHORT: Record<string, string> = {
  '11': 'Agriculture',
  '21': 'Mining',
  '22': 'Utilities',
  '23': 'Construction',
  '31': 'Manufacturing',
  '32': 'Manufacturing',
  '33': 'Manufacturing',
  '42': 'Wholesale Trade',
  '44': 'Retail Trade',
  '45': 'Retail Trade',
  '48': 'Transportation',
  '49': 'Transportation',
  '51': 'Information',
  '52': 'Finance & Insurance',
  '53': 'Real Estate',
  '54': 'Professional Services',
  '55': 'Management',
  '56': 'Admin & Waste Services',
  '61': 'Education',
  '62': 'Health Care',
  '71': 'Arts & Entertainment',
  '72': 'Hospitality',
  '81': 'Other Services',
  '92': 'Public Administration',
};
