create table if not exists reminders_sent(
  user_id int references users(id) on delete cascade,
  scholarship_id int references scholarships(id) on delete cascade,
  bucket int not null, sent_at timestamptz default now(),
  primary key(user_id, scholarship_id, bucket));
create table if not exists password_resets(
  token_hash text primary key, user_id int references users(id) on delete cascade,
  expires_at timestamptz not null, used boolean default false, created_at timestamptz default now());
