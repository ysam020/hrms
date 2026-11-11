import { describe, it, expect, vi, afterEach } from "vitest";
import { act, render, screen, fireEvent } from "@testing-library/react";
import {
  usePermissionPrimer,
  type PermissionKind,
} from "@next/ui/permissionPrimer";

function setCamera(state: PermissionState | "throw") {
  Object.defineProperty(navigator, "permissions", {
    configurable: true,
    value: {
      query: vi.fn(() =>
        state === "throw"
          ? Promise.reject(new Error("unsupported"))
          : Promise.resolve({ state }),
      ),
    },
  });
  Object.defineProperty(navigator, "mediaDevices", {
    configurable: true,
    value: { getUserMedia: vi.fn() },
  });
}

function Harness({
  kind,
  onResult,
}: {
  kind: PermissionKind;
  onResult: (ok: boolean) => void;
}) {
  const { ask, primer } = usePermissionPrimer();
  return (
    <>
      <button onClick={() => ask(kind).then(onResult)}>start</button>
      {primer}
    </>
  );
}

const start = async () => {
  await act(async () => {
    fireEvent.click(screen.getByText("start"));
  });
};

afterEach(() => vi.restoreAllMocks());

describe("usePermissionPrimer", () => {
  it("explains before the browser asks, and continues on consent", async () => {
    setCamera("prompt");
    const onResult = vi.fn();
    render(<Harness kind="camera" onResult={onResult} />);
    await start();
    expect(screen.getByText("Allow Camera for Face Check")).toBeTruthy();
    expect(screen.getByText(/isn’t uploaded or stored/)).toBeTruthy();
    await act(async () => {
      fireEvent.click(screen.getByText("Continue"));
    });
    expect(onResult).toHaveBeenCalledWith(true);
  });

  it("stops when the person says not now", async () => {
    setCamera("throw"); // can't be queried: explain first
    const onResult = vi.fn();
    render(<Harness kind="camera" onResult={onResult} />);
    await start();
    await act(async () => {
      fireEvent.click(screen.getByText("Not Now"));
    });
    expect(onResult).toHaveBeenCalledWith(false);
  });

  it("shows how to unblock a blocked permission", async () => {
    setCamera("denied");
    const onResult = vi.fn();
    render(<Harness kind="camera" onResult={onResult} />);
    await start();
    expect(screen.getByText("Camera Is Blocked")).toBeTruthy();
    expect(screen.getByText("Set Camera to Allow.")).toBeTruthy();
    await act(async () => {
      fireEvent.click(screen.getByText("Close"));
    });
    expect(onResult).toHaveBeenCalledWith(false);
  });

  it("goes straight through when already allowed", async () => {
    setCamera("granted");
    const onResult = vi.fn();
    render(<Harness kind="camera" onResult={onResult} />);
    await start();
    expect(onResult).toHaveBeenCalledWith(true);
    expect(screen.queryByText("Allow Camera for Face Check")).toBeNull();
  });
});
