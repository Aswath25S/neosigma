export type Ats = "greenhouse" | "lever" | "ashby" | "workable" | "smartrecruiters" | "workday" | "careers" | "manual";

export interface SalaryRange {
  min: number | null;
  max: number | null;
  currency: string | null;
  interval: string | null;
  location: string | null;
  source: "board" | "posting";
}

// One posting as fetched, before dedupe and extraction. Every fetcher returns
// this shape so the rest of the pipeline is source-agnostic.
export interface RawPosting {
  externalId: string;
  ats: Ats;
  companyName: string;
  title: string;
  url: string;
  sourceUrl: string; // the API or page the record was read from
  fetchedAt: string;
  postedAt: string | null;
  locations: string[];
  remote: boolean | null;
  text: string;
  salaries: SalaryRange[];
}

export interface Source {
  company: string;
  domain: string;
  ats: Ats;
  board_token: string;
  segment: Segment;
  employee_band: string;
  size_source_url: string;
}

export type Segment = "agent_native" | "vertical_ai" | "agent_platform" | "enterprise_cx" | "saas_copilot";
