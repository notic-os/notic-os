function getThemeClass(theme) {
  return theme === "light" ? "theme-light" : "theme-dark";
}

function getThemeStyles(theme) {
  if (theme !== "light") return "";
  // Override key slate classes for a lighter presentation without rewriting templates.
  return `<style>
    body.theme-light { background:#f8fafc; color:#0f172a; }
    body.theme-light .bg-slate-950,
    body.theme-light .bg-slate-950\\/70,
    body.theme-light .bg-slate-950\\/80,
    body.theme-light .bg-slate-900,
    body.theme-light .bg-slate-900\\/40,
    body.theme-light .bg-slate-900\\/50,
    body.theme-light .bg-slate-900\\/60,
    body.theme-light .bg-slate-900\\/70,
    body.theme-light .bg-slate-900\\/80,
    body.theme-light .bg-slate-900\\/90,
    body.theme-light .bg-slate-800,
    body.theme-light .bg-slate-800\\/60,
    body.theme-light .bg-slate-800\\/70,
    body.theme-light .bg-slate-800\\/80 {
      background-color:#ffffff;
      color:#0f172a;
    }
    body.theme-light .bg-slate-900\\/70 { background-color:rgba(255,255,255,0.92); }
    body.theme-light .bg-slate-900\\/60 { background-color:rgba(255,255,255,0.90); }
    body.theme-light .bg-slate-900\\/40 { background-color:rgba(255,255,255,0.88); }
    body.theme-light .bg-slate-900\\/50 { background-color:rgba(255,255,255,0.89); }
    body.theme-light .bg-slate-950\\/70 { background-color:rgba(255,255,255,0.95); }
    body.theme-light .bg-slate-950\\/80 { background-color:rgba(255,255,255,0.97); }
    body.theme-light .border-slate-800,
    body.theme-light .border-slate-700 { border-color:#e2e8f0; }
    body.theme-light .text-slate-100,
    body.theme-light .text-slate-200,
    body.theme-light .text-slate-300,
    body.theme-light .text-white { color:#0f172a; }
    body.theme-light .text-slate-400 { color:#334155; }
    body.theme-light .text-slate-500 { color:#475569; }
    body.theme-light .shadow-black\\/30 { box-shadow:0 20px 40px rgba(15,23,42,0.12); }
    body.theme-light .shadow-sky-900\\/30 { box-shadow:0 20px 40px rgba(12,74,110,0.12); }
    body.theme-light table thead { background-color:#f1f5f9; color:#334155; }
    body.theme-light a { color:#0f172a; }
    body.theme-light .text-sky-300 { color:#0369a1; }
    body.theme-light .bg-gradient-to-r { background-image:linear-gradient(to right, #e2e8f0, #f8fafc, #e2e8f0); }
    body.theme-light .bg-gradient-to-br { background-image:linear-gradient(to bottom right, #e2e8f0, #f8fafc); }
    body.theme-light header.bg-gradient-to-r { background-image:linear-gradient(to right, #e2e8f0, #f8fafc); }
    body.theme-light aside { background-color:#f8fafc !important; }
    body.theme-light .bg-slate-800:hover,
    body.theme-light .hover\\:bg-slate-800:hover { background-color:#f1f5f9; }
  </style>`;
}

module.exports = { getThemeClass, getThemeStyles };
