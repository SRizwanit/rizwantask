/* থিম: হাতে বদলানো (auto / light / dark) — <head>-এ সবার আগে চলে, যাতে রঙ ঝিলিক না দেয়। */
(function(){try{var t=localStorage.getItem('kp_theme_v1');if(t==='dark'||t==='light')document.documentElement.setAttribute('data-theme',t);}catch(e){}})();

/* ব্রাউজারের উপরের বার (theme-color) থিম অনুযায়ী বদলায়: লাইটে উজ্জ্বল সবুজ, নাইটে গাঢ় সবুজ-কালো */
(function(){
  var LIGHT='#0b5f4c', DARK='#06201a';
  function dark(){var t=document.documentElement.getAttribute('data-theme');return t==='dark'||(t!=='light'&&!!window.matchMedia&&matchMedia('(prefers-color-scheme: dark)').matches);}
  function apply(){
    var m=document.querySelector('meta[name="theme-color"]'); if(!m)return;
    if(!m.hasAttribute('data-kp'))m.setAttribute('data-kp',m.getAttribute('content')||'');
    if(m.getAttribute('data-kp')!==LIGHT)return;   // স্প্ল্যাশের আলাদা রঙ অক্ষত থাকে
    m.setAttribute('content',dark()?DARK:LIGHT);
  }
  window.__kpTC=apply;
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',apply);else apply();
  try{var mq=matchMedia('(prefers-color-scheme: dark)');if(mq.addEventListener)mq.addEventListener('change',apply);else if(mq.addListener)mq.addListener(apply);}catch(e){}
})();

/* PWA: হোম স্ক্রিনে ইনস্টল + অফলাইন শেল (sw.js) */
(function(){
  window.addEventListener('beforeinstallprompt',function(e){e.preventDefault();window.__kpInstallEv=e;try{window.dispatchEvent(new Event('kp-installable'));}catch(x){}});
  window.addEventListener('appinstalled',function(){window.__kpInstallEv=null;try{window.dispatchEvent(new Event('kp-installed'));}catch(x){}});
  if('serviceWorker' in navigator&&/^https?:$/.test(location.protocol)){
    window.addEventListener('load',function(){navigator.serviceWorker.register('sw.js').catch(function(){});});
  }
})();
