-- Duration on a logged actual: how many working days the task took (optional, half days allowed).
alter table actuals add column duration_days numeric check (duration_days is null or (duration_days >= 0 and duration_days <= 999));
