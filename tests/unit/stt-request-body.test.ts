import { readBodyBytes, RequestBodyTooLargeError } from "@/lib/server/request-body";
import { STT_MAX_BYTES } from "@/lib/ai/stt";

test("audio uploads stop reading at the byte limit without a Content-Length", async () => {
  const cancel = jest.fn();
  const body = new ReadableStream<Uint8Array<ArrayBuffer>>({
    start(controller) { controller.enqueue(new Uint8Array(STT_MAX_BYTES + 1)); },
    cancel,
  });
  await expect(readBodyBytes({ headers: new Headers(), body }, STT_MAX_BYTES)).rejects.toBeInstanceOf(RequestBodyTooLargeError);
  expect(cancel).toHaveBeenCalledTimes(1);
});

test("bounded audio uploads preserve the received bytes", async () => {
  const request = new Request("https://example.com/api/stt/", { method: "POST", body: new Uint8Array([1, 2, 3]) });
  expect(new Uint8Array(await readBodyBytes(request, STT_MAX_BYTES))).toEqual(new Uint8Array([1, 2, 3]));
});
