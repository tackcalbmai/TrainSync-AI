create or replace function public.delete_current_user()
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'SIGN_IN_REQUIRED' using errcode = '42501';
  end if;

  delete from auth.users
  where id = v_user_id;

  if not found then
    raise exception 'USER_NOT_FOUND';
  end if;

  return true;
end;
$$;

revoke all on function public.delete_current_user() from public;
revoke all on function public.delete_current_user() from anon;
grant execute on function public.delete_current_user() to authenticated;
