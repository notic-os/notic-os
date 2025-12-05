require("dotenv").config();
const express = require("express");
const path = require("path");
const fs = require("fs");
const cors = require("cors");
const session = require("express-session");
const bcrypt = require("bcryptjs");
const Tickets = require("./lib/ticketStore.js");
const Settings = require("./lib/settingsStore.js");
const { getThemeClass, getThemeStyles } = require("./lib/theme.js");

const app = express();
const PORT = process.env.PORT || 3000;

// ✅ CORS FIRST — before anything else
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname)));

const useSecureCookies = process.env.SESSION_COOKIE_SECURE === "true";
if (useSecureCookies) {
  // behind a proxy (e.g. nginx) Express needs this flag to honor secure cookies
  app.set("trust proxy", 1);
}

// Sessions for admin auth
app.use(
  session({
    secret: process.env.SESSION_SECRET || "change-me-session-secret",
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: "lax",
      secure: useSecureCookies,
    },
  })
);

// Simple session-based admin auth using bcrypt password hash in env
function requireLogin(req, res, next) {
  if (req.session && req.session.adminUser) return next();
  return res.redirect("/login");
}

app.get("/login", (req, res) => {
  const error = req.query.error ? decodeURIComponent(req.query.error) : "";
  const settings = Settings.load();
  const themeClass = getThemeClass(settings.theme);
  const themeStyles = getThemeStyles(settings.theme);
  const cardClass =
    settings.theme === "light"
      ? "bg-white text-gray-900 border-gray-200"
      : "bg-slate-950 text-slate-100 border-slate-800 shadow-sky-900/30";
  const inputClass =
    settings.theme === "light"
      ? "border border-gray-300 p-2 rounded w-full mb-3"
      : "border border-slate-700 bg-slate-900 text-slate-100 p-2 rounded w-full mb-3";
  const buttonClass =
    settings.theme === "light"
      ? "w-full bg-[#0F6CBD] text-white py-2 rounded font-medium"
      : "w-full bg-sky-600 hover:bg-sky-500 text-white py-2 rounded font-medium";
  const logoBlock = settings.loginLogo
    ? `<div class="flex justify-center mb-4"><img src="${settings.loginLogo}" alt="Admin logo" style="max-width:200px;max-height:200px;height:auto;width:auto;" class="rounded-md shadow"/></div>`
    : "";
  res.send(`
    <html>
    <head>
      <title>Admin Login</title>
      <link href="/assets/tailwind.css" rel="stylesheet" />
      ${themeStyles}
    </head>
    <body class="${themeClass} ${settings.theme === "light" ? "bg-gray-100 text-gray-900" : "bg-slate-950 text-slate-100"} min-h-screen flex items-center justify-center p-6">
      <form method="POST" action="/login" class="${cardClass} shadow rounded-xl p-6 w-full max-w-sm border">
        ${logoBlock}
        <h1 class="text-xl font-semibold mb-4">${settings.theme === "light" ? "Admin Login" : "Admin Login"}</h1>
        ${error ? `<div class=\"mb-3 text-sm text-red-500\">${error}</div>` : ""}
        <label class="block text-sm font-medium ${settings.theme === "light" ? "text-gray-700" : "text-slate-200"}">Username</label>
        <input name="username" class="${inputClass}" required />
        <label class="block text-sm font-medium ${settings.theme === "light" ? "text-gray-700" : "text-slate-200"}">Password</label>
        <input name="password" type="password" class="${inputClass.replace("mb-3", "mb-4")}" required />
        <button class="${buttonClass}">Sign in</button>
      </form>
    </body>
    </html>
  `);
});

app.post("/login", async (req, res) => {
  const { username, password } = req.body || {};
  const expectedUser = process.env.ADMIN_USER || "";
  const passHash = process.env.ADMIN_PASS_HASH || "";

  if (!expectedUser || !passHash) {
    console.error("ADMIN_USER or ADMIN_PASS_HASH not set. Admin login is unavailable.");
    return res.redirect("/login?error=" + encodeURIComponent("Admin not configured. Set ADMIN_USER and ADMIN_PASS_HASH."));
  }

  try {
    const okUser = username === expectedUser;
    const okPass = await bcrypt.compare(String(password || ""), passHash);
    if (okUser && okPass) {
      req.session.adminUser = expectedUser;
      return res.redirect("/admin");
    }
  } catch (e) {
    console.error("Login error:", e.message);
  }
  return res.redirect("/login?error=" + encodeURIComponent("Invalid credentials"));
});

app.post("/logout", (req, res) => {
  req.session.destroy(() => res.redirect("/login"));
});

// Basic health check for monitoring
app.get("/healthz", async (req, res) => {
  const checks = {};

  // Config: basic admin auth + email configuration
  const missingConfig = [];
  if (!process.env.ADMIN_USER) missingConfig.push("ADMIN_USER");
  if (!process.env.ADMIN_PASS_HASH) missingConfig.push("ADMIN_PASS_HASH");
  if (!process.env.SESSION_SECRET) missingConfig.push("SESSION_SECRET");
  checks.config = {
    ok: missingConfig.length === 0,
    missing: missingConfig,
  };

  // Storage: ensure we can write to Ticket/ and uploads/
  const storageDetails = {};
  let storageOk = true;
  const dirs = [
    { key: "ticketDir", dir: Tickets.TICKET_DIR },
    { key: "uploadsDir", dir: path.join(__dirname, "uploads") },
  ];

  for (const { key, dir } of dirs) {
    try {
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      const probe = path.join(dir, `.healthcheck-${Date.now()}-${Math.random().toString(16).slice(2)}`);
      fs.writeFileSync(probe, "ok");
      fs.unlinkSync(probe);
      storageDetails[key] = { ok: true, path: dir };
    } catch (err) {
      storageOk = false;
      storageDetails[key] = { ok: false, path: dir, error: err.message };
    }
  }
  checks.storage = {
    ok: storageOk,
    ...storageDetails,
  };

  // Email: validate that whichever mode is configured has the required env vars
  const useGraph = process.env.USE_GRAPH === "true";
  if (useGraph) {
    const required = ["AZURE_TENANT_ID", "AZURE_CLIENT_ID", "AZURE_CLIENT_SECRET", "GRAPH_SENDER_UPN"];
    const missing = required.filter((k) => !process.env[k]);
    checks.email = {
      mode: "graph",
      ok: missing.length === 0,
      missing,
    };
  } else {
    const required = ["SMTP_HOST", "SMTP_PORT", "FROM_EMAIL"];
    const missing = required.filter((k) => !process.env[k]);
    checks.email = {
      mode: "smtp",
      ok: missing.length === 0,
      missing,
    };
  }

  const overallOk = checks.config.ok && checks.storage.ok && checks.email.ok;
  res.status(overallOk ? 200 : 503).json({
    ok: overallOk,
    checks,
  });
});

app.use("/", require("./routes/tickets"));
app.use("/admin", requireLogin, require("./routes/admin"));

//const pollMailbox = require("./jobs/pollMail.js");

//setInterval(() => {
//  pollMailbox();
//}, 60 * 1000); // every 60 sec

app.listen(PORT, "0.0.0.0", () => {
  const base = process.env.BASE_URL || `http://localhost:${PORT}`;
  console.log(`Running at ${base}`);
});
