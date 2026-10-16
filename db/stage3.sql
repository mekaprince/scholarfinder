create table if not exists reminders_sent(
  user_id int references users(id) on delete cascade,
  scholarship_id int references scholarships(id) on delete cascade,
  bucket int not null, sent_at timestamptz default now(),
  primary key(user_id, scholarship_id, bucket));
create table if not exists password_resets(
  token_hash text primary key, user_id int references users(id) on delete cascade,
  expires_at timestamptz not null, used boolean default false, created_at timestamptz default now());

-- Phase 3: counselor data and chat usage limits (safe to re-run)
alter table scholarships
  add column if not exists application_fee_waiver text,
  add column if not exists english_proficiency_exemptions text,
  add column if not exists stay_back_visa_duration text,
  add column if not exists in_study_work_allowance text,
  add column if not exists local_cost_of_living_estimate text;
create table if not exists chat_usage(
  user_id int references users(id) on delete cascade,
  created_at timestamptz default now());
create index if not exists chat_usage_user_idx on chat_usage(user_id, created_at);
