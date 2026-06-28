import path from "node:path";
import { fileURLToPath } from "node:url";
import { createApiServer } from "./app.js";
import { loadConfig } from "./config.js";
import { createRepositories } from "./modules/repositories.js";

const config = loadConfig();
const repositories = createRepositories(config.databaseUrl);
const moduleDirectory = path.dirname(fileURLToPath(import.meta.url));
const publicDirectory = path.resolve(moduleDirectory, "../public");
const server = createApiServer({
  repositories,
  publicDirectory,
  authSessionSecret: config.authSessionSecret,
});

server.listen(config.port, "0.0.0.0", () => {
  console.log(
    JSON.stringify({
      event: "api_started",
      port: config.port,
      persistence: config.databaseUrl ? "postgres" : "memory",
    }),
  );
});
