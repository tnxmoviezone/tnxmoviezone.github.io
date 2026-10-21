/* TNxMovieZone — Bangla/English UI toggle (v1)
   Static strings: [data-i18n] (text) + [data-i18n-ph] (placeholder).
   Dynamic strings: window.tr('English text') from page scripts. */
(function () {
  var BN = {
    'Home': 'হোম',
    'Trending': 'ট্রেন্ডিং',
    'Release': 'রিলিজ',
    'Search movies...': 'মুভি খুঁজুন...',
    '✨ Featured': '✨ ফিচার্ড',
    '▶ Watch Now': '▶ এখনই দেখুন',
    'More Info': 'আরও তথ্য',
    'Announcement': 'ঘোষণা',
    'Request a Movie': 'মুভির অনুরোধ করুন',
    'Movie/Series name...': 'মুভি/সিরিজের নাম...',
    'Year (optional)...': 'বছর (ঐচ্ছিক)...',
    'Send Request': 'অনুরোধ পাঠান',
    '🔍 Search Results': '🔍 খোঁজার ফলাফল',
    '✕ Clear': '✕ মুছুন',
    '▶ Continue Watching': '▶ দেখা চালিয়ে যান',
    'Clear': 'মুছুন',
    '❤️ My Watchlist': '❤️ আমার ওয়াচলিস্ট',
    'Trending Now': 'এখন ট্রেন্ডিং',
    'Latest Release': 'সর্বশেষ রিলিজ',
    'Newest First': 'নতুন আগে',
    'Top Rated': 'সেরা রেটিং',
    '📅 All Years': '📅 সব বছর',
    '⭐ Any Rating': '⭐ যেকোনো রেটিং',
    '⭐ 7+': '⭐ ৭+',
    '⭐ 8+': '⭐ ৮+',
    '⭐ 9+': '⭐ ৯+',
    '↕ Default Sort': '↕ ডিফল্ট',
    '🆕 Newest First': '🆕 নতুন আগে',
    '⭐ Top Rated': '⭐ সেরা রেটিং',
    'All rights reserved.': 'সর্বস্বত্ব সংরক্ষিত।',
    'Made for movie lovers 🍿': 'মুভিপ্রেমীদের জন্য তৈরি 🍿',
    '← Back': '← ফিরে যান',
    '🎬 Trailer': '🎬 ট্রেলার',
    '📤 Share': '📤 শেয়ার করুন',
    'Rate this:': 'রেটিং দিন:',
    '🎭 Cast': '🎭 অভিনয়শিল্পী',
    'You May Also Like': 'আপনার আরও পছন্দ হতে পারে',
    'Movie not found': 'মুভিটি পাওয়া যায়নি',
    'No related titles.': 'সম্পর্কিত আর কিছু নেই।',
    'No titles here yet.': 'এখানে এখনো কিছু নেই।',
    'No movies yet': 'এখনো কোনো মুভি আসেনি',
    'Failed to load catalog': 'ক্যাটালগ লোড করা যায়নি',
    'Server': 'সার্ভার',
    '🚨 Report': '🚨 রিপোর্ট',
    'Loading player...': 'প্লেয়ার লোড হচ্ছে...',
    '📺 Episodes': '📺 এপিসোডসমূহ',
    '⏭️ Auto-next': '⏭️ অটো-নেক্সট',
    'Next Episode →': 'পরের এপিসোড →',
    'Movie Details': 'মুভির বিবরণ',
    'If a server fails, try another 🍿': 'একটি সার্ভার কাজ না করলে আরেকটি চেষ্টা করুন 🍿',
    'Audio': 'অডিও',
    'Subtitle': 'সাবটাইটেল',
    'Loading...': 'লোড হচ্ছে...'
  };

  var lang = 'en';
  try { lang = localStorage.getItem('tnx_lang') || 'en'; } catch (e) {}
  if (lang !== 'bn') lang = 'en';

  function tr(s) {
    if (lang === 'bn' && BN[s]) return BN[s];
    return s;
  }

  function applyI18n() {
    document.querySelectorAll('[data-i18n]').forEach(function (el) {
      el.textContent = tr(el.getAttribute('data-i18n'));
    });
    document.querySelectorAll('[data-i18n-ph]').forEach(function (el) {
      el.setAttribute('placeholder', tr(el.getAttribute('data-i18n-ph')));
    });
    document.querySelectorAll('.langToggle').forEach(function (b) {
      b.textContent = lang === 'bn' ? 'EN' : 'বাং';
    });
    document.documentElement.setAttribute('lang', lang === 'bn' ? 'bn' : 'en');
  }

  function toggleLang() {
    lang = lang === 'bn' ? 'en' : 'bn';
    try { localStorage.setItem('tnx_lang', lang); } catch (e) {}
    applyI18n();
    try { window.dispatchEvent(new Event('langchange')); } catch (e) {}
  }

  window.tr = tr;
  window.applyI18n = applyI18n;
  window.toggleLang = toggleLang;
  window.currentLang = function () { return lang; };

  document.addEventListener('click', function (e) {
    var b = e.target.closest ? e.target.closest('.langToggle') : null;
    if (b) toggleLang();
  });
  document.addEventListener('DOMContentLoaded', applyI18n);
})();
