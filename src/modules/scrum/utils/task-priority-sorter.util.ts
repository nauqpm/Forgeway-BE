// Chứa hàm sortTasksByPriority() để sort task theo priority và createdAt.
const PRIORITY_WEIGHT: Record<string, number> = {
  highest: 5,
  high: 4,
  medium: 3,
  low: 2,
  lowest: 1,
};

export function sortTasksByPriority<
  T extends { priority?: string; createdAt?: Date | string },
>(tasks: T[]): T[] {
  return [...tasks].sort((a, b) => {
    const aPriority = PRIORITY_WEIGHT[a.priority ?? ''] ?? 0;
    const bPriority = PRIORITY_WEIGHT[b.priority ?? ''] ?? 0;

    if (aPriority !== bPriority) {
      return bPriority - aPriority;
    }

    const aCreatedAt = a.createdAt ? new Date(a.createdAt).getTime() : 0;
    const bCreatedAt = b.createdAt ? new Date(b.createdAt).getTime() : 0;

    return bCreatedAt - aCreatedAt;
  });
}
