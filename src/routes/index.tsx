import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { User } from "@supabase/supabase-js";
import { jsPDF } from "jspdf";
import {
  calculateScore,
  emptyForm,
  generatePolicy,
  STEP_NAMES,
  TOOLBOX,
  TOTAL_STEPS,
  validateStep,
  type FormData,
  type ScoreResult,
} from "@/lib/complyfy";
import "@/styles/complyfy.css";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Complyfy — UK GDPR Privacy Policy Generator" },
      {
        name: "description",
        content:
          "Generate a tailored, UK GDPR-compliant privacy policy for your small business in minutes. Covers UK GDPR, DPA 2018 and PECR.",
      },
    ],
    links: [
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600&family=Syne:wght@700;800&display=swap",
      },
    ],
  }),
  component: ComplyfyPage,
});

type Page = "home" | "account" | "generator" | "review" | "profile" | "admin" | "history" | "toolbox" | "analytics";
type AuthMode = "signup" | "login";
type Role = "admin" | "dpo" | "user";

interface SavedPolicy {
  id: string;
  company: string;
  score: number;
  risk_level: string;
  created_at: string;
  policy_text?: string;
  recommendations?: string[];
}

/* ────────  Activity helper  ──────── */
async function logActivity(userId: string, action: string, metadata: Record<string, unknown> = {}) {
  await supabase.from("user_activity").insert([{ user_id: userId, action, metadata: metadata as never }]);
}

function ComplyfyPage() {
  const [user, setUser] = useState<User | null>(null);
  const [page, setPage] = useState<Page>("home");
  const [roles, setRoles] = useState<Role[]>([]);
  const [menuOpen, setMenuOpen] = useState(false);

  const goTo = (p: Page) => { setPage(p); setMenuOpen(false); };

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });
    supabase.auth.getSession().then(({ data }) => {
      setUser(data.session?.user ?? null);
      if (data.session?.user) setPage("generator");
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!user) {
      setRoles([]);
      return;
    }
    supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .then(({ data }) => {
        setRoles((data ?? []).map((r) => r.role as Role));
      });
  }, [user]);

  const isReviewer = roles.includes("admin") || roles.includes("dpo");
  const isAdmin = roles.includes("admin");

  const logout = async () => {
    if (user) await logActivity(user.id, "logout");
    await supabase.auth.signOut();
    setUser(null);
    setPage("home");
  };

  return (
    <div className="complyfy-app">
      <header className="site-header">
        <div className="logo" style={{ cursor: "pointer" }} onClick={() => setPage(user ? "generator" : "home")}>
          Complyfy<span className="logo-dot"></span>
        </div>
        {user && (
          <div id="headerUser">
            <button className="secondary nav-btn" onClick={() => setPage("generator")}>Generator</button>
            <button className="secondary nav-btn" onClick={() => setPage("history")}>History</button>
            <button className="secondary nav-btn" onClick={() => setPage("toolbox")}>🧰 Toolbox</button>
            <button className="secondary nav-btn" onClick={() => setPage("profile")}>Profile</button>
            {isReviewer && (
              <button className="secondary nav-btn" onClick={() => setPage("review")}>🛡️ Review</button>
            )}
            {isReviewer && (
              <button className="secondary nav-btn" onClick={() => setPage("analytics")}>📊 Analytics</button>
            )}
            {isAdmin && (
              <button className="secondary nav-btn" onClick={() => setPage("admin")}>⚙ Admin</button>
            )}
            <div className="avatar">{(user.email ?? "U").charAt(0).toUpperCase()}</div>
            <span>
              {user.email}
              {isAdmin ? <span className="role-chip">Admin</span> : roles.includes("dpo") ? <span className="role-chip">DPO</span> : null}
            </span>
            <button id="logoutBtn" onClick={logout}>Sign out</button>
          </div>
        )}
      </header>

      {page === "home" && <HomePage onStart={() => setPage(user ? "generator" : "account")} />}
      {page === "account" && (
        <AccountPage onAuthed={() => setPage("generator")} onBack={() => setPage("home")} />
      )}
      {page === "generator" && user && <GeneratorPage user={user} />}
      {page === "history" && user && <HistoryPage user={user} />}
      {page === "profile" && user && <ProfilePage user={user} />}
      {page === "toolbox" && <ToolboxPage />}
      {page === "review" && user && isReviewer && <ReviewPage user={user} />}
      {page === "analytics" && user && isReviewer && <AnalyticsPage />}
      {page === "admin" && user && isAdmin && <AdminPage />}
    </div>
  );
}

/* ─────────────────────────  HOME  ───────────────────────── */

function HomePage({ onStart }: { onStart: () => void }) {
  return (
    <div className="container">
      <div className="card">
        <div className="hero-tag"></div>
        <h1>Privacy policies,<br />done properly.</h1>
        <p>Complyfy generates tailored UK GDPR-compliant privacy policies for small businesses in minutes — no lawyers, no jargon.</p>
        <p>A Privacy Policy is a legal document that explains how your business collects, uses, and protects personal data. If you run a website or collect customer information, you are legally required to be transparent about this.</p>

        <h3>Why this matters</h3>
        <p>UK businesses must comply with the UK GDPR and the Data Protection Act 2018. Many small businesses either don't understand these rules or copy generic policies, which can lead to fines, legal risk, and loss of customer trust.</p>

        <div className="info-grid">
          <div className="info-box">
            <div className="info-box-label">Regulations covered</div>
            <div className="info-box-value">3</div>
            <p>UK GDPR · DPA 2018 · PECR</p>
          </div>
          <div className="info-box">
            <div className="info-box-label">Steps to complete</div>
            <div className="info-box-value">6</div>
            <p>Takes under 5 minutes</p>
          </div>
        </div>

        <h3>You need this if you…</h3>
        <ul className="home-list">
          <li>Operate a website or app in the UK</li>
          <li>Collect personal data from users or customers</li>
          <li>Use cookies, analytics or marketing tools</li>
          <li>Want to avoid ICO fines and protect customer trust</li>
        </ul>

        <button className="primary" onClick={onStart}>Get started →</button>
      </div>
    </div>
  );
}

/* ─────────────────────────  ACCOUNT (Signup w/ extra fields)  ───────────────────────── */

function AccountPage({ onAuthed, onBack }: { onAuthed: () => void; onBack: () => void }) {
  const [mode, setMode] = useState<AuthMode>("signup");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [username, setUsername] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [industry, setIndustry] = useState("");
  const [accountType, setAccountType] = useState<"user" | "dpo">("user");
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setError("");
    setInfo("");
    const trimmed = email.trim();
    if (!trimmed || !password) return setError("Please enter an email and password.");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) return setError("Please enter a valid email address.");
    if (password.length < 6) return setError("Password must be at least 6 characters.");
    if (mode === "signup") {
      if (!username.trim()) return setError("Please choose a username.");
      if (!companyName.trim()) return setError("Please enter your company name.");
      if (!industry.trim()) return setError("Please choose an industry.");
    }
    setBusy(true);
    try {
      if (mode === "signup") {
        const { error: e } = await supabase.auth.signUp({
          email: trimmed,
          password,
          options: {
            emailRedirectTo: window.location.origin,
            data: {
              username: username.trim(),
              company_name: companyName.trim(),
              industry: industry.trim(),
            },
          },
        });
        if (e) return setError(e.message);
        const { data } = await supabase.auth.getSession();
        if (data.session) {
          // If user picked DPO, upgrade their role (trigger seeds 'user' by default).
          // Admin is intentionally NOT self-selectable for security — promote via Admin dashboard.
          if (accountType === "dpo") {
            await supabase.from("user_roles").delete().eq("user_id", data.session.user.id);
            await supabase.from("user_roles").insert([{ user_id: data.session.user.id, role: "dpo" }]);
          }
          await logActivity(data.session.user.id, "signup");
          onAuthed();
        } else setInfo("Account created. Please check your email to confirm.");
      } else {
        const { data, error: e } = await supabase.auth.signInWithPassword({ email: trimmed, password });
        if (e) return setError("Incorrect email or password.");
        if (data.user) await logActivity(data.user.id, "login");
        onAuthed();
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="container">
      <div className="card">
        <h2>Your account</h2>
        <p>Create a free account or log in to save and manage your policies.</p>
        <div className="auth-tabs" style={{ marginTop: 20 }}>
          <button className={"auth-tab" + (mode === "signup" ? " active" : "")} onClick={() => { setMode("signup"); setError(""); setInfo(""); }}>Sign Up</button>
          <button className={"auth-tab" + (mode === "login" ? " active" : "")} onClick={() => { setMode("login"); setError(""); setInfo(""); }}>Login</button>
        </div>

        {mode === "signup" && (
          <div className="signup-grid">
            <div className="field">
              <label>Username</label>
              <input type="text" placeholder="e.g. jdoe" value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" />
            </div>
            <div className="field">
              <label>Company name</label>
              <input type="text" placeholder="ABCD Ltd" value={companyName} onChange={(e) => setCompanyName(e.target.value)} />
            </div>
          </div>
        )}
        {mode === "signup" && (
          <div className="field">
            <label>Industry</label>
            <select value={industry} onChange={(e) => setIndustry(e.target.value)}>
              <option value="">Select an industry…</option>
              <option>Retail / e-commerce</option>
              <option>SaaS / technology</option>
              <option>Professional services</option>
              <option>Healthcare</option>
              <option>Education</option>
              <option>Hospitality</option>
              <option>Charity / non-profit</option>
              <option>Other</option>
            </select>
          </div>
        )}
        {mode === "signup" && (
          <div className="field">
            <label>Account type</label>
            <select value={accountType} onChange={(e) => setAccountType(e.target.value as "user" | "dpo")}>
              <option value="user">User — Generate &amp; manage your own policies</option>
              <option value="dpo">Data Protection Officer — Review all policies, compliance scores &amp; risk reports</option>
            </select>
            <small style={{ display: "block", marginTop: 6, opacity: 0.7, fontSize: 12 }}>
              Admin accounts can only be granted by an existing admin from the Admin dashboard.
            </small>
          </div>
        )}

        <div className="field">
          <label htmlFor="email">Email</label>
          <input type="email" id="email" placeholder="you@yourcompany.co.uk" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="password">Password</label>
          <input type="password" id="password" placeholder="Min. 6 characters" autoComplete={mode === "signup" ? "new-password" : "current-password"} value={password} onChange={(e) => setPassword(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") submit(); }} />
        </div>
        {error && <div className="auth-error">{error}</div>}
        {info && <div className="auth-info">{info}</div>}
        <button className="primary" onClick={submit} disabled={busy}>{busy ? "Please wait…" : mode === "signup" ? "Create Account" : "Login"}</button>
        <button className="secondary" onClick={onBack}>← Back</button>
      </div>
    </div>
  );
}

/* ─────────────────────────  GENERATOR  ───────────────────────── */

function GeneratorPage({ user }: { user: User }) {
  const [step, setStep] = useState(1);
  const [data, setData] = useState<FormData>(emptyForm());
  const [result, setResult] = useState<{ policy: string; score: ScoreResult } | null>(null);
  const [savedMsg, setSavedMsg] = useState("");
  const [saving, setSaving] = useState(false);

  // Pre-fill company from profile if available
  useEffect(() => {
    supabase
      .from("profiles")
      .select("company_name")
      .eq("user_id", user.id)
      .maybeSingle()
      .then(({ data: p }) => {
        if (p?.company_name) setData((d) => (d.company ? d : { ...d, company: p.company_name as string }));
      });
  }, [user.id]);

  const update = <K extends keyof FormData>(k: K, v: FormData[K]) => setData((d) => ({ ...d, [k]: v }));
  const toggleArray = (k: "dataTypes" | "thirdParties", value: string) => {
    setData((d) => {
      const arr = d[k];
      return { ...d, [k]: arr.includes(value) ? arr.filter((v) => v !== value) : [...arr, value] };
    });
  };

  const goTo = (n: number) => {
    if (n > step) {
      const err = validateStep(step, data);
      if (err) return alert(err);
    }
    setStep(n);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    const err = validateStep(6, data);
    if (err) return alert(err);
    const score = calculateScore(data);
    const policy = generatePolicy(data, score);
    setResult({ policy, score });
    setSavedMsg("");
    setTimeout(() => {
      document.getElementById("resultSection")?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 100);
  };

  const startOver = () => { setData(emptyForm()); setResult(null); setStep(1); window.scrollTo({ top: 0, behavior: "smooth" }); };

  const downloadPDF = () => {
    if (!result) return;
    const doc = new jsPDF({ unit: "mm", format: "a4" });
    const pageH = doc.internal.pageSize.height;
    const margin = 15;
    let y = margin;
    doc.setFont("courier", "normal");
    doc.setFontSize(8);
    doc.splitTextToSize(result.policy, 180).forEach((line: string) => {
      if (y + 5 > pageH - margin) { doc.addPage(); y = margin; }
      doc.text(line, margin, y);
      y += 4.5;
    });
    const safe = (data.company || "policy").replace(/\s+/g, "_").toLowerCase();
    doc.save(safe + "_privacy_policy.pdf");
  };

  const savePolicy = async () => {
    if (!result) return;
    setSaving(true);
    setSavedMsg("");
    const { error } = await supabase.from("policies").insert([
      {
        user_id: user.id,
        company: data.company,
        policy_text: result.policy,
        score: result.score.score,
        risk_level: result.score.riskLevel,
        recommendations: result.score.recommendations as never,
        form_data: data as never,
      },
    ]);
    setSaving(false);
    if (error) setSavedMsg("Could not save: " + error.message);
    else {
      setSavedMsg("✓ Saved to your account. View it in History.");
      await logActivity(user.id, "generate_policy", { company: data.company, score: result.score.score });
    }
  };

  const progressPct = result ? 100 : ((step - 1) / TOTAL_STEPS) * 100;
  const scoreClass: "good" | "mid" | "bad" = result
    ? result.score.score >= 80 ? "good" : result.score.score >= 60 ? "mid" : "bad"
    : "good";

  return (
    <div className="container">
      <div className="card">
        <div className="form-intro">
          <strong>Why we ask these questions:</strong> we need to understand how your business uses
          personal data so we can generate a legally accurate privacy policy under UK GDPR, DPA 2018
          and PECR. Each step takes under a minute.
        </div>
        <div className="step-header">
          <div className="step-meta">
            <span className="step-label">Step {step} of {TOTAL_STEPS}</span>
            <span className="step-count">{STEP_NAMES[step - 1]}</span>
          </div>
          <div className="progress"><div className="progress-bar" style={{ width: progressPct + "%" }}></div></div>
          <div className="step-dots">
            {Array.from({ length: TOTAL_STEPS }, (_, i) => {
              const n = i + 1;
              const cls = result ? "step-dot done" : n === step ? "step-dot active" : n < step ? "step-dot done" : "step-dot";
              return <div key={n} className={cls}></div>;
            })}
          </div>
        </div>

        <form onSubmit={handleSubmit}>
          {step === 1 && <Step1 data={data} update={update} onNext={() => goTo(2)} />}
          {step === 2 && <Step2 data={data} update={update} toggleArray={toggleArray} onBack={() => goTo(1)} onNext={() => goTo(3)} />}
          {step === 3 && <Step3 data={data} update={update} onBack={() => goTo(2)} onNext={() => goTo(4)} />}
          {step === 4 && <Step4 data={data} update={update} toggleArray={toggleArray} onBack={() => goTo(3)} onNext={() => goTo(5)} />}
          {step === 5 && <Step5 data={data} update={update} onBack={() => goTo(4)} onNext={() => goTo(6)} />}
          {step === 6 && <Step6 data={data} update={update} onBack={() => goTo(5)} />}
        </form>
      </div>

      {result && (
        <div id="resultSection" className="card">
          <h2>Your Privacy Policy</h2>
          <p>Review your generated policy below. Download as a PDF or save to your account.</p>
          <div className="score-bar-wrap">
            <div className="score-label-row">
              <span style={{ fontSize: 13, fontWeight: 600, color: "var(--ink)" }}>
                Compliance score · Risk: {result.score.riskLevel.toUpperCase()}
              </span>
              <span className={"score-number score-" + scoreClass}>{result.score.score}%</span>
            </div>
            <div className="score-track">
              <div className={"score-fill " + scoreClass} style={{ width: result.score.score + "%" }}></div>
            </div>
            <div className="risk-tags">
              {[...result.score.risks, ...result.score.positives].map((r, i) => (
                <span key={i} className={"risk-tag " + r.type}>{r.label}</span>
              ))}
            </div>
          </div>

          {result.score.recommendations.length > 0 && (
            <>
              <hr className="section-divider" />
              <h3>📋 Recommended next steps</h3>
              <p>Actionable advice tailored to the answers you gave.</p>
              <ul className="rec-list">
                {result.score.recommendations.map((r, i) => <li key={i}>{r}</li>)}
              </ul>
            </>
          )}

          <hr className="section-divider" />
          <div className="output">{result.policy}</div>
          <button className="download-btn" onClick={downloadPDF}>⬇ Download as PDF</button>
          <button className="primary" onClick={savePolicy} disabled={saving}>
            {saving ? "Saving…" : "💾 Save to my account"}
          </button>
          {savedMsg && (
            <div className={savedMsg.startsWith("✓") ? "auth-info" : "auth-error"}>{savedMsg}</div>
          )}
          <button className="secondary" onClick={startOver}>Start over</button>
        </div>
      )}
    </div>
  );
}

/* ─────────────────────────  HISTORY  ───────────────────────── */

function HistoryPage({ user }: { user: User }) {
  const [items, setItems] = useState<SavedPolicy[]>([]);
  const [openId, setOpenId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    const { data: rows } = await supabase
      .from("policies")
      .select("id, company, score, risk_level, created_at, policy_text, recommendations")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });
    setItems((rows ?? []) as SavedPolicy[]);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const deletePolicy = async (id: string) => {
    await supabase.from("policies").delete().eq("id", id);
    load();
  };

  return (
    <div className="container">
      <div className="card">
        <h2>📚 Policy history</h2>
        <p>Every policy you save is stored here with its compliance score and recommendations.</p>
        {loading ? <p>Loading…</p> : items.length === 0 ? (
          <p style={{ marginTop: 12 }}>No saved policies yet — head to the Generator and save your first.</p>
        ) : (
          <ul className="saved-list">
            {items.map((s) => {
              const cls = s.score >= 80 ? "good" : s.score >= 60 ? "mid" : "bad";
              return (
                <li key={s.id} style={{ flexDirection: "column", alignItems: "stretch" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", width: "100%", alignItems: "center", gap: 8 }}>
                    <div>
                      <strong>{s.company}</strong>
                      <div className="meta">{new Date(s.created_at).toLocaleString("en-GB")} · risk {s.risk_level}</div>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span className={"score-pill score-" + cls} style={{ background: "var(--bg)" }}>{s.score}%</span>
                      <button className="secondary nav-btn" onClick={() => setOpenId(openId === s.id ? null : s.id)}>
                        {openId === s.id ? "Close" : "View"}
                      </button>
                      <button className="secondary nav-btn" onClick={() => deletePolicy(s.id)}>Delete</button>
                    </div>
                  </div>
                  {openId === s.id && (
                    <div className="history-detail">
                      {s.recommendations && s.recommendations.length > 0 && (
                        <>
                          <strong style={{ fontSize: 13 }}>Recommendations</strong>
                          <ul className="rec-list">{s.recommendations.map((r, i) => <li key={i}>{r}</li>)}</ul>
                        </>
                      )}
                      <div className="output" style={{ marginTop: 12, maxHeight: 320 }}>{s.policy_text}</div>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

/* ─────────────────────────  PROFILE  ───────────────────────── */

interface Profile {
  username: string | null;
  company_name: string | null;
  industry: string | null;
  additional_info: string | null;
}

function ProfilePage({ user }: { user: User }) {
  const [profile, setProfile] = useState<Profile>({ username: "", company_name: "", industry: "", additional_info: "" });
  const [email, setEmail] = useState(user.email ?? "");
  const [newPassword, setNewPassword] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [activity, setActivity] = useState<{ action: string; created_at: string }[]>([]);

  useEffect(() => {
    supabase.from("profiles").select("username, company_name, industry, additional_info").eq("user_id", user.id).maybeSingle()
      .then(({ data }) => { if (data) setProfile(data as Profile); });
    supabase.from("user_activity").select("action, created_at").eq("user_id", user.id).order("created_at", { ascending: false }).limit(20)
      .then(({ data }) => setActivity(data ?? []));
  }, [user.id]);

  const saveProfile = async () => {
    setBusy(true); setMsg("");
    const payload = {
      user_id: user.id,
      username: profile.username,
      company_name: profile.company_name,
      industry: profile.industry,
      additional_info: profile.additional_info,
    };
    const { error } = await supabase.from("profiles").upsert(payload, { onConflict: "user_id" });
    if (error) setMsg("Could not save: " + error.message);
    else {
      setMsg("✓ Profile saved.");
      await logActivity(user.id, "update_profile");
    }
    setBusy(false);
  };

  const updateEmail = async () => {
    setBusy(true); setMsg("");
    const { error } = await supabase.auth.updateUser({ email: email.trim() });
    if (error) setMsg("Could not update email: " + error.message);
    else { setMsg("✓ Email update requested. Check your inbox to confirm."); await logActivity(user.id, "update_email"); }
    setBusy(false);
  };

  const updatePassword = async () => {
    if (newPassword.length < 6) { setMsg("Password must be at least 6 characters."); return; }
    setBusy(true); setMsg("");
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) setMsg("Could not update password: " + error.message);
    else { setMsg("✓ Password updated."); setNewPassword(""); await logActivity(user.id, "update_password"); }
    setBusy(false);
  };

  return (
    <div className="container">
      <div className="card">
        <h2>👤 Your profile</h2>
        <p>Keep your business details up to date so generated policies are accurate.</p>

        <div className="signup-grid">
          <div className="field">
            <label>Username</label>
            <input type="text" value={profile.username ?? ""} onChange={(e) => setProfile({ ...profile, username: e.target.value })} />
          </div>
          <div className="field">
            <label>Company name</label>
            <input type="text" value={profile.company_name ?? ""} onChange={(e) => setProfile({ ...profile, company_name: e.target.value })} />
          </div>
        </div>
        <div className="field">
          <label>Industry</label>
          <select value={profile.industry ?? ""} onChange={(e) => setProfile({ ...profile, industry: e.target.value })}>
            <option value="">Select an industry…</option>
            <option>Retail / e-commerce</option>
            <option>SaaS / technology</option>
            <option>Professional services</option>
            <option>Healthcare</option>
            <option>Education</option>
            <option>Hospitality</option>
            <option>Charity / non-profit</option>
            <option>Other</option>
          </select>
        </div>
        <div className="field">
          <label>Additional information</label>
          <textarea placeholder="Anything else we should know about your business?" value={profile.additional_info ?? ""} onChange={(e) => setProfile({ ...profile, additional_info: e.target.value })} />
        </div>
        <button className="primary" onClick={saveProfile} disabled={busy}>{busy ? "Saving…" : "Save profile"}</button>
      </div>

      <div className="card">
        <h3>Account credentials</h3>
        <div className="field">
          <label>Email</label>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <button className="secondary" onClick={updateEmail} disabled={busy}>Update email</button>

        <div className="field" style={{ marginTop: 16 }}>
          <label>New password</label>
          <input type="password" placeholder="Min. 6 characters" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
        </div>
        <button className="secondary" onClick={updatePassword} disabled={busy}>Update password</button>
        {msg && <div className={msg.startsWith("✓") ? "auth-info" : "auth-error"} style={{ marginTop: 10 }}>{msg}</div>}
      </div>

      <div className="card">
        <h3>Recent activity</h3>
        {activity.length === 0 ? <p>No activity yet.</p> : (
          <ul className="activity-list">
            {activity.map((a, i) => (
              <li key={i}>
                <span className="action">{a.action.replace(/_/g, " ")}</span>
                <span className="when">{new Date(a.created_at).toLocaleString("en-GB")}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

/* ─────────────────────────  TOOLBOX  ───────────────────────── */

function ToolboxPage() {
  return (
    <div className="container">
      <div className="card">
        <h2>🧰 GDPR Toolbox</h2>
        <p>Plain-English explanations of the key concepts you'll meet in the generator. Tap any term to expand.</p>
        <div className="toolbox-grid">
          {TOOLBOX.map((t) => (
            <details key={t.term} className="toolbox-item">
              <summary>
                <span>{t.term}<span className="short">— {t.short}</span></span>
              </summary>
              <p>{t.detail}</p>
            </details>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────  ADMIN (users + analytics)  ───────────────────────── */

interface AdminUserRow {
  user_id: string;
  username: string | null;
  company_name: string | null;
  industry: string | null;
  role: Role;
}

function AdminPage() {
  const [rows, setRows] = useState<AdminUserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({ users: 0, policies: 0, reviewers: 0, activity: 0 });
  const [msg, setMsg] = useState("");

  const load = async () => {
    setLoading(true);
    const [profilesRes, rolesRes, policiesRes, activityRes] = await Promise.all([
      supabase.from("profiles").select("user_id, username, company_name, industry"),
      supabase.from("user_roles").select("user_id, role"),
      supabase.from("policies").select("id", { count: "exact", head: true }),
      supabase.from("user_activity").select("id", { count: "exact", head: true }),
    ]);
    const roleByUser = new Map<string, Role>();
    (rolesRes.data ?? []).forEach((r) => roleByUser.set(r.user_id, r.role as Role));
    const merged: AdminUserRow[] = (profilesRes.data ?? []).map((p) => ({
      user_id: p.user_id,
      username: p.username,
      company_name: p.company_name,
      industry: p.industry,
      role: roleByUser.get(p.user_id) ?? "user",
    }));
    setRows(merged);
    setStats({
      users: merged.length,
      policies: policiesRes.count ?? 0,
      reviewers: merged.filter((r) => r.role === "admin" || r.role === "dpo").length,
      activity: activityRes.count ?? 0,
    });
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const changeRole = async (userId: string, role: Role) => {
    setMsg("");
    // Replace all roles for this user with the new one
    const del = await supabase.from("user_roles").delete().eq("user_id", userId);
    if (del.error) { setMsg("Failed: " + del.error.message); return; }
    const ins = await supabase.from("user_roles").insert([{ user_id: userId, role }]);
    if (ins.error) { setMsg("Failed: " + ins.error.message); return; }
    setMsg("✓ Role updated.");
    load();
  };

  return (
    <div className="container">
      <div className="card">
        <h2>⚙ Admin dashboard</h2>
        <p>Manage user roles and view system analytics.</p>

        <div className="review-stats">
          <div className="info-box"><div className="info-box-label">Users</div><div className="info-box-value">{stats.users}</div></div>
          <div className="info-box"><div className="info-box-label">Policies</div><div className="info-box-value">{stats.policies}</div></div>
          <div className="info-box"><div className="info-box-label">Reviewers</div><div className="info-box-value">{stats.reviewers}</div></div>
          <div className="info-box"><div className="info-box-label">Activity events</div><div className="info-box-value">{stats.activity}</div></div>
        </div>

        {msg && <div className={msg.startsWith("✓") ? "auth-info" : "auth-error"}>{msg}</div>}

        {loading ? <p>Loading…</p> : (
          <table className="admin-table">
            <thead>
              <tr><th>Username</th><th>Company</th><th>Industry</th><th>Role</th></tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.user_id}>
                  <td>{r.username ?? "—"}</td>
                  <td>{r.company_name ?? "—"}</td>
                  <td>{r.industry ?? "—"}</td>
                  <td>
                    <select value={r.role} onChange={(e) => changeRole(r.user_id, e.target.value as Role)}>
                      <option value="user">User</option>
                      <option value="dpo">DPO</option>
                      <option value="admin">Admin</option>
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

/* ─────────────────────────  ANALYTICS (DPO / Admin)  ───────────────────────── */

interface AnalyticsPolicy {
  id: string;
  company: string;
  score: number;
  risk_level: string;
  created_at: string;
  recommendations: string[] | null;
}

function AnalyticsPage() {
  const [policies, setPolicies] = useState<AnalyticsPolicy[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase
      .from("policies")
      .select("id, company, score, risk_level, created_at, recommendations")
      .order("created_at", { ascending: false })
      .then(({ data }) => {
        setPolicies((data ?? []) as AnalyticsPolicy[]);
        setLoading(false);
      });
  }, []);

  const stats = useMemo(() => {
    const total = policies.length;
    const avg = total ? Math.round(policies.reduce((s, p) => s + p.score, 0) / total) : 0;
    const low = policies.filter((p) => p.score >= 80).length;
    const medium = policies.filter((p) => p.score >= 50 && p.score < 80).length;
    const high = policies.filter((p) => p.score < 50).length;
    return { total, avg, low, medium, high };
  }, [policies]);

  const topRecommendations = useMemo(() => {
    const counts = new Map<string, number>();
    for (const p of policies) {
      for (const r of p.recommendations ?? []) {
        counts.set(r, (counts.get(r) ?? 0) + 1);
      }
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
  }, [policies]);

  const highRisk = policies.filter((p) => p.score < 50);

  return (
    <div className="container">
      <div className="card">
        <h2>📊 Compliance analytics</h2>
        <p>Aggregate risk view across every policy generated on the platform — for Data Protection Officers and admins.</p>

        <div className="review-stats">
          <div className="info-box"><div className="info-box-label">Total policies</div><div className="info-box-value">{stats.total}</div></div>
          <div className="info-box"><div className="info-box-label">Average score</div><div className="info-box-value">{stats.avg}%</div></div>
          <div className="info-box"><div className="info-box-label">Low risk</div><div className="info-box-value">{stats.low}</div></div>
          <div className="info-box"><div className="info-box-label">Medium risk</div><div className="info-box-value">{stats.medium}</div></div>
          <div className="info-box"><div className="info-box-label">High risk</div><div className="info-box-value">{stats.high}</div></div>
        </div>

        {loading ? <p>Loading…</p> : (
          <>
            <hr className="section-divider" />
            <h3>🚨 High-risk policies (&lt; 50%)</h3>
            {highRisk.length === 0 ? <p>No high-risk policies — well done.</p> : (
              <ul className="saved-list">
                {highRisk.map((p) => (
                  <li key={p.id}>
                    <div>
                      <strong>{p.company}</strong>
                      <div className="meta">{new Date(p.created_at).toLocaleString("en-GB")} · risk {p.risk_level}</div>
                    </div>
                    <span className="score-pill score-bad" style={{ background: "var(--bg)" }}>{p.score}%</span>
                  </li>
                ))}
              </ul>
            )}

            <hr className="section-divider" />
            <h3>📋 Most common recommendations</h3>
            {topRecommendations.length === 0 ? <p>No recommendations recorded yet.</p> : (
              <ul className="rec-list">
                {topRecommendations.map(([text, count]) => (
                  <li key={text}><strong>×{count}</strong> — {text}</li>
                ))}
              </ul>
            )}
          </>
        )}
      </div>
    </div>
  );
}

/* ─────────────────────────  STEP COMPONENTS  ───────────────────────── */

type StepProps = {
  data: FormData;
  update: <K extends keyof FormData>(k: K, v: FormData[K]) => void;
  onNext?: () => void;
  onBack?: () => void;
  toggleArray?: (k: "dataTypes" | "thirdParties", value: string) => void;
};

function Tooltip({ text }: { text: string }) {
  return (
    <span className="tooltip">
      <span className="tip-icon">i</span>
      <span className="tooltiptext">{text}</span>
    </span>
  );
}

function NavRow({ onBack, onNext, nextLabel = "Next →" }: { onBack?: () => void; onNext?: () => void; nextLabel?: ReactNode }) {
  if (onBack && onNext) {
    return (
      <div className="btn-row">
        <button type="button" className="primary" onClick={onNext}>{nextLabel}</button>
        <button type="button" className="secondary" onClick={onBack}>← Back</button>
      </div>
    );
  }
  return <button type="button" className="primary" onClick={onNext}>{nextLabel}</button>;
}

function Step1({ data, update, onNext }: StepProps) {
  return (
    <div>
      <h3>Company info</h3>
      <div className="field">
        <label>Company / trading name <span className="badge req">Required</span></label>
        <input type="text" placeholder="e.g. ABCD Ltd" value={data.company} onChange={(e) => update("company", e.target.value)} />
      </div>
      <div className="field">
        <label>Data controller email <span className="badge req">Required</span></label>
        <div className="field-hint">The contact address users can reach for data requests.</div>
        <input type="email" placeholder="privacy@yourcompany.co.uk" value={data.email} onChange={(e) => update("email", e.target.value)} />
      </div>
      <div className="field">
        <label>Website URL</label>
        <input type="url" placeholder="https://yourcompany.co.uk" value={data.website} onChange={(e) => update("website", e.target.value)} />
      </div>
      <div className="field">
        <label>ICO Registration number <span className="badge">Optional</span></label>
        <input type="text" placeholder="e.g. ZA123456" value={data.ico} onChange={(e) => update("ico", e.target.value)} />
      </div>
      <div className="field">
        <label>Data Protection Officer name <span className="badge">Optional</span></label>
        <input type="text" placeholder="Full name or leave blank" value={data.dpo} onChange={(e) => update("dpo", e.target.value)} />
      </div>
      <NavRow onNext={onNext} />
    </div>
  );
}

const DATA_TYPES = [
  { value: "Names and email addresses", title: "Names & email addresses", desc: "Basic contact information" },
  { value: "Phone numbers", title: "Phone numbers", desc: "Contact or support purposes" },
  { value: "Postal and billing addresses", title: "Postal / billing addresses", desc: "Delivery or invoicing" },
  { value: "Payment and financial data", title: "Payment & financial data", desc: "Card details, bank info — higher risk" },
  { value: "Device and usage data (IP address, browser, pages visited)", title: "Device & usage data", desc: "IP address, browser, pages visited" },
  { value: "Special category / sensitive data (health, religion, ethnicity, or biometric data)", title: "Special category / sensitive data", desc: "Health, religion, ethnicity, biometric — stricter obligations apply" },
];

function CheckGroup({ values, options, onToggle }: { values: string[]; options: { value: string; title: string; desc: string }[]; onToggle: (v: string) => void; }) {
  return (
    <div className="checkbox-group">
      {options.map((o) => (
        <label key={o.value} className="check-item">
          <input type="checkbox" checked={values.includes(o.value)} onChange={() => onToggle(o.value)} />
          <div className="clabel"><strong>{o.title}</strong><span>{o.desc}</span></div>
        </label>
      ))}
    </div>
  );
}

function Step2({ data, update, toggleArray, onBack, onNext }: StepProps) {
  return (
    <div>
      <h3>Data collection</h3>
      <div className="tipbox">
        <span>💡</span>
        <span>Only collect data you actually need. Data minimisation is a core UK GDPR principle.</span>
      </div>
      <div className="field">
        <label>Types of personal data collected{" "}
          <Tooltip text="Personal data is any information that can identify someone — names, emails, IP addresses, even an order number tied to a customer. Tick everything that applies; sensitive (special category) data triggers stricter rules." />
          <span className="badge req">Select all that apply</span>
        </label>
        <CheckGroup values={data.dataTypes} options={DATA_TYPES} onToggle={(v) => toggleArray!("dataTypes", v)} />
      </div>
      <div className="field">
        <label>Primary purpose of processing{" "}
          <Tooltip text="Legal basis is your mandatory justification under UK GDPR for using personal data. You must clearly explain WHY you collect data — vague purposes are not sufficient." />
        </label>
        <select value={data.purpose} onChange={(e) => update("purpose", e.target.value)}>
          <option>Order fulfilment and delivery</option>
          <option>Account creation and management</option>
          <option>Marketing and newsletters</option>
          <option>Customer support</option>
          <option>Legal and compliance obligations</option>
          <option>Analytics and service improvement</option>
        </select>
      </div>
      <div className="field">
        <label>Additional processing purposes <span className="badge">Optional</span></label>
        <textarea placeholder="e.g. We also personalise your dashboard experience..." value={data.purposeExtra} onChange={(e) => update("purposeExtra", e.target.value)} />
      </div>
      <NavRow onBack={onBack} onNext={onNext} />
    </div>
  );
}

function Step3({ data, update, onBack, onNext }: StepProps) {
  return (
    <div>
      <h3>Legal basis</h3>
      <div className="tipbox">
        <span>⚖️</span>
        <span>Legal basis is your mandatory justification under UK GDPR for using personal data. You must have a valid legal basis for every type of processing. Legitimate Interests requires a balancing test.</span>
      </div>
      <div className="field">
        <label>Legal basis for processing{" "}
          <Tooltip text="Under UK GDPR Article 6 you must identify at least one of six lawful bases before processing personal data: Consent, Contract, Legal obligation, Vital interests, Public task, or Legitimate interests." />
        </label>
        <select value={data.legal} onChange={(e) => update("legal", e.target.value)}>
          <option>Consent</option>
          <option>Contract performance</option>
          <option>Legal obligation</option>
          <option>Vital interests</option>
          <option>Public task</option>
          <option>Legitimate interests</option>
        </select>
      </div>
      {data.legal === "Legitimate interests" && (
        <div className="field">
          <label>Describe your legitimate interest <span className="badge req">Required if selected</span></label>
          <div className="field-hint">Explain the interest, why it overrides individual rights, and that you have carried out a balancing test.</div>
          <textarea placeholder="e.g. We process purchase history to detect fraud. We have carried out a Legitimate Interests Assessment and concluded our interests are not overridden because..." value={data.legitExplain} onChange={(e) => update("legitExplain", e.target.value)} />
        </div>
      )}
      <div className="field">
        <label>Special category legal basis <span className="badge">If applicable</span></label>
        <div className="field-hint">Required only if you process sensitive/special category data (Article 9 UK GDPR).</div>
        <select value={data.specialCategoryBasis} onChange={(e) => update("specialCategoryBasis", e.target.value)}>
          <option value="">Not applicable</option>
          <option>Explicit consent</option>
          <option>Employment / social security law</option>
          <option>Vital interests (subject unable to consent)</option>
          <option>Data made public by the data subject</option>
          <option>Legal claims</option>
          <option>Substantial public interest</option>
          <option>Medical / health purposes</option>
          <option>Public health</option>
          <option>Archiving / research / statistics</option>
        </select>
      </div>
      <NavRow onBack={onBack} onNext={onNext} />
    </div>
  );
}

const THIRD_PARTIES = [
  { value: "No third parties — we process all data internally", title: "No third parties", desc: "All data processed internally" },
  { value: "Email marketing provider (e.g. Mailchimp, Klaviyo)", title: "Email marketing provider", desc: "e.g. Mailchimp, Klaviyo, Brevo" },
  { value: "Payment processor (e.g. Klarna, PayPal)", title: "Payment processor", desc: "e.g. Klarna, PayPal, Square" },
  { value: "Analytics provider (e.g. Google Analytics, Hotjar)", title: "Analytics provider", desc: "e.g. Google Analytics, Hotjar" },
  { value: "Cloud hosting and infrastructure provider (e.g. AWS, Google Cloud, Azure)", title: "Cloud hosting / infrastructure", desc: "e.g. AWS, Google Cloud, Azure" },
  { value: "CRM or customer support tools (e.g. HubSpot, Zendesk)", title: "CRM / customer support tools", desc: "e.g. HubSpot, Zendesk, Intercom" },
  { value: "Advertising networks (e.g. Google Ads, Meta Ads)", title: "Advertising networks", desc: "e.g. Google Ads, Meta Ads" },
  { value: "Legal or regulatory authorities when required by law", title: "Legal / regulatory authorities", desc: "When required by law or court order" },
];

function Step4({ data, update, toggleArray, onBack, onNext }: StepProps) {
  return (
    <div>
      <h3>Third-party sharing</h3>
      <div className="field">
        <label>Who do you share personal data with? <span className="badge req">Select all that apply</span></label>
        <CheckGroup values={data.thirdParties} options={THIRD_PARTIES} onToggle={(v) => toggleArray!("thirdParties", v)} />
      </div>
      <div className="field">
        <label>International data transfers</label>
        <div className="field-hint">Do any third-party processors store or process data outside the UK?</div>
        <select value={data.transfersOutsideUK} onChange={(e) => update("transfersOutsideUK", e.target.value)}>
          <option value="no">No — all data remains within the UK</option>
          <option value="adequacy">Yes — to countries with UK adequacy decisions</option>
          <option value="safeguards">Yes — with appropriate safeguards (e.g. standard contractual clauses)</option>
          <option value="unsure">Unsure / some transfers may occur</option>
        </select>
      </div>
      <NavRow onBack={onBack} onNext={onNext} />
    </div>
  );
}

function Step5({ data, update, onBack, onNext }: StepProps) {
  return (
    <div>
      <h3>Cookies &amp; retention</h3>
      <div className="field">
        <label>Cookie usage{" "}
          <Tooltip text="Under PECR (Privacy and Electronic Communications Regulations) any non-essential cookies require explicit, informed consent before being set." />
        </label>
        <select value={data.cookies} onChange={(e) => update("cookies", e.target.value)}>
          <option value="none">No cookies used</option>
          <option value="essential">Essential cookies only (no consent needed)</option>
          <option value="analytics">Analytics / performance cookies (consent required)</option>
          <option value="marketing">Marketing / targeting cookies (consent required)</option>
          <option value="all">All of the above (consent required for non-essential)</option>
        </select>
      </div>
      <div className="field">
        <label>Data retention period{" "}
          <Tooltip text="UK GDPR requires you to specify how long you keep personal data and not retain it longer than necessary for the purpose." />
        </label>
        <select value={data.retention} onChange={(e) => update("retention", e.target.value)}>
          <option>Up to 12 months</option>
          <option>1–3 years</option>
          <option>3–6 years</option>
          <option>Over 6 years (legal / financial records)</option>
          <option>Until account deletion or withdrawal of consent</option>
        </select>
      </div>
      <div className="field">
        <label>Security measures in place <span className="badge">Optional</span></label>
        <div className="field-hint">Briefly describe how you protect personal data.</div>
        <textarea placeholder="e.g. All data is encrypted in transit via TLS 1.2+. Access is restricted to authorised staff. We use MFA on all systems." value={data.securityMeasures} onChange={(e) => update("securityMeasures", e.target.value)} />
      </div>
      <NavRow onBack={onBack} onNext={onNext} />
    </div>
  );
}

function Step6({ data, update, onBack }: StepProps) {
  return (
    <div>
      <h3>Final details</h3>
      <div className="field">
        <label>Do you process data of children under 13?</label>
        <select value={data.childrenData} onChange={(e) => update("childrenData", e.target.value)}>
          <option value="no">No</option>
          <option value="yes">Yes — with parental consent</option>
          <option value="restricted">Service is restricted to adults (18+)</option>
        </select>
      </div>
      <div className="field">
        <label>Automated decision-making or profiling?{" "}
          <Tooltip text="If you use algorithms or AI to make decisions that significantly affect individuals (e.g. credit scoring) you must disclose this and offer human review under Article 22." />
        </label>
        <select value={data.automatedDecisions} onChange={(e) => update("automatedDecisions", e.target.value)}>
          <option value="no">No automated decision-making</option>
          <option value="profiling">Profiling only (no significant decisions)</option>
          <option value="automated">Automated decisions that significantly affect individuals</option>
        </select>
      </div>
      <div className="field">
        <label>How will you notify users of policy changes?</label>
        <select value={data.policyUpdateMethod} onChange={(e) => update("policyUpdateMethod", e.target.value)}>
          <option>Email notification to registered users</option>
          <option>Notice on website homepage</option>
          <option>In-app notification</option>
          <option>Updated "Last Revised" date only</option>
        </select>
      </div>
      <div className="field">
        <label>Anything else to include? <span className="badge">Optional</span></label>
        <textarea placeholder="Sector-specific obligations, extra contact details, or notes for your users..." value={data.additionalInfo} onChange={(e) => update("additionalInfo", e.target.value)} />
      </div>
      <div className="btn-row">
        <button type="submit" className="primary">Generate policy ✓</button>
        <button type="button" className="secondary" onClick={onBack}>← Back</button>
      </div>
    </div>
  );
}

/* ─────────────────────────  REVIEW (Admin / DPO)  ───────────────────────── */

type ReviewStatus = "pending" | "approved" | "changes_requested" | "rejected";

interface ReviewablePolicy {
  id: string;
  company: string;
  score: number;
  created_at: string;
  user_id: string;
  policy_text: string;
}

interface PolicyReview {
  id: string;
  policy_id: string;
  reviewer_id: string;
  status: ReviewStatus;
  notes: string;
  updated_at: string;
}

const STATUS_LABEL: Record<ReviewStatus, string> = {
  pending: "Pending",
  approved: "Approved",
  changes_requested: "Changes requested",
  rejected: "Rejected",
};

function ReviewPage({ user }: { user: User }) {
  const [policies, setPolicies] = useState<ReviewablePolicy[]>([]);
  const [reviews, setReviews] = useState<PolicyReview[]>([]);
  const [openId, setOpenId] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "unreviewed" | ReviewStatus>("all");
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    const [pRes, rRes] = await Promise.all([
      supabase.from("policies").select("id, company, score, created_at, user_id, policy_text").order("created_at", { ascending: false }),
      supabase.from("policy_reviews").select("id, policy_id, reviewer_id, status, notes, updated_at").order("updated_at", { ascending: false }),
    ]);
    if (pRes.data) setPolicies(pRes.data as ReviewablePolicy[]);
    if (rRes.data) setReviews(rRes.data as PolicyReview[]);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const latestReviewFor = (policyId: string): PolicyReview | undefined =>
    reviews.find((r) => r.policy_id === policyId);

  const filtered = useMemo(() => {
    if (filter === "all") return policies;
    if (filter === "unreviewed") return policies.filter((p) => !latestReviewFor(p.id));
    return policies.filter((p) => latestReviewFor(p.id)?.status === filter);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [policies, reviews, filter]);

  const stats = useMemo(() => {
    const counts = { total: policies.length, unreviewed: 0, approved: 0, changes_requested: 0, rejected: 0, pending: 0 };
    for (const p of policies) {
      const r = latestReviewFor(p.id);
      if (!r) counts.unreviewed++; else counts[r.status]++;
    }
    return counts;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [policies, reviews]);

  return (
    <div className="container">
      <div className="card">
        <h2>🛡️ Review queue</h2>
        <p>As an admin or Data Protection Officer, you can review every policy generated by users, flag issues, and record an approval decision.</p>

        <div className="review-stats">
          <div className="info-box"><div className="info-box-label">Total</div><div className="info-box-value">{stats.total}</div></div>
          <div className="info-box"><div className="info-box-label">Unreviewed</div><div className="info-box-value">{stats.unreviewed}</div></div>
          <div className="info-box"><div className="info-box-label">Approved</div><div className="info-box-value">{stats.approved}</div></div>
          <div className="info-box"><div className="info-box-label">Changes req.</div><div className="info-box-value">{stats.changes_requested}</div></div>
        </div>

        <div className="filter-row">
          {(["all", "unreviewed", "pending", "approved", "changes_requested", "rejected"] as const).map((f) => (
            <button key={f} className={"filter-chip" + (filter === f ? " active" : "")} onClick={() => setFilter(f)} type="button">
              {f === "all" ? "All" : f === "unreviewed" ? "Unreviewed" : STATUS_LABEL[f]}
            </button>
          ))}
        </div>

        {loading ? <p>Loading…</p> : filtered.length === 0 ? <p>No policies match this filter.</p> : (
          <ul className="saved-list">
            {filtered.map((p) => {
              const r = latestReviewFor(p.id);
              const cls = p.score >= 80 ? "good" : p.score >= 60 ? "mid" : "bad";
              return (
                <li key={p.id} style={{ flexDirection: "column", alignItems: "stretch" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", width: "100%", alignItems: "center", gap: 8 }}>
                    <div>
                      <strong>{p.company}</strong>
                      <div className="meta">{new Date(p.created_at).toLocaleString("en-GB")} · user {p.user_id.slice(0, 8)}…</div>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span className={"score-pill score-" + cls} style={{ background: "var(--bg)" }}>{p.score}%</span>
                      {r ? <span className={"status-chip status-" + r.status}>{STATUS_LABEL[r.status]}</span> : <span className="status-chip status-unreviewed">Unreviewed</span>}
                      <button className="secondary nav-btn" onClick={() => setOpenId(openId === p.id ? null : p.id)} type="button">{openId === p.id ? "Close" : "Open"}</button>
                    </div>
                  </div>
                  {openId === p.id && <ReviewPanel policy={p} existing={r} reviewerId={user.id} onSaved={load} />}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

function ReviewPanel({ policy, existing, reviewerId, onSaved }: { policy: ReviewablePolicy; existing: PolicyReview | undefined; reviewerId: string; onSaved: () => void; }) {
  const [status, setStatus] = useState<ReviewStatus>(existing?.status ?? "pending");
  const [notes, setNotes] = useState(existing?.notes ?? "");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  const submit = async () => {
    setBusy(true); setMsg("");
    let error;
    if (existing) {
      ({ error } = await supabase.from("policy_reviews").update({ status, notes }).eq("id", existing.id));
    } else {
      ({ error } = await supabase.from("policy_reviews").insert([{ policy_id: policy.id, reviewer_id: reviewerId, status, notes }]));
    }
    setBusy(false);
    if (error) setMsg("Could not save: " + error.message);
    else { setMsg("✓ Review saved."); onSaved(); }
  };

  return (
    <div className="review-panel">
      <div className="output" style={{ maxHeight: 320, overflowY: "auto" }}>{policy.policy_text}</div>
      <div className="field">
        <label>Decision</label>
        <select value={status} onChange={(e) => setStatus(e.target.value as ReviewStatus)}>
          <option value="pending">Pending — still reviewing</option>
          <option value="approved">Approved — compliant</option>
          <option value="changes_requested">Changes requested</option>
          <option value="rejected">Rejected — not compliant</option>
        </select>
      </div>
      <div className="field">
        <label>Reviewer notes</label>
        <textarea placeholder="Cite UK GDPR articles, missing sections, or recommendations for the policy owner..." value={notes} onChange={(e) => setNotes(e.target.value)} />
      </div>
      <button className="primary" onClick={submit} disabled={busy} type="button">{busy ? "Saving…" : existing ? "Update review" : "Submit review"}</button>
      {msg && <div className={msg.startsWith("✓") ? "auth-info" : "auth-error"}>{msg}</div>}
    </div>
  );
}
