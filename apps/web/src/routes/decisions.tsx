import { createFileRoute, redirect } from "@tanstack/react-router";
import { DecisionsPage } from "../components/decisions/DecisionsPage";
export const Route = createFileRoute("/decisions")({
  beforeLoad: ({ context }) => {
    if (
      context.authGateState.status !== "authenticated" &&
      context.authGateState.status !== "hosted-static"
    ) {
      throw redirect({ to: "/pair", replace: true });
    }
  },
  validateSearch: (search: Record<string, unknown>) => ({
    id: typeof search.id === "string" ? search.id : undefined,
  }),
  component: DecisionsPage,
});
