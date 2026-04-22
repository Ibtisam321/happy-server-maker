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

type Page = "home" | "account" | "generator" | "review";
type AuthMode = "signup" | "login";
type Role = "admin" | "dpo" | "user";

interface SavedPolicy {
  id: string;
  company: string;
  score: number;
  created_at: string;
}

function ComplyfyPage() {
  const [user, setUser] = useState<User | null>(null);
  const [page, setPage] = useState<Page>("home");
  const [roles, setRoles] = useState<Role[]>([]);

  // Auth state restoration — listener BEFORE getSession (per docs)
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

  // Load roles whenever the user changes
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

  const logout = async () => {
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
            {isReviewer && (
              <>
                <button
                  className="secondary nav-btn"
                  onClick={() => setPage("generator")}
                >
                  Generator
                </button>
                <button
                  className="secondary nav-btn"
                  onClick={() => setPage("review")}
                >
                  🛡️ Review queue
                </button>
              </>
            )}
            <div className="avatar">{(user.email ?? "U").charAt(0).toUpperCase()}</div>
            <span>
              {user.email}
              {isReviewer && (
                <span className="role-chip">{roles.includes("admin") ? "Admin" : "DPO"}</span>
              )}
            </span>
            <button id="logoutBtn" onClick={logout}>
              Sign out
            </button>
          </div>
        )}
      </header>

      {page === "home" && <HomePage onStart={() => setPage(user ? "generator" : "account")} />}
      {page === "account" && (
        <AccountPage
          onAuthed={() => setPage("generator")}
          onBack={() => setPage("home")}
        />
      )}
      {page === "generator" && user && <GeneratorPage user={user} />}
      {page === "review" && user && isReviewer && <ReviewPage user={user} />}
    </div>
  );
}

/* ─────────────────────────  HOME  ───────────────────────── */

function HomePage({ onStart }: { onStart: () => void }) {
  return (
    <div className="container">
      <div className="card">
        <div className="hero-tag"></div>
        <h1>
          Privacy policies,
          <br />
          done properly.
        </h1>
        <p>
          Complyfy generates tailored UK GDPR-compliant privacy policies for small businesses
          in minutes — no lawyers, no jargon.
        </p>
        <p>
          A Privacy Policy is a legal document that explains how your business collects, uses,
          and protects personal data. If you run a website or collect customer information, you
          are legally required to be transparent about this.
        </p>

        <h3>Why this matters</h3>
        <p>
          UK businesses must comply with the UK GDPR and the Data Protection Act 2018. Many
          small businesses either don't understand these rules or copy generic policies, which
          can lead to fines, legal risk, and loss of customer trust.
        </p>

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

        <button className="primary" onClick={onStart}>
          Get started →
        </button>
      </div>
    </div>
  );
}

/* ─────────────────────────  ACCOUNT  ───────────────────────── */

function AccountPage({ onAuthed, onBack }: { onAuthed: () => void; onBack: () => void }) {
  const [mode, setMode] = useState<AuthMode>("signup");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setError("");
    setInfo("");
    const trimmed = email.trim();
    if (!trimmed || !password) {
      setError("Please enter an email and password.");
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      setError("Please enter a valid email address.");
      return;
    }
    if (password.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }
    setBusy(true);
    try {
      if (mode === "signup") {
        const { error: e } = await supabase.auth.signUp({
          email: trimmed,
          password,
          options: { emailRedirectTo: window.location.origin },
        });
        if (e) {
          setError(e.message);
          return;
        }
        // With auto-confirm enabled, user is signed in immediately.
        const { data } = await supabase.auth.getSession();
        if (data.session) onAuthed();
        else setInfo("Account created. Please check your email to confirm.");
      } else {
        const { error: e } = await supabase.auth.signInWithPassword({
          email: trimmed,
          password,
        });
        if (e) {
          setError("Incorrect email or password.");
          return;
        }
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
          <button
            className={"auth-tab" + (mode === "signup" ? " active" : "")}
            onClick={() => {
              setMode("signup");
              setError("");
              setInfo("");
            }}
          >
            Sign Up
          </button>
          <button
            className={"auth-tab" + (mode === "login" ? " active" : "")}
            onClick={() => {
              setMode("login");
              setError("");
              setInfo("");
            }}
          >
            Login
          </button>
        </div>
        <div className="field">
          <label htmlFor="email">Email</label>
          <input
            type="email"
            id="email"
            placeholder="you@yourcompany.co.uk"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor="password">Password</label>
          <input
            type="password"
            id="password"
            placeholder="Min. 6 characters"
            autoComplete={mode === "signup" ? "new-password" : "current-password"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") submit();
            }}
          />
        </div>
        {error && <div className="auth-error">{error}</div>}
        {info && <div className="auth-info">{info}</div>}
        <button className="primary" onClick={submit} disabled={busy}>
          {busy ? "Please wait…" : mode === "signup" ? "Create Account" : "Login"}
        </button>
        <button className="secondary" onClick={onBack}>
          ← Back
        </button>
      </div>
    </div>
  );
}

/* ─────────────────────────  GENERATOR  ───────────────────────── */

function GeneratorPage({ user }: { user: User }) {
  const [step, setStep] = useState(1);
  const [data, setData] = useState<FormData>(emptyForm());
  const [result, setResult] = useState<{ policy: string; score: ScoreResult } | null>(null);
  const [saved, setSaved] = useState<SavedPolicy[]>([]);
  const [savedMsg, setSavedMsg] = useState("");
  const [saving, setSaving] = useState(false);

  const update = <K extends keyof FormData>(k: K, v: FormData[K]) =>
    setData((d) => ({ ...d, [k]: v }));

  const toggleArray = (k: "dataTypes" | "thirdParties", value: string) => {
    setData((d) => {
      const arr = d[k];
      return {
        ...d,
        [k]: arr.includes(value) ? arr.filter((v) => v !== value) : [...arr, value],
      };
    });
  };

  const goTo = (n: number) => {
    if (n > step) {
      const err = validateStep(step, data);
      if (err) {
        alert(err);
        return;
      }
    }
    setStep(n);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    const err = validateStep(6, data);
    if (err) {
      alert(err);
      return;
    }
    const score = calculateScore(data);
    const policy = generatePolicy(data);
    setResult({ policy, score });
    setSavedMsg("");
    setTimeout(() => {
      document.getElementById("resultSection")?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 100);
  };

  const startOver = () => {
    setData(emptyForm());
    setResult(null);
    setStep(1);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const downloadPDF = () => {
    if (!result) return;
    const doc = new jsPDF({ unit: "mm", format: "a4" });
    const pageH = doc.internal.pageSize.height;
    const margin = 15;
    let y = margin;
    doc.setFont("courier", "normal");
    doc.setFontSize(8);
    doc.splitTextToSize(result.policy, 180).forEach((line: string) => {
      if (y + 5 > pageH - margin) {
        doc.addPage();
        y = margin;
      }
      doc.text(line, margin, y);
      y += 4.5;
    });
    const safe = (data.company || "policy").replace(/\s+/g, "_").toLowerCase();
    doc.save(safe + "_privacy_policy.pdf");
  };

  const loadSaved = async () => {
    const { data: rows, error } = await supabase
      .from("policies")
      .select("id, company, score, created_at")
      .order("created_at", { ascending: false });
    if (!error && rows) setSaved(rows);
  };

  useEffect(() => {
    loadSaved();
  }, []);

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
        form_data: data as never,
      },
    ]);
    setSaving(false);
    if (error) {
      setSavedMsg("Could not save: " + error.message);
    } else {
      setSavedMsg("✓ Saved to your account.");
      loadSaved();
    }
  };

  const deletePolicy = async (id: string) => {
    await supabase.from("policies").delete().eq("id", id);
    loadSaved();
  };

  // Progress: when a result exists, force 100%
  const progressPct = result ? 100 : ((step - 1) / TOTAL_STEPS) * 100;

  const scoreClass: "good" | "mid" | "bad" = result
    ? result.score.score >= 80
      ? "good"
      : result.score.score >= 60
        ? "mid"
        : "bad"
    : "good";

  return (
    <div className="container">
      <div className="card">
        <div className="step-header">
          <div className="step-meta">
            <span className="step-label">
              Step {step} of {TOTAL_STEPS}
            </span>
            <span className="step-count">{STEP_NAMES[step - 1]}</span>
          </div>
          <div className="progress">
            <div className="progress-bar" style={{ width: progressPct + "%" }}></div>
          </div>
          <div className="step-dots">
            {Array.from({ length: TOTAL_STEPS }, (_, i) => {
              const n = i + 1;
              const cls = result
                ? "step-dot done"
                : n === step
                  ? "step-dot active"
                  : n < step
                    ? "step-dot done"
                    : "step-dot";
              return <div key={n} className={cls}></div>;
            })}
          </div>
        </div>

        <form onSubmit={handleSubmit}>
          {step === 1 && <Step1 data={data} update={update} onNext={() => goTo(2)} />}
          {step === 2 && (
            <Step2 data={data} update={update} toggleArray={toggleArray} onBack={() => goTo(1)} onNext={() => goTo(3)} />
          )}
          {step === 3 && <Step3 data={data} update={update} onBack={() => goTo(2)} onNext={() => goTo(4)} />}
          {step === 4 && (
            <Step4 data={data} update={update} toggleArray={toggleArray} onBack={() => goTo(3)} onNext={() => goTo(5)} />
          )}
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
                <span key={i} className={"risk-tag " + r.type}>
                  {r.label}
                </span>
              ))}
            </div>
          </div>
          <hr className="section-divider" />
          <div className="output">{result.policy}</div>
          <button className="download-btn" onClick={downloadPDF}>
            ⬇ Download as PDF
          </button>
          <button className="primary" onClick={savePolicy} disabled={saving}>
            {saving ? "Saving…" : "💾 Save to my account"}
          </button>
          {savedMsg && (
            <div className={savedMsg.startsWith("✓") ? "auth-info" : "auth-error"}>{savedMsg}</div>
          )}
          <button className="secondary" onClick={startOver}>
            Start over
          </button>
        </div>
      )}

      <div className="card">
        <h3>Your saved policies</h3>
        {saved.length === 0 ? (
          <p>No saved policies yet. Generate one and click "Save to my account".</p>
        ) : (
          <ul className="saved-list">
            {saved.map((s) => {
              const cls = s.score >= 80 ? "good" : s.score >= 60 ? "mid" : "bad";
              return (
                <li key={s.id}>
                  <div>
                    <strong>{s.company}</strong>
                    <div className="meta">{new Date(s.created_at).toLocaleString("en-GB")}</div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span className={"score-pill score-" + cls} style={{ background: "var(--bg)" }}>
                      {s.score}%
                    </span>
                    <button
                      className="secondary"
                      style={{ width: "auto", marginTop: 0, padding: "6px 10px", fontSize: 12 }}
                      onClick={() => deletePolicy(s.id)}
                    >
                      Delete
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
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
        <button type="button" className="secondary" onClick={onBack}>
          ← Back
        </button>
        <button type="button" className="primary" onClick={onNext}>
          {nextLabel}
        </button>
      </div>
    );
  }
  return (
    <button type="button" className="primary" onClick={onNext}>
      {nextLabel}
    </button>
  );
}

function Step1({ data, update, onNext }: StepProps) {
  return (
    <div>
      <h3>Company info</h3>
      <div className="field">
        <label>
          Company / trading name <span className="badge req">Required</span>
        </label>
        <input
          type="text"
          placeholder="e.g. ABCD Ltd"
          value={data.company}
          onChange={(e) => update("company", e.target.value)}
        />
      </div>
      <div className="field">
        <label>
          Data controller email <span className="badge req">Required</span>
        </label>
        <div className="field-hint">The contact address users can reach for data requests.</div>
        <input
          type="email"
          placeholder="privacy@yourcompany.co.uk"
          value={data.email}
          onChange={(e) => update("email", e.target.value)}
        />
      </div>
      <div className="field">
        <label>Website URL</label>
        <input
          type="url"
          placeholder="https://yourcompany.co.uk"
          value={data.website}
          onChange={(e) => update("website", e.target.value)}
        />
      </div>
      <div className="field">
        <label>
          ICO Registration number <span className="badge">Optional</span>
        </label>
        <input type="text" placeholder="e.g. ZA123456" value={data.ico} onChange={(e) => update("ico", e.target.value)} />
      </div>
      <div className="field">
        <label>
          Data Protection Officer name <span className="badge">Optional</span>
        </label>
        <input
          type="text"
          placeholder="Full name or leave blank"
          value={data.dpo}
          onChange={(e) => update("dpo", e.target.value)}
        />
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
  {
    value: "Device and usage data (IP address, browser, pages visited)",
    title: "Device & usage data",
    desc: "IP address, browser, pages visited",
  },
  {
    value: "Special category / sensitive data (health, religion, ethnicity, or biometric data)",
    title: "Special category / sensitive data",
    desc: "Health, religion, ethnicity, biometric — stricter obligations apply",
  },
];

function CheckGroup({
  values,
  options,
  onToggle,
}: {
  values: string[];
  options: { value: string; title: string; desc: string }[];
  onToggle: (v: string) => void;
}) {
  return (
    <div className="checkbox-group">
      {options.map((o) => (
        <label key={o.value} className="check-item">
          <input type="checkbox" checked={values.includes(o.value)} onChange={() => onToggle(o.value)} />
          <div className="clabel">
            <strong>{o.title}</strong>
            <span>{o.desc}</span>
          </div>
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
        <label>
          Types of personal data collected <span className="badge req">Select all that apply</span>
        </label>
        <CheckGroup values={data.dataTypes} options={DATA_TYPES} onToggle={(v) => toggleArray!("dataTypes", v)} />
      </div>
      <div className="field">
        <label>
          Primary purpose of processing{" "}
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
        <label>
          Additional processing purposes <span className="badge">Optional</span>
        </label>
        <textarea
          placeholder="e.g. We also personalise your dashboard experience..."
          value={data.purposeExtra}
          onChange={(e) => update("purposeExtra", e.target.value)}
        />
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
        <span>
          Legal basis is your mandatory justification under UK GDPR for using personal data. You must have a valid
          legal basis for every type of processing. Legitimate Interests requires a balancing test.
        </span>
      </div>
      <div className="field">
        <label>
          Legal basis for processing{" "}
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
          <label>
            Describe your legitimate interest <span className="badge req">Required if selected</span>
          </label>
          <div className="field-hint">
            Explain the interest, why it overrides individual rights, and that you have carried out a balancing test.
          </div>
          <textarea
            placeholder="e.g. We process purchase history to detect fraud. We have carried out a Legitimate Interests Assessment and concluded our interests are not overridden because..."
            value={data.legitExplain}
            onChange={(e) => update("legitExplain", e.target.value)}
          />
        </div>
      )}
      <div className="field">
        <label>
          Special category legal basis <span className="badge">If applicable</span>
        </label>
        <div className="field-hint">
          Required only if you process sensitive/special category data (Article 9 UK GDPR).
        </div>
        <select
          value={data.specialCategoryBasis}
          onChange={(e) => update("specialCategoryBasis", e.target.value)}
        >
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
        <label>
          Who do you share personal data with? <span className="badge">Select all that apply</span>
        </label>
        <CheckGroup
          values={data.thirdParties}
          options={THIRD_PARTIES}
          onToggle={(v) => toggleArray!("thirdParties", v)}
        />
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
        <label>
          Cookie usage{" "}
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
        <label>
          Data retention period{" "}
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
        <label>
          Security measures in place <span className="badge">Optional</span>
        </label>
        <div className="field-hint">Briefly describe how you protect personal data.</div>
        <textarea
          placeholder="e.g. All data is encrypted in transit via TLS 1.2+. Access is restricted to authorised staff. We use MFA on all systems."
          value={data.securityMeasures}
          onChange={(e) => update("securityMeasures", e.target.value)}
        />
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
        <label>
          Automated decision-making or profiling?{" "}
          <Tooltip text="If you use algorithms or AI to make decisions that significantly affect individuals (e.g. credit scoring) you must disclose this and offer human review under Article 22." />
        </label>
        <select
          value={data.automatedDecisions}
          onChange={(e) => update("automatedDecisions", e.target.value)}
        >
          <option value="no">No automated decision-making</option>
          <option value="profiling">Profiling only (no significant decisions)</option>
          <option value="automated">Automated decisions that significantly affect individuals</option>
        </select>
      </div>
      <div className="field">
        <label>How will you notify users of policy changes?</label>
        <select
          value={data.policyUpdateMethod}
          onChange={(e) => update("policyUpdateMethod", e.target.value)}
        >
          <option>Email notification to registered users</option>
          <option>Notice on website homepage</option>
          <option>In-app notification</option>
          <option>Updated "Last Revised" date only</option>
        </select>
      </div>
      <div className="field">
        <label>
          Anything else to include? <span className="badge">Optional</span>
        </label>
        <textarea
          placeholder="Sector-specific obligations, extra contact details, or notes for your users..."
          value={data.additionalInfo}
          onChange={(e) => update("additionalInfo", e.target.value)}
        />
      </div>
      <div className="btn-row">
        <button type="button" className="secondary" onClick={onBack}>
          ← Back
        </button>
        <button type="submit" className="primary">
          Generate policy ✓
        </button>
      </div>
    </div>
  );
}
