CREATE TYPE "public"."customer_source" AS ENUM('vies', 'manual');--> statement-breakpoint
CREATE TYPE "public"."customer_status" AS ENUM('waiting_for_approval', 'active', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."flavour" AS ENUM('aloha', 'gaia', 'santorini', 'kyoto');--> statement-breakpoint
CREATE TYPE "public"."locale" AS ENUM('en', 'bg', 'he');--> statement-breakpoint
CREATE TYPE "public"."order_status" AS ENUM('waiting_for_payment', 'paid', 'sent_to_warehouse', 'delivered', 'invoice_issued', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."proforma_language" AS ENUM('en', 'bg');--> statement-breakpoint
CREATE TYPE "public"."request_status" AS ENUM('pending', 'approved', 'declined');--> statement-breakpoint
CREATE TYPE "public"."request_type" AS ENUM('take_over', 'price', 'correction');--> statement-breakpoint
CREATE TYPE "public"."role" AS ENUM('agent', 'admin');--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_id" uuid,
	"action" text NOT NULL,
	"entity" text NOT NULL,
	"entity_id" text,
	"data" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "customers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"number" text,
	"vat_number" text NOT NULL,
	"name" text NOT NULL,
	"country" text NOT NULL,
	"billing_address" text NOT NULL,
	"delivery_address" text,
	"contact_name_enc" text,
	"phone_enc" text,
	"email_enc" text,
	"status" "customer_status" DEFAULT 'waiting_for_approval' NOT NULL,
	"source" "customer_source" DEFAULT 'vies' NOT NULL,
	"needs_review" boolean DEFAULT false NOT NULL,
	"rejected_reason" text,
	"payment_terms_days" integer DEFAULT 0 NOT NULL,
	"owner_agent_id" uuid,
	"owned_since" timestamp with time zone,
	"last_order_at" timestamp with time zone,
	"created_by" uuid,
	"approved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "customers_number_unique" UNIQUE("number"),
	CONSTRAINT "customers_vat_number_unique" UNIQUE("vat_number")
);
--> statement-breakpoint
CREATE TABLE "free_reminders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agent_id" uuid NOT NULL,
	"customer_id" uuid NOT NULL,
	"notify_on" date NOT NULL,
	"sent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"type" text NOT NULL,
	"params" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"link" text NOT NULL,
	"read_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "number_sequences" (
	"key" text PRIMARY KEY NOT NULL,
	"next" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "order_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"flavour" "flavour" NOT NULL,
	"cartons" integer NOT NULL,
	"units" integer NOT NULL,
	"unit_price_cents" integer NOT NULL,
	"line_net_cents" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"number" text NOT NULL,
	"customer_id" uuid NOT NULL,
	"agent_id" uuid NOT NULL,
	"status" "order_status" DEFAULT 'waiting_for_payment' NOT NULL,
	"language" "proforma_language" DEFAULT 'en' NOT NULL,
	"total_cartons" integer NOT NULL,
	"total_units" integer NOT NULL,
	"tier_unit_price_cents" integer NOT NULL,
	"unit_price_cents" integer NOT NULL,
	"net_cents" integer NOT NULL,
	"vat_rate_bp" integer NOT NULL,
	"vat_cents" integer NOT NULL,
	"total_cents" integer NOT NULL,
	"commission_cents" integer NOT NULL,
	"price_request_id" uuid,
	"bill_to" jsonb NOT NULL,
	"delivery_address" text NOT NULL,
	"delivery_instructions" text,
	"payment_terms_days" integer NOT NULL,
	"issued_at" timestamp with time zone DEFAULT now() NOT NULL,
	"valid_until" date NOT NULL,
	"due_date" date NOT NULL,
	"hold_until" date NOT NULL,
	"paid_at" timestamp with time zone,
	"sent_to_warehouse_at" timestamp with time zone,
	"delivered_at" timestamp with time zone,
	"invoiced_at" timestamp with time zone,
	"cancelled_at" timestamp with time zone,
	"emailed_to" text,
	"email_error" text,
	"idempotency_key" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "orders_number_unique" UNIQUE("number")
);
--> statement-breakpoint
CREATE TABLE "payment_reminders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"agent_id" uuid NOT NULL,
	"to_email" text NOT NULL,
	"cc" text NOT NULL,
	"subject" text NOT NULL,
	"body" text NOT NULL,
	"sent_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"type" "request_type" NOT NULL,
	"status" "request_status" DEFAULT 'pending' NOT NULL,
	"agent_id" uuid NOT NULL,
	"customer_id" uuid,
	"order_id" uuid,
	"note" text,
	"target_unit_price_cents" integer,
	"used_by_order_id" uuid,
	"decision_note" text,
	"decided_by" uuid,
	"decided_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sessions_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"password_hash" text NOT NULL,
	"name" text NOT NULL,
	"role" "role" DEFAULT 'agent' NOT NULL,
	"locale" "locale" DEFAULT 'en' NOT NULL,
	"phone" text,
	"account_holder" text,
	"iban_enc" text,
	"iban_last4" text,
	"bank" text,
	"bic" text,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "vies_cache" (
	"vat_number" text PRIMARY KEY NOT NULL,
	"valid" boolean NOT NULL,
	"name" text,
	"address" text,
	"country" text NOT NULL,
	"checked_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customers" ADD CONSTRAINT "customers_owner_agent_id_users_id_fk" FOREIGN KEY ("owner_agent_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customers" ADD CONSTRAINT "customers_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "free_reminders" ADD CONSTRAINT "free_reminders_agent_id_users_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "free_reminders" ADD CONSTRAINT "free_reminders_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_lines" ADD CONSTRAINT "order_lines_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_agent_id_users_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_reminders" ADD CONSTRAINT "payment_reminders_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_reminders" ADD CONSTRAINT "payment_reminders_agent_id_users_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "requests" ADD CONSTRAINT "requests_agent_id_users_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "requests" ADD CONSTRAINT "requests_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "requests" ADD CONSTRAINT "requests_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "requests" ADD CONSTRAINT "requests_decided_by_users_id_fk" FOREIGN KEY ("decided_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audit_entity_idx" ON "audit_log" USING btree ("entity","entity_id");--> statement-breakpoint
CREATE INDEX "customers_owner_idx" ON "customers" USING btree ("owner_agent_id");--> statement-breakpoint
CREATE INDEX "customers_name_idx" ON "customers" USING btree ("name");--> statement-breakpoint
CREATE UNIQUE INDEX "free_reminders_unique" ON "free_reminders" USING btree ("agent_id","customer_id");--> statement-breakpoint
CREATE INDEX "notifications_user_idx" ON "notifications" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "orders_idempotency_idx" ON "orders" USING btree ("agent_id","idempotency_key");--> statement-breakpoint
CREATE INDEX "orders_agent_idx" ON "orders" USING btree ("agent_id");--> statement-breakpoint
CREATE INDEX "orders_customer_idx" ON "orders" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "payment_reminders_order_idx" ON "payment_reminders" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "requests_agent_idx" ON "requests" USING btree ("agent_id","type","status");