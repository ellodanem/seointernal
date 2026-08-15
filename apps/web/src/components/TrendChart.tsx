import { useId, useMemo, useState } from "react";
import type { ProjectDashboard } from "../lib/dashboard";
import { formatInt, formatShortDate } from "../lib/format";

type Props = {
  points: ProjectDashboard["trend"];
};

type MetricKey = "impressions" | "clicks";

export function TrendChart({ points }: Props) {
  const [metric, setMetric] = useState<MetricKey>("impressions");
  const labelId = useId();
  const descId = useId();
  const titleId = useId();

  const { path, area, maxY, ticks } = useMemo(() => {
    const values = points.map((p) => p[metric]);
    const max = Math.max(1, ...values);
    const w = 100;
    const h = 40;
    const padX = 1;
    const padY = 2;
    const innerW = w - padX * 2;
    const innerH = h - padY * 2;
    const coords = points.map((p, i) => {
      const x = padX + (points.length <= 1 ? innerW / 2 : (i / (points.length - 1)) * innerW);
      const y = padY + innerH - (p[metric] / max) * innerH;
      return { x, y, value: p[metric], date: p.date };
    });
    const line = coords.map((c, i) => `${i === 0 ? "M" : "L"} ${c.x.toFixed(2)} ${c.y.toFixed(2)}`).join(" ");
    const areaPath =
      coords.length > 0
        ? `${line} L ${coords.at(-1)!.x.toFixed(2)} ${(padY + innerH).toFixed(2)} L ${coords[0]!.x.toFixed(2)} ${(padY + innerH).toFixed(2)} Z`
        : "";
    const tickIdx = [0, Math.floor((points.length - 1) / 2), points.length - 1].filter(
      (v, i, arr) => points.length > 0 && arr.indexOf(v) === i && v >= 0,
    );
    return {
      path: line,
      area: areaPath,
      maxY: max,
      ticks: tickIdx.map((i) => ({
        date: points[i]!.date,
        value: points[i]![metric],
      })),
    };
  }, [points, metric]);

  if (points.length === 0) {
    return <p className="muted">No daily trend data for this period.</p>;
  }

  const label = metric === "impressions" ? "Impressions" : "Clicks";

  return (
    <div className="trend">
      <div className="trend-toolbar">
        <div className="segmented" role="group" aria-label="Trend metric">
          <button
            type="button"
            className={metric === "impressions" ? "active" : undefined}
            aria-pressed={metric === "impressions"}
            onClick={() => setMetric("impressions")}
          >
            Impressions
          </button>
          <button
            type="button"
            className={metric === "clicks" ? "active" : undefined}
            aria-pressed={metric === "clicks"}
            onClick={() => setMetric("clicks")}
          >
            Clicks
          </button>
        </div>
        <p className="muted trend-max" id={labelId}>
          Peak {label.toLowerCase()}: {formatInt(maxY)}
        </p>
      </div>

      <svg
        className="trend-svg"
        viewBox="0 0 100 40"
        role="img"
        aria-labelledby={titleId}
        aria-describedby={descId}
        preserveAspectRatio="none"
      >
        <title id={titleId}>
          Daily {label.toLowerCase()} from {formatShortDate(points[0]!.date)} to{" "}
          {formatShortDate(points.at(-1)!.date)}
        </title>
        <desc id={descId}>
          {ticks
            .map((t) => `${formatShortDate(t.date)}: ${formatInt(t.value)} ${label.toLowerCase()}`)
            .join(". ")}
        </desc>
        <path d={area} className="trend-area" />
        <path d={path} className="trend-line" fill="none" />
      </svg>

      <div className="trend-axis" aria-hidden="true">
        <span>{formatShortDate(points[0]!.date)}</span>
        <span>{formatShortDate(points.at(-1)!.date)}</span>
      </div>

      <table className="trend-a11y-table">
        <caption>
          Daily {label.toLowerCase()}
        </caption>
        <thead>
          <tr>
            <th scope="col">Date</th>
            <th scope="col">{label}</th>
          </tr>
        </thead>
        <tbody>
          {points.map((p) => (
            <tr key={p.date}>
              <td>{p.date}</td>
              <td>{formatInt(p[metric])}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
