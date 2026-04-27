// Retrying JSON fetch for our own API routes. Handles the 3 main flakiness
// sources for the event-booth use case: transient Bedrock 429s, Polly
// throttling, and conference-wifi disconnects.

type FetchJsonOptions = {
  method?: "GET" | "POST";
  body?: unknown;
  signal?: AbortSignal;
  retries?: number;
};

export class ApiError extends Error {
  status: number;
  code: string | null;
  friendly: string;

  constructor(status: number, code: string | null, friendly: string) {
    super(friendly);
    this.status = status;
    this.code = code;
    this.friendly = friendly;
  }
}

const RETRY_STATUSES = new Set([408, 425, 429, 500, 502, 503, 504]);

function friendlyMessage(status: number, rawCode: string | null): string {
  if (status === 429) return "A IA tá com a fila cheia. Tentando de novo…";
  if (status === 502 || status === 503 || status === 504)
    return "Servidor da IA oscilou. Tentando de novo…";
  if (status === 500) return "Algo quebrou no servidor. Vou tentar outra vez.";
  if (status === 400) return "Pedido inválido — tenta com outras palavras.";
  if (status === 401 || status === 403)
    return "Credenciais AWS expiradas ou sem permissão pro Bedrock/Polly.";
  if (rawCode?.includes("claude")) return "Claude não conseguiu responder agora.";
  if (rawCode?.includes("polly")) return "A voz não saiu. Tenta de novo.";
  return "Algo não funcionou. Tenta de novo.";
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(resolve, ms);
    if (signal) {
      signal.addEventListener(
        "abort",
        () => {
          clearTimeout(t);
          reject(new Error("aborted"));
        },
        { once: true },
      );
    }
  });
}

export async function fetchJson<T>(
  url: string,
  opts: FetchJsonOptions = {},
): Promise<T> {
  const retries = opts.retries ?? 2;
  let lastErr: unknown = null;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, {
        method: opts.method ?? (opts.body ? "POST" : "GET"),
        headers: opts.body ? { "Content-Type": "application/json" } : undefined,
        body: opts.body ? JSON.stringify(opts.body) : undefined,
        signal: opts.signal,
      });

      if (res.ok) return (await res.json()) as T;

      const body = (await res.json().catch(() => null)) as {
        error?: string;
      } | null;
      const code = body?.error ?? null;

      // Non-retryable: fail immediately.
      if (!RETRY_STATUSES.has(res.status)) {
        throw new ApiError(res.status, code, friendlyMessage(res.status, code));
      }

      lastErr = new ApiError(res.status, code, friendlyMessage(res.status, code));
    } catch (err) {
      // Network errors and aborts land here
      if (err instanceof ApiError && !RETRY_STATUSES.has(err.status)) throw err;
      if (opts.signal?.aborted) throw err;
      lastErr = err;
    }

    if (attempt < retries) {
      // Exponential backoff with jitter: 500ms, 1500ms
      const delay = 500 * Math.pow(3, attempt) + Math.random() * 200;
      await sleep(delay, opts.signal);
    }
  }

  if (lastErr instanceof ApiError) throw lastErr;
  throw new ApiError(
    0,
    null,
    "A rede oscilou e não consegui falar com o servidor.",
  );
}
