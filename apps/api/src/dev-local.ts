process.env.PORT ??= "3011";
process.env.SHOW_DEV_AUTH_CODE ??= "true";
process.env.PERSISTENCE_MODE ??= "postgres";
process.env.CORS_ALLOWED_ORIGINS ??= [
  "http://127.0.0.1:3000",
  "http://localhost:3000",
  "http://127.0.0.1:3020",
  "http://localhost:3020",
  "http://127.0.0.1:3021",
  "http://localhost:3021",
  "http://127.0.0.1:8082",
  "http://localhost:8082",
].join(",");

await import("./server.js");
