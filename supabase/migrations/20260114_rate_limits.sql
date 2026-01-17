create table if not exists "RateLimits" (
  scope text not null,
  key text not null,
  count integer not null default 0,
  first_seen timestamptz not null,
  last_seen timestamptz,
  primary key (scope, key)
);

create index if not exists rate_limits_scope_first_seen_idx
  on "RateLimits"(scope, first_seen);
