import { useRouteError } from "react-router-dom";
import { Button, EmptyState, Page } from "@next/ui";
import { TransitionLink } from "@next/motion";

export function NoAccess() {
  return (
    <Page title="No Access">
      {/* Tells the walkthrough this route was refused (skip, don't wait). */}
      <span data-tour-blocked="" hidden />
      <EmptyState
        icon="lock"
        title="You don’t have access to this page"
        action={
          <TransitionLink to="/dashboard">
            <Button>Go to Today</Button>
          </TransitionLink>
        }
      >
        Ask an administrator if you need it for your role.
      </EmptyState>
    </Page>
  );
}

export function NotFound() {
  return (
    <Page title="Page Not Found">
      <span data-tour-blocked="" hidden />
      <EmptyState
        icon="search"
        title="There’s nothing at this address"
        action={
          <TransitionLink to="/dashboard">
            <Button>Go to Today</Button>
          </TransitionLink>
        }
      >
        The link may be out of date. Use Search (⌘K) to find what you’re looking
        for.
      </EmptyState>
    </Page>
  );
}

export function RouteError() {
  const err = useRouteError() as any;
  return (
    <div style={{ minHeight: "60vh", display: "grid", placeItems: "center" }}>
      <EmptyState
        icon="alert"
        title="Something went wrong on this page"
        action={
          <Button onClick={() => window.location.reload()}>Reload</Button>
        }
      >
        {err?.message || "An unexpected error occurred."}
      </EmptyState>
    </div>
  );
}
