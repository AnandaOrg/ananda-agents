CREATE TABLE "login_attempts" (
	"key" text PRIMARY KEY NOT NULL,
	"n" integer NOT NULL,
	"first_at" timestamp with time zone NOT NULL
);
