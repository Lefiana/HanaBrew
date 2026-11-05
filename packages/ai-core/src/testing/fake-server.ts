import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";

export interface Captured {
  method: string;
  url: string;
  headers: IncomingMessage["headers"];
  body: unknown;
  raw: string;
}

export interface FakeServer {
  url: string;
  requests: Captured[];
  /** Queue the next response(s); the last one repeats. */
  respond(status: number, body: unknown, delayMs?: number): void;
  /** Forget queued responses and recorded requests, so the next `respond` starts fresh. */
  clear(): void;
  close(): Promise<void>;
}

/** A tiny HTTP server that records requests and replays canned JSON, standing in for a provider. */
export async function startFakeServer(): Promise<FakeServer> {
  const requests: Captured[] = [];
  const queue: Array<{ status: number; body: unknown; delayMs: number }> = [];
  const server: Server = createServer((req: IncomingMessage, res: ServerResponse) => {
    const chunks: Buffer[] = [];
    req.on("data", (c: Buffer) => chunks.push(c));
    req.on("end", () => {
      const raw = Buffer.concat(chunks).toString("utf8");
      let body: unknown;
      try {
        body = raw ? JSON.parse(raw) : undefined;
      } catch {
        body = raw;
      }
      requests.push({
        method: req.method ?? "",
        url: req.url ?? "",
        headers: req.headers,
        body,
        raw,
      });
      const next = queue.length > 1 ? queue.shift()! : queue[0];
      const send = () => {
        res.statusCode = next?.status ?? 200;
        res.setHeader("content-type", "application/json");
        res.end(typeof next?.body === "string" ? next.body : JSON.stringify(next?.body ?? {}));
      };
      if (next?.delayMs) setTimeout(send, next.delayMs);
      else send();
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${port}`,
    requests,
    respond: (status, body, delayMs = 0) => void queue.push({ status, body, delayMs }),
    clear: () => {
      queue.length = 0;
      requests.length = 0;
    },
    close: () => new Promise((resolve) => server.close(() => resolve())),
  };
}
