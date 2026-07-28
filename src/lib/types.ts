export interface Demo {
  id: number;
  name: string;
  description: string;
  short_description: string;
  thumbnail_stage_path: string | null;
  thumbnail_url?: string;
  entry_url: string | null;
  demo_type: "SPCS" | "STREAMLIT";
  topics: string[];
  capabilities: string[];
  click_script_stage_path: string | null;
  video_url: string | null;
  status: "PUBLISHED" | "DRAFT" | "DISABLED";
  sort_order: number;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  internal_host: string | null;
  proxy_path: string | null;
  idle_timeout_minutes: number;
  service_name: string | null;
  compute_pool: string | null;
  schedule_start: string | null;
  schedule_stop: string | null;
  schedule_days: string | null;
  schedule_timezone: string | null;
  auto_resume_enabled: boolean;
  service_status?: string;
}

export interface DemoSession {
  demo_id: number;
  locked_by: string;
  locked_at: string;
  last_activity: string;
}

export const DEFAULT_TOPICS = [
  "Predictive Maintenance",
  "Quality Control",
  "Supply Chain Optimization",
  "Production Planning",
  "Asset Management",
  "Energy & Sustainability",
  "Digital Twin",
  "Warehouse & Logistics",
];

export const DEFAULT_CAPABILITIES = [
  "Cortex AI",
  "Cortex Agents",
  "Snowpark",
  "Streamlit",
  "SPCS",
  "Dynamic Tables",
  "Notebooks",
  "Iceberg",
  "Data Sharing",
  "Snowpipe Streaming",
  "ML/Model Registry",
  "Document AI",
  "Geospatial",
  "Time Series",
];
