import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync } from "fs";
import { spawn } from "child_process";
import { createRequire } from "module";
import { basename, join } from "path";
import { chromium } from "playwright";
import {
  getLocalBrowserSession,
  updateLocalBrowserSession,
  withLocalBrowserSessionLock,
  type LocalBrowserConsoleEntry,
  type LocalBrowserNetworkErrorEntry,
  type LocalBrowserNetworkRequestEntry,
  type LocalBrowserRecordingSegment,
} from "./local-browser-session.js";

interface LocalBrowserDaemonConfig {
  sessionId: string;
  browser?: "chrome" | "edge" | "chromium";
  executablePath: string;
  userDataDir: string;
  debugPort: number;
  url?: string;
  headless?: boolean;
  recordVideo?: boolean;
  recordingDir?: string;
}

interface LocalBrowserDaemonControlRequest {
  action: "close";
  requestedAt: string;
}

const MAX_LOCAL_CONSOLE_LOGS = 200;
const MAX_LOCAL_NETWORK_ERRORS = 100;
const MAX_LOCAL_NETWORK_REQUESTS = 500;
const LOCAL_RECORDING_FPS = 25;
const LOCAL_RECORDING_SIZE = { width: 1280, height: 800 };
const require = createRequire(import.meta.url);

function getPlaywrightFfmpegPath(): string {
  const playwrightCoreRoot = require.resolve("playwright-core");
  const registryModule = require(join(playwrightCoreRoot, "..", "lib", "server", "registry", "index.js")) as {
    registry: {
      findExecutable(name: string): {
        executablePathOrDie(sdkLanguage: string): string;
      };
    };
  };
  return registryModule.registry.findExecutable("ffmpeg").executablePathOrDie("javascript");
}

function getDaemonControlPath(userDataDir: string): string {
  return join(userDataDir, "daemon-control.json");
}

function readDaemonControlRequest(userDataDir: string): LocalBrowserDaemonControlRequest | null {
  const controlPath = getDaemonControlPath(userDataDir);
  if (!existsSync(controlPath)) {
    return null;
  }

  try {
    const request = JSON.parse(readFileSync(controlPath, "utf8")) as LocalBrowserDaemonControlRequest;
    rmSync(controlPath, { force: true });
    return request?.action === "close" ? request : null;
  } catch {
    rmSync(controlPath, { force: true });
    return null;
  }
}

function applyWindowsFfmpegHideWorkaround(): void {
  if (process.platform !== "win32") {
    return;
  }

  const childProcess = require("child_process") as typeof import("child_process") & {
    __deepsyteFfmpegHidePatched?: boolean;
  };

  if (childProcess.__deepsyteFfmpegHidePatched) {
    return;
  }

  const originalSpawn = childProcess.spawn.bind(childProcess);
  const patchedSpawn = ((command: string, ...spawnArgs: unknown[]) => {
    const executableName = basename(command || "").toLowerCase();
    const maybeArgs = Array.isArray(spawnArgs[0]) ? spawnArgs[0] as readonly string[] : undefined;
    const maybeOptions = (Array.isArray(spawnArgs[0]) ? spawnArgs[1] : spawnArgs[0]) as import("child_process").SpawnOptions | undefined;
    if (executableName === "ffmpeg-win64.exe" || executableName === "ffmpeg.exe") {
      return maybeArgs
        ? originalSpawn(command, maybeArgs, {
            ...maybeOptions,
            windowsHide: true,
          })
        : originalSpawn(command, {
            ...maybeOptions,
            windowsHide: true,
          });
    }
    return maybeArgs
      ? originalSpawn(command, maybeArgs, maybeOptions ?? {})
      : originalSpawn(command, maybeOptions ?? {});
  }) as unknown as typeof childProcess.spawn;
  childProcess.spawn = patchedSpawn;
  childProcess.__deepsyteFfmpegHidePatched = true;
}

async function wait(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

function hasNonEmptyFile(filePath?: string): filePath is string {
  if (!filePath || !existsSync(filePath)) {
    return false;
  }

  try {
    return statSync(filePath).size > 0;
  } catch {
    return false;
  }
}

function choosePreferredRecordingPath(candidates: Array<string | undefined>): string | undefined {
  const scored = candidates
    .map((candidate) => {
      if (!candidate || !existsSync(candidate)) {
        return null;
      }
      try {
        const stat = statSync(candidate);
        if (stat.size <= 0) {
          return null;
        }
        return {
          path: candidate,
          size: stat.size,
          mtimeMs: stat.mtimeMs,
        };
      } catch {
        return null;
      }
    })
    .filter((value): value is { path: string; size: number; mtimeMs: number } => !!value)
    .sort((left, right) => right.size - left.size || right.mtimeMs - left.mtimeMs);

  return scored[0]?.path;
}

function findBestRecordingPathInDir(recordingDir?: string): string | undefined {
  if (!recordingDir || !existsSync(recordingDir)) {
    return undefined;
  }

  return choosePreferredRecordingPath(
    readdirSync(recordingDir)
      .filter((fileName) => fileName.toLowerCase().endsWith(".webm"))
      .map((fileName) => join(recordingDir, fileName)),
  );
}

async function waitForNonEmptyFile(filePath?: string, timeoutMs = 15000): Promise<string | undefined> {
  if (!filePath) {
    return undefined;
  }

  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (hasNonEmptyFile(filePath)) {
      return filePath;
    }
    await wait(250);
  }

  return hasNonEmptyFile(filePath) ? filePath : undefined;
}

function resolvePlaywrightChannel(browser?: "chrome" | "edge" | "chromium"): "chrome" | "msedge" | undefined {
  if (browser === "chrome") {
    return "chrome";
  }
  if (browser === "edge") {
    return "msedge";
  }
  return undefined;
}

class LocalScreencastRecorder {
  private cdpSession: any | null = null;
  private ffmpegProcess: ReturnType<typeof spawn> | null = null;
  private launchPromise: Promise<void>;
  private lastWritePromise = Promise.resolve();
  private firstFrameTimestamp = 0;
  private lastFrame: { buffer: Buffer; timestamp: number; frameNumber: number } | null = null;
  private lastWriteNodeTime = 0;
  private frameQueue: Buffer[] = [];
  private stopped = false;
  private readonly firstFramePromise: Promise<void>;
  private resolveFirstFrame!: () => void;
  private readonly segment: LocalBrowserRecordingSegment;

  constructor(
    private readonly page: any,
    private readonly outputFile: string,
    private readonly size = LOCAL_RECORDING_SIZE,
    private readonly onStateChange?: () => void,
  ) {
    this.segment = {
      path: outputFile,
      pageUrl: this.page.url(),
      status: "starting",
      frameCount: 0,
      startedAt: new Date().toISOString(),
    };
    this.firstFramePromise = new Promise((resolve) => {
      this.resolveFirstFrame = resolve;
    });
    this.launchPromise = this.launch();
  }

  private async launch(): Promise<void> {
    const args = `-loglevel error -f image2pipe -avioflags direct -fpsprobesize 0 -probesize 32 -analyzeduration 0 -c:v mjpeg -i pipe:0 -y -an -r ${LOCAL_RECORDING_FPS} -c:v vp8 -qmin 0 -qmax 50 -crf 8 -deadline realtime -speed 8 -b:v 1M -threads 1 -vf pad=${this.size.width}:${this.size.height}:0:0:gray,crop=${this.size.width}:${this.size.height}:0:0`.split(" ");
    args.push(this.outputFile);

    this.ffmpegProcess = spawn(getPlaywrightFfmpegPath(), args, {
      stdio: ["pipe", "ignore", "ignore"],
      windowsHide: true,
      shell: false,
    });

    this.cdpSession = await this.page.context().newCDPSession(this.page);
    this.cdpSession.on("Page.screencastFrame", this.handleScreencastFrame);
    await this.page.bringToFront().catch(() => {});
    await this.cdpSession.send("Page.enable").catch(() => {});
    await this.cdpSession.send("Page.startScreencast", {
      format: "jpeg",
      quality: 90,
      maxWidth: this.size.width,
      maxHeight: this.size.height,
    });
  }

  private handleScreencastFrame = (payload: any) => {
    const buffer = Buffer.from(payload.data, "base64");
    const timestamp = payload.metadata?.timestamp ? payload.metadata.timestamp : Date.now() / 1000;
    this.writeFrame(buffer, timestamp);
    void this.cdpSession?.send("Page.screencastFrameAck", { sessionId: payload.sessionId }).catch(() => {});
  };

  private writeFrame(frame: Buffer, timestamp: number): void {
    void this.launchPromise.then(() => {
      this.bufferFrame(frame, timestamp);
    }).catch(() => {});
  }

  private bufferFrame(frame: Buffer, timestamp: number): void {
    if (!this.ffmpegProcess || this.stopped) {
      return;
    }

    if (!this.firstFrameTimestamp) {
      this.firstFrameTimestamp = timestamp;
      this.segment.status = "ready";
      this.segment.firstFrameAt = new Date().toISOString();
      this.resolveFirstFrame();
    }

    const frameNumber = Math.floor((timestamp - this.firstFrameTimestamp) * LOCAL_RECORDING_FPS);
    if (this.lastFrame) {
      const repeatCount = frameNumber - this.lastFrame.frameNumber;
      for (let index = 0; index < repeatCount; index += 1) {
        this.frameQueue.push(this.lastFrame.buffer);
      }
      this.lastWritePromise = this.lastWritePromise.then(() => this.sendFrames());
    }

    this.lastFrame = { buffer: frame, timestamp, frameNumber };
    this.lastWriteNodeTime = Date.now() / 1000;
    this.segment.pageUrl = this.page.url();
    this.segment.frameCount += 1;
    this.segment.lastFrameAt = new Date().toISOString();
    this.onStateChange?.();
  }

  getSegment(): LocalBrowserRecordingSegment {
    return {
      ...this.segment,
      pageUrl: this.page.url(),
    };
  }

  private async waitForFirstFrame(timeoutMs: number): Promise<boolean> {
    if (this.segment.frameCount > 0) {
      return true;
    }

    return await new Promise<boolean>((resolve) => {
      const timeout = setTimeout(() => resolve(false), timeoutMs);
      timeout.unref();
      void this.firstFramePromise.then(() => {
        clearTimeout(timeout);
        resolve(true);
      });
    });
  }

  private async sendFrames(): Promise<void> {
    while (this.frameQueue.length > 0) {
      const frame = this.frameQueue.shift();
      const ffmpegStdin = this.ffmpegProcess?.stdin;
      if (!frame || !ffmpegStdin || ffmpegStdin.destroyed) {
        return;
      }

      await new Promise<void>((resolve) => {
        ffmpegStdin.write(frame, () => resolve());
      });
    }
  }

  private async finalizeProcess(): Promise<void> {
    if (!this.ffmpegProcess) {
      return;
    }

    const ffmpegStdin = this.ffmpegProcess.stdin;
    if (ffmpegStdin && !ffmpegStdin.destroyed) {
      await new Promise<void>((resolve) => {
        ffmpegStdin.end(() => resolve());
      });
    }

    const ffmpegProcess = this.ffmpegProcess;
    await new Promise<void>((resolve) => {
      let settled = false;
      const finish = () => {
        if (settled) {
          return;
        }
        settled = true;
        resolve();
      };
      ffmpegProcess.once("exit", finish);
      ffmpegProcess.once("error", finish);
      const timeout = setTimeout(() => {
        try {
          ffmpegProcess.kill("SIGKILL");
        } catch {
          // noop
        }
        finish();
      }, 5000);
      timeout.unref();
    });
  }

  async stop(): Promise<string | undefined> {
    const launchError = await this.launchPromise.then(() => null).catch((error) => error);
    if (this.stopped) {
      return undefined;
    }

    if (launchError) {
      this.segment.status = "failed";
      this.segment.stoppedAt = new Date().toISOString();
      this.onStateChange?.();
      return undefined;
    }

    this.stopped = true;
    await this.waitForFirstFrame(1500).catch(() => false);

    if (this.cdpSession) {
      this.cdpSession.off?.("Page.screencastFrame", this.handleScreencastFrame);
      await this.cdpSession.send("Page.stopScreencast").catch(() => {});
    }

    if (!this.lastFrame) {
      await this.finalizeProcess();
      this.segment.status = "empty";
      this.segment.stoppedAt = new Date().toISOString();
      this.segment.sizeBytes = hasNonEmptyFile(this.outputFile) ? statSync(this.outputFile).size : 0;
      this.onStateChange?.();
      return undefined;
    }

    const addTime = Math.max(Date.now() / 1000 - this.lastWriteNodeTime, 1);
    this.bufferFrame(Buffer.from([]), this.lastFrame.timestamp + addTime);
    await this.lastWritePromise.catch(() => {});
    await this.finalizeProcess();
    const finalizedPath = await waitForNonEmptyFile(this.outputFile, 5000);
    this.segment.status = finalizedPath ? "complete" : "empty";
    this.segment.stoppedAt = new Date().toISOString();
    this.segment.sizeBytes = finalizedPath ? statSync(finalizedPath).size : 0;
    this.onStateChange?.();
    return finalizedPath;
  }
}

function pushConsoleLog(logs: LocalBrowserConsoleEntry[], entry: LocalBrowserConsoleEntry): void {
  logs.push(entry);
  if (logs.length > MAX_LOCAL_CONSOLE_LOGS) {
    logs.splice(0, logs.length - MAX_LOCAL_CONSOLE_LOGS);
  }
}

function pushNetworkError(errors: LocalBrowserNetworkErrorEntry[], entry: LocalBrowserNetworkErrorEntry): void {
  errors.push(entry);
  if (errors.length > MAX_LOCAL_NETWORK_ERRORS) {
    errors.splice(0, errors.length - MAX_LOCAL_NETWORK_ERRORS);
  }
}

function pushNetworkRequest(requests: LocalBrowserNetworkRequestEntry[], entry: LocalBrowserNetworkRequestEntry): void {
  requests.push(entry);
  if (requests.length > MAX_LOCAL_NETWORK_REQUESTS) {
    requests.splice(0, requests.length - MAX_LOCAL_NETWORK_REQUESTS);
  }
}

async function main(): Promise<void> {
  const configPath = process.argv[2];
  if (!configPath || !existsSync(configPath)) {
    throw new Error("Local browser daemon config file was not provided.");
  }

  const config = JSON.parse(readFileSync(configPath, "utf8")) as LocalBrowserDaemonConfig;
  if (config.recordVideo && config.recordingDir) {
    mkdirSync(config.recordingDir, { recursive: true });
  }

  applyWindowsFfmpegHideWorkaround();

  const channel = resolvePlaywrightChannel(config.browser);

  const context = await chromium.launchPersistentContext(config.userDataDir, {
    channel,
    executablePath: channel ? undefined : config.executablePath,
    headless: !!config.headless,
    viewport: LOCAL_RECORDING_SIZE,
    args: [
      `--remote-debugging-port=${config.debugPort}`,
      "--no-first-run",
      "--no-default-browser-check",
    ],
  });

  const startupPages = context.pages();
  const page = await context.newPage();
  for (const startupPage of startupPages) {
    if (startupPage !== page && !startupPage.isClosed()) {
      await startupPage.close().catch(() => {});
    }
  }
  if (config.url) {
    await page.goto(config.url, { waitUntil: "domcontentloaded" }).catch(() => {});
  }
  await page.bringToFront().catch(() => {});

  const daemonState = {
    sessionId: config.sessionId,
    url: page.url(),
    pid: process.pid,
    recordVideo: !!config.recordVideo,
    recordingDir: config.recordingDir,
    recordingPath: undefined as string | undefined,
    recordingSegments: [] as LocalBrowserRecordingSegment[],
    consoleLogs: [] as LocalBrowserConsoleEntry[],
    networkErrors: [] as LocalBrowserNetworkErrorEntry[],
    networkRequests: [] as LocalBrowserNetworkRequestEntry[],
  };

  let flushTimer: ReturnType<typeof setTimeout> | null = null;
  const pageRecorders = new Map<object, LocalScreencastRecorder>();
  const finalizedRecordingSegments: LocalBrowserRecordingSegment[] = [];
  const refreshRecordingState = () => {
    const activeSegments = [...pageRecorders.values()].map((recorder) => recorder.getSegment());
    daemonState.recordingSegments = [...finalizedRecordingSegments, ...activeSegments];
    daemonState.recordingPath = choosePreferredRecordingPath(daemonState.recordingSegments.map((segment) => segment.path));
  };
  const flushSession = async () => {
    await withLocalBrowserSessionLock(async () => {
      const current = getLocalBrowserSession();
      if (!current || current.sessionId !== config.sessionId) {
        return;
      }
      updateLocalBrowserSession({
        ...current,
        pid: daemonState.pid,
        url: daemonState.url,
        launchMode: "daemon",
        recordVideo: daemonState.recordVideo,
        recordingDir: daemonState.recordingDir,
        recordingPath: daemonState.recordingPath,
        recordingSegments: [...daemonState.recordingSegments],
        consoleLogs: [...daemonState.consoleLogs],
        networkErrors: [...daemonState.networkErrors],
        networkRequests: [...daemonState.networkRequests],
      });
    }).catch(() => {});
  };

  const scheduleFlush = () => {
    if (flushTimer) {
      return;
    }
    flushTimer = setTimeout(() => {
      flushTimer = null;
      void flushSession();
    }, 250);
    flushTimer.unref();
  };

  const observedPages = new Set<object>();
  const stopPageRecorder = async (observedPage: any): Promise<string | undefined> => {
    const recorder = pageRecorders.get(observedPage);
    if (!recorder) {
      return undefined;
    }

    pageRecorders.delete(observedPage);
    const recordingPath = await recorder.stop().catch(() => undefined);
    finalizedRecordingSegments.push(recorder.getSegment());
    refreshRecordingState();
    scheduleFlush();
    return recordingPath;
  };

  const attachPageRecorder = (observedPage: any) => {
    if (!config.recordVideo || !config.recordingDir || pageRecorders.has(observedPage)) {
      return;
    }

    const outputFile = join(config.recordingDir, `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.webm`);
    pageRecorders.set(observedPage, new LocalScreencastRecorder(observedPage, outputFile, LOCAL_RECORDING_SIZE, () => {
      refreshRecordingState();
      scheduleFlush();
    }));
    refreshRecordingState();
    scheduleFlush();
    observedPage.on("close", () => {
      void stopPageRecorder(observedPage);
    });
  };

  const attachPageObservers = (observedPage: any) => {
    if (observedPages.has(observedPage)) {
      return;
    }
    observedPages.add(observedPage);
    attachPageRecorder(observedPage);

    const requestTimings = new WeakMap<object, number>();

    observedPage.on("console", (msg: any) => {
      const level = msg.type();
      if (level === "error" || level === "warning" || level === "log") {
        pushConsoleLog(daemonState.consoleLogs, {
          level,
          text: msg.text(),
          ts: Date.now(),
        });
        scheduleFlush();
      }
    });

    observedPage.on("pageerror", (error: any) => {
      pushConsoleLog(daemonState.consoleLogs, {
        level: "exception",
        text: error instanceof Error ? error.message : String(error),
        ts: Date.now(),
      });
      scheduleFlush();
    });

    observedPage.on("request", (request: any) => {
      requestTimings.set(request, Date.now());
    });

    observedPage.on("response", (response: any) => {
      const request = response.request();
      const startedAt = requestTimings.get(request) ?? Date.now();
      const entry: LocalBrowserNetworkRequestEntry = {
        url: response.url(),
        method: request.method(),
        status: response.status(),
        statusText: response.statusText(),
        resourceType: request.resourceType(),
        duration: Date.now() - startedAt,
        size: Number(response.headers()?.["content-length"] || 0),
        ts: Date.now(),
      };
      pushNetworkRequest(daemonState.networkRequests, entry);
      if (entry.status >= 400) {
        pushNetworkError(daemonState.networkErrors, {
          url: entry.url,
          status: entry.status,
          statusText: entry.statusText,
          ts: entry.ts,
        });
      }
      scheduleFlush();
    });

    observedPage.on("framenavigated", (frame: any) => {
      if (frame === observedPage.mainFrame()) {
        daemonState.url = frame.url();
        scheduleFlush();
      }
    });
  };

  for (const existingPage of context.pages()) {
    attachPageObservers(existingPage);
  }
  context.on("page", (newPage) => {
    attachPageObservers(newPage);
    daemonState.url = newPage.url();
    scheduleFlush();
  });

  await flushSession();

  let shuttingDown = false;
  const closeGracefully = async () => {
    if (shuttingDown) {
      return;
    }
    shuttingDown = true;

    try {
      const recordingPaths = await Promise.all([...pageRecorders.keys()].map((recordedPage) => stopPageRecorder(recordedPage)));
      await context.close().catch(() => {});
      refreshRecordingState();
      const finalizedVideoPath = choosePreferredRecordingPath([
        ...recordingPaths,
        ...finalizedRecordingSegments.map((segment) => segment.path),
        findBestRecordingPathInDir(config.recordingDir),
      ]);
      if (finalizedVideoPath) {
        daemonState.recordingPath = finalizedVideoPath;
      }
      await flushSession();
    } finally {
      process.exit(0);
    }
  };

  process.on("SIGTERM", () => {
    void closeGracefully();
  });
  process.on("SIGINT", () => {
    void closeGracefully();
  });
  process.on("SIGHUP", () => {
    void closeGracefully();
  });

  setInterval(() => {
    const request = readDaemonControlRequest(config.userDataDir);
    if (request?.action === "close") {
      void closeGracefully();
    }
  }, 250).unref();

  setInterval(() => {
    daemonState.url = page.isClosed() ? context.pages()[context.pages().length - 1]?.url() : page.url();
    void flushSession();
  }, 1000 * 5).unref();

  await new Promise(() => {});
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
