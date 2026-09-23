import { ChildProcessByStdio, spawn } from 'node:child_process';
import type { Readable } from 'node:stream';
import http from 'node:http';
import path from 'node:path';

/**
 * Verifies the real drain/shutdown sequence against a real OS SIGTERM sent
 * to a real child process — the same way the Go side was actually verified
 * ("timed a SIGTERM: exactly 5s drain then clean exit"), not just by calling
 * runShutdownSequence() as a plain async function. This has to run out of
 * process: installGracefulShutdown ends by calling process.exit(), which
 * would kill the Jest worker itself if exercised in-process.
 */
describe('graceful shutdown (real SIGTERM against a real subprocess, e2e)', () => {
  const fixture = path.join(__dirname, 'fixtures', 'shutdown-demo.ts');
  const packageRoot = path.join(__dirname, '..');
  const DRAIN_MS = 700;

  function waitForReady(child: ChildProcessByStdio<null, Readable, Readable>): Promise<number> {
    return new Promise((resolve, reject) => {
      let buf = '';
      const onData = (chunk: Buffer): void => {
        buf += chunk.toString();
        const match = buf.match(/READY (\d+)/);
        if (match) {
          child.stdout.off('data', onData);
          resolve(Number(match[1]));
        }
      };
      child.stdout.on('data', onData);
      child.stderr.on('data', (chunk: Buffer) => {
        buf += chunk.toString();
      });
      const timer = setTimeout(() => reject(new Error(`fixture never printed READY; output so far:\n${buf}`)), 10000);
      child.once('exit', (code) => {
        clearTimeout(timer);
        if (code !== null && code !== 0 && !buf.includes('READY')) {
          reject(new Error(`fixture exited early with code ${code}; output:\n${buf}`));
        }
      });
    });
  }

  function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  function getStatusOnce(port: number, urlPath: string): Promise<number> {
    return new Promise((resolve, reject) => {
      const req = http.get({ host: '127.0.0.1', port, path: urlPath, timeout: 2000 }, (res) => {
        res.resume();
        resolve(res.statusCode ?? -1);
      });
      req.on('error', reject);
      req.on('timeout', () => req.destroy(new Error('request timed out')));
    });
  }

  /**
   * `app.listen()` resolving and the OS socket actually accepting
   * connections aren't perfectly synchronous in every Node/Nest version —
   * a request fired the instant `waitForReady` resolves can occasionally
   * hit ECONNREFUSED for a few milliseconds. A short bounded retry is the
   * standard, pragmatic way to wait out that window without weakening what
   * the test actually asserts (the retry only covers connection failures,
   * not wrong status codes).
   */
  async function getStatus(port: number, urlPath: string, attempts = 5): Promise<number> {
    for (let attempt = 1; attempt <= attempts; attempt++) {
      try {
        return await getStatusOnce(port, urlPath);
      } catch (err) {
        if (attempt === attempts) throw err;
        await sleep(50);
      }
    }
    /* istanbul ignore next: unreachable — the loop above always returns or throws */
    throw new Error('unreachable');
  }

  it('flips readiness immediately, keeps serving through the drain window, then exits cleanly', async () => {
    const child = spawn(process.execPath, ['-r', 'ts-node/register/transpile-only', fixture], {
      cwd: packageRoot,
      env: {
        ...process.env,
        SHUTDOWN_DRAIN_MS: String(DRAIN_MS),
        SHUTDOWN_TIMEOUT_MS: '5000',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    const port = await waitForReady(child);

    // Sanity: the server is actually up and ready before we touch it.
    expect(await getStatus(port, '/readyz')).toBe(200);

    const start = Date.now();
    const exited = new Promise<number | null>((resolve) => {
      child.once('exit', (code) => resolve(code));
    });

    child.kill('SIGTERM');

    // Readiness must flip to 503 immediately — before the drain sleep even
    // starts, per shared/go/platform/shutdown.go's Run: SetReady(false) is
    // step 1, the sleep is step 2. The server must still be accepting
    // connections at this point (it hasn't been closed yet).
    await sleep(100);
    expect(await getStatus(port, '/readyz')).toBe(503);
    expect(await getStatus(port, '/healthz')).toBe(200); // liveness unaffected

    const exitCode = await exited;
    const elapsedMs = Date.now() - start;

    expect(exitCode).toBe(0);
    // Lower bound proves the drain period was actually honored, not skipped.
    expect(elapsedMs).toBeGreaterThanOrEqual(DRAIN_MS - 100);
    // Upper bound proves it didn't fall through to the shutdown timeout.
    expect(elapsedMs).toBeLessThan(DRAIN_MS + 4000);
  }, 20000);
});
