# RizwanTask

কিতাব প্রুফিং ওয়েব অ্যাপ (Supabase + GitHub + Gemini)।

## পেইজ
- `index.html` — splash স্ক্রিন (লোডিং অ্যানিমেশন), তারপর লগইন/টাস্কে পাঠায়
- `login.html`, `signup.html`, `task.html`, `view.html`, `admin.html`
- `common.css` / `common.js` — শেয়ার্ড লেআউট ও ক্লায়েন্ট
- `theme.css` — ইসলামি থিম: জামরুদ সবুজ + সোনালি ঝিলিমিলি, গম্বুজ/চাঁদ-তারা/গোলাপ-নকশা (সব পেইজে)
- `icon.svg` — ফেভিকন

## এপি আই চালু/বন্ধ
অ্যাডমিন প্যানেল → সেটিংস → "এপি আই নিয়ন্ত্রণ" টগল।
বন্ধ থাকলে view.html-এ কোনো এপি আই (OCR/অটো OCR/প্রুফিং) চলে না; স্ট্যাটাস লাইনে
`টেক্সট নেই (পেস্ট করে সেভ করুন) • এপি আই বন্ধ` দেখায়।

প্রথমবার Supabase SQL Editor-এ `supabase_api_toggle.sql` চালান (নতুন কলাম `app_settings.api_enabled`)।
