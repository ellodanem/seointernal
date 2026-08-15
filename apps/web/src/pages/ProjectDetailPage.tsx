import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { apiGet } from "../lib/api";
import type { IngestStatus, Project } from "../lib/types";

export function ProjectDetailPage() {
  const { slug } = useParams();
  const [project, setProject] = useState<Project | null>(null);
  const [ingestStatus, setIngestStatus] = useState<IngestStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!slug) return;
    setLoading(true);
    apiGet<{ project: Project; ingestStatus: IngestStatus }>(`/api/projects/${slug}`)
      .then((data) => {
        setProject(data.project);
        setIngestStatus(data.ingestStatus);
      })
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
  const job = ingestStatus?.lastJob;
  const counts = ingestStatus?.counts;

  return (
    <>
      <div className="page-header">
        <div>
          <p className="muted" style={{ marginBottom: "0.35rem" }}>
            <Link to="/">Projects</Link> / {project.slug}
          </p>
          <h1>{project.displayName}</h1>
          <p>Operational project + GSC ingest status (Phase 3). No SEO dashboard yet.</p>
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
              <label>Last verified</label>
              <div className="mono">
                {primary.lastVerifiedAt
                  ? new Date(primary.lastVerifiedAt).toLocaleString()
                  : "—"}
              </div>
            </div>
            {primary.lastError ? (
              <div className="meta-item" style={{ gridColumn: "1 / -1" }}>
                <label>Last error</label>
                <div className="error">{primary.lastError}</div>
              </div>
            ) : null}
          </div>
        ) : (
          <p className="muted">No GSC property configured.</p>
        )}
      </div>

      <div className="panel">
        <h2>Ingest status</h2>
        <div className="meta-grid">
          <div className="meta-item">
            <label>Search data through</label>
            <div className="mono">{ingestStatus?.latestFinalizedDate ?? "—"}</div>
          </div>
          <div className="meta-item">
            <label>Last successful ingest</label>
            <div className="mono">
              {ingestStatus?.lastSuccessAt
                ? new Date(ingestStatus.lastSuccessAt).toLocaleString()
                : "—"}
            </div>
          </div>
          <div className="meta-item">
            <label>Last job status</label>
            <div>
              {job ? <span className="badge">{job.status}</span> : <span className="muted">—</span>}
            </div>
          </div>
          <div className="meta-item">
            <label>Last job finished</label>
            <div className="mono">
              {job?.finishedAt ? new Date(job.finishedAt).toLocaleString() : "—"}
            </div>
          </div>
        </div>
        {job?.error ? (
          <p className="error" style={{ marginTop: "1rem" }}>
            {job.error}
          </p>
        ) : null}
        {counts ? (
          <div className="meta-grid" style={{ marginTop: "1.25rem" }}>
            <div className="meta-item">
              <label>PROPERTY total days</label>
              <div>{counts.propertyDays}</div>
            </div>
            <div className="meta-item">
              <label>ORIGIN total days</label>
              <div>{counts.originDays}</div>
            </div>
            <div className="meta-item">
              <label>Page daily rows</label>
              <div>{counts.pageRows}</div>
            </div>
            <div className="meta-item">
              <label>Query daily rows (ORIGIN)</label>
              <div>{counts.queryRows}</div>
            </div>
            <div className="meta-item">
              <label>Query×page rollup rows</label>
              <div>{counts.queryPageRows}</div>
            </div>
            <div className="meta-item">
              <label>Sitemap snapshots</label>
              <div>{counts.sitemapSnapshots}</div>
            </div>
          </div>
        ) : null}
        <p className="muted" style={{ marginTop: "1rem", marginBottom: 0 }}>
          Manual ingest: <code>npm run gsc:ingest</code>. Charts and recommendations are Phase 4+.
        </p>
      </div>
    </>
  );
}
