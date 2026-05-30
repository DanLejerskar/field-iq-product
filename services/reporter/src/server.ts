/**
 * Reporter service entry point.
 *
 * Two ways in:
 *  - `POST /render` { sessionId, format? } — synchronous; renders + uploads + returns the
 *    signed URL. Used by the API when a user hits `GET /api/sessions/:id/report`.
 *  - Redis Stream `report-queue` — async; bulk export jobs from the dashboard.
 *
 * Both paths call `renderOne()` so behaviour is identical.
 */
import Fastify, { type FastifyError } from 'fastify';
import { Redis } from 'ioredis';
import { assembleReport } from './assemble.js';
import { loadReportData } from './data.js';
import { renderPdf } from './render.js';
import { presignGet, uploadPdf } from './storage.js';

export const REPORT_QUEUE = 'report-queue';
const GROUP = 'reporter';
const CONSUMER = 'reporter-1';

interface RenderJob {
  sessionId: string;
  format?: 'letter' | 'a4';
}

function getSigningKey(): string {
  const key = process.env.REPORT_SIGNING_KEY;
  if (!key || key.startsWith('<')) {
    throw new Error('REPORT_SIGNING_KEY is required — run `pnpm run setup`.');
  }
  return key;
}

export async function renderOne(
  job: RenderJob,
): Promise<{ key: string; url: string; signature: string }> {
  const row = await loadReportData(job.sessionId);
  const data = await assembleReport(row, {
    format: job.format ?? 'letter',
    signingKey: getSigningKey(),
  });
  const pdf = await renderPdf(data);
  const key = await uploadPdf(job.sessionId, pdf);
  const url = await presignGet(key, 24 * 60 * 60);
  return { key, url, signature: data.signature };
}

export async function buildServer() {
  const app = Fastify({ logger: { level: process.env.LOG_LEVEL ?? 'info' } });

  app.setErrorHandler((error: FastifyError, _req, reply) => {
    app.log.error(error);
    return reply.code(error.statusCode ?? 500).send({ error: error.message });
  });

  app.get('/health', async () => ({ ok: true }));

  app.post('/render', async (req) => {
    const { sessionId, format } = (req.body ?? {}) as RenderJob;
    if (!sessionId) {
      throw Object.assign(new Error('sessionId is required'), { statusCode: 400 });
    }
    return renderOne({ sessionId, format });
  });

  return app;
}

function startQueueWorker(logger: ReturnType<typeof Fastify>['log']): {
  stop: () => Promise<void>;
} {
  const redis = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379', {
    maxRetriesPerRequest: null,
  });
  let running = true;

  void redis.xgroup('CREATE', REPORT_QUEUE, GROUP, '$', 'MKSTREAM').catch(() => undefined);

  async function loop(): Promise<void> {
    while (running) {
      try {
        const res = (await redis.xreadgroup(
          'GROUP',
          GROUP,
          CONSUMER,
          'COUNT',
          1,
          'BLOCK',
          2000,
          'STREAMS',
          REPORT_QUEUE,
          '>',
        )) as [string, [string, string[]][]][] | null;
        if (!res) continue;
        for (const [, entries] of res) {
          for (const [entryId, fields] of entries) {
            const jobJson = fields[fields.indexOf('job') + 1];
            if (!jobJson) {
              await redis.xack(REPORT_QUEUE, GROUP, entryId);
              continue;
            }
            const job = JSON.parse(jobJson) as RenderJob;
            try {
              const result = await renderOne(job);
              logger.info({ session: job.sessionId, key: result.key }, 'report rendered');
              await redis.xack(REPORT_QUEUE, GROUP, entryId);
            } catch (err) {
              logger.error({ err: String(err) }, 'report-queue job failed');
            }
          }
        }
      } catch (err) {
        logger.error({ err: String(err) }, 'report-queue loop error');
        await new Promise((r) => setTimeout(r, 1000));
      }
    }
  }

  void loop();
  return {
    async stop() {
      running = false;
      await redis.quit();
    },
  };
}

const isMain = process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/^.*\//, ''));
if (isMain) {
  buildServer()
    .then(async (app) => {
      const worker = startQueueWorker(app.log);
      app.addHook('onClose', async () => {
        await worker.stop();
      });
      return app.listen({ port: Number(process.env.REPORTER_PORT ?? 3010), host: '0.0.0.0' });
    })
    .then((addr) => {
      // eslint-disable-next-line no-console
      console.log(`reporter listening on ${addr}`);
    })
    .catch((err: unknown) => {
      console.error(err instanceof Error ? err.message : String(err));
      process.exit(1);
    });
}
