-- The day a pushed item didn't happen. An item already under way on that day pauses (hidden for the pushed
-- working days, finish moved out) instead of its whole span shifting. See applyDelays in src/logic/forecast.js.
alter table schedule_adjustments add column delay_from date;
