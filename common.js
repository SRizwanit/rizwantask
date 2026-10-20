/* Shared client: Supabase REST, session, phone validation, PIN hashing, device id, UI helpers. */
(function(){
const SB_URL='https://opluyjvhaibcznaidiod.supabase.co';
const SB_KEY='eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9wbHV5anZoYWliY3puYWlkaW9kIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc5MjQ3ODcyMSwiZXhwIjoyMTA4MDU0NzIxfQ.3tCEEoIuyvrPt7a_9RNYzsjNwijAxA7ixQVLRpk-Blk';
const ADMIN_PHONE='01714656343', ADMIN_WA='8801714656343';
const SK='kp_session_v1', DK='kp_device_v1';
const enc=encodeURIComponent;

async function req(method,path,body,prefer){
  const h={apikey:SB_KEY,Authorization:'Bearer '+SB_KEY};
  if(body!==undefined)h['Content-Type']='application/json';
  if(prefer)h.Prefer=prefer;
  const r=await fetch(SB_URL+'/rest/v1/'+path,{method,headers:h,body:body!==undefined?JSON.stringify(body):undefined,cache:'no-store'});
  const t=await r.text();
  if(!r.ok)throw new Error(method+' '+path.split('?')[0]+' failed: '+r.status+' '+t);
  return t?JSON.parse(t):[];
}
const sb={
  get:p=>req('GET',p),
  post:(p,b)=>req('POST',p,b,'return=representation'),
  patch:(p,b)=>req('PATCH',p,b,'return=representation'),
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
  if(admin&&!isAdminPhone(u.phone)){location.replace('task.html');return new Promise(()=>{});}
  return u;}

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
 check:'<polyline points="20 6 9 17 4 12"/>',wallet:'<path d="M20 12V8H6a2 2 0 0 1 0-4h12v4"/><path d="M4 6v12a2 2 0 0 0 2 2h14v-4"/><path d="M18 12a2 2 0 0 0 0 4h4v-4z"/>'
};
const LOGO='<svg class="mark" viewBox="0 0 64 64" aria-hidden="true"><g fill="none" stroke-linecap="round" stroke-linejoin="round"><path d="M12 12h40v40H12z M32 3.7 60.3 32 32 60.3 3.7 32z" stroke-width="2" style="stroke:#f2d27a"/><path d="M32 42V25 M32 25C28 22 22.5 22 19 23.5V40.5C22.5 39 28 39 32 42 M32 25C36 22 41.5 22 45 23.5V40.5C41.5 39 36 39 32 42" stroke-width="2.4" style="stroke:#f3fff9"/><path d="M35.5 32.5l3.2 3.2 5-6.4" stroke-width="2.6" style="stroke:#f2d27a"/></g><path class="mk-sp" d="M54 6c.5 3.6 1.9 5 5.5 5.5-3.6.5-5 1.9-5.5 5.5-.5-3.6-1.9-5-5.5-5.5C52.1 11 53.5 9.6 54 6z" style="fill:#fff7d6"/></svg>';
const ic=(n,c)=>n==='mark'?LOGO:'<svg class="i '+(c||'')+'" viewBox="0 0 24 24" aria-hidden="true">'+(ICONS[n]||'')+'</svg>';
function hydrateIcons(root){(root||document).querySelectorAll('[data-ic]').forEach(e=>{e.innerHTML=ic(e.dataset.ic,e.dataset.cls)+(e.innerHTML||'');e.removeAttribute('data-ic');});}
const $=id=>document.getElementById(id);
function btnBusy(b,on){if(b)b.disabled=!!on;}

window.App={sb,Phone,isAdminPhone,hashPin,newSalt,verifyPin,hasPin,deviceId,deviceEmpty,findUserByPhone,findUserByDevice,requestOtp,verifyOtp,
  session,logout,requireAuth,esc,toast,ic,hydrateIcons,$,btnBusy,ADMIN_PHONE,ADMIN_WA};
})();
