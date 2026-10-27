// cPanel/Passenger entry point. Use a normal build, not NEXT_STANDALONE=1.
/* eslint-disable @typescript-eslint/no-require-imports -- Passenger startup is intentionally CommonJS. */
const { createServer } = require("node:http");
process.env.NODE_ENV ||= "production";
const next = require("next");
const port = Number(process.env.PORT || 3000);
if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error("PORT must be a valid TCP port.");
const hostname = process.env.HOSTNAME || "127.0.0.1";
const app = next({ dev: false, dir: __dirname, hostname, port });
const handle = app.getRequestHandler();

app.prepare().then(() => {
  const server = createServer((request, response) => {
    handle(request, response).catch((error) => {
      console.error("Request failed", error);
      if (!response.headersSent) response.writeHead(500);
      response.end("Internal server error");
    });
  });
  server.listen(port, hostname, () => console.log(`Seven Sparkles listening on ${hostname}:${port}`));
}).catch((error) => {
  console.error("Could not start Seven Sparkles", error);
  process.exitCode = 1;
});
