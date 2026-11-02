import { useEffect } from "react";
import { useRouteError } from "react-router-dom";
import { Button, EmptyState, Page } from "@next/ui";
import { TransitionLink } from "@next/motion";
import { isBusy } from "@next/offline/state";

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

// A page's code couldn't be downloaded (Chrome, Safari, Firefox wording, and
// Vite's for a page's stylesheet): the connection dropped, or the app was
// updated since this tab loaded and the old version's files are gone.
const CHUNK_ERROR =
  /dynamically imported module|Importing a module script failed|Unable to preload CSS/i;
const RELOADED_AT = "px-chunk-reload";

// Storage access lives outside the component (React Compiler, see AppShell).
function reloadedRecently() {
  try {
    return Date.now() - Number(sessionStorage.getItem(RELOADED_AT)) < 60_000;
  } catch {
    return true;
  }
}
function reloadForUpdate() {
  try {
    sessionStorage.setItem(RELOADED_AT, String(Date.now()));
  } catch {
    return;
  }
  window.location.reload();
}

export function RouteError() {
  const err = useRouteError() as any;
  const missingCode = CHUNK_ERROR.test(String(err?.message ?? ""));

  // Usually a new version: one automatic reload fetches it. Not while
  // offline or with unsaved work, and only once a minute, so a file that's
  // really missing ends here rather than in a reload loop.
  useEffect(() => {
    if (missingCode && navigator.onLine && !isBusy() && !reloadedRecently())
      reloadForUpdate();
  }, [missingCode]);

  return (
    <div style={{ minHeight: "60vh", display: "grid", placeItems: "center" }}>
      {missingCode ? (
        <EmptyState
          icon="alert"
          title="This page couldn’t be loaded"
          action={
            <Button onClick={() => window.location.reload()}>Try Again</Button>
          }
        >
          Check your connection and try again.
        </EmptyState>
      ) : (
        <EmptyState
          icon="alert"
          title="Something went wrong on this page"
          action={
            <Button onClick={() => window.location.reload()}>Reload</Button>
          }
        >
          {err?.message || "An unexpected error occurred."}
        </EmptyState>
      )}
    </div>
  );
}
