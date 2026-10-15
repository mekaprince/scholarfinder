create table if not exists users(
  id serial primary key, email text unique not null, password_hash text not null,
  is_admin boolean default false, created_at timestamptz default now());
create table if not exists profiles(
  user_id int primary key references users(id) on delete cascade,
  full_name text, nationality text, highest_degree text, degree_class text,
  field text, grad_year int, institution text, work_years numeric, ielts numeric,
  dest_countries text[] default '{}', target_levels text[] default '{}',
  fully_funded_only boolean default true, email_notify boolean default true);
create table if not exists scholarships(
  id serial primary key, title text not null, provider text, country text,
  degree_levels text[] default '{}',
  eligible_nationalities text[],   -- NULL = not stated (shown as uncertain)
  fields text[], min_degree_class text, min_work_years numeric, min_ielts numeric,
  funding_type text default 'unknown', funding_details text, deadline date,
  source_url text not null, application_url text,
  status text default 'needs_review',  -- active | needs_review | expired | inactive
  content_hash text, last_checked timestamptz default now(),
  unique(source_url, title));
create table if not exists saved(
  user_id int references users(id) on delete cascade,
  scholarship_id int references scholarships(id) on delete cascade,
  primary key(user_id, scholarship_id));
create table if not exists applications(
  user_id int references users(id) on delete cascade,
  scholarship_id int references scholarships(id) on delete cascade,
  status text default 'planning', notes text, updated_at timestamptz default now(),
  primary key(user_id, scholarship_id));
create table if not exists sources(
  id serial primary key, name text, url text unique, kind text default 'manual',
  active boolean default true, last_run timestamptz);
create table if not exists discovery_runs(
  id serial primary key, source_id int references sources(id), started_at timestamptz default now(),
  ok boolean, found int default 0, error text);
