-- The Data API refuses a DELETE with no WHERE clause, so saving the trade list from Setup always failed
-- ("DELETE requires a WHERE clause"). Same function, with a WHERE that matches every row.
create or replace function replace_trades(p_trades jsonb) returns void language plpgsql as $$
begin
  delete from trades where name is not null;
  insert into trades (name, sort_order) select t, ord::int from jsonb_array_elements_text(p_trades) with ordinality as x(t, ord);
end $$;
