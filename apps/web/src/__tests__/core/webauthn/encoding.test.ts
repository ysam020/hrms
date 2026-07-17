import { arrayBufferToBase64url } from "@web/core/webauthn/arrayBufferToBase64url";
import { base64urlToArrayBuffer } from "@web/core/webauthn/base64urlToArrayBuffer";
import { base64urlToUint8Array } from "@web/core/webauthn/base64urlToUint8Array";
import { urlBase64ToUint8Array } from "@web/core/webauthn/urlBase64ToUint8Array";
import { toArrayBuffer } from "@web/core/webauthn/toArrayBuffer";
import { serializeCredential } from "@web/core/webauthn/serializeCredential";
import { formatLoginOptions } from "@web/core/webauthn/formatLoginOptions";
import { getCredential } from "@web/core/webauthn/getCredential";

describe("arrayBufferToBase64url", () => {
  it("round-trips an ArrayBuffer through base64url encoding", () => {
    const bytes = new Uint8Array([1, 2, 3, 255, 254]);
    const encoded = arrayBufferToBase64url(bytes.buffer);
    expect(encoded).not.toMatch(/[+/=]/); // no standard-base64 chars
    const decoded = new Uint8Array(base64urlToArrayBuffer(encoded));
    expect(Array.from(decoded)).toEqual([1, 2, 3, 255, 254]);
  });

  it("accepts a Uint8Array directly", () => {
    const encoded = arrayBufferToBase64url(new Uint8Array([65, 66, 67]));
    expect(encoded).toBe("QUJD"); // "ABC"
  });

  it("accepts a plain number array", () => {
    const encoded = arrayBufferToBase64url([65, 66, 67]);
    expect(encoded).toBe("QUJD");
  });

  it("throws for null/undefined input", () => {
    expect(() => arrayBufferToBase64url(null as any)).toThrow(
      "Buffer is null or undefined",
    );
  });

  it("throws for an unsupported input type", () => {
    expect(() => arrayBufferToBase64url("not-a-buffer" as any)).toThrow(
      /Invalid buffer type/,
    );
  });

  it("replaces +, /, and = with URL-safe characters", () => {
    // Bytes chosen so the raw base64 would contain '+' and '/'.
    const bytes = new Uint8Array([251, 255, 191]);
    const encoded = arrayBufferToBase64url(bytes);
    expect(encoded).not.toMatch(/[+/=]/);
  });
});

describe("base64urlToArrayBuffer", () => {
  it("decodes a base64url string back to the original bytes", () => {
    const buf = base64urlToArrayBuffer("QUJD");
    expect(Array.from(new Uint8Array(buf))).toEqual([65, 66, 67]);
  });

  it("passes an ArrayBuffer through unchanged", () => {
    const original = new Uint8Array([1, 2, 3]).buffer;
    expect(base64urlToArrayBuffer(original)).toBe(original);
  });

  it("converts a Uint8Array to its underlying ArrayBuffer slice", () => {
    const arr = new Uint8Array([1, 2, 3]);
    const result = base64urlToArrayBuffer(arr);
    expect(Array.from(new Uint8Array(result as ArrayBuffer))).toEqual([
      1, 2, 3,
    ]);
  });

  it("converts a plain array to an ArrayBuffer", () => {
    const result = base64urlToArrayBuffer([9, 8, 7]);
    expect(Array.from(new Uint8Array(result as ArrayBuffer))).toEqual([
      9, 8, 7,
    ]);
  });

  it("converts a Buffer-shaped object ({ data: number[] }) to an ArrayBuffer", () => {
    const result = base64urlToArrayBuffer({ data: [4, 5, 6] });
    expect(Array.from(new Uint8Array(result as ArrayBuffer))).toEqual([
      4, 5, 6,
    ]);
  });

  it("throws for an empty string", () => {
    expect(() => base64urlToArrayBuffer("")).toThrow("Empty base64url string");
  });

  it("throws for an unsupported input type", () => {
    expect(() => base64urlToArrayBuffer(42)).toThrow(/Invalid input type/);
  });

  it("pads correctly regardless of base64url string length mod 4", () => {
    // "A" (1 char) needs 3 padding chars; verify no throw and correct byte.
    expect(Array.from(new Uint8Array(base64urlToArrayBuffer("QQ")))).toEqual([
      65,
    ]);
  });
});

describe("base64urlToUint8Array / toArrayBuffer (thin wrappers)", () => {
  it("base64urlToUint8Array returns a Uint8Array view of the decoded bytes", () => {
    const result = base64urlToUint8Array("QUJD");
    expect(result).toBeInstanceOf(Uint8Array);
    expect(Array.from(result)).toEqual([65, 66, 67]);
  });

  it("toArrayBuffer delegates to base64urlToArrayBuffer", () => {
    const result = toArrayBuffer("QUJD");
    expect(Array.from(new Uint8Array(result as ArrayBuffer))).toEqual([
      65, 66, 67,
    ]);
  });
});

describe("urlBase64ToUint8Array", () => {
  it("decodes a base64url string to a Uint8Array", () => {
    expect(Array.from(urlBase64ToUint8Array("QUJD"))).toEqual([65, 66, 67]);
  });

  it("trims whitespace before decoding", () => {
    expect(Array.from(urlBase64ToUint8Array("  QUJD  "))).toEqual([65, 66, 67]);
  });

  it("throws for a non-string input", () => {
    expect(() => urlBase64ToUint8Array(null as any)).toThrow(
      "Invalid base64 string provided",
    );
  });

  it("throws for an empty string", () => {
    expect(() => urlBase64ToUint8Array("")).toThrow(
      "Invalid base64 string provided",
    );
  });

  it("throws a wrapped error for malformed base64", () => {
    expect(() => urlBase64ToUint8Array("not valid base64!!!")).toThrow(
      /Failed to decode base64url string/,
    );
  });
});

describe("serializeCredential", () => {
  it("converts an assertion credential's binary fields to plain number arrays", () => {
    const credential = {
      id: "cred-1",
      type: "public-key",
      rawId: new Uint8Array([1, 2]).buffer,
      response: {
        authenticatorData: new Uint8Array([3, 4]).buffer,
        clientDataJSON: new Uint8Array([5, 6]).buffer,
        signature: new Uint8Array([7, 8]).buffer,
        userHandle: new Uint8Array([9, 10]).buffer,
      },
    } as unknown as PublicKeyCredential;

    const result = serializeCredential(credential);

    expect(result).toEqual({
      id: "cred-1",
      type: "public-key",
      rawId: [1, 2],
      response: {
        authenticatorData: [3, 4],
        clientDataJSON: [5, 6],
        signature: [7, 8],
        userHandle: [9, 10],
      },
    });
  });

  it("serializes userHandle as null when absent", () => {
    const credential = {
      id: "cred-1",
      type: "public-key",
      rawId: new Uint8Array([1]).buffer,
      response: {
        authenticatorData: new Uint8Array([1]).buffer,
        clientDataJSON: new Uint8Array([1]).buffer,
        signature: new Uint8Array([1]).buffer,
        userHandle: null,
      },
    } as unknown as PublicKeyCredential;

    expect(serializeCredential(credential).response.userHandle).toBeNull();
  });
});

describe("formatLoginOptions", () => {
  it("converts the challenge to an ArrayBuffer", () => {
    const options = { challenge: "QUJD" };
    const result = formatLoginOptions(options);
    expect(Array.from(new Uint8Array(result.challenge))).toEqual([65, 66, 67]);
  });

  it("converts every allowCredentials[].id to an ArrayBuffer", () => {
    const options = {
      challenge: "QUJD",
      allowCredentials: [{ id: "QUJD" }, { id: "QQ" }],
    };
    const result = formatLoginOptions(options);
    expect(Array.from(new Uint8Array(result.allowCredentials[0].id))).toEqual([
      65, 66, 67,
    ]);
    expect(Array.from(new Uint8Array(result.allowCredentials[1].id))).toEqual([
      65,
    ]);
  });

  it("leaves allowCredentials untouched when absent", () => {
    const options = { challenge: "QUJD" };
    const result = formatLoginOptions(options);
    expect(result.allowCredentials).toBeUndefined();
  });

  it("throws a wrapped error when the challenge is malformed", () => {
    expect(() => formatLoginOptions({ challenge: 42 })).toThrow(
      /Invalid challenge format/,
    );
  });

  it("throws a wrapped error when a credential id is malformed", () => {
    expect(() =>
      formatLoginOptions({ challenge: "QUJD", allowCredentials: [{ id: 42 }] }),
    ).toThrow(/Invalid credential ID format/);
  });
});

describe("getCredential", () => {
  it("delegates to navigator.credentials.get with the publicKey option", async () => {
    const mockGet = vi.fn().mockResolvedValue({ id: "cred-1" });
    (global as any).navigator.credentials = { get: mockGet };

    const options = { challenge: new Uint8Array([1]) } as any;
    const result = await getCredential(options);

    expect(mockGet).toHaveBeenCalledWith({ publicKey: options });
    expect(result).toEqual({ id: "cred-1" });
  });
});
