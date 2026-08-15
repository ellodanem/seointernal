import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { apiGet } from "../lib/api";
import type { Project } from "../lib/types";

export function ProjectDetailPage() {
  const { slug } = useParams();
  const [project, setProject] = useState<Project | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!slug) return;
    setLoading(true);
    apiGet<{ project: Project }>(`/api/projects/${slug}`)
      .then((data) => setProject(data.project))
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load"))
      .finally(() => setLoading(false));
  }, [slug]);

  if (loading) return <p className="muted">Loading…</p>;
  if (error) {
    return (
      <>
        <div className="error">{error}</div>
        <Link to="/">← Back to projects</Link>
      </>
    );
  }
  if (!project) return null;

  const primary = project.gscProperties.find((p) => p.isPrimary) ?? project.gscProperties[0];

  return (
    <>
      <div className="page-header">
        <div>
          <p className="muted" style={{ marginBottom: "0.35rem" }}>
            <Link to="/">Projects</Link> / {project.slug}
          </p>
          <h1>{project.displayName}</h1>
          <p>Project configuration only — no SEO metrics in Phase 2.</p>
        </div>
        <span className="badge badge-ok">{project.status}</span>
      </div>

      <div className="panel">
        <h2>Project</h2>
        <div className="meta-grid">
          <div className="meta-item">
            <label>Display name</label>
            <div>{project.displayName}</div>
          </div>
          <div className="meta-item">
            <label>Slug</label>
            <div className="mono">{project.slug}</div>
          </div>
          <div className="meta-item">
            <label>Primary origin</label>
            <div className="mono">{project.primaryOrigin}</div>
          </div>
          <div className="meta-item">
            <label>Sitemap URL</label>
            <div className="mono">{project.sitemapUrl ?? "—"}</div>
          </div>
        </div>
      </div>

      <div className="panel">
        <h2>Search Console property</h2>
        {primary ? (
          <div className="meta-grid">
            <div className="meta-item">
              <label>Site URL</label>
              <div className="mono">{primary.siteUrl}</div>
            </div>
            <div className="meta-item">
              <label>Property type</label>
              <div>{primary.propertyType}</div>
            </div>
            <div className="meta-item">
              <label>Status</label>
              <div>
                <span className="badge">{primary.status}</span>
              </div>
            </div>
            <div className="meta-item">
              <label>Primary</label>
              <div>{primary.isPrimary ? "Yes" : "No"}</div>
            </div>
          </div>
        ) : (
          <p className="muted">No GSC property configured.</p>
        )}
      </div>

      <div className="panel">
        <h2>Integration status</h2>
        <div className="stack">
          <div>
            <span className="badge badge-warn">Placeholder</span>
            <span className="muted" style={{ marginLeft: "0.75rem" }}>
              GSC ingestion is deferred to Phase 3. Credential path is optional for boot.
            </span>
          </div>
          <p className="muted" style={{ margin: 0 }}>
            Phase 1 verified access to <code>sc-domain:simplerosterplus.com</code> with finalized data
            through 2026-08-13 (~2-day lag). Production daily ingest is not enabled yet.
          </p>
        </div>
      </div>
    </>
  );
}
