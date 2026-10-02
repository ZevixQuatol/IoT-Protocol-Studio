export type RecentProject = { name: string; rootPath: string; lastOpenedAt?: number };
const key = "iotps.recentProjects";

export function readRecentProjects(): RecentProject[] {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(key) ?? "[]");
    if (!Array.isArray(value)) return [];
    return value
      .filter(
        (item): item is RecentProject =>
          item !== null &&
          typeof item === "object" &&
          typeof item.name === "string" &&
          item.name.length > 0 &&
          item.name.length <= 400 &&
          typeof item.rootPath === "string" &&
          item.rootPath.length > 0 &&
          item.rootPath.length <= 32767,
      )
      .map((item) => ({
        name: item.name,
        rootPath: item.rootPath,
        ...(typeof item.lastOpenedAt === "number" &&
        Number.isFinite(item.lastOpenedAt) &&
        item.lastOpenedAt > 0 &&
        item.lastOpenedAt <= 8.64e15
          ? { lastOpenedAt: item.lastOpenedAt }
          : {}),
      }))
      .slice(0, 10);
  } catch {
    return [];
  }
}

export function storeRecentProjects(projects: RecentProject[]): void {
  try {
    localStorage.setItem(key, JSON.stringify(projects));
  } catch {
    // History remains usable in this session when storage is unavailable.
  }
}

export function rememberProject(
  projects: RecentProject[],
  project: RecentProject,
): RecentProject[] {
  // The current desktop host is Windows; normalize separators and case for path deduplication.
  const normalize = (path: string) => path.replace(/\\/g, "/").replace(/\/+$/, "").toLowerCase();
  return [
    { name: project.name, rootPath: project.rootPath, lastOpenedAt: Date.now() },
    ...projects.filter((item) => normalize(item.rootPath) !== normalize(project.rootPath)),
  ].slice(0, 10);
}
