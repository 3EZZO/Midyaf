// Apply the persisted language before React mounts so the first paint
// is already in the right direction. Theme is always dark.
(function () {
  try {
    var lang = localStorage.getItem("midyaf.lang") || "ar";
    var root = document.documentElement;
    root.lang = lang;
    root.dir = lang === "ar" ? "rtl" : "ltr";
  } catch (_) {}
})();
