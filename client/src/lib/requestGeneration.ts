/**
 * Guards async UI updates against stale results. Each component keeps one
 * generation per kind of request (a list, the selected thread, the session).
 *
 * - `begin()` starts a request and makes every earlier one stale, so only
 *   the latest load may paint (a slow reply for A cannot overwrite B).
 * - `capture()` snapshots the current generation without superseding
 *   anything; use it to scope a mutation to the session or resource it
 *   started under.
 * - `invalidate()` makes everything in flight stale: resource switch,
 *   logout/session change, unmount.
 *
 * Each returns an `isCurrent()` check to call after every await.
 */
export type IsCurrent = () => boolean;

export type RequestGeneration = {
  begin(): IsCurrent;
  capture(): IsCurrent;
  invalidate(): void;
};

export function createRequestGeneration(): RequestGeneration {
  let generation = 0;
  const at = (mine: number): IsCurrent => () => mine === generation;
  return {
    begin() {
      generation += 1;
      return at(generation);
    },
    capture() {
      return at(generation);
    },
    invalidate() {
      generation += 1;
    }
  };
}

/** True only while every given check is still current. */
export function allCurrent(...checks: IsCurrent[]): IsCurrent {
  return () => checks.every((check) => check());
}
