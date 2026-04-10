export function detectDependencyCycle(
  dependencyGraph: Record<string, string[]>,
  sourceTaskId: string,
  nextDependencies: string[],
): boolean {
  const graph: Record<string, string[]> = {
    ...dependencyGraph,
    [sourceTaskId]: [...new Set(nextDependencies)],
  };

  const visiting = new Set<string>();
  const visited = new Set<string>();

  const visit = (taskId: string): boolean => {
    if (visiting.has(taskId)) {
      return true;
    }

    if (visited.has(taskId)) {
      return false;
    }

    visiting.add(taskId);

    for (const dependencyId of graph[taskId] ?? []) {
      if (visit(dependencyId)) {
        return true;
      }
    }

    visiting.delete(taskId);
    visited.add(taskId);

    return false;
  };

  return visit(sourceTaskId);
}
