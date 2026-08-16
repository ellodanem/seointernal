import { useEffect, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { TrendChart } from "../components/TrendChart";
import { apiGet } from "../lib/api";
import type {
  AttentionItem,
  ComparedMetric,
  DashboardIndexing,
  IndexingAttentionItem,
  IndexingPageRow,
  ProjectDashboard,
} from "../lib/dashboard";
import {
  formatCheckedDate,
  formatCountDelta,
  formatCtr,
  formatCtrDelta,
  formatDataThrough,
  formatInt,
  formatPosition,
  formatPositionDelta,
  formatRelativeTime,
  originDisplay,
} from "../lib/format";

export function ProjectDetailPage() {
  const { slug } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const periodParam = Number(searchParams.get("period") ?? 28);
  const [dashboard, setDashboard] = useState<ProjectDashboard | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!slug) return;
    setLoading(true);
    const q = Number.isFinite(periodParam) ? `?period=${periodParam}` : "";
    apiGet<{ dashboard: ProjectDashboard }>(`/api/projects/${slug}/dashboard${q}`)
      .then((data) => {
        setDashboard(data.dashboard);
        setError(null);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load"))
      .finally(() => setLoading(false));
  }, [slug, periodParam]);

  if (loading) return <p className="muted">Loading dashboard…</p>;
  if (error) {
    return (
      <>
        <div className="error">{error}</div>
        <Link to="/">← Back to projects</Link>
      </>
    );
  }
  if (!dashboard) return null;

  const { project, period, freshness, summary, metrics, sitemap, attention, indexing } =
    dashboard;
  const dataThrough = formatDataThrough(period.dataThrough || freshness.latestFinalizedDate || "");

  function setPeriod(days: number) {
    setSearchParams(days === 28 ? {} : { period: String(days) });
  }

  return (
    <div className="dashboard">
      <div className="page-header">
        <div>
          <p className="muted" style={{ marginBottom: "0.35rem" }}>
            <Link to="/">Projects</Link> / {project.slug}
          </p>
          <h1>{project.displayName}</h1>
          <p className="mono origin-line">{originDisplay(project.primaryOrigin)}</p>
        </div>
        {period.availablePeriods.length > 0 ? (
          <div className="segmented" role="group" aria-label="Reporting period">
            {period.availablePeriods.map((days) => (
              <button
                key={days}
                type="button"
                className={period.days === days ? "active" : undefined}
                aria-pressed={period.days === days}
                onClick={() => setPeriod(days)}
              >
                {days} days
              </button>
            ))}
          </div>
        ) : null}
      </div>

      {freshness.currentFailure ? (
        <div className="error" role="alert">
          Ingest issue: {freshness.currentFailure.message}
        </div>
      ) : null}

      <section className="freshness-banner" aria-label="Search data freshness">
        <div>
          <strong>Search data through {dataThrough || "—"}</strong>
          <p className="muted" style={{ margin: "0.25rem 0 0" }}>
            Google Search Console reports with a delay.
          </p>
        </div>
        <div className="freshness-meta muted">
          <div>Last ingest: {formatRelativeTime(freshness.lastSuccessAt)}</div>
          <div>
            Latest finalized:{" "}
            <span className="mono">{freshness.latestFinalizedDate ?? "—"}</span>
          </div>
        </div>
      </section>

      {dashboard.empty ? (
        <div className="panel">
          <h2>No search data yet</h2>
          <p className="muted" style={{ marginBottom: 0 }}>
            Once Search Console ingestion stores finalized days for this project, visibility metrics
            will appear here.
          </p>
        </div>
      ) : (
        <>
          <section className="panel summary-panel" aria-labelledby="visibility-heading">
            <h2 id="visibility-heading">Google visibility</h2>
            <p className="summary-message">{summary.message}</p>
            <p className="muted small">
              {period.current.startDate} → {period.current.endDate}
              {period.hasFullPrevious
                ? ` · compared with ${period.previous.startDate} → ${period.previous.endDate}`
                : " · previous period not fully available"}
            </p>
          </section>

          <section aria-labelledby="metrics-heading">
            <h2 id="metrics-heading" className="sr-only">
              Headline metrics
            </h2>
            <div className="metric-grid">
              <MetricCard
                title="Clicks"
                help="Visits from Google Search."
                metric={metrics.clicks}
                formatValue={formatInt}
                formatDelta={(m) => formatCountDelta(m.delta.absolute, m.delta.relative)}
              />
              <MetricCard
                title="Impressions"
                help="Times your pages appeared in Google search results."
                metric={metrics.impressions}
                formatValue={formatInt}
                formatDelta={(m) => formatCountDelta(m.delta.absolute, m.delta.relative)}
              />
              <MetricCard
                title="CTR"
                help="The percentage of search appearances that resulted in a click."
                metric={metrics.ctr}
                formatValue={formatCtr}
                formatDelta={(m) => formatCtrDelta(m.delta.percentagePoints)}
              />
              <MetricCard
                title="Average position"
                help="The average position of your highest result when your site appeared. Lower is generally better, but this number is an aggregate and should not be treated as an exact ranking."
                metric={metrics.position}
                formatValue={formatPosition}
                formatDelta={(m) => formatPositionDelta(m.delta.positionsImproved)}
              />
            </div>
          </section>

          <section className="panel" aria-labelledby="trend-heading">
            <h2 id="trend-heading">Trend</h2>
            <p className="muted section-help">
              Daily primary-site search appearances and clicks for the selected period.
            </p>
            <TrendChart points={dashboard.trend} />
          </section>

          <NeedsAttentionSection
            indexingItems={indexing.attention}
            performanceItems={attention.items}
            performanceEmptyMessage={attention.emptyMessage}
          />

          <IndexingSection indexing={indexing} />

          <section className="panel" aria-labelledby="pages-heading">
            <h2 id="pages-heading">Top pages</h2>
            <p className="muted section-help">
              Pages on {originDisplay(project.primaryOrigin)} only. Sorted by impressions.
            </p>
            {dashboard.topPages.length === 0 ? (
              <p className="muted">No page impressions in this period yet.</p>
            ) : (
              <div className="table-wrap">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th scope="col">Page</th>
                      <th scope="col">Clicks</th>
                      <th scope="col">Impressions</th>
                      <th scope="col">CTR</th>
                      <th scope="col">Avg position</th>
                      <th scope="col">vs previous</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dashboard.topPages.map((row) => (
                      <tr key={row.pageUrl}>
                        <td>
                          <details className="page-details">
                            <summary>
                              <span className="page-label">{row.label}</span>
                              <span className="muted mono page-path">{row.path}</span>
                            </summary>
                            <p className="mono small break">{row.pageUrl}</p>
                          </details>
                        </td>
                        <td>{formatInt(row.clicks)}</td>
                        <td>{formatInt(row.impressions)}</td>
                        <td>{formatCtr(row.ctr)}</td>
                        <td>{formatPosition(row.position)}</td>
                        <td className="muted">
                          {formatCountDelta(
                            row.delta.impressions.delta.absolute,
                            row.delta.impressions.delta.relative,
                          ) ?? "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {dashboard.topPages.some((p) => p.impressions > 0 && p.clicks === 0) ? (
              <p className="muted small" style={{ marginTop: "0.75rem", marginBottom: 0 }}>
                Google has started showing some of these pages, but there haven&apos;t been clicks in
                this period yet.
              </p>
            ) : null}
          </section>

          <section className="panel" aria-labelledby="queries-heading">
            <h2 id="queries-heading">Top queries</h2>
            <p className="muted section-help">
              Searches that showed your primary site. Average position is aggregated — not an exact
              rank.
            </p>
            {dashboard.topQueries.length === 0 ? (
              <p className="muted">No queries recorded for this period yet.</p>
            ) : (
              <div className="table-wrap">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th scope="col">Query</th>
                      <th scope="col">Clicks</th>
                      <th scope="col">Impressions</th>
                      <th scope="col">CTR</th>
                      <th scope="col">Avg position</th>
                      <th scope="col">vs previous</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dashboard.topQueries.map((row) => (
                      <tr key={row.query}>
                        <td className="query-cell">{row.query}</td>
                        <td>{formatInt(row.clicks)}</td>
                        <td>{formatInt(row.impressions)}</td>
                        <td>{formatCtr(row.ctr)}</td>
                        <td>{formatPosition(row.position)}</td>
                        <td className="muted">
                          {formatCountDelta(
                            row.delta.impressions.delta.absolute,
                            row.delta.impressions.delta.relative,
                          ) ?? "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <div className="split-grid">
            <section className="panel" aria-labelledby="hosts-heading">
              <h2 id="hosts-heading">Other hosts appearing in Google</h2>
              <p className="muted section-help">
                Google has search history for pages outside your primary SEO site. This is
                informational — not automatically an error.
              </p>
              {dashboard.otherHosts.length === 0 ? (
                <p className="muted">No other hosts appeared in this period.</p>
              ) : (
                <div className="table-wrap">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th scope="col">Host</th>
                        <th scope="col">URLs</th>
                        <th scope="col">Impressions</th>
                        <th scope="col">Clicks</th>
                        <th scope="col">Last seen</th>
                      </tr>
                    </thead>
                    <tbody>
                      {dashboard.otherHosts.map((h) => (
                        <tr key={h.host}>
                          <td className="mono">{h.host}</td>
                          <td>{formatInt(h.urlCount)}</td>
                          <td>{formatInt(h.impressions)}</td>
                          <td>{formatInt(h.clicks)}</td>
                          <td className="mono">{h.mostRecentDate ?? "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            <section className="panel" aria-labelledby="sitemap-heading">
              <h2 id="sitemap-heading">Sitemap</h2>
              {sitemap ? (
                <>
                  <p>{sitemap.summary}</p>
                  <div className="meta-grid">
                    <div className="meta-item">
                      <label>Path</label>
                      <div className="mono break">{sitemap.sitemapPath}</div>
                    </div>
                    <div className="meta-item">
                      <label>Submitted URLs</label>
                      <div>{sitemap.submittedCount ?? "—"}</div>
                    </div>
                    <div className="meta-item">
                      <label>Warnings</label>
                      <div>{sitemap.warningCount}</div>
                    </div>
                    <div className="meta-item">
                      <label>Errors</label>
                      <div>{sitemap.errorCount}</div>
                    </div>
                    <div className="meta-item">
                      <label>Last downloaded</label>
                      <div className="mono">
                        {sitemap.lastDownloaded
                          ? new Date(sitemap.lastDownloaded).toLocaleString()
                          : "—"}
                      </div>
                    </div>
                    <div className="meta-item">
                      <label>Pending</label>
                      <div>{sitemap.isPending ? "Yes" : "No"}</div>
                    </div>
                  </div>
                </>
              ) : (
                <p className="muted">No sitemap snapshot stored yet.</p>
              )}
            </section>
          </div>

          <p className="muted small caveat">{dashboard.notes.aggregationCaveat}</p>
        </>
      )}

      {dashboard.empty ? <IndexingSection indexing={indexing} /> : null}

      <section className="panel connection-panel" aria-labelledby="connection-heading">
        <h2 id="connection-heading">Data connection</h2>
        <div className="meta-grid">
          <div className="meta-item">
            <label>Search Console</label>
            <div>
              {freshness.gscConnected ? (
                <span className="badge badge-ok">Connected</span>
              ) : (
                <span className="badge badge-warn">Issue</span>
              )}
            </div>
          </div>
          <div className="meta-item">
            <label>GSC property</label>
            <div className="mono break">{freshness.gscSiteUrl ?? "—"}</div>
          </div>
          <div className="meta-item">
            <label>Last ingest</label>
            <div>{formatRelativeTime(freshness.lastSuccessAt)}</div>
          </div>
          <div className="meta-item">
            <label>Latest finalized date</label>
            <div className="mono">{freshness.latestFinalizedDate ?? "—"}</div>
          </div>
        </div>
        {freshness.gscLastError ? (
          <p className="error" style={{ marginTop: "1rem", marginBottom: 0 }}>
            {freshness.gscLastError}
          </p>
        ) : null}
      </section>
    </div>
  );
}

function NeedsAttentionSection(props: {
  indexingItems: IndexingAttentionItem[];
  performanceItems: AttentionItem[];
  performanceEmptyMessage: string | null;
}) {
  const hasIndexing = props.indexingItems.length > 0;
  const hasPerf = props.performanceItems.length > 0;
  const empty = !hasIndexing && !hasPerf;

  return (
    <section className="panel attention-section" aria-labelledby="attention-heading">
      <h2 id="attention-heading">What deserves attention?</h2>
      <p className="muted section-help">
        Indexing problems are listed first. Search opportunity signals stay conservative.
      </p>
      {empty ? (
        <p className="attention-empty">
          {props.performanceEmptyMessage ?? "Nothing needs attention yet."}
        </p>
      ) : (
        <div className="attention-groups">
          {hasIndexing ? (
            <div>
              <h3 className="attention-group-title">Indexing</h3>
              <ul className="attention-list">
                {props.indexingItems.map((item) => (
                  <li key={item.id}>
                    <article
                      className="attention-card attention-card-indexing"
                      aria-labelledby={`attention-${item.id}-title`}
                    >
                      <div className="attention-card-head">
                        <div>
                          <h4 id={`attention-${item.id}-title`} className="attention-page">
                            {item.label}
                          </h4>
                          <p className="muted mono page-path" style={{ margin: "0.15rem 0 0" }}>
                            {item.path}
                          </p>
                        </div>
                        <div className="attention-tags">
                          <span className="badge">{item.categoryLabel}</span>
                        </div>
                      </div>
                      <p style={{ margin: 0 }}>{item.reason}</p>
                    </article>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {hasPerf ? (
            <div>
              <h3 className="attention-group-title">Search opportunity</h3>
              <ul className="attention-list">
                {props.performanceItems.map((item) => (
                  <li key={item.id}>
                    <AttentionCard item={item} />
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      )}
    </section>
  );
}

function IndexingSection(props: { indexing: DashboardIndexing }) {
  const { indexing } = props;
  const { summary, freshness, pages } = indexing;

  return (
    <section className="panel indexing-section" aria-labelledby="indexing-heading">
      <div className="indexing-header">
        <div>
          <h2 id="indexing-heading">Indexing</h2>
          <p className="muted section-help">
            Google indexing status for pages this project expects to appear in search.
          </p>
        </div>
        <div className="indexing-freshness muted">
          <div>
            {freshness.lastCheckedAt
              ? `Indexing checked ${formatCheckedDate(freshness.lastCheckedAt)}`
              : "Last indexing check: not yet"}
          </div>
          {freshness.overdue ? <div>Check is past the usual weekly cadence.</div> : null}
          {freshness.refreshFailed ? (
            <div className="error" role="status">
              {freshness.refreshFailureMessage ?? "Indexing check could not refresh."}
            </div>
          ) : null}
        </div>
      </div>

      <div className="indexing-summary" aria-live="polite">
        <p className="summary-message" style={{ marginBottom: "0.35rem" }}>
          <strong>{summary.headline}</strong>
        </p>
        <p className="muted" style={{ margin: 0 }}>
          {summary.subcopy}
        </p>
        {summary.expectedCount > 0 &&
        !summary.healthy &&
        summary.neverCheckedCount < summary.expectedCount ? (
          <ul className="indexing-counts">
            <li>{summary.indexedCount} indexed</li>
            <li>{summary.needsReviewCount} need review</li>
          </ul>
        ) : null}
      </div>

      {pages.length === 0 ? (
        <p className="muted">No INDEXABLE pages in the managed inventory.</p>
      ) : (
        <>
          <div className="table-wrap indexing-table-wrap">
            <table className="data-table indexing-table">
              <thead>
                <tr>
                  <th scope="col">Page</th>
                  <th scope="col">Status</th>
                  <th scope="col">Last crawl</th>
                  <th scope="col">Canonical</th>
                  <th scope="col">Last checked</th>
                </tr>
              </thead>
              <tbody>
                {pages.map((row) => (
                  <IndexingRow key={row.pageId} row={row} />
                ))}
              </tbody>
            </table>
          </div>
          <ul className="indexing-cards" aria-label="Indexing pages">
            {pages.map((row) => (
              <li key={`card-${row.pageId}`}>
                <IndexingCard row={row} />
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}

function IndexingRow(props: { row: IndexingPageRow }) {
  const { row } = props;
  return (
    <tr className={row.needsReview ? "indexing-row-review" : undefined}>
      <td>
        <details className="page-details">
          <summary>
            <span className="page-label">{row.label}</span>
            <span className="muted mono page-path">{row.path}</span>
          </summary>
          <IndexingDetail row={row} />
        </details>
      </td>
      <td>
        <span className="indexing-status">{row.statusLabel}</span>
        {row.statusDetail ? <div className="muted small">{row.statusDetail}</div> : null}
      </td>
      <td>{formatCheckedDate(row.lastCrawlTime)}</td>
      <td>{row.canonicalLabel}</td>
      <td>{formatCheckedDate(row.inspectedAt)}</td>
    </tr>
  );
}

function IndexingCard(props: { row: IndexingPageRow }) {
  const { row } = props;
  return (
    <article className="indexing-card" aria-labelledby={`indexing-${row.pageId}-title`}>
      <h3 id={`indexing-${row.pageId}-title`} className="attention-page">
        {row.label}
      </h3>
      <p className="muted mono page-path" style={{ margin: "0.15rem 0 0.65rem" }}>
        {row.path}
      </p>
      <dl className="indexing-card-meta">
        <div>
          <dt>Status</dt>
          <dd>{row.statusLabel}</dd>
        </div>
        <div>
          <dt>Last crawl</dt>
          <dd>{formatCheckedDate(row.lastCrawlTime)}</dd>
        </div>
        <div>
          <dt>Canonical</dt>
          <dd>{row.canonicalLabel}</dd>
        </div>
        <div>
          <dt>Last checked</dt>
          <dd>{formatCheckedDate(row.inspectedAt)}</dd>
        </div>
      </dl>
      {row.statusDetail ? <p className="muted small">{row.statusDetail}</p> : null}
      <details className="attention-queries">
        <summary>Inspection details</summary>
        <IndexingDetail row={row} />
      </details>
    </article>
  );
}

function IndexingDetail(props: { row: IndexingPageRow }) {
  const { row } = props;
  if (row.neverChecked || !row.detail) {
    return <p className="muted small">Not checked yet — no URL Inspection result stored.</p>;
  }
  const d = row.detail;
  return (
    <dl className="indexing-detail">
      <div>
        <dt>Expected URL</dt>
        <dd className="mono break">{row.pageUrl}</dd>
      </div>
      <div>
        <dt>Google coverage</dt>
        <dd>{d.coverageState ?? "—"}</dd>
      </div>
      <div>
        <dt>Indexing allowed</dt>
        <dd>
          {d.indexingAllowed == null ? d.indexingState ?? "—" : d.indexingAllowed ? "Yes" : "No"}
        </dd>
      </div>
      <div>
        <dt>Robots</dt>
        <dd>{d.robotsTxtState ?? "—"}</dd>
      </div>
      <div>
        <dt>Fetch</dt>
        <dd>{d.pageFetchState ?? "—"}</dd>
      </div>
      <div>
        <dt>Crawled as</dt>
        <dd>{row.crawledAsLabel ?? row.crawledAs ?? "—"}</dd>
      </div>
      <div>
        <dt>Declared canonical</dt>
        <dd className="mono break">{d.userCanonical ?? "—"}</dd>
      </div>
      <div>
        <dt>Google canonical</dt>
        <dd className="mono break">{d.googleCanonical ?? "—"}</dd>
      </div>
    </dl>
  );
}

function confidenceText(c: AttentionItem["confidence"]): string {
  if (c === "early") return "Early signal";
  if (c === "moderate") return "Moderate evidence";
  return "Strong evidence";
}

function AttentionCard(props: { item: AttentionItem }) {
  const { item } = props;
  const prevImpr = item.previous?.impressions;
  const showPrev =
    item.comparisonEligible && prevImpr != null
      ? `${formatInt(prevImpr)} prev`
      : item.previous != null && item.previous.impressions > 0
        ? `${formatInt(item.previous.impressions)} prev (thin)`
        : null;

  return (
    <article className="attention-card" aria-labelledby={`attention-${item.id}-title`}>
      <div className="attention-card-head">
        <div>
          <h3 id={`attention-${item.id}-title`} className="attention-page">
            {item.label}
          </h3>
          <p className="muted mono page-path" style={{ margin: "0.15rem 0 0" }}>
            {item.path}
          </p>
        </div>
        <div className="attention-tags">
          <span className="badge">{item.categoryLabel}</span>
          <span className="badge">{confidenceText(item.confidence)}</span>
        </div>
      </div>

      <div className="attention-metrics" aria-label="Page metrics">
        <div>
          <span className="attention-metric-label">Impressions</span>
          <span className="attention-metric-value">{formatInt(item.metrics.impressions)}</span>
          {showPrev ? <span className="muted small">{showPrev}</span> : null}
        </div>
        <div>
          <span className="attention-metric-label">Clicks</span>
          <span className="attention-metric-value">{formatInt(item.metrics.clicks)}</span>
        </div>
        <div>
          <span className="attention-metric-label">Avg position</span>
          <span className="attention-metric-value">{formatPosition(item.metrics.position)}</span>
        </div>
        <div>
          <span className="attention-metric-label">CTR</span>
          <span className="attention-metric-value">{formatCtr(item.metrics.ctr)}</span>
        </div>
      </div>

      <div className="attention-reason">
        <h4 className="attention-subhead">Why this is here</h4>
        <p>{item.reason}</p>
      </div>

      <div className="attention-stance">
        <h4 className="attention-subhead">Suggested stance</h4>
        <p>
          <strong>{item.stanceLabel}</strong>
        </p>
      </div>

      {item.supportingQueries.length > 0 ? (
        <details className="attention-queries">
          <summary>Top associated searches ({item.supportingQueries.length})</summary>
          <ul>
            {item.supportingQueries.map((q) => (
              <li key={q.query}>
                <span className="query-cell">{q.query}</span>
                <span className="muted small">
                  {formatInt(q.impressions)} impr · {formatPosition(q.position)} avg
                </span>
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </article>
  );
}

function MetricCard(props: {
  title: string;
  help: string;
  metric: ComparedMetric;
  formatValue: (n: number) => string;
  formatDelta: (m: ComparedMetric) => string | null;
}) {
  const helpId = `${props.title.toLowerCase().replace(/\s+/g, "-")}-help`;
  const delta = props.formatDelta(props.metric);
  return (
    <article className="metric-card panel" aria-describedby={helpId}>
      <h3>{props.title}</h3>
      <p className="help-text" id={helpId}>
        {props.help}
      </p>
      <p className="metric-value">{props.formatValue(props.metric.current)}</p>
      <p className="metric-delta muted">
        {delta
          ? props.metric.previous != null
            ? `${delta} vs previous`
            : delta
          : "No previous period to compare"}
      </p>
    </article>
  );
}
