import { Suspense } from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import WebAuthnDevices from "@web/features/profile/WebAuthnDevices";
import { AlertContext } from "@web/app/providers/AlertContext";
import { ThemeContext } from "@web/app/providers/ThemeContext";
import apiClient from "@web/core/http/axiosConfig";
import {
  disableWebAuthnCredential,
  disableAllWebAuthn,
  getCurrentDeviceCredentialId,
  initiateWebauthnRegistration,
} from "@web/core/webauthn";

vi.mock("@web/core/http/axiosConfig", () => ({ default: vi.fn() }));
const mockApiClient = apiClient as unknown as ReturnType<typeof vi.fn>;

vi.mock("@web/core/webauthn", () => ({
  disableWebAuthnCredential: vi.fn(),
  disableAllWebAuthn: vi.fn(),
  getCurrentDeviceCredentialId: vi.fn(),
  initiateWebauthnRegistration: vi.fn(),
}));
const mockDisableOne = disableWebAuthnCredential as unknown as ReturnType<
  typeof vi.fn
>;
const mockDisableAll = disableAllWebAuthn as unknown as ReturnType<
  typeof vi.fn
>;
const mockGetCurrentId = getCurrentDeviceCredentialId as unknown as ReturnType<
  typeof vi.fn
>;
const mockInitiateRegistration =
  initiateWebauthnRegistration as unknown as ReturnType<typeof vi.fn>;

vi.mock("@web/shared/components/ConfirmationDialog", () => ({
  default: (props: any) =>
    props.open ? (
      <div>
        <p>{props.message}</p>
        <button onClick={props.onConfirm}>{props.confirmText}</button>
        <button onClick={props.onClose}>{props.cancelText}</button>
      </div>
    ) : null,
}));
vi.mock("@web/shared/components/EmptyState", () => ({
  default: (props: any) => <div>{props.message}</div>,
}));

function renderDevices(setAlert = vi.fn()) {
  render(
    <Suspense fallback={null}>
      <ThemeContext.Provider
        value={{ theme: "light", toggleTheme: vi.fn() } as any}
      >
        <AlertContext.Provider value={{ setAlert } as any}>
          <WebAuthnDevices />
        </AlertContext.Provider>
      </ThemeContext.Provider>
    </Suspense>,
  );
  return { setAlert };
}

function credentialsResponse(credentials: any[]) {
  return { data: { data: { credentials } } };
}

describe("WebAuthnDevices", () => {
  beforeEach(() => {
    mockApiClient.mockReset();
    mockDisableOne.mockReset();
    mockDisableAll.mockReset();
    mockGetCurrentId.mockReset().mockReturnValue(null);
    mockInitiateRegistration.mockReset();
    localStorage.clear();
  });

  it("shows an empty state when there are no registered credentials", async () => {
    mockApiClient.mockResolvedValue(credentialsResponse([]));
    renderDevices();
    expect(
      await screen.findByText(
        /No WebAuthn credentials are currently registered\./,
      ),
    ).toBeInTheDocument();
  });

  it("lists registered credentials with browser/OS/transport details", async () => {
    mockApiClient.mockResolvedValue(
      credentialsResponse([
        {
          credentialID: "cred-1",
          deviceInfo: {
            browser: "Chrome",
            browserVersion: "120.0",
            os: "macOS",
          },
          transports: ["internal"],
          createdAt: new Date().toISOString(),
        },
      ]),
    );
    renderDevices();
    expect(await screen.findByText("Chrome 120")).toBeInTheDocument();
    expect(screen.getByText(/macOS/)).toBeInTheDocument();
  });

  it("marks the current device's credential with a 'This Device' badge and disables re-registration", async () => {
    mockGetCurrentId.mockReturnValue("cred-1");
    mockApiClient.mockResolvedValue(
      credentialsResponse([
        { credentialID: "cred-1", transports: ["internal"] },
      ]),
    );
    renderDevices();
    expect(await screen.findByText("This Device")).toBeInTheDocument();
    expect(screen.getByText(/Already registered/)).toBeInTheDocument();
  });

  it("falls back to a transport-based display name when there is no deviceInfo", async () => {
    mockApiClient.mockResolvedValue(
      credentialsResponse([{ credentialID: "cred-1", transports: ["usb"] }]),
    );
    renderDevices();
    expect(await screen.findByText("USB Security Key")).toBeInTheDocument();
  });

  it("registers this device and refreshes the credential list", async () => {
    mockApiClient
      .mockResolvedValueOnce(credentialsResponse([]))
      .mockResolvedValueOnce(
        credentialsResponse([
          { credentialID: "cred-new", transports: ["internal"] },
        ]),
      );
    mockInitiateRegistration.mockResolvedValue(undefined);
    mockGetCurrentId.mockReturnValueOnce(null).mockReturnValueOnce("cred-new");

    renderDevices();
    await screen.findByText(/No WebAuthn credentials/);

    fireEvent.click(
      screen.getByText("Register this device", { selector: "span" }),
    );

    await waitFor(() => expect(mockInitiateRegistration).toHaveBeenCalled());
    expect(await screen.findByText("This Device")).toBeInTheDocument();
  });

  it("removes a single credential through its confirmation dialog", async () => {
    mockApiClient
      .mockResolvedValueOnce(
        credentialsResponse([
          {
            credentialID: "cred-1",
            deviceInfo: { browser: "Chrome", os: "macOS" },
          },
        ]),
      )
      .mockResolvedValueOnce(credentialsResponse([]));
    mockDisableOne.mockResolvedValue(undefined);

    renderDevices();
    fireEvent.click(await screen.findByText("Remove", { selector: "span" }));
    expect(
      screen.getByText(/Remove "Chrome" from your trusted devices\?/),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByText("Remove", { selector: "button" }));

    await waitFor(() =>
      expect(mockDisableOne).toHaveBeenCalledWith(
        "cred-1",
        expect.any(Function),
      ),
    );
    expect(
      await screen.findByText(/No WebAuthn credentials/),
    ).toBeInTheDocument();
  });

  it("clears the stored current-device id when the removed credential was the current device", async () => {
    localStorage.setItem("currentWebAuthnCredentialId", "cred-1");
    mockGetCurrentId.mockReturnValue("cred-1");
    mockApiClient
      .mockResolvedValueOnce(
        credentialsResponse([
          { credentialID: "cred-1", transports: ["internal"] },
        ]),
      )
      .mockResolvedValueOnce(credentialsResponse([]));
    mockDisableOne.mockResolvedValue(undefined);

    renderDevices();
    fireEvent.click(await screen.findByText("Remove", { selector: "span" }));
    fireEvent.click(screen.getByText("Remove", { selector: "button" }));

    await waitFor(() =>
      expect(localStorage.getItem("currentWebAuthnCredentialId")).toBeNull(),
    );
  });

  it("disables all credentials through its own confirmation dialog", async () => {
    mockApiClient.mockResolvedValue(
      credentialsResponse([
        { credentialID: "cred-1", transports: ["internal"] },
      ]),
    );
    mockDisableAll.mockResolvedValue(undefined);

    renderDevices();
    await screen.findByText("Active Devices (1)");

    fireEvent.click(
      screen.getByText("Disable all devices", { selector: "span" }),
    );
    fireEvent.click(screen.getByText("Disable All", { selector: "button" }));

    await waitFor(() =>
      expect(mockDisableAll).toHaveBeenCalledWith(expect.any(Function)),
    );
    expect(
      await screen.findByText(/No WebAuthn credentials/),
    ).toBeInTheDocument();
  });
});
