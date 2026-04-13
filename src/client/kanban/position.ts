export function getReorderedPosition(
  previousPosition?: number,
  nextPosition?: number,
): number {
  if (typeof previousPosition === "number" && typeof nextPosition === "number") {
    return previousPosition + (nextPosition - previousPosition) / 2;
  }

  if (typeof nextPosition === "number") {
    return nextPosition - 1;
  }

  if (typeof previousPosition === "number") {
    return previousPosition + 1;
  }

  return 1;
}
