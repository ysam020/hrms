import { useContext, useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { UserContext } from "@web/app/providers/UserContext";
import { API_ENDPOINTS } from "@web/shared/constants/apiEndpoints";
import { Banner, Button, Checkbox, Group, Spinner } from "@next/ui";
import { apiClient, errorMessage } from "@next/lib/api";
import { BrandLockup } from "@next/features/auth/BrandMark";
import s from "./assistant.module.css";

// The consent screen an AI assistant's sign-in lands on
// (/connect/authorize/:requestId, sent here by the gateway's
// /oauth/authorize). It sits behind RequireSession, so the person has
// already signed in to Praesto the usual way — Google or a passkey — and
// approving binds the connection to that session's account and
// organisation. Nothing on this page decides who the grant is for.

interface RequestDetails {
  clientName: string;
  clientUri: string | null;
  redirectHost: string;
  organisation: string | null;
  scopes: { scope: string; description: string; defaultOn: boolean }[];
}

export default function ConnectAuthorize() {
  const { requestId = "" } = useParams();
  const { user } = useContext(UserContext);
  const [details, setDetails] = useState<RequestDetails | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [chosen, setChosen] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<"allow" | "deny" | null>(null);

  useEffect(() => {
    document.title = "Connect an Assistant · Praesto";
    apiClient
      .get(API_ENDPOINTS.AI_CONNECTION_REQUEST(requestId))
      .then((res) => {
        const d: RequestDetails = res.data.data;
        setDetails(d);
        setChosen(
          new Set(d.scopes.filter((x) => x.defaultOn).map((x) => x.scope)),
        );
      })
      .catch((err) => setError(errorMessage(err)));
  }, [requestId]);

  const answer = async (choice: "allow" | "deny") => {
    setBusy(choice);
    setError(null);
    try {
      const res =
        choice === "allow"
          ? await apiClient.post(
              API_ENDPOINTS.AI_CONNECTION_APPROVE(requestId),
              { scopes: [...chosen] },
            )
          : await apiClient.post(API_ENDPOINTS.AI_CONNECTION_DENY(requestId));
      // Back to the assistant, with a code (or the refusal) for it.
      window.location.assign(res.data.data.redirectTo);
    } catch (err) {
      setError(errorMessage(err));
      setBusy(null);
    }
  };

  const toggle = (scope: string) =>
    setChosen((c) => {
      const n = new Set(c);
      if (n.has(scope)) n.delete(scope);
      else n.add(scope);
      return n;
    });

  const name =
    [user?.firstName, user?.lastName].filter(Boolean).join(" ") ||
    user?.username;

  return (
    <div className={s.screen}>
      <main className={`${s.card} px-enter`} aria-labelledby="connect-title">
        <BrandLockup size={26} />
        {!details && !error ? (
          <Spinner label="Loading" size="large" />
        ) : !details ? (
          <>
            <h1 id="connect-title" className={s.title}>
              Can’t Connect
            </h1>
            <Banner tone="danger">{error}</Banner>
          </>
        ) : (
          <>
            <div className={s.heading}>
              <h1 id="connect-title" className={s.title}>
                Connect {details.clientName} to Praesto?
              </h1>
              <p className={s.subtitle}>
                {details.clientName} will be able to read the following for{" "}
                <strong>{name}</strong>
                {details.organisation && <> at {details.organisation}</>}. It
                can’t change anything, and only sees what you can see in
                Praesto.
              </p>
            </div>

            <fieldset className={s.scopes}>
              <legend className="px-sr-only">What it may see</legend>
              <Group>
                {details.scopes.map((x) => (
                  <label key={x.scope} className={s.scope}>
                    <Checkbox
                      checked={chosen.has(x.scope)}
                      onChange={() => toggle(x.scope)}
                    />
                    <span>{x.description}</span>
                  </label>
                ))}
              </Group>
            </fieldset>

            <Banner tone="warning">
              Only continue if you started connecting {details.clientName}{" "}
              yourself. Approving sends you to{" "}
              <strong>{details.redirectHost}</strong>; what the assistant reads
              is then handled by whoever runs it. Praesto hasn’t verified this
              app.
            </Banner>

            {error && <Banner tone="danger">{error}</Banner>}

            <div className={s.actions}>
              <Button
                disabled={busy !== null}
                busy={busy === "deny"}
                onClick={() => answer("deny")}
              >
                Don’t Allow
              </Button>
              <Button
                variant="primary"
                disabled={busy !== null || chosen.size === 0}
                busy={busy === "allow"}
                onClick={() => answer("allow")}
              >
                Allow
              </Button>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
