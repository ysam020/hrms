import { renderHook, act, waitFor } from "@testing-library/react";
import { useCrudDialog } from "@web/shared/hooks/useCrudDialog";

interface Item {
  id: string;
  name: string;
}

function makeOptions(
  overrides: Partial<Parameters<typeof useCrudDialog>[0]> = {},
) {
  return {
    emptyForm: { name: "" },
    toForm: (item: Item) => ({ name: item.name }),
    getId: (item: Item) => item.id,
    create: vi.fn().mockResolvedValue({}),
    update: vi.fn().mockResolvedValue({}),
    remove: vi.fn().mockResolvedValue({}),
    onRefetch: vi.fn().mockResolvedValue(undefined),
    setAlert: vi.fn(),
    labels: {
      created: "Created!",
      updated: "Updated!",
      deleted: "Deleted!",
      saveFailed: "Save failed.",
      deleteFailed: "Delete failed.",
    },
    ...overrides,
  };
}

describe("useCrudDialog", () => {
  it("initializes with the dialog closed and the empty form", () => {
    const { result } = renderHook(() => useCrudDialog(makeOptions()));
    expect(result.current.dialogOpen).toBe(false);
    expect(result.current.editing).toBeNull();
    expect(result.current.form).toEqual({ name: "" });
  });

  it("openAdd resets the form to empty and opens the dialog in create mode", () => {
    const options = makeOptions();
    const { result } = renderHook(() => useCrudDialog(options));
    act(() => result.current.setForm({ name: "leftover" }));
    act(() => result.current.openAdd());
    expect(result.current.dialogOpen).toBe(true);
    expect(result.current.editing).toBeNull();
    expect(result.current.form).toEqual({ name: "" });
  });

  it("openEdit populates the form via toForm and opens the dialog in edit mode", () => {
    const item: Item = { id: "1", name: "Existing" };
    const { result } = renderHook(() => useCrudDialog(makeOptions()));
    act(() => result.current.openEdit(item));
    expect(result.current.dialogOpen).toBe(true);
    expect(result.current.editing).toBe(item);
    expect(result.current.form).toEqual({ name: "Existing" });
  });

  it("save calls create (not update) when not editing, then shows a success alert, closes the dialog, and refetches", async () => {
    const options = makeOptions();
    const { result } = renderHook(() => useCrudDialog(options));
    act(() => result.current.setForm({ name: "New Item" }));

    await act(async () => {
      await result.current.save();
    });

    expect(options.create).toHaveBeenCalledWith({ name: "New Item" });
    expect(options.update).not.toHaveBeenCalled();
    expect(options.setAlert).toHaveBeenCalledWith({
      open: true,
      message: "Created!",
      severity: "success",
    });
    expect(options.onRefetch).toHaveBeenCalled();
    await waitFor(() => expect(result.current.dialogOpen).toBe(false));
    expect(result.current.saving).toBe(false);
  });

  it("save calls update (not create) when editing an existing item", async () => {
    const options = makeOptions();
    const item: Item = { id: "1", name: "Existing" };
    const { result } = renderHook(() => useCrudDialog(options));
    act(() => result.current.openEdit(item));
    act(() => result.current.setForm({ name: "Renamed" }));

    await act(async () => {
      await result.current.save();
    });

    expect(options.update).toHaveBeenCalledWith("1", { name: "Renamed" });
    expect(options.create).not.toHaveBeenCalled();
    expect(options.setAlert).toHaveBeenCalledWith(
      expect.objectContaining({ message: "Updated!" }),
    );
  });

  it("transforms the form via buildPayload before sending it", async () => {
    const buildPayload = vi.fn((f: { name: string }) => ({
      label: f.name.toUpperCase(),
    }));
    const options = makeOptions({ buildPayload } as any);
    const { result } = renderHook(() => useCrudDialog(options));
    act(() => result.current.setForm({ name: "lowercase" }));

    await act(async () => {
      await result.current.save();
    });

    expect(buildPayload).toHaveBeenCalledWith({ name: "lowercase" });
    expect(options.create).toHaveBeenCalledWith({ label: "LOWERCASE" });
  });

  it("shows the server-provided error message on a failed save and keeps the dialog open", async () => {
    const options = makeOptions({
      create: vi.fn().mockRejectedValue({
        response: { data: { message: "Duplicate code" } },
      }),
    } as any);
    const { result } = renderHook(() => useCrudDialog(options));
    act(() => result.current.openAdd());

    await act(async () => {
      await result.current.save();
    });

    expect(options.setAlert).toHaveBeenCalledWith({
      open: true,
      message: "Duplicate code",
      severity: "error",
    });
    expect(result.current.dialogOpen).toBe(true); // not closed on failure
    expect(options.onRefetch).not.toHaveBeenCalled();
    expect(result.current.saving).toBe(false);
  });

  it("falls back to the generic saveFailed label when the server gives no message", async () => {
    const options = makeOptions({
      create: vi.fn().mockRejectedValue(new Error("network down")),
    } as any);
    const { result } = renderHook(() => useCrudDialog(options));

    await act(async () => {
      await result.current.save();
    });

    expect(options.setAlert).toHaveBeenCalledWith(
      expect.objectContaining({ message: "Save failed." }),
    );
  });

  it("sets saving=true while the save is in flight", async () => {
    let resolveCreate: () => void;
    const create = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveCreate = resolve;
        }),
    );
    const options = makeOptions({ create } as any);
    const { result } = renderHook(() => useCrudDialog(options));

    let savePromise: Promise<void>;
    act(() => {
      savePromise = result.current.save();
    });
    expect(result.current.saving).toBe(true);

    await act(async () => {
      resolveCreate!();
      await savePromise;
    });
    expect(result.current.saving).toBe(false);
  });

  it("confirmDelete is a no-op when there is no delete target", async () => {
    const options = makeOptions();
    const { result } = renderHook(() => useCrudDialog(options));

    await act(async () => {
      await result.current.confirmDelete();
    });

    expect(options.remove).not.toHaveBeenCalled();
  });

  it("confirmDelete removes the target, alerts, clears the target, and refetches", async () => {
    const options = makeOptions();
    const item: Item = { id: "1", name: "ToDelete" };
    const { result } = renderHook(() => useCrudDialog(options));
    act(() => result.current.setDeleteTarget(item));

    await act(async () => {
      await result.current.confirmDelete();
    });

    expect(options.remove).toHaveBeenCalledWith("1");
    expect(options.setAlert).toHaveBeenCalledWith({
      open: true,
      message: "Deleted!",
      severity: "info",
    });
    expect(result.current.deleteTarget).toBeNull();
    expect(options.onRefetch).toHaveBeenCalled();
  });

  it("shows the server error and keeps the delete target on a failed delete", async () => {
    const options = makeOptions({
      remove: vi.fn().mockRejectedValue({
        response: { data: { message: "In use elsewhere" } },
      }),
    } as any);
    const item: Item = { id: "1", name: "ToDelete" };
    const { result } = renderHook(() => useCrudDialog(options));
    act(() => result.current.setDeleteTarget(item));

    await act(async () => {
      await result.current.confirmDelete();
    });

    expect(options.setAlert).toHaveBeenCalledWith({
      open: true,
      message: "In use elsewhere",
      severity: "error",
    });
    expect(result.current.deleteTarget).toBe(item);
  });
});
