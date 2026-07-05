const { spawn } = require("child_process");
const path = require("path");

const port = Number(process.env.SMOKE_PORT || 4180);
const baseUrl = `http://127.0.0.1:${port}`;
const child = spawn(process.execPath, ["dev-server.js"], {
  cwd: path.resolve(__dirname, ".."),
  env: {
    ...process.env,
    PORT: String(port),
    HOST: "127.0.0.1",
    NODE_ENV: "test",
    MODEL_API_KEY: process.env.MODEL_API_KEY || ""
  },
  stdio: ["ignore", "pipe", "pipe"]
});

const logs = [];
child.stdout.on("data", (chunk) => logs.push(chunk.toString()));
child.stderr.on("data", (chunk) => logs.push(chunk.toString()));

main()
  .then(() => {
    child.kill("SIGTERM");
    console.log("Smoke test passed.");
  })
  .catch((error) => {
    child.kill("SIGTERM");
    console.error(logs.join(""));
    console.error(error.message);
    process.exit(1);
  });

async function main() {
  await waitForServer();
  await expectStatus("/", 200);
  await expectStatus("/api/config", 200);
  await expectStatus("/api/health", [200, 503]);
}

async function waitForServer() {
  const deadline = Date.now() + 8000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${baseUrl}/api/config`);
      if (response.status === 200) return;
    } catch (error) {
      await sleep(200);
    }
  }
  throw new Error("Server did not become ready.");
}

async function expectStatus(path, expected) {
  const response = await fetch(`${baseUrl}${path}`);
  const allowed = Array.isArray(expected) ? expected : [expected];
  if (!allowed.includes(response.status)) {
    throw new Error(`${path} returned ${response.status}, expected ${allowed.join(" or ")}.`);
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
