/** Read request bodies with real byte and elapsed-time limits. No body logging. */
export class PayloadError extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message);
  }
}
export async function boundedText(
  request: Request,
  maxBytes: number,
  timeoutMs = 10000,
): Promise<string> {
  const reader = request.body?.getReader();
  if (!reader) {
    throw new PayloadError(400, "BAD_REQUEST", "Request body is required.");
  }
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () =>
        reject(
          new PayloadError(408, "REQUEST_TIMEOUT", "Request body timed out."),
        ),
      timeoutMs,
    );
  });
  const chunks: Uint8Array[] = [];
  let size = 0;
  let complete = false;
  try {
    for (;;) {
      const { done, value } = await Promise.race([reader.read(), deadline]);
      if (done) {
        complete = true;
        break;
      }
      size += value.byteLength;
      if (size > maxBytes) {
        throw new PayloadError(
          413,
          "REQUEST_TOO_LARGE",
          "Request exceeds the allowed size.",
        );
      }
      chunks.push(value);
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.length;
    }
    try {
      return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    } catch {
      throw new PayloadError(
        400,
        "BAD_REQUEST",
        "Request must contain valid UTF-8.",
      );
    }
  } finally {
    clearTimeout(timer);
    if (!complete) void reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}
