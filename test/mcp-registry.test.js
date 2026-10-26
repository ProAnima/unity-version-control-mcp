import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { mcpRegistryProblems } from "../scripts/mcp-registry.js";

const root = path.resolve(import.meta.dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const pkg = JSON.parse(read("package.json"));
const server = JSON.parse(read("server.json"));
const options = {
  configurationText: read("docs/configuration.md"),
  fileExists: (file) => fs.existsSync(path.join(root, file))
};

test("server.json describes exactly the npm package of this release", () => {
  assert.deepEqual(mcpRegistryProblems(server, pkg, options), []);
  assert.equal(server.name, "io.github.ProAnima/uvcs-mcp");
  const workspace = server.packages[0].environmentVariables.find((variable) => variable.name === "UVCS_WORKSPACE");
  assert.equal(workspace.isRequired, true);
});

test("server.json drift is reported", () => {
  const drifted = JSON.parse(JSON.stringify(server));
  drifted.version = "0.0.1";
  drifted.packages[0].identifier = "@someone/else";
  drifted.description = "x".repeat(101);
  drifted.icons = [{ src: "https://raw.githubusercontent.com/ProAnima/unity-version-control-mcp/main/assets/missing.png" }];
  drifted.packages[0].environmentVariables = [{ name: "UVCS_UNDOCUMENTED" }];
  const problems = mcpRegistryProblems(drifted, pkg, options).join("\n");
  for (const expected of ["version 0.0.1", "identifier @someone/else", "description must be", "icon assets/missing.png", "UVCS_UNDOCUMENTED"]) {
    assert.match(problems, new RegExp(expected.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&")));
  }

  assert.match(mcpRegistryProblems(server, { ...pkg, mcpName: undefined }, options).join("\n"), /no mcpName/);
});
