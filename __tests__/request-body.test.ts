import {
  InvalidJsonBodyError,
  readJsonBody,
  RequestBodyTooLargeError,
} from "@/lib/request-body";

describe("readJsonBody", () => {
  it("parses a JSON body within its byte limit", async () => {
    const request = new Request("https://example.test/api", {
      method: "POST",
      body: JSON.stringify({ note: "hello" }),
    });

    await expect(readJsonBody(request, 1024)).resolves.toEqual({ note: "hello" });
  });

  it("rejects an oversized streamed body even when Content-Length is understated", async () => {
    const request = new Request("https://example.test/api", {
      method: "POST",
      headers: { "Content-Length": "1" },
      body: JSON.stringify({ ignored: "x".repeat(1024) }),
    });

    await expect(readJsonBody(request, 128)).rejects.toBeInstanceOf(RequestBodyTooLargeError);
  });

  it("rejects malformed JSON after reading a bounded body", async () => {
    const request = new Request("https://example.test/api", {
      method: "POST",
      body: "{not-json",
    });

    await expect(readJsonBody(request, 1024)).rejects.toBeInstanceOf(InvalidJsonBodyError);
  });
});