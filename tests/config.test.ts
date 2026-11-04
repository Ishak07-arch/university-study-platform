import { test } from "node:test";
import assert from "node:assert/strict";
import { appOrigin, configuredOrigin } from "../src/server/config";

test("APP_URL is normalised to an origin, including a trailing slash or path", () => {
  assert.equal(
    configuredOrigin({ APP_URL: "https://study.example.edu/" }),
    "https://study.example.edu",
  );
  assert.equal(
    configuredOrigin({ APP_URL: " https://study.example.edu/app " }),
    "https://study.example.edu",
  );
  assert.equal(configuredOrigin({ APP_URL: "" }), null);
  assert.throws(() => configuredOrigin({ APP_URL: "study.example.edu" }));
  assert.throws(() => configuredOrigin({ APP_URL: "ftp://study.example.edu" }));
});

test("production requires APP_URL and HTTPS, except a loopback preview", () => {
  const production = { NODE_ENV: "production" };
  assert.throws(() => appOrigin("https://attacker.example", production), /APP_URL/);
  assert.throws(
    () => appOrigin("x", { ...production, APP_URL: "http://study.example.edu" }),
    /HTTPS/,
  );
  for (const local of [
    "http://127.0.0.1:3000",
    "http://localhost:3000",
    "http://[::1]:3000",
  ])
    assert.equal(
      appOrigin("x", { ...production, APP_URL: local }),
      new URL(local).origin,
    );
  assert.equal(
    appOrigin("https://attacker.example", {
      ...production,
      APP_URL: "https://study.example.edu",
    }),
    "https://study.example.edu",
  );
});

test("development keeps the request-derived fallback when APP_URL is empty", () => {
  assert.equal(
    appOrigin("http://127.0.0.1:3000", { NODE_ENV: "development" }),
    "http://127.0.0.1:3000",
  );
  assert.equal(
    appOrigin("http://127.0.0.1:3000", {
      NODE_ENV: "development",
      APP_URL: "http://127.0.0.1:3000/",
    }),
    "http://127.0.0.1:3000",
  );
});
