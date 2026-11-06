export type Waba = { id: string; name: string | null; currency: string | null; timezone_id: string | null; ownership: string | null; connection_id?: number | null };
export type Phone = {
  id: string; waba_id: string; display_phone_number: string | null; phone_digits: string | null;
  verified_name: string | null; quality_rating: string | null; messaging_limit: string | null;
  status: string | null; name_status: string | null; label?: string | null; featured?: boolean | null;
};
export type Template = {
  id: string; waba_id: string; name: string; language: string | null; category: string | null;
  status: string | null; quality_score: string | null; rejected_reason: string | null;
};
export type DailyMessages = { waba_id: string; phone_digits: string; day: string; sent: number; delivered: number };
export type DailyCost = { waba_id: string; day: string; pricing_category: string; pricing_type: string; country: string; volume: number; cost: number };
export type TemplateDaily = { template_id: string; waba_id: string; day: string; sent: number; delivered: number; read: number; clicks: number; cost: number };
export type MessageEvent = {
  wamid: string; status: string; waba_id: string | null; phone_number_id: string | null; recipient: string | null;
  pricing_category: string | null; pricing_type: string | null; billable: boolean | null;
  error_code: number | null; error_title: string | null; error_details: string | null; ts: string;
};
export type SyncRun = { id: number; started_at: string; finished_at: string | null; ok: boolean | null; details: unknown };

export type Dataset = {
  demo: boolean;
  wabas: Waba[];
  phones: Phone[];
  templates: Template[];
  messages: DailyMessages[];
  costs: DailyCost[];
  templateDaily: TemplateDaily[];
  failures: MessageEvent[];
  lastSync: SyncRun | null;
};
