import DOMPurify from "dompurify";
import { useCallback, useContext, useEffect, useState } from "react";
import { AlertContext } from "@web/app/providers/AlertContext";
import { UserContext } from "@web/app/providers/UserContext";
import { API_ENDPOINTS } from "@web/shared/constants/apiEndpoints";
import useServerPagination from "@web/shared/hooks/useServerPagination";
import hasPermission from "@web/shared/utils/permissions/hasPermission";
import { Swap, TransitionLink } from "@next/motion";
import {
  Button,
  ConfirmDialog,
  EmptyState,
  Page,
  Pagination,
  Sheet,
  Skeleton,
  ArticleSkeleton,
  Tag,
} from "@next/ui";
import { apiClient, errorMessage } from "@next/lib/api";
import { useIsRegular } from "@next/lib/hooks";
import { fmtDate } from "@next/lib/format";
import s from "./policies.module.css";

// Policies as a reader: a source list beside the document (split view at
// regular widths, a sheet on narrow ones). Content is sanitised with
// DOMPurify exactly as Classic does. Writing/editing is PolicyEditor;
// delete follows Classic's Policy:delete permission.

export default function Policies() {
  const { user } = useContext(UserContext);
  const { setAlert } = useContext(AlertContext);
  const split = useIsRegular();
  const [current, setCurrent] = useState<any | null>(null);
  const [deleting, setDeleting] = useState<any | null>(null);
  const [busy, setBusy] = useState(false);
  const canDelete = hasPermission(
    "Policy",
    "delete",
    "-",
    user?.isSuperUser,
    user?.permissions || [],
  );
  const canWrite =
    hasPermission(
      "Policy",
      "create",
      "-",
      user?.isSuperUser,
      user?.permissions || [],
    ) ||
    hasPermission(
      "Policy",
      "update",
      "-",
      user?.isSuperUser,
      user?.permissions || [],
    );

  const fetchPage = useCallback(
    async ({ page, limit }: { page: number; limit: number }) => {
      const res = await apiClient.get(API_ENDPOINTS.GET_POLICIES(page, limit));
      const list = Array.isArray(res.data?.data)
        ? res.data.data
        : res.data?.data?.policies || [];
      return { data: list, totalCount: res.data?.total ?? list.length };
    },
    [],
  );
  const list = useServerPagination(fetchPage, { initialPageSize: 50 });

  useEffect(() => {
    if (split && !current && list.data.length) setCurrent(list.data[0]);
  }, [split, list.data]); // eslint-disable-line react-hooks/exhaustive-deps

  const download = async (p: any) => {
    try {
      const res = await apiClient.get(API_ENDPOINTS.DOWNLOAD_POLICY_PDF(p.id), {
        responseType: "blob",
      });
      const url = URL.createObjectURL(
        new Blob([res.data], { type: "application/pdf" }),
      );
      const a = document.createElement("a");
      a.href = url;
      a.download = `${(p.title || p.category || "policy").replace(/\s+/g, "_")}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setAlert({
        open: true,
        message: errorMessage(err, "The PDF couldn’t be downloaded."),
        severity: "error",
      });
    }
  };

  const reader = current && (
    <article className={s.doc}>
      <header className={s.docHead}>
        <Tag>{current.category || "Policy"}</Tag>
        <h2 className={s.docTitle}>{current.title || current.category}</h2>
        <p className="px-meta">
          Updated {fmtDate(current.updatedAt || current.createdAt)}
        </p>
        <div className="px-row" style={{ marginTop: 8 }}>
          <Button
            size="small"
            icon="download"
            onClick={() => download(current)}
          >
            Download PDF
          </Button>
          {canWrite && (
            <TransitionLink to={`/policy/${current.id}/edit`}>
              <Button size="small" variant="plain" icon="edit">
                Edit
              </Button>
            </TransitionLink>
          )}
          {canDelete && (
            <Button
              size="small"
              variant="plain"
              onClick={() => setDeleting(current)}
            >
              Delete
            </Button>
          )}
        </div>
      </header>
      <div
        className={s.prose}
        dangerouslySetInnerHTML={{
          __html: DOMPurify.sanitize(current.content || ""),
        }}
      />
    </article>
  );

  return (
    <Page
      title="Policies"
      actions={
        canWrite && (
          <TransitionLink to="/policy/new">
            <Button variant="primary" icon="plus">
              New Policy
            </Button>
          </TransitionLink>
        )
      }
    >
      {list.loading && list.data.length === 0 ? (
        <div className={s.split} aria-hidden>
          <div style={{ display: "grid", gap: 6 }}>
            {[70, 55, 80, 60].map((wd, i) => (
              <div key={i} className={s.sourceItem}>
                <Skeleton width={`${wd}%`} height={15} />
                <Skeleton width="35%" height={11} />
              </div>
            ))}
          </div>
          <ArticleSkeleton paragraphs={3} />
        </div>
      ) : list.data.length === 0 ? (
        <EmptyState icon="doc" title="No policies published yet">
          Company policies your HR team publishes will appear here.
        </EmptyState>
      ) : (
        <div className={s.split}>
          <nav aria-label="Policies" className={s.source}>
            <ul>
              {list.data.map((p: any) => (
                <li key={p.id}>
                  <button
                    type="button"
                    className={s.sourceItem}
                    aria-current={current?.id === p.id ? "true" : undefined}
                    onClick={() => setCurrent(p)}
                  >
                    <span className={s.sourceTitle}>
                      {p.title || p.category}
                    </span>
                    <span className="px-meta">{p.category}</span>
                  </button>
                </li>
              ))}
            </ul>
            <Pagination
              page={list.currentPage}
              pageSize={list.pageSize}
              total={list.totalCount}
              onPage={(n) => list.goToPage(n - 1)}
            />
          </nav>
          {split ? (
            <div className={s.reader}>
              {current && <Swap id={current.id}>{reader}</Swap>}
            </div>
          ) : (
            <Sheet
              open={Boolean(current)}
              onClose={() => setCurrent(null)}
              label={current?.title || current?.category || "Policy"}
              back="Policies"
              width={720}
            >
              <div style={{ padding: 20 }}>{reader}</div>
            </Sheet>
          )}
        </div>
      )}
      <ConfirmDialog
        open={Boolean(deleting)}
        onClose={() => setDeleting(null)}
        busy={busy}
        title="Delete Policy?"
        description={deleting?.title || deleting?.category}
        confirmLabel="Delete"
        onConfirm={async () => {
          setBusy(true);
          try {
            await apiClient.delete(API_ENDPOINTS.DELETE_POLICY(deleting.id));
            setAlert({
              open: true,
              message: "Policy deleted.",
              severity: "success",
            });
            setDeleting(null);
            setCurrent(null);
            list.refresh();
          } catch (err) {
            setAlert({
              open: true,
              message: errorMessage(err),
              severity: "error",
            });
          } finally {
            setBusy(false);
          }
        }}
      />
    </Page>
  );
}
