/**
 * Pure presentational summary — used by overview page and smoke render test.
 * No Next.js APIs; safe for react-dom/server.
 */
export type OverviewProject = {
  id: string;
  name: string;
  source?: string;
  status?: string;
  agents?: string[];
};

export function OverviewSummary({
  projects,
  edgeCount,
}: {
  projects: OverviewProject[];
  edgeCount: number;
}) {
  return (
    <div data-testid="overview-summary">
      <h1>Luna Studio</h1>
      <p data-testid="overview-counts">
        {projects.length} projects · {edgeCount} edges
      </p>
      <ul data-testid="overview-projects">
        {projects.map((p) => (
          <li key={p.id} data-project-id={p.id}>
            {p.name}
            {p.source ? ` (${p.source})` : ""}
          </li>
        ))}
      </ul>
    </div>
  );
}
