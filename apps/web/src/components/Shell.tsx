import { NavLink } from "react-router-dom";
import { authClient } from "../lib/api";

type ShellProps = {
  userEmail: string;
  children: React.ReactNode;
};

export function Shell({ userEmail, children }: ShellProps) {
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-name">SEO Operations</div>
          <div className="brand-meta">Internal console · Phase 2</div>
        </div>
        <nav className="nav">
          <NavLink to="/" end>
            Projects
          </NavLink>
        </nav>
        <div className="user-chip">
          <div>{userEmail}</div>
          <button
            className="btn btn-secondary"
            style={{ marginTop: "0.75rem", width: "100%" }}
            type="button"
            onClick={() => void authClient.signOut()}
          >
            Sign out
          </button>
        </div>
      </aside>
      <main className="main">{children}</main>
    </div>
  );
}
