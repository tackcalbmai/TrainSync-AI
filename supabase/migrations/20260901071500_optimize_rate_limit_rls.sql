alter policy api_rate_limit_select_own
on public.api_rate_limit_buckets
using ((select auth.uid()) = user_id);

alter policy api_rate_limit_insert_own
on public.api_rate_limit_buckets
with check ((select auth.uid()) = user_id);

alter policy api_rate_limit_update_own
on public.api_rate_limit_buckets
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

alter policy api_rate_limit_delete_expired_own
on public.api_rate_limit_buckets
using (
  (select auth.uid()) = user_id
  and bucket_start < (clock_timestamp() - interval '2 days')
);
