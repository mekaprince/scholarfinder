alter table scholarships
  add column if not exists host_institution text,
  add column if not exists eligibility_text text,
  add column if not exists minimum_cgpa numeric(3,2) check (minimum_cgpa is null or (minimum_cgpa >= 0 and minimum_cgpa <= 5)),
  add column if not exists ai_extracted boolean default false,
  add column if not exists ai_model text;
alter table profiles add column if not exists cgpa numeric(3,2) check (cgpa is null or (cgpa >= 0 and cgpa <= 5));
alter table sources
  add column if not exists verified boolean default false,
  add column if not exists discovered_by text default 'admin',
  add column if not exists domain text;
create table if not exists ingestion_jobs(
  id serial primary key, source_url text not null, raw_text text not null,
  status text default 'pending' check (status in ('pending','running','done','failed')),
  attempts int default 0, error text,
  scholarship_id int references scholarships(id) on delete set null,
  locked_at timestamptz, created_at timestamptz default now(), updated_at timestamptz default now());
create index if not exists ingestion_jobs_status_idx on ingestion_jobs(status, id);
