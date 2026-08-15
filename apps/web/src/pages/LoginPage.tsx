import { authClient } from "../lib/api";

type LoginPageProps = {
  googleConfigured: boolean | null;
};

export function LoginPage({ googleConfigured }: LoginPageProps) {
  return (
    <div className="login-page">
      <div className="login-card">
        <h1>SEO Operations Console</h1>
        <p>Owner-only access. Sign in with an allowlisted Google account.</p>

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
