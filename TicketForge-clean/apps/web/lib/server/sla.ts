export function computeSlaState(input: {
  firstResponseDueAt?: Date | null;
  resolutionDueAt?: Date | null;
  firstRespondedAt?: Date | null;
  resolvedAt?: Date | null;
}) {
  const now = Date.now();

  function summarize(dueAt?: Date | null, completedAt?: Date | null) {
    if (!dueAt) return null;
    const due = dueAt.getTime();
    const completed = completedAt?.getTime();
    if (completed) {
      return {
        msRemaining: Math.max(due - completed, 0),
        breached: completed > due,
        complete: true
      };
    }
    return {
      msRemaining: due - now,
      breached: now > due,
      complete: false
    };
  }

  return {
    firstResponse: summarize(input.firstResponseDueAt, input.firstRespondedAt),
    resolution: summarize(input.resolutionDueAt, input.resolvedAt)
  };
}
