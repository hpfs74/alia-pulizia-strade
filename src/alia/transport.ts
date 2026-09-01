export const BASE_URL = 'https://www2.aliaserviziambientali.it/puliziastrade';
export const USER_AGENT =
  'pulizia-strade-skill/0.1 (+https://github.com/hpfs/pulizia-strade-skill)';

export type PostFn = (path: string, form: Record<string, string>) => Promise<unknown>;

/**
 * Live transport. Serialises every request through a single promise chain so
 * that calls are spaced by at least `minIntervalMs`, keeping us a negligible
 * load on Alia's servers even during a full-city harvest.
 */
export function createTransport(options: { minIntervalMs?: number } = {}): PostFn {
  const minIntervalMs = options.minIntervalMs ?? 300;
  let queue: Promise<unknown> = Promise.resolve();
  let lastStart = 0;

  return (path, form) => {
    const result = queue.then(async () => {
      const wait = Math.max(0, lastStart + minIntervalMs - Date.now());
      if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
      lastStart = Date.now();

      const response = await fetch(`${BASE_URL}/${path}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent': USER_AGENT,
        },
        body: new URLSearchParams(form).toString(),
      });

      if (!response.ok) {
        throw new Error(`Alia ${path} returned HTTP ${response.status}`);
      }
      return response.json();
    });

    queue = result.catch(() => undefined);
    return result;
  };
}
