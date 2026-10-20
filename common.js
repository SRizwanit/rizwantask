/* Shared client: Supabase REST, session, phone validation, PIN hashing, device id, UI helpers. */
(function(){
const SB_URL='https://opluyjvhaibcznaidiod.supabase.co';
const SB_KEY='eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9wbHV5anZoYWliY3puYWlkaW9kIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc5MjQ3ODcyMSwiZXhwIjoyMTA4MDU0NzIxfQ.3tCEEoIuyvrPt7a_9RNYzsjNwijAxA7ixQVLRpk-Blk';
const ADMIN_PHONE='01714656343', ADMIN_WA='8801714656343';
const SK='kp_session_v1', DK='kp_device_v1';
const enc=encodeURIComponent;

/* ---- ইন্টারনেট নেই / ধীর নেট — স্পষ্ট বার্তা (পেইজের উপরে ছোট বার) ---- */
const Net=(function(){
  let bar=null,msg=null,btn=null,slowT=0,hideT=0,inflight=0,mode='';
  function css(){
    if(document.getElementById('netBarCss'))return;
    const s=document.createElement('style');s.id='netBarCss';
    s.textContent='#netBar{position:fixed;left:50%;top:calc(env(safe-area-inset-top,0px) + 66px);transform:translateX(-50%);z-index:9999;display:none;align-items:center;gap:10px;max-width:92vw;padding:8px 12px;border-radius:12px;font-size:13px;line-height:1.45;color:#fff;background:#b91c1c;box-shadow:0 8px 24px rgba(0,0,0,.35);border:1px solid rgba(255,255,255,.25)}'
     +'#netBar.on{display:flex}#netBar.slow{background:#b45309}#netBar.ok{background:#15803d}'
     +'#netBar button{flex:none;border:1px solid rgba(255,255,255,.6);background:rgba(255,255,255,.16);color:#fff;border-radius:99px;padding:3px 12px;font-size:12.5px;font-weight:600;cursor:pointer}#netBar button[hidden]{display:none}';
    document.head.appendChild(s);
  }
  function ensure(){
    if(bar&&document.body.contains(bar))return true;
    if(!document.body)return false;
    css();bar=document.createElement('div');bar.id='netBar';bar.setAttribute('role','status');bar.setAttribute('aria-live','polite');
    msg=document.createElement('span');btn=document.createElement('button');btn.type='button';btn.textContent='আবার চেষ্টা';
    btn.onclick=()=>{const ev=new CustomEvent('kp-retry',{cancelable:true});window.dispatchEvent(ev);
      if(!ev.defaultPrevented&&!/view\.html/.test(location.pathname)&&navigator.onLine)location.reload();
      else if(!navigator.onLine)toast('এখনো ইন্টারনেট নেই',true);};
    bar.appendChild(msg);bar.appendChild(btn);document.body.appendChild(bar);return true;
  }
  function show(m,text,retry,auto){
    if(!ensure()){document.addEventListener('DOMContentLoaded',()=>show(m,text,retry,auto),{once:true});return;}
    clearTimeout(hideT);mode=m;msg.textContent=text;btn.hidden=!retry;bar.className='on '+m;
    if(auto)hideT=setTimeout(hide,auto);
  }
  function hide(){if(bar)bar.className='';mode='';}
  function offline(){show('off','ইন্টারনেট নেই — সংযোগ ফিরলে নিজে থেকেই আবার চেষ্টা হবে।',true);}
  window.addEventListener('offline',offline);
  window.addEventListener('online',()=>{show('ok','ইন্টারনেট ফিরেছে',false,2500);try{window.dispatchEvent(new Event('kp-online'));}catch(e){}});
  if(!navigator.onLine){if(document.body)offline();else document.addEventListener('DOMContentLoaded',offline,{once:true});}
  return{
    start(){inflight++;clearTimeout(slowT);slowT=setTimeout(()=>{if(inflight>0&&navigator.onLine&&mode!=='off')show('slow','নেট ধীর — একটু অপেক্ষা করুন…',false);},9000);return 1;},
    end(){inflight=Math.max(0,inflight-1);if(!inflight){clearTimeout(slowT);if(mode==='slow')hide();}},
    fail(){if(!navigator.onLine)offline();else show('off','সংযোগ পাওয়া যাচ্ছে না — নেট দুর্বল হতে পারে।',true,7000);},
    hide
  };
})();

async function req(method,path,body,prefer){
  const h={apikey:SB_KEY,Authorization:'Bearer '+SB_KEY};
  if(body!==undefined)h['Content-Type']='application/json';
  if(prefer)h.Prefer=prefer;
  const tk=Net.start();
  try{
    const r=await fetch(SB_URL+'/rest/v1/'+path,{method,headers:h,body:body!==undefined?JSON.stringify(body):undefined,cache:'no-store'});
    const t=await r.text();
    if(!r.ok)throw new Error(method+' '+path.split('?')[0]+' failed: '+r.status+' '+t);
    return t?JSON.parse(t):[];
  }catch(e){
    if(e instanceof TypeError||/Failed to fetch|NetworkError|Load failed|network/i.test(String(e&&e.message))&&!/failed: \d{3}/.test(String(e&&e.message))){
      Net.fail(); throw new Error('ইন্টারনেট সংযোগ নেই বা খুব দুর্বল — আবার চেষ্টা করুন');
    }
    throw e;
  }finally{Net.end(tk);}
}
const sb={
  get:p=>req('GET',p),
  post:(p,b)=>req('POST',p,b,'return=representation'),
  patch:(p,b)=>req('PATCH',p,b,'return=representation'),
  patchMin:(p,b)=>req('PATCH',p,b,'return=minimal'),
  upsert:(p,b)=>req('POST',p,b,'resolution=merge-duplicates,return=representation'),
  del:p=>req('DELETE',p)
};

/* ---- phone validation (port of SupabaseClient.PhoneValidator) ---- */
const Phone={
  isBD(raw){const p=raw.trim().replace(/[\s-]/g,'');return p.startsWith('01')||p.startsWith('+8801')||p.startsWith('8801')||p.startsWith('+880');},
  normBD(raw){let p=raw.trim().replace(/[\s-]/g,'');if(p.startsWith('+880'))p='0'+p.slice(4);else if(p.startsWith('880'))p='0'+p.slice(3);return p;},
  validate(raw){
    const t=(raw||'').trim();
    if(!t)return{ok:false,phone:'',msg:'ফোন নাম্বার দিন',foreign:false};
    const c=t.replace(/[\s-]/g,'');
    if(Phone.isBD(t)){
      const n=Phone.normBD(t);
      if(n.length!==11)return{ok:false,phone:n,msg:'বাংলাদেশি নাম্বার ১১ ডিজিটের হতে হবে (যেমন: 017XXXXXXXX)',foreign:false};
      if(!/^01[0-9]{9}$/.test(n))return{ok:false,phone:n,msg:'সঠিক বাংলাদেশি নাম্বার দিন',foreign:false};
      return{ok:true,phone:n,msg:'OK',foreign:false};
    }
    const f=c.replace('+','');
    if(!/^[0-9]{7,15}$/.test(f))return{ok:false,phone:t,msg:'সঠিক বিদেশি নাম্বার দিন (৭-১৫ ডিজিট, + সহ)',foreign:true};
    return{ok:true,phone:c.startsWith('+')?c:'+'+f,msg:'OK',foreign:true};
  }
};
const isAdminPhone=p=>!!p&&Phone.normBD(p)===ADMIN_PHONE;

/* ---- PIN hashing: sha256("salt:pin") hex, same as the Kotlin app ---- */
async function sha256(s){const b=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s));return[...new Uint8Array(b)].map(x=>x.toString(16).padStart(2,'0')).join('');}
const newSalt=()=>[...crypto.getRandomValues(new Uint8Array(16))].map(x=>x.toString(16).padStart(2,'0')).join('');
const hashPin=(pin,salt)=>sha256(salt+':'+pin);
async function verifyPin(user,pin){if(!user.password_salt||!user.password_hash)return false;return(await hashPin(pin,user.password_salt))===user.password_hash;}
const hasPin=u=>!!(u.password_hash&&u.password_salt);

/* ---- device id ---- */
function deviceId(){let d='';try{d=localStorage.getItem(DK)||'';}catch(e){}
  if(!d){d=(crypto.randomUUID?crypto.randomUUID():newSalt()+newSalt());try{localStorage.setItem(DK,d);}catch(e){}}return d;}
const deviceEmpty=d=>d==null||String(d).trim()===''||String(d).trim().toLowerCase()==='null';

/* ---- users ---- */
async function findUserByPhone(phone){
  const n=Phone.normBD(phone);let r=await sb.get('app_users?phone=eq.'+enc(phone)+'&limit=1');
  if(!r.length&&n!==phone)r=await sb.get('app_users?phone=eq.'+enc(n)+'&limit=1');return r[0]||null;}
async function findUserByDevice(dev,excludeId){
  let p='app_users?device_id=eq.'+enc(dev)+'&limit=1';if(excludeId)p+='&id=neq.'+enc(excludeId);
  const r=await sb.get(p);return r[0]||null;}

/* ---- OTP pool (table otp_codes, same flow as the app) ---- */
async function requestOtp(phone){
  const a=await sb.get('otp_codes?status=eq.available&limit=1&order=id.asc');
  if(!a.length)throw new Error('OTP পুল খালি, অ্যাডমিনকে জানান');
  const row=a[0],exp=new Date(Date.now()+2*60000).toISOString();
  await sb.patch('otp_codes?id=eq.'+row.id,{status:'assigned',phone,assigned_at:new Date().toISOString(),expires_at:exp});
  return row.code;}
async function verifyOtp(phone,code){
  const r=await sb.get('otp_codes?phone=eq.'+enc(phone)+'&code=eq.'+enc(code)+'&status=eq.assigned&order=id.desc&limit=1');
  if(!r.length)return false;const o=r[0];
  if(o.expires_at&&new Date(o.expires_at).getTime()<Date.now()){await sb.patch('otp_codes?id=eq.'+o.id,{status:'expired'});return false;}
  await sb.patch('otp_codes?id=eq.'+o.id,{status:'verified'});return true;}

/* ---- session ---- */
const session={
  get(){try{return JSON.parse(localStorage.getItem(SK)||'null');}catch(e){return null;}},
  set(u){try{localStorage.setItem(SK,JSON.stringify({id:u.id,phone:u.phone,name:u.full_name}));}catch(e){}},
  clear(){try{localStorage.removeItem(SK);}catch(e){}}
};
function logout(){session.clear();location.replace('login.html');}
/* Guard: returns the fresh user row, or redirects (never resolves) when not allowed. */
async function requireAuth({admin=false}={}){
  const s=session.get();if(!s){location.replace('login.html');return new Promise(()=>{});}
  let u=null;
  try{const r=await sb.get('app_users?id=eq.'+enc(s.id)+'&limit=1');u=r[0]||null;}
  catch(e){toast('নেটওয়ার্ক সমস্যা: '+e.message,true);return new Promise(()=>{});}
  if(!u||deviceEmpty(u.device_id)||u.device_id!==deviceId()){logout();return new Promise(()=>{});}
  if(u.is_blocked&&!isAdminPhone(u.phone)){blockedScreen(u);return new Promise(()=>{});}
  if(admin&&!isAdminPhone(u.phone)){location.replace('task.html');return new Promise(()=>{});}
  touchActive(u);
  return u;}
/* ব্লক করা ইউজারের পূর্ণ-পর্দা বার্তা */
function blockedScreen(u){
  document.body.innerHTML='<div class="wrap"><div class="card" style="text-align:center;margin-top:40px"><div class="av" style="background:var(--err)">!</div>'
   +'<h3 style="margin:0 0 8px">আপনার অ্যাকাউন্ট ব্লক করা হয়েছে</h3>'
   +'<p class="hint">'+esc(u.blocked_reason||'অ্যাডমিন আপনার অ্যাকাউন্টটি সাময়িকভাবে বন্ধ করেছেন।')+'</p>'
   +'<button id="bkWa" class="help block" style="margin-top:14px">হোয়াটসঅ্যাপে অ্যাডমিনের সাথে যোগাযোগ</button>'
   +'<button id="bkOut" class="danger block" style="margin-top:10px">লগআউট</button></div></div>';
  document.getElementById('bkOut').onclick=logout;
  document.getElementById('bkWa').onclick=()=>window.open('https://wa.me/'+ADMIN_WA+'?text='+enc('আসসালামু আলাইকুম, আমার অ্যাকাউন্ট ব্লক দেখাচ্ছে। নাম: '+(u.full_name||'-')+', ফোন: '+(u.phone||'-')),'_blank','noopener');
}
/* সর্বশেষ সক্রিয় সময় (৫ মিনিটে একবার; কলাম না থাকলে নীরবে বাদ) */
function touchActive(u){
  const k='kp_touch_v1',n=Date.now();
  try{if(n-(+localStorage.getItem(k)||0)<300000)return;localStorage.setItem(k,String(n));}catch(e){}
  sb.patch('app_users?id=eq.'+enc(u.id),{last_active_at:new Date(n).toISOString()}).catch(()=>{});
}
/* কার্যকলাপের লগ — ব্যর্থ হলেও অ্যাপ থামে না (activity_log টেবিল না থাকলে বাদ) */
function log(action,detail,who){
  try{
    const s=who||session.get()||{};
    const row={user_id:s.id!=null?String(s.id):null,user_name:s.name||s.full_name||'',action,detail:String(detail==null?'':detail).slice(0,500)};
    return fetch(SB_URL+'/rest/v1/activity_log',{method:'POST',keepalive:true,headers:{apikey:SB_KEY,Authorization:'Bearer '+SB_KEY,'Content-Type':'application/json',Prefer:'return=minimal'},body:JSON.stringify(row)}).catch(()=>{});
  }catch(e){return Promise.resolve();}
}
/* ---- সংখ্যা / টাকা / তারিখ (বাংলা) ---- */
const bn=n=>Number(n||0).toLocaleString('bn-BD');
const r2=x=>Math.round((Number(x)||0)*100)/100;
const money=x=>r2(x).toLocaleString('bn-BD',{minimumFractionDigits:2,maximumFractionDigits:2})+' ৳';
const fmtD=t=>t?new Date(t).toLocaleDateString('bn-BD',{day:'numeric',month:'short',year:'numeric'}):'-';
const fmtDT=t=>t?new Date(t).toLocaleString('bn-BD',{day:'numeric',month:'short',hour:'numeric',minute:'2-digit'}):'-';
const startOfDay=(d)=>{const x=d?new Date(d):new Date();x.setHours(0,0,0,0);return x;};
/* ---- আয়ের হিসাব ----
   রেট: কিতাবের page_rate; না থাকলে সেটিংসের ডিফল্ট page_rate (০.২০ ৳)। আয় গোনা হয় শুধু "অনুমোদিত" পেইজে
   (অনুমোদনের সময়ের রেট proofs.rate-এ থাকে)। অপেক্ষমাণ পেইজ আলাদা দেখায়; "সংশোধন দরকার" পেইজে আয় নেই। */
const DEF_RATE=0.2, DEF_MIN=50;
function rateOf(book,S){
  const r=book&&book.page_rate; if(r!=null&&r!==''&&Number.isFinite(Number(r)))return Number(r);
  const d=S&&S.page_rate; return d!=null&&d!==''&&Number.isFinite(Number(d))?Number(d):DEF_RATE;
}
function summarize(proofs,booksById,S,payments){
  const o={pages:0,approved:0,pending:0,correction:0,earned:0,pendingAmt:0,paid:0,requested:0,available:0,byBook:{}};
  (proofs||[]).forEach(p=>{
    const st=p.review_status||'pending',b=booksById[String(p.book_id)],cur=rateOf(b,S);
    const bb=o.byBook[p.book_id]||(o.byBook[p.book_id]={n:0,approved:0,pending:0,correction:0,earned:0});
    o.pages++;bb.n++;
    if(st==='approved'){const r=p.rate!=null&&p.rate!==''?Number(p.rate):cur;o.approved++;bb.approved++;o.earned+=r;bb.earned+=r;}
    else if(st==='correction'){o.correction++;bb.correction++;}
    else{o.pending++;bb.pending++;o.pendingAmt+=cur;}
  });
  (payments||[]).forEach(x=>{if(x.status==='paid')o.paid+=Number(x.amount)||0;else if(x.status==='requested')o.requested+=Number(x.amount)||0;});
  o.earned=r2(o.earned);o.pendingAmt=r2(o.pendingAmt);o.paid=r2(o.paid);o.requested=r2(o.requested);
  o.available=Math.max(0,r2(o.earned-o.paid-o.requested));
  return o;
}
/* সব সারি পেজিনেট করে আনে (১০০০টি করে) */
async function getAll(path,max){
  const out=[],P=1000,sep=path.includes('?')?'&':'?';
  for(let off=0;off<(max||200000);off+=P){const r=await sb.get(path+sep+'limit='+P+'&offset='+off);out.push(...r);if(r.length<P)break;}
  return out;
}
/* ---- থিম: auto (সিস্টেম) → light → dark ---- */
const TK='kp_theme_v1';
const theme={
  get(){try{const t=localStorage.getItem(TK);return t==='dark'||t==='light'?t:'auto';}catch(e){return'auto';}},
  set(t){try{if(t==='auto')localStorage.removeItem(TK);else localStorage.setItem(TK,t);}catch(e){}
    if(t==='auto')document.documentElement.removeAttribute('data-theme');else document.documentElement.setAttribute('data-theme',t);
    if(window.__kpTC)window.__kpTC();},
  next(){return({auto:'light',light:'dark',dark:'auto'})[theme.get()];},
  label(t){return({auto:'সিস্টেম অনুযায়ী',light:'লাইট মোড',dark:'ডার্ক মোড'})[t||theme.get()];}
};
function mountTheme(root){
  (root||document).querySelectorAll('[data-theme-toggle]').forEach(b=>{
    const paint=()=>{const t=theme.get();b.innerHTML=ic(t==='dark'?'moon':t==='light'?'sun':'auto');b.title='থিম: '+theme.label(t)+' (বদলাতে চাপুন)';b.setAttribute('aria-label',b.title);};
    b.onclick=()=>{theme.set(theme.next());paint();toast('থিম: '+theme.label());};paint();
  });
}

/* ---- UI helpers ---- */
const esc=s=>String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let tt=0;
function toast(m,bad){let t=document.getElementById('toast');if(!t){t=document.createElement('div');t.id='toast';document.body.appendChild(t);}
  t.textContent=m;t.className='show'+(bad?' bad':'');clearTimeout(tt);tt=setTimeout(()=>t.className='',3200);}
const ICONS={
 book:'<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>',
 user:'<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
 users:'<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
 tasks:'<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/>',
 shield:'<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>',
 logout:'<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>',
 left:'<polyline points="15 18 9 12 15 6"/>',plus:'<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>',
 edit:'<path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>',
 trash:'<polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>',
 search:'<circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>',
 key:'<path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.78 7.78 5.5 5.5 0 0 1 7.78-7.78zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4"/>',
 phone:'<rect x="5" y="2" width="14" height="20" rx="2"/><line x1="12" y1="18" x2="12.01" y2="18"/>',
 settings:'<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>',
 refresh:'<polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>',
 device:'<rect x="2" y="4" width="20" height="12" rx="2"/><line x1="8" y1="20" x2="16" y2="20"/><line x1="12" y1="16" x2="12" y2="20"/>',
 check:'<polyline points="20 6 9 17 4 12"/>',wallet:'<path d="M20 12V8H6a2 2 0 0 1 0-4h12v4"/><path d="M4 6v12a2 2 0 0 0 2 2h14v-4"/><path d="M18 12a2 2 0 0 0 0 4h4v-4z"/>',
 ticket:'<path d="M3 9a2 2 0 0 0 0 6v3a1 1 0 0 0 1 1h16a1 1 0 0 0 1-1v-3a2 2 0 0 1 0-6V6a1 1 0 0 0-1-1H4a1 1 0 0 0-1 1z"/><path d="M14 5v2.5M14 10.75v2.5M14 16.5V19"/>',
 whatsapp:'<path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/><path d="M9.4 8.6c-.3.5-.3 1.3.5 2.6s2 2.2 3.3 2.6c.6.2 1.2-.1 1.5-.6l.3-.6-1.6-.9-.6.6c-.8-.3-1.5-1-1.9-1.8l.6-.6-.9-1.6z"/>',
 headset:'<path d="M3 18v-6a9 9 0 0 1 18 0v6"/><path d="M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3zM3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z"/>',
 sun:'<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/>',
 moon:'<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>',
 auto:'<circle cx="12" cy="12" r="9"/><path d="M12 3v18" /><path d="M12 3a9 9 0 0 1 0 18z" fill="currentColor"/>',
 trophy:'<path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0V4z"/><path d="M17 5h3v2a3 3 0 0 1-3 3M7 5H4v2a3 3 0 0 0 3 3"/>',
 bell:'<path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/>',
 chart:'<line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/>',
 list:'<line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><circle cx="3.5" cy="6" r="1"/><circle cx="3.5" cy="12" r="1"/><circle cx="3.5" cy="18" r="1"/>',
 ban:'<circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/>',
 x:'<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>',
 clock:'<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>',
 info:'<circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/>',
 send:'<line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>',
 zap:'<polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>',
 play:'<polygon points="6 3 20 12 6 21 6 3"/>',
 target:'<circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/>',
 download:'<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>'
};
const LOGO='<svg class="mark" viewBox="0 0 64 64" aria-hidden="true"><g fill="none" stroke-linecap="round" stroke-linejoin="round"><path d="M9 61V35a23 23 0 0 1 46 0V61M4 61H60" stroke-width="2" style="stroke:#f2d27a"/><g transform="translate(32 25)" style="stroke:#f2d27a" stroke-width="1.2"><circle r="1.4"/><ellipse rx="1.7" ry="5"/><ellipse rx="1.7" ry="5" transform="rotate(45)"/><ellipse rx="1.7" ry="5" transform="rotate(90)"/><ellipse rx="1.7" ry="5" transform="rotate(135)"/></g><path d="M32 52V38M32 38C28 35.5 22 35.5 17 37V51C22 49.5 28 49.5 32 52M32 38C36 35.5 42 35.5 47 37V51C42 49.5 36 49.5 32 52" stroke-width="2.2" style="stroke:#f3fff9"/><path d="M19 57C25 56.5 29 55 32 52C35 55 39 56.5 45 57" stroke-width="1.8" style="stroke:#f2d27a"/><path d="M36.5 44l2.8 2.8 4.6-5.8" stroke-width="2.2" style="stroke:#f2d27a"/></g><path d="M35 1.4A5.5 5.5 0 1 0 35 10.6A4.6 4.6 0 1 1 35 1.4z" style="fill:#f2d27a"/><path class="mk-sp" d="M40.50 3.30 L41.18 5.07 L43.07 5.17 L41.59 6.36 L42.09 8.18 L40.50 7.15 L38.91 8.18 L39.41 6.36 L37.93 5.17 L39.82 5.07z" style="fill:#fff7d6"/></svg>';
const ic=(n,c)=>n==='mark'?LOGO:'<svg class="i '+(c||'')+'" viewBox="0 0 24 24" aria-hidden="true">'+(ICONS[n]||'')+'</svg>';
function hydrateIcons(root){(root||document).querySelectorAll('[data-ic]').forEach(e=>{e.innerHTML=ic(e.dataset.ic,e.dataset.cls)+(e.innerHTML||'');e.removeAttribute('data-ic');});mountTheme(root);}
/* ---- হোম স্ক্রিনে ইনস্টল (PWA) ---- */
const Install={
  standalone:()=>(window.matchMedia&&matchMedia('(display-mode: standalone)').matches)||window.navigator.standalone===true,
  ios:()=>/iphone|ipad|ipod/i.test(navigator.userAgent)&&!window.MSStream,
  can:()=>!!window.__kpInstallEv,
  async prompt(){const ev=window.__kpInstallEv;if(!ev)return 'none';ev.prompt();let r={};try{r=await ev.userChoice;}catch(e){}window.__kpInstallEv=null;return r.outcome||'done';}
};

const $=id=>document.getElementById(id);
function btnBusy(b,on){if(b)b.disabled=!!on;}

window.App={sb,Phone,isAdminPhone,hashPin,newSalt,verifyPin,hasPin,deviceId,deviceEmpty,findUserByPhone,findUserByDevice,requestOtp,verifyOtp,
  session,logout,requireAuth,esc,toast,ic,hydrateIcons,$,btnBusy,ADMIN_PHONE,ADMIN_WA,
  log,bn,r2,money,fmtD,fmtDT,startOfDay,rateOf,summarize,getAll,DEF_RATE,DEF_MIN,theme,mountTheme,enc,Net,Install};
})();
