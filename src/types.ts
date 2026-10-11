export type UserRole = 'ADMIN' | 'CLIENT';

export type DiscoverySource = 'Serper' | 'DataForSEO' | 'Both';

export type ErrorSource = 'Serper.dev' | 'DataForSEO' | 'App';

export type ListingMatchStatus = 'Confirmed' | 'Strong Possible' | 'Possible';

export type ChecklistMatchStatus = ListingMatchStatus | 'Not Found';

export type ListingBadge = 'Mentioned in a list' | 'Mentioned (address only)';

export type RejectionReason =
  | 'generic name only'
  | 'city-only address'
  | 'search page'
  | 'no signals';

export interface AuthUser {
  id: number;
  userId: string;
  role: UserRole;
  name: string;
  company: string;
  email: string;
  phone: string;
  dailyLimit: number;
  monthlyLimit: number;
  active: boolean;
}

export type ListingType =
  | 'Business Profile'
  | 'Review Page'
  | 'Category Page'
  | 'Social Profile'
  | 'Channel'
  | 'Video'
  | 'Blog Post'
  | 'Forum Thread'
  | 'Classified Ad'
  | 'Press Release'
  | 'Map Listing'
  | 'Wiki'
  | 'Mention Only'
  | 'Other';

export type MatchedSignal = 'Name' | 'Phone' | 'Address' | 'Website' | 'URL_SLUG' | 'CITY';

export interface NapDiscrepancy {
  field: 'Name' | 'Phone' | 'Address';
  found: string;
  expected: string;
  detail: string;
}

export interface SiteChecklistItem {
  siteId: number;
  siteName: string;
  searchDomain: string;
  group: string;
  createUrl: string;
  status: ChecklistMatchStatus;
  badge?: ListingBadge;
  source: DiscoverySource | '-';
  listingUrl: string;
  listingTitle: string;
  listingType: ListingType | '-';
  matchedSignals: MatchedSignal[];
  matchScore: number;
  why: string;
  foundName: string;
  foundPhone: string;
  foundAddress: string;
  snippet: string;
  napMismatch: boolean;
  napDiscrepancies: NapDiscrepancy[];
  deepVerified: boolean;
}

export interface OpenWebItem {
  domain: string;
  url: string;
  title: string;
  snippet: string;
  status: ListingMatchStatus;
  badge?: ListingBadge;
  source: DiscoverySource;
  listingType: ListingType;
  matchedSignals: MatchedSignal[];
  matchScore: number;
  why: string;
  foundName: string;
  foundPhone: string;
  foundAddress: string;
  napMismatch: boolean;
  napDiscrepancies: NapDiscrepancy[];
  deepVerified: boolean;
}

export interface NapIssueItem {
  sourceName: string;
  domain: string;
  url: string;
  status: 'Confirmed';
  source?: DiscoverySource;
  listingType: ListingType;
  matchedSignals: MatchedSignal[];
  matchScore?: number;
  why?: string;
  foundName: string;
  expectedName: string;
  foundPhone: string;
  expectedPhone: string;
  foundAddress: string;
  expectedAddress: string;
  discrepancies: NapDiscrepancy[];
}

export interface OwnPropertyItem {
  propertyType: 'Official Website' | 'Google Business Profile' | 'Subdomain / Brand Property';
  domain: string;
  url: string;
  title: string;
  snippet: string;
  source?: DiscoverySource;
}

export interface RejectedResultItem {
  url: string;
  domain: string;
  title: string;
  snippet: string;
  source: DiscoverySource;
  rejectionReason: RejectionReason;
  why: string;
  matchScore: number;
  isNonListingPage?: boolean;
}

export interface BenchmarkUrlItem {
  inputUrl: string;
  normalizedUrl: string;
  domain: string;
  outcome: 'Found' | 'Rejected' | 'Missed';
  status?: ListingMatchStatus | 'Rejected' | 'Not Returned';
  matchedUrl?: string;
  locationTab?: 'Site Checklist' | 'Other Sites Found' | 'Own Properties' | 'Debug (Rejected)' | '-';
  matchScore?: number;
  rejectionReason?: RejectionReason | string;
  why?: string;
}

export interface BenchmarkReport {
  totalKnown: number;
  foundCount: number;
  rejectedCount: number;
  missedCount: number;
  recallPercent: number;
  items: BenchmarkUrlItem[];
}

export interface ProviderWarningItem {
  source: ErrorSource;
  message: string;
  adminHint?: string;
}

export interface RawQueryLogItem {
  provider?: 'Serper.dev' | 'DataForSEO';
  phase: string;
  query: string;
  page: number;
  httpStatus?: number;
  resultsCount: number;
  creditsUsed?: number;
  location?: string;
  gl?: string;
  hl?: string;
  error?: string;
  errorSource?: ErrorSource;
  organic: Array<{
    title: string;
    link: string;
    snippet: string;
    position?: number;
  }>;
}

export interface SearchExecutionResult {
  summary: {
    sitesChecked: number;
    confirmedCount: number;
    strongPossibleCount?: number;
    possibleCount: number;
    notFoundCount: number;
    otherSitesCount: number;
    napIssuesCount: number;
    ownPropertiesCount: number;
    rejectedCount?: number;
    serperCallsUsed: number;
    dataForSeoCallsUsed: number;
    cached: boolean;
    durationMs: number;
    locationUsed?: string;
    glUsed?: string;
    hlUsed?: string;
    distinctiveTokens?: string[];
    warningMessage?: string;
    clientWarningMessage?: string;
    providerWarnings?: ProviderWarningItem[];
  };
  siteChecklist: SiteChecklistItem[];
  otherSitesFound: OpenWebItem[];
  napIssues: NapIssueItem[];
  ownProperties: OwnPropertyItem[];
  rawResults?: RawQueryLogItem[];
  rejectedResults?: RejectedResultItem[];
  benchmarkReport?: BenchmarkReport;
}

export interface SearchRecord {
  id: number;
  clientId?: number;
  clientName?: string;
  clientUserId?: string;
  clientCompany?: string;
  businessName: string;
  alternateNames?: string[];
  website: string;
  gbpUrl?: string;
  address: string;
  city: string;
  country: string;
  phones: string[];
  industry?: string;
  scanMode: 'quick' | 'full';
  deepVerify: boolean;
  serperCallsUsed: number;
  dataForSeoCallsUsed?: number;
  confirmedCount: number;
  possibleCount: number;
  notFoundCount: number;
  napIssuesCount: number;
  durationMs: number;
  status: 'running' | 'completed' | 'cached' | 'failed';
  progressPercent?: number;
  progressMessage?: string;
  errorMessage?: string;
  errorSource?: ErrorSource;
  createdAt: string;
  completedAt?: string | null;
  results?: SearchExecutionResult | null;
}

export interface ClientAccount {
  id: number;
  userId: string;
  name: string;
  company: string;
  email: string;
  phone: string;
  dailyLimit: number;
  monthlyLimit: number;
  active: boolean;
  createdAt: string;
  lastLogin: string | null;
  totalSearches: number;
  searchesToday: number;
  searchesThisMonth: number;
  creditsUsed: number;
  dataForSeoCallsUsed?: number;
}

export interface RegistrySite {
  id: number;
  name: string;
  searchDomain: string;
  group: string;
  createUrl: string;
  enabled: boolean;
  createdAt: string;
}

export interface AdminSettingsData {
  defaultCountry: string;
  defaultLanguage: string;
  timezone: string;
  defaultScanMode: 'quick' | 'full';
  pagesPerQuery: number;
  maxCallsPerSearch: number;
  serperEnabled: boolean;
  serperKeyConfigured: boolean;
  serperKeySource: 'db' | 'env' | 'none';
  serperKeyMasked: string;
  totalCreditsUsed: number;
  creditsUsedToday: number;
  useDataForSeoBacklinks: boolean;
  dataForSeoConfigured: boolean;
  dataForSeoSource: 'db' | 'env' | 'none';
  dataForSeoLoginMasked: string;
  dataForSeoPasswordMasked: string;
  totalDataForSeoCallsUsed: number;
  dataForSeoCallsToday: number;
}

export interface DashboardData {
  cards: {
    totalClients: number;
    activeClients: number;
    searchesToday: number;
    searchesThisWeek: number;
    searchesThisMonth: number;
    totalSerperCredits: number;
    creditsToday: number;
    totalDataForSeoCalls: number;
    dataForSeoCallsToday: number;
  };
  searchesPerDay: Array<{ date: string; count: number; credits: number; dataForSeoCalls?: number }>;
  searchesByHour: Array<{ hour: number; label: string; count: number }>;
  topClients: Array<{
    id: number;
    userId: string;
    name: string;
    company: string;
    active: boolean;
    lastLogin: string | null;
    totalSearches: number;
    searchesToday: number;
    creditsUsed: number;
    dataForSeoCallsUsed: number;
  }>;
  recentActivity: Array<{
    id: number;
    clientName: string;
    clientUserId: string;
    clientRole: string;
    businessName: string;
    city: string;
    scanMode: string;
    confirmedCount: number;
    possibleCount: number;
    serperCallsUsed: number;
    dataForSeoCallsUsed: number;
    status: string;
    createdAt: string;
  }>;
}
