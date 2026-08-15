import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { apiGet, apiPost } from "../lib/api";
import type { Project } from "../lib/types";

export function ProjectsPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [seeding, setSeeding] = useState(false);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const data = await apiGet<{ projects: Project[] }>("/api/projects");
      setProjects(data.projects);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load projects");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function seedSrp() {
    setSeeding(true);
    setError(null);
    try {
      await apiPost("/api/projects/seed/simple-roster-plus");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Seed failed");
    } finally {
      setSeeding(false);
    }
  }

  return (
    <>
      <div className="page-header">
        <div>
          <h1>Projects</h1>
          <p>SEO projects managed by this console. Metrics ingestion arrives in Phase 3.</p>
        </div>
        <button className="btn" type="button" disabled={seeding} onClick={() => void seedSrp()}>
          {seeding ? "Seeding…" : "Seed Simple Roster Plus"}
        </button>
      </div>

      {error ? <div className="error">{error}</div> : null}

      <div className="panel">
        {loading ? (
          <p className="muted">Loading projects…</p>
        ) : projects.length === 0 ? (
          <div className="empty">
            <p>No projects yet.</p>
            <p className="muted">Seed Project #1 (Simple Roster Plus) to get started.</p>
          </div>
        ) : (
          <ul className="list">
            {projects.map((project) => {
              const primary = project.gscProperties.find((p) => p.isPrimary) ?? project.gscProperties[0];
              return (
                <li key={project.id}>
                  <Link className="row" to={`/projects/${project.slug}`}>
                    <div>
                      <strong>{project.displayName}</strong>
                      <div className="muted mono">{project.primaryOrigin}</div>
                    </div>
                    <div className="muted mono">{primary?.siteUrl ?? "No GSC property"}</div>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </>
  );
}
