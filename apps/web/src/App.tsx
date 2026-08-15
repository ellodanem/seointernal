import { useEffect, useState } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { Shell } from "./components/Shell";
import { authClient, apiGet } from "./lib/api";
import type { MeResponse } from "./lib/types";
import { LoginPage } from "./pages/LoginPage";
import { ProjectDetailPage } from "./pages/ProjectDetailPage";
import { ProjectsPage } from "./pages/ProjectsPage";

export function App() {
  const { data: session, isPending } = authClient.useSession();
  const [me, setMe] = useState<MeResponse | null>(null);
  const [meError, setMeError] = useState<string | null>(null);
  const [googleConfigured, setGoogleConfigured] = useState<boolean | null>(null);

  useEffect(() => {
    fetch("/api/health")
      .then((r) => r.json())
      .then((data: { googleOAuthConfigured?: boolean }) => {
        setGoogleConfigured(Boolean(data.googleOAuthConfigured));
      })
      .catch(() => setGoogleConfigured(null));
  }, []);

  useEffect(() => {
    if (!session?.user) {
      setMe(null);
      setMeError(null);
      return;
    }
    apiGet<MeResponse>("/api/me")
      .then((data) => {
        setMe(data);
        setMeError(null);
      })
      .catch((err) => {
        setMe(null);
        setMeError(err instanceof Error ? err.message : "Session rejected");
      });
  }, [session?.user?.id]);

  if (isPending) {
    return (
      <div className="login-page">
        <p className="muted">Checking session…</p>
      </div>
    );
  }

  if (!session?.user || !me?.user) {
    return (
      <div className="login-page">
        <div className="login-card">
          <h1>SEO Operations Console</h1>
          <p>Owner-only access. Sign in with an allowlisted Google account.</p>
          {meError ? <div className="error">{meError}</div> : null}
          {googleConfigured === false ? (
            <div className="error">
              Google OAuth is not configured. Set <code>GOOGLE_CLIENT_ID</code> and{" "}
              <code>GOOGLE_CLIENT_SECRET</code> in <code>.env</code>. See docs/local-setup.md.
            </div>
          ) : null}
          <button
            className="btn"
            type="button"
            disabled={googleConfigured === false}
            style={{ width: "100%" }}
            onClick={() =>
              void authClient.signIn.social({
                provider: "google",
                callbackURL: "/",
              })
            }
          >
            Continue with Google
          </button>
        </div>
      </div>
    );
  }

  return (
    <Shell userEmail={me.user.email}>
      <Routes>
        <Route path="/" element={<ProjectsPage />} />
        <Route path="/projects/:slug" element={<ProjectDetailPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Shell>
  );
}
