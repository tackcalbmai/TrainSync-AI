create unique index if not exists training_programs_one_active_per_user
on public.training_programs(user_id)
where status = 'active';
