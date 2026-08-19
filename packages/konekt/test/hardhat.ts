import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { createServer } from "node:net";

const cli = createRequire(import.meta.url).resolve("hardhat/internal/cli/cli.js");

export async function startHardhat() {
  const port = await freePort();
  const child = spawn(process.execPath, [cli, "node", "--hostname", "127.0.0.1", "--port", String(port)], {
    stdio: ["ignore", "pipe", "pipe"],
  });

  await new Promise<void>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("hardhat start timeout")), 30_000);
    const onData = (buf: Buffer) => {
      if (!String(buf).includes("Started HTTP") && !String(buf).includes("JSON-RPC")) return;
      cleanup();
      resolve();
    };
    const onExit = (c: number | null) => {
      cleanup();
      reject(new Error(`hardhat exited ${c}`));
    };
    const cleanup = () => {
      clearTimeout(t);
      child.stdout.off("data", onData);
      child.stderr.off("data", onData);
      child.off("exit", onExit);
    };
    child.stdout.on("data", onData);
    child.stderr.on("data", onData);
    child.on("exit", onExit);
  });

  return {
    url: `http://127.0.0.1:${port}`,
    stop: () =>
      new Promise<void>((resolve) => {
        if (child.exitCode !== null || child.signalCode) return resolve();
        const killer = setTimeout(() => child.kill("SIGKILL"), 1500);
        child.once("exit", () => {
          clearTimeout(killer);
          resolve();
        });
        child.kill("SIGTERM");
      }),
  };
}

function freePort() {
  return new Promise<number>((resolve, reject) => {
    const s = createServer();
    s.listen(0, "127.0.0.1", () => {
      const addr = s.address();
      if (!addr || typeof addr === "string") return reject(new Error("port"));
      const { port } = addr;
      s.close(() => resolve(port));
    });
  });
}
