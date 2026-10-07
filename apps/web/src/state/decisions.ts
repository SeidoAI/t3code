import type { EnvironmentId } from "@t3tools/contracts";
import { useEffect } from "react";
import { useEnvironmentQuery } from "./query";
import { serverEnvironment } from "./server";
export function useDecisionQueue(environmentId: EnvironmentId | null, interval = 5000) {
  const query = useEnvironmentQuery(
    environmentId ? serverEnvironment.decisions({ environmentId, input: {} }) : null,
  );
  const refresh = query.refresh;
  useEffect(() => {
    if (!environmentId) return;
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") refresh();
    }, interval);
    return () => clearInterval(timer);
  }, [environmentId, refresh, interval]);
  return query;
}
