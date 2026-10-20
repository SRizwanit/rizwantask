-- ইউজারের নিজের সম্পন্ন (প্রুফড) টাস্কের মোট সংখ্যা — task.html ও view.html ব্যবহার করে।
-- ফাংশন না থাকলেও অ্যাপ সরাসরি page_proofs গুনে নেয়; এটি শুধু দ্রুত করার জন্য।
create or replace function public.my_proof_count(p_user text)
returns bigint
language sql stable
as $$
  select count(*) from public.page_proofs where user_id::text = p_user;
$$;
grant execute on function public.my_proof_count(text) to anon, authenticated;
