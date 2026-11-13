export type Priority = "high" | "medium" | "low";

export function isPriority(value: unknown): value is Priority {
  return value === "high" || value === "medium" || value === "low";
}

// Importance is an editorial judgment. Missing novelty evidence is not low importance.
export function evaluateBrief(input: {
  priority: Priority;
  relevanceScore: number;
  noveltyScore: number | null;
  practicalityScore: number;
}) {
  return {
    priority: input.priority,
    score: input.noveltyScore === null ? null : Math.round(
      input.relevanceScore * 8 + input.noveltyScore * 8 + input.practicalityScore * 4,
    ),
  };
}
