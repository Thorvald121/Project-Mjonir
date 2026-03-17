// @valhalla/types
// Single source of truth for all entity types.
// Used by apps/web, apps/mobile, packages/hooks, and packages/db.

export type TicketStatus = 'open' | 'in_progress' | 'waiting' | 'resolved' | 'closed'
export type TicketPriority = 'critical' | 'high' | 'medium' | 'low'
export type TicketCategory =
  | 'hardware' | 'software' | 'network' | 'security'
  | 'account' | 'email' | 'printing' | 'other'

export type CustomerStatus = 'active' | 'inactive' | 'prospect'
export type ContractType = 'managed' | 'block_hours' | 'time_and_materials' | 'project'
export type MemberRole = 'owner' | 'admin' | 'technician' | 'client'
export type InvoiceStatus = 'draft' | 'sent' | 'paid' | 'partial' | 'overdue' | 'void'
export type QuoteStatus = 'draft' | 'sent' | 'viewed' | 'approved' | 'rejected' | 'expired' | 'converted'
export type LeadStage = 'new' | 'contacted' | 'qualified' | 'proposal' | 'negotiation' | 'closed_won' | 'closed_lost'
export type InventoryStatus = 'in_stock' | 'deployed' | 'retired' | 'maintenance'

// ── Organization ──────────────────────────────────────────────────────────────
export interface Organization {
  id: string
  name: string
  company_email: string | null
  owner_email: string | null
  app_url: string | null
  sla_config: SlaConfig
  notification_config: NotificationConfig
  branding: OrgBranding
  stripe_customer_id: string | null
  gmail_last_history_id: string | null
  created_at: string
  updated_at: string
}

export interface SlaConfig {
  critical: number  // hours
  high: number
  medium: number
  low: number
}

export interface NotificationConfig {
  ticket_assigned_email?: boolean
  ticket_assigned_push?: boolean
  ticket_resolved_email?: boolean
  sla_breach_email?: boolean
  sla_warning_push?: boolean
  customer_reply_push?: boolean
}

export interface OrgBranding {
  logo_url?: string
  primary_color?: string
  support_email?: string
  footer_text?: string
}

// ── Organization Member ───────────────────────────────────────────────────────
export interface OrganizationMember {
  id: string
  organization_id: string
  user_id: string
  user_email: string
  role: MemberRole
  permissions: Record<string, boolean> | null
  created_at: string
}

// ── Customer ──────────────────────────────────────────────────────────────────
export interface Customer {
  id: string
  organization_id: string
  name: string
  status: CustomerStatus
  industry: string | null
  notes: string | null
  contract_type: ContractType | null
  monthly_rate: number | null
  hourly_rate: number | null
  after_hours_rate: number | null
  project_rate: number | null
  block_hours_purchased: number | null
  block_hours_period_start: string | null
  contact_name: string | null
  contact_email: string | null
  contact_phone: string | null
  stripe_subscription_id: string | null
  stripe_plan: string | null
  health_score: number | null
  created_at: string
  updated_at: string
}

export interface CustomerContact {
  id: string
  organization_id: string
  customer_id: string
  name: string
  email: string | null
  phone: string | null
  role: 'owner' | 'admin' | 'billing' | 'technical' | 'contact'
  notes: string | null
  is_primary: boolean
  created_at: string
  updated_at: string
}

// ── Ticket ────────────────────────────────────────────────────────────────────
export interface Ticket {
  id: string
  organization_id: string
  title: string
  description: string | null
  status: TicketStatus
  priority: TicketPriority
  category: TicketCategory
  customer_id: string | null
  customer_name: string | null
  assigned_to: string | null
  contact_name: string | null
  contact_email: string | null
  tags: string[]
  sla_due_date: string | null
  first_response_at: string | null
  timer_started: string | null
  time_spent_minutes: number
  is_recurring: boolean
  recurrence_interval: 'daily' | 'weekly' | 'monthly' | null
  scheduled_date: string | null
  ai_triage: AiTriageResult | null
  gmail_thread_id: string | null
  gmail_message_id: string | null
  created_at: string
  updated_at: string
}

export interface AiTriageResult {
  priority: TicketPriority
  category: TicketCategory
  confidence: number
  reasoning: string
  suggested_kb_ids: string[]
}

export interface TicketComment {
  id: string
  organization_id: string
  ticket_id: string
  author_name: string | null
  author_email: string | null
  content: string
  is_staff: boolean
  attachment_url: string | null
  attachment_name: string | null
  gmail_message_id: string | null
  created_at: string
}

// ── Time Entry ────────────────────────────────────────────────────────────────
export interface TimeEntry {
  id: string
  organization_id: string
  ticket_id: string | null
  ticket_title: string | null
  customer_id: string | null
  customer_name: string | null
  technician: string | null
  description: string | null
  minutes: number
  billable: boolean
  hourly_rate: number | null
  date: string
  invoice_id: string | null
  created_at: string
}

// ── Invoice ───────────────────────────────────────────────────────────────────
export interface Invoice {
  id: string
  organization_id: string
  invoice_number: string
  customer_id: string | null
  customer_name: string | null
  contact_email: string | null
  status: InvoiceStatus
  issue_date: string | null
  due_date: string | null
  payment_terms: 'due_on_receipt' | 'net_7' | 'net_15' | 'net_30' | 'net_45' | 'net_60' | null
  line_items: LineItem[]
  subtotal: number
  tax_rate: number
  tax_amount: number
  discount_amount: number
  discount_percent: number
  total: number
  amount_paid: number
  balance_due: number   // computed column
  paid_date: string | null
  stripe_payment_url: string | null
  stripe_charge_id: string | null
  dunning_sent_count: number
  is_recurring: boolean
  recurrence_interval: 'monthly' | 'quarterly' | 'annually' | null
  is_overage_invoice: boolean
  notes: string | null
  created_at: string
  updated_at: string
}

export interface LineItem {
  description: string
  quantity: number
  unit_price: number
  total: number
}

// ── Quote ─────────────────────────────────────────────────────────────────────
export interface Quote {
  id: string
  organization_id: string
  customer_id: string | null
  customer_name: string | null
  contact_email: string | null
  quote_number: string
  status: QuoteStatus
  line_items: LineItem[]
  subtotal: number
  tax_rate: number
  tax_amount: number
  discount_amount: number
  total: number
  valid_until: string | null
  notes: string | null
  converted_to_invoice_id: string | null
  created_at: string
  updated_at: string
}

// ── Inventory ─────────────────────────────────────────────────────────────────
export interface InventoryItem {
  id: string
  organization_id: string
  customer_id: string | null
  customer_name: string | null
  name: string
  category: string
  status: InventoryStatus
  serial_number: string | null
  asset_tag: string | null
  model: string | null
  vendor: string | null
  quantity: number
  unit_cost: number | null
  purchase_date: string | null
  warranty_expiry: string | null
  location: string | null
  notes: string | null
  created_at: string
  updated_at: string
}

// ── Lead ──────────────────────────────────────────────────────────────────────
export interface Lead {
  id: string
  organization_id: string
  contact_name: string | null
  contact_email: string | null
  contact_phone: string | null
  company_name: string | null
  stage: LeadStage
  estimated_value: number | null
  source: string | null
  assigned_to: string | null
  next_follow_up: string | null
  notes: string | null
  created_at: string
  updated_at: string
}

// ── Knowledge Base ────────────────────────────────────────────────────────────
export interface KnowledgeArticle {
  id: string
  organization_id: string
  title: string
  content: string | null
  category: 'troubleshooting' | 'how_to' | 'policy' | 'setup' | 'faq'
  is_published: boolean
  view_count: number
  helpful_count: number
  created_by: string | null
  created_at: string
  updated_at: string
}

// ── Canned Reply ──────────────────────────────────────────────────────────────
export interface CannedReply {
  id: string
  organization_id: string
  name: string
  category: string | null
  body: string
  is_active: boolean
  created_at: string
  updated_at: string
}

// ── CSAT ──────────────────────────────────────────────────────────────────────
export interface CsatResponse {
  id: string
  organization_id: string
  ticket_id: string | null
  customer_name: string | null
  contact_email: string | null
  score: 1 | 2 | 3 | 4 | 5
  comment: string | null
  submitted_at: string
}

// ── Automations ───────────────────────────────────────────────────────────────
export interface EmailAutomation {
  id: string
  organization_id: string
  name: string
  trigger: string
  conditions: AutomationCondition[]
  actions: AutomationAction[]
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface TicketAutomationRule {
  id: string
  organization_id: string
  name: string
  trigger: string
  conditions: AutomationCondition[]
  actions: AutomationAction[]
  priority: number
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface AutomationCondition {
  field: string
  operator: 'equals' | 'not_equals' | 'contains' | 'not_contains' | 'is_empty' | 'is_not_empty'
  value: string
}

export interface AutomationAction {
  type: string
  value?: string
  template?: string
}

// ── Device Push Token ─────────────────────────────────────────────────────────
export interface DevicePushToken {
  id: string
  organization_id: string
  user_id: string
  user_email: string
  token: string
  platform: 'ios' | 'android'
  created_at: string
  updated_at: string
}

// ── MSP Plan ──────────────────────────────────────────────────────────────────
export interface MspPlan {
  id: string
  organization_id: string
  key: string
  name: string
  price: number
  features: string[]
  badge: string | null
  badge_color: string | null
  color: string | null
  icon: string | null
  sort_order: number
  is_active: boolean
  created_at: string
  updated_at: string
}
