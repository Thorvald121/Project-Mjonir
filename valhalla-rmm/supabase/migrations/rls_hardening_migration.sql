-- ═══════════════════════════════════════════════════════════════════════════
-- Valhalla RMM — RLS Hardening Migration (STAGED)
-- Project: yetrdrgagfovphrerpie
--
-- PROBLEM: client-role portal users pass every `org_isolation` policy, so via
-- the REST API they can read AND modify staff-only data (time entries with
-- rates, pricing, other customers, all invoices, audit log, etc). Also,
-- `failed_emails` is readable by any authenticated user in any org.
--
-- APPROACH: two phases.
--   PHASE 1 (additive, zero breakage risk): helper functions + client-scoped
--     policies so the portal has its own explicit access paths.
--   PHASE 2 (restrictive): gate the broad org policies to staff only.
--     Run ONLY after Phase 1 is verified with the test checklist below.
--   ROLLBACK at the bottom restores today's exact state.
--
-- ── TEST CHECKLIST — run after EACH phase ────────────────────────────────────
--  As STAFF (your normal login):
--   [ ] Admin dashboard loads, tickets list loads
--   [ ] Open a ticket: comments visible, can reply
--   [ ] Customers, invoices, quotes, time tracking, schedule pages load
--   [ ] Create a test ticket, edit it, log time on it
--  As CLIENT (vik.2187@protonmail.com test login):
--   [ ] Portal loads, shows company name (Arges)
--   [ ] Ticket list shows their tickets (and ONLY theirs)
--   [ ] Open a ticket: staff replies visible, internal notes NOT visible
--   [ ] Post a reply from the portal
--   [ ] Create a new ticket from the portal
--   [ ] Invoices tab loads, Devices/inventory tab loads
--   [ ] Upcoming visits (scheduled jobs) shows
--  UNAUTHENTICATED:
--   [ ] Quote approval link (/quote-approval?token=...) still loads a quote
--   [ ] Public KB article (if any published) still loads
-- ═══════════════════════════════════════════════════════════════════════════


-- ─────────────────────────────────────────────────────────────────────────────
-- PRE-FLIGHT: check whether ticket_comments has an internal-note flag.
-- Run this SELECT first. If a column like `is_internal` exists, uncomment the
-- marked line in the client comment-read policy in Phase 1.
-- ─────────────────────────────────────────────────────────────────────────────
-- SELECT column_name FROM information_schema.columns
-- WHERE table_name = 'ticket_comments' ORDER BY ordinal_position;


-- ═══════════════════════════════════════════════════════════════════════════
-- PHASE 1 — ADDITIVE (safe to run immediately; adds access, removes none)
-- ═══════════════════════════════════════════════════════════════════════════

-- Helper: is the current user staff (any non-client role) in some org?
-- SECURITY DEFINER so policy subqueries bypass RLS recursion issues.
CREATE OR REPLACE FUNCTION public.auth_is_staff()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM organization_members
    WHERE user_id = auth.uid() AND role <> 'client'
  );
$$;

-- Helper: the client user's own customer_id (NULL for staff / anon)
CREATE OR REPLACE FUNCTION public.auth_customer_id()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT customer_id FROM organization_members
  WHERE user_id = auth.uid() AND role = 'client'
  LIMIT 1;
$$;

-- Helper: the member's login email (used where tickets were email-matched)
CREATE OR REPLACE FUNCTION public.auth_member_email()
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT user_email FROM organization_members
  WHERE user_id = auth.uid()
  LIMIT 1;
$$;

-- 1A. Clients can read THEIR OWN customer record (needed for portal header,
--     and keeps any policy/UI joins to `customers` working after Phase 2).
DROP POLICY IF EXISTS client_read_own_customer ON public.customers;
CREATE POLICY client_read_own_customer ON public.customers
  FOR SELECT USING (id = public.auth_customer_id());

-- 1B. Clients can read tickets for their customer (by linkage OR by their
--     email on the ticket — covers email-ingested tickets predating linkage).
DROP POLICY IF EXISTS client_read_own_tickets ON public.tickets;
CREATE POLICY client_read_own_tickets ON public.tickets
  FOR SELECT USING (
    customer_id = public.auth_customer_id()
    OR (contact_email IS NOT NULL AND contact_email = public.auth_member_email())
  );

-- 1C. Clients can create tickets for their own customer only.
DROP POLICY IF EXISTS client_insert_own_tickets ON public.tickets;
CREATE POLICY client_insert_own_tickets ON public.tickets
  FOR INSERT WITH CHECK (
    customer_id = public.auth_customer_id()
    AND organization_id = public.auth_org_id()
  );

-- 1D. Clients can read ALL comments on their tickets (staff replies included —
--     the existing client_portal_read policy only exposed is_staff=false rows;
--     clients currently see staff replies through the org-wide comments_select,
--     which Phase 2 removes, so this replacement must exist first).
DROP POLICY IF EXISTS client_read_own_ticket_comments ON public.ticket_comments;
CREATE POLICY client_read_own_ticket_comments ON public.ticket_comments
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM tickets t
      WHERE t.id = ticket_comments.ticket_id
        AND (t.customer_id = public.auth_customer_id()
             OR (t.contact_email IS NOT NULL AND t.contact_email = public.auth_member_email()))
    )
    -- AND (is_internal IS DISTINCT FROM true)  -- UNCOMMENT if this column exists (pre-flight check)
  );

-- 1E. Clients can post replies on their own tickets (never as staff).
DROP POLICY IF EXISTS client_insert_own_ticket_comments ON public.ticket_comments;
CREATE POLICY client_insert_own_ticket_comments ON public.ticket_comments
  FOR INSERT WITH CHECK (
    is_staff = false
    AND EXISTS (
      SELECT 1 FROM tickets t
      WHERE t.id = ticket_comments.ticket_id
        AND (t.customer_id = public.auth_customer_id()
             OR (t.contact_email IS NOT NULL AND t.contact_email = public.auth_member_email()))
    )
  );

-- 1F. Rewrite the inventory client policy to use the helper (the old version
--     joined customers+customer_contacts, which breaks after Phase 2 restricts
--     those tables; the helper is SECURITY DEFINER so it cannot break).
DROP POLICY IF EXISTS client_portal_read ON public.inventory_items;
CREATE POLICY client_portal_read ON public.inventory_items
  FOR SELECT USING (customer_id = public.auth_customer_id());

-- 1G. Same rewrite for invoices (old one matched contact_email via subquery on
--     organization_members — fine, but align to customer linkage + keep email).
DROP POLICY IF EXISTS client_portal_read ON public.invoices;
CREATE POLICY client_portal_read ON public.invoices
  FOR SELECT USING (
    customer_id = public.auth_customer_id()
    OR (contact_email IS NOT NULL AND contact_email = public.auth_member_email())
  );

-- (scheduled_jobs already has a correct clients_view_own_jobs policy — kept.)

-- ═══ END PHASE 1 — run the FULL test checklist as staff AND client now. ═════
-- Everything should behave exactly as before (clients gained no visible
-- features; the new policies are redundant with the broad ones until Phase 2).



-- ═══════════════════════════════════════════════════════════════════════════
-- PHASE 2 — RESTRICTIVE (run only after Phase 1 verified)
-- Gates broad org access to staff. Clients keep only the Phase-1 paths.
-- ═══════════════════════════════════════════════════════════════════════════

-- 2A. Tickets: staff-only for the broad policies; drop the duplicate set.
DROP POLICY IF EXISTS tickets_select          ON public.tickets;
DROP POLICY IF EXISTS tickets_update          ON public.tickets;
DROP POLICY IF EXISTS tickets_delete          ON public.tickets;
DROP POLICY IF EXISTS tickets_insert          ON public.tickets;
DROP POLICY IF EXISTS members_update_tickets  ON public.tickets;
DROP POLICY IF EXISTS members_delete_tickets  ON public.tickets;
DROP POLICY IF EXISTS members_insert_tickets  ON public.tickets;

CREATE POLICY staff_select_tickets ON public.tickets FOR SELECT
  USING ((organization_id = auth_org_id() AND public.auth_is_staff()) OR is_platform_admin());
CREATE POLICY staff_insert_tickets ON public.tickets FOR INSERT
  WITH CHECK ((organization_id = auth_org_id() AND public.auth_is_staff()) OR is_platform_admin());
CREATE POLICY staff_update_tickets ON public.tickets FOR UPDATE
  USING ((organization_id = auth_org_id() AND public.auth_is_staff()) OR is_platform_admin());
CREATE POLICY staff_delete_tickets ON public.tickets FOR DELETE
  USING ((organization_id = auth_org_id() AND public.auth_is_staff()) OR is_platform_admin());

-- 2B. Ticket comments: staff-only broad policies (client paths exist from 1D/1E).
DROP POLICY IF EXISTS comments_select ON public.ticket_comments;
DROP POLICY IF EXISTS comments_insert ON public.ticket_comments;
DROP POLICY IF EXISTS comments_update ON public.ticket_comments;
DROP POLICY IF EXISTS comments_delete ON public.ticket_comments;
DROP POLICY IF EXISTS client_portal_read ON public.ticket_comments;  -- superseded by 1D

CREATE POLICY staff_select_comments ON public.ticket_comments FOR SELECT
  USING ((organization_id = auth_org_id() AND public.auth_is_staff()) OR is_platform_admin());
CREATE POLICY staff_insert_comments ON public.ticket_comments FOR INSERT
  WITH CHECK ((organization_id = auth_org_id() AND public.auth_is_staff()) OR is_platform_admin());
CREATE POLICY staff_update_comments ON public.ticket_comments FOR UPDATE
  USING ((organization_id = auth_org_id() AND public.auth_is_staff()) OR is_platform_admin());
CREATE POLICY staff_delete_comments ON public.ticket_comments FOR DELETE
  USING ((organization_id = auth_org_id() AND public.auth_is_staff()) OR is_platform_admin());

-- 2C. Customers: staff-only broad access (clients keep 1A read-own).
DROP POLICY IF EXISTS org_isolation ON public.customers;
CREATE POLICY staff_all_customers ON public.customers FOR ALL
  USING ((organization_id = auth_org_id() AND public.auth_is_staff()) OR is_platform_admin());

-- 2D. Fix the cross-tenant failed_emails leak.
DROP POLICY IF EXISTS auth_read_failed_emails ON public.failed_emails;
CREATE POLICY staff_read_failed_emails ON public.failed_emails FOR ALL
  USING (public.auth_is_staff() OR is_platform_admin());

-- 2E. Staff-gate every remaining broad `org_isolation` (simple orgs-scoped
--     tables that clients have no business touching).
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'audit_log','canned_replies','contracts','credit_notes','customer_contacts',
    'customer_notes','customer_plans','email_automation_log','email_automation_rules',
    'email_automations','invoice_payments','leads','maintenance_schedules',
    'monitors','msp_plans','pending_emails','pricing_settings','role_permissions',
    'scheduled_reports','ticket_automation_rules','ticket_templates',
    'time_entries','vendor_licenses','quotes'
  ] LOOP
    EXECUTE format('DROP POLICY IF EXISTS org_isolation ON public.%I', t);
    EXECUTE format(
      'CREATE POLICY staff_org_isolation ON public.%I FOR ALL
       USING ((organization_id = auth_org_id() AND public.auth_is_staff()) OR is_platform_admin())', t);
  END LOOP;
END $$;

-- 2F. Tables whose org_isolation quals reference other tables (custom quals):
DROP POLICY IF EXISTS org_isolation ON public.monitor_checks;
CREATE POLICY staff_org_isolation ON public.monitor_checks FOR ALL
  USING (
    (public.auth_is_staff() AND monitor_id IN (
      SELECT id FROM monitors WHERE organization_id = auth_org_id()))
    OR is_platform_admin()
  );

DROP POLICY IF EXISTS org_isolation ON public.ticket_tasks;
CREATE POLICY staff_org_isolation ON public.ticket_tasks FOR ALL
  USING (
    (public.auth_is_staff() AND ticket_id IN (
      SELECT id FROM tickets WHERE organization_id = auth_org_id()))
    OR is_platform_admin()
  );

-- 2G. Inventory / invoices / scheduled_jobs / service_reports / remote_sessions:
--     staff-gate broad access; client paths already exist where intended.
DROP POLICY IF EXISTS org_isolation ON public.inventory_items;
CREATE POLICY staff_org_isolation ON public.inventory_items FOR ALL
  USING ((organization_id = auth_org_id() AND public.auth_is_staff()) OR is_platform_admin());

DROP POLICY IF EXISTS org_isolation ON public.invoices;
CREATE POLICY staff_org_isolation ON public.invoices FOR ALL
  USING ((organization_id = auth_org_id() AND public.auth_is_staff()) OR is_platform_admin());

DROP POLICY IF EXISTS org_members_scheduled_jobs ON public.scheduled_jobs;
CREATE POLICY staff_scheduled_jobs ON public.scheduled_jobs FOR ALL
  USING ((organization_id = auth_org_id() AND public.auth_is_staff()) OR is_platform_admin());
-- (clients_view_own_jobs SELECT policy remains for portal)

DROP POLICY IF EXISTS "Org members can read service_reports"   ON public.service_reports;
DROP POLICY IF EXISTS "Org members can insert service_reports" ON public.service_reports;
DROP POLICY IF EXISTS "Org members can update service_reports" ON public.service_reports;
DROP POLICY IF EXISTS "Org members can delete service_reports" ON public.service_reports;
CREATE POLICY staff_all_service_reports ON public.service_reports FOR ALL
  USING ((organization_id = auth_org_id() AND public.auth_is_staff()) OR is_platform_admin())
  WITH CHECK ((organization_id = auth_org_id() AND public.auth_is_staff()) OR is_platform_admin());

DROP POLICY IF EXISTS org_members_remote_sessions ON public.remote_sessions;
CREATE POLICY staff_remote_sessions ON public.remote_sessions FOR ALL
  USING ((organization_id = auth_org_id() AND public.auth_is_staff()) OR is_platform_admin());

-- 2H. Knowledge base: staff manage; public published-read stays untouched.
DROP POLICY IF EXISTS org_isolation ON public.knowledge_articles;
CREATE POLICY staff_org_isolation ON public.knowledge_articles FOR ALL
  USING ((organization_id = auth_org_id() AND public.auth_is_staff()) OR is_platform_admin());
-- (public_read_published SELECT policy remains — portal KB keeps working)

-- 2I. CSAT: staff read/update; anonymous insert + featured read stay untouched.
DROP POLICY IF EXISTS org_isolation ON public.csat_responses;
CREATE POLICY staff_read_csat ON public.csat_responses FOR SELECT
  USING ((organization_id = auth_org_id() AND public.auth_is_staff()) OR is_platform_admin());
-- (public_csat_insert, public_read_featured_reviews, org_members_update_csat remain;
--  optionally tighten org_members_update_csat similarly later.)

-- 2J. quote_attachments: staff-gate the authenticated ALL policy; keep anon
--     read of client-visible files (approval page needs it).
DROP POLICY IF EXISTS auth_full_access_attachments ON public.quote_attachments;
CREATE POLICY staff_full_access_attachments ON public.quote_attachments FOR ALL
  TO authenticated
  USING ((organization_id = auth_org_id() AND public.auth_is_staff()) OR is_platform_admin())
  WITH CHECK ((organization_id = auth_org_id() AND public.auth_is_staff()) OR is_platform_admin());
-- (anon_read_client_visible_attachments remains)

-- ═══ END PHASE 2 — run the FULL test checklist again, both roles + anon. ════



-- ═══════════════════════════════════════════════════════════════════════════
-- ROLLBACK — restores the pre-migration state exactly. Run whole block.
-- ═══════════════════════════════════════════════════════════════════════════
/*
-- Drop everything this migration created
DROP POLICY IF EXISTS client_read_own_customer          ON public.customers;
DROP POLICY IF EXISTS client_read_own_tickets           ON public.tickets;
DROP POLICY IF EXISTS client_insert_own_tickets         ON public.tickets;
DROP POLICY IF EXISTS client_read_own_ticket_comments   ON public.ticket_comments;
DROP POLICY IF EXISTS client_insert_own_ticket_comments ON public.ticket_comments;
DROP POLICY IF EXISTS staff_select_tickets  ON public.tickets;
DROP POLICY IF EXISTS staff_insert_tickets  ON public.tickets;
DROP POLICY IF EXISTS staff_update_tickets  ON public.tickets;
DROP POLICY IF EXISTS staff_delete_tickets  ON public.tickets;
DROP POLICY IF EXISTS staff_select_comments ON public.ticket_comments;
DROP POLICY IF EXISTS staff_insert_comments ON public.ticket_comments;
DROP POLICY IF EXISTS staff_update_comments ON public.ticket_comments;
DROP POLICY IF EXISTS staff_delete_comments ON public.ticket_comments;
DROP POLICY IF EXISTS staff_all_customers   ON public.customers;
DROP POLICY IF EXISTS staff_read_failed_emails ON public.failed_emails;
DROP POLICY IF EXISTS staff_all_service_reports ON public.service_reports;
DROP POLICY IF EXISTS staff_scheduled_jobs  ON public.scheduled_jobs;
DROP POLICY IF EXISTS staff_remote_sessions ON public.remote_sessions;
DROP POLICY IF EXISTS staff_read_csat       ON public.csat_responses;
DROP POLICY IF EXISTS staff_full_access_attachments ON public.quote_attachments;
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'audit_log','canned_replies','contracts','credit_notes','customer_contacts',
    'customer_notes','customer_plans','email_automation_log','email_automation_rules',
    'email_automations','invoice_payments','leads','maintenance_schedules',
    'monitors','msp_plans','pending_emails','pricing_settings','role_permissions',
    'scheduled_reports','ticket_automation_rules','ticket_templates',
    'time_entries','vendor_licenses','quotes','monitor_checks','ticket_tasks',
    'inventory_items','invoices','knowledge_articles'
  ] LOOP
    EXECUTE format('DROP POLICY IF EXISTS staff_org_isolation ON public.%I', t);
  END LOOP;
END $$;

-- Recreate originals
CREATE POLICY tickets_select ON public.tickets FOR SELECT USING ((organization_id = auth_org_id()) OR is_platform_admin());
CREATE POLICY tickets_insert ON public.tickets FOR INSERT WITH CHECK ((organization_id = auth_org_id()) OR is_platform_admin());
CREATE POLICY tickets_update ON public.tickets FOR UPDATE USING ((organization_id = auth_org_id()) OR is_platform_admin());
CREATE POLICY tickets_delete ON public.tickets FOR DELETE USING ((organization_id = auth_org_id()) OR is_platform_admin());
CREATE POLICY members_insert_tickets ON public.tickets FOR INSERT WITH CHECK (organization_id = auth_org_id());
CREATE POLICY members_update_tickets ON public.tickets FOR UPDATE USING (organization_id = auth_org_id());
CREATE POLICY members_delete_tickets ON public.tickets FOR DELETE USING (organization_id = auth_org_id());
CREATE POLICY comments_select ON public.ticket_comments FOR SELECT USING ((organization_id = auth_org_id()) OR is_platform_admin());
CREATE POLICY comments_insert ON public.ticket_comments FOR INSERT WITH CHECK ((organization_id = auth_org_id()) OR is_platform_admin());
CREATE POLICY comments_update ON public.ticket_comments FOR UPDATE USING ((organization_id = auth_org_id()) OR is_platform_admin());
CREATE POLICY comments_delete ON public.ticket_comments FOR DELETE USING ((organization_id = auth_org_id()) OR is_platform_admin());
CREATE POLICY client_portal_read ON public.ticket_comments FOR SELECT USING ((is_staff = false) AND (EXISTS ( SELECT 1 FROM tickets t WHERE ((t.id = ticket_comments.ticket_id) AND (t.contact_email = ( SELECT organization_members.user_email FROM organization_members WHERE (organization_members.user_id = auth.uid()) LIMIT 1))))));
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'audit_log','canned_replies','contracts','credit_notes','customer_contacts',
    'customer_notes','customer_plans','customers','email_automation_log',
    'email_automation_rules','email_automations','inventory_items','invoice_payments',
    'invoices','leads','maintenance_schedules','monitors','msp_plans','pending_emails',
    'pricing_settings','role_permissions','scheduled_reports','ticket_automation_rules',
    'ticket_templates','time_entries','vendor_licenses','quotes','knowledge_articles'
  ] LOOP
    EXECUTE format(
      'CREATE POLICY org_isolation ON public.%I FOR ALL
       USING ((organization_id = auth_org_id()) OR is_platform_admin())', t);
  END LOOP;
END $$;
CREATE POLICY org_isolation ON public.monitor_checks FOR ALL USING ((monitor_id IN ( SELECT monitors.id FROM monitors WHERE (monitors.organization_id = auth_org_id()))) OR is_platform_admin());
CREATE POLICY org_isolation ON public.ticket_tasks FOR ALL USING ((ticket_id IN ( SELECT tickets.id FROM tickets WHERE (tickets.organization_id = auth_org_id()))) OR is_platform_admin());
CREATE POLICY client_portal_read ON public.inventory_items FOR SELECT USING (customer_id IN ( SELECT c.id FROM (customers c JOIN customer_contacts cc ON ((cc.customer_id = c.id))) WHERE (cc.email = ( SELECT organization_members.user_email FROM organization_members WHERE (organization_members.user_id = auth.uid()) LIMIT 1))));
CREATE POLICY client_portal_read ON public.invoices FOR SELECT USING (contact_email = ( SELECT organization_members.user_email FROM organization_members WHERE (organization_members.user_id = auth.uid()) LIMIT 1));
CREATE POLICY auth_read_failed_emails ON public.failed_emails FOR ALL TO authenticated USING (true);
CREATE POLICY org_members_scheduled_jobs ON public.scheduled_jobs FOR ALL USING (organization_id IN ( SELECT organization_members.organization_id FROM organization_members WHERE (organization_members.user_id = auth.uid())));
CREATE POLICY "Org members can read service_reports" ON public.service_reports FOR SELECT USING (organization_id IN ( SELECT organization_members.organization_id FROM organization_members WHERE (organization_members.user_id = auth.uid())));
CREATE POLICY "Org members can insert service_reports" ON public.service_reports FOR INSERT WITH CHECK (organization_id IN ( SELECT organization_members.organization_id FROM organization_members WHERE (organization_members.user_id = auth.uid())));
CREATE POLICY "Org members can update service_reports" ON public.service_reports FOR UPDATE USING (organization_id IN ( SELECT organization_members.organization_id FROM organization_members WHERE (organization_members.user_id = auth.uid())));
CREATE POLICY "Org members can delete service_reports" ON public.service_reports FOR DELETE USING (organization_id IN ( SELECT organization_members.organization_id FROM organization_members WHERE (organization_members.user_id = auth.uid())));
CREATE POLICY org_members_remote_sessions ON public.remote_sessions FOR ALL USING (organization_id IN ( SELECT organization_members.organization_id FROM organization_members WHERE (organization_members.user_id = auth.uid())));
CREATE POLICY org_isolation ON public.csat_responses FOR SELECT USING ((organization_id = auth_org_id()) OR is_platform_admin());
CREATE POLICY auth_full_access_attachments ON public.quote_attachments FOR ALL TO authenticated USING ((organization_id = auth_org_id()) OR is_platform_admin()) WITH CHECK ((organization_id = auth_org_id()) OR is_platform_admin());
*/
