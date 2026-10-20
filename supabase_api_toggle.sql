-- =====================================================================
-- RizwanTask — নতুন ফিচার: এপি আই চালু/বন্ধ (Admin প্যানেল থেকে নিয়ন্ত্রণ)
-- Supabase Dashboard → SQL Editor → New query → পেস্ট করে Run চাপুন।
-- শুধু নতুন জিনিসটুকুই আছে; আগের টেবিল/ডেটা অক্ষত থাকবে। বারবার চালালেও সমস্যা নেই।
-- =====================================================================

-- ১) app_settings টেবিলে নতুন কলাম (ডিফল্ট = চালু)
alter table public.app_settings
  add column if not exists api_enabled boolean not null default true;

-- ২) আগে থেকে থাকা সেটিংস সারি (id = 1) চালু অবস্থায় থাকুক
update public.app_settings set api_enabled = true where id = 1 and api_enabled is null;

-- ৩) সেটিংস সারি একেবারে না থাকলে (নতুন প্রজেক্ট) একটি তৈরি করুন — আগে থাকলে কিছুই বদলাবে না
insert into public.app_settings (id, api_enabled)
select 1, true
where not exists (select 1 from public.app_settings where id = 1);

-- ৪) PostgREST-কে নতুন কলাম চিনিয়ে দিন (না করলে কিছুক্ষণ "column not found" আসতে পারে)
notify pgrst, 'reload schema';

-- ---- দরকার হলে হাতে চালু/বন্ধ (Admin প্যানেলের টগলও একই কাজ করে) ----
-- update public.app_settings set api_enabled = false where id = 1;  -- বন্ধ
-- update public.app_settings set api_enabled = true  where id = 1;  -- চালু

-- ---- ফেরত নিতে চাইলে (কলাম মুছে ফেলা) ----
-- alter table public.app_settings drop column if exists api_enabled;
