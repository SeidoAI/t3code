import { createFileRoute } from "@tanstack/react-router";
import { DecisionsPage } from "../components/decisions/DecisionsPage";
export const Route = createFileRoute("/decisions")({
  validateSearch: (search: Record<string, unknown>) => ({
    id: typeof search.id === "string" ? search.id : undefined,
  }),
  component: DecisionsPage,
});
