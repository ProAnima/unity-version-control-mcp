// Consistency rules for server.json, the MCP Registry entry. The registry
// itself only checks the schema and that the published npm package declares
// the same mcpName, so a version or identifier drift would publish an entry
// that points at the wrong package.
export function mcpRegistryProblems(server, pkg, { configurationText = "", fileExists = () => true } = {}) {
  const problems = [];
  const npmPackage = (server.packages ?? []).find((entry) => entry.registryType === "npm");
  if (!pkg.mcpName) problems.push("package.json has no mcpName");
  if (server.name !== pkg.mcpName) problems.push(`name ${server.name} differs from package.json mcpName ${pkg.mcpName}`);
  if (!/^io\.github\.[A-Za-z0-9-]+\/[a-zA-Z0-9._-]+$/.test(server.name ?? "")) {
    problems.push(`name ${server.name} is not an io.github.<owner>/<server> name`);
  }
  if (server.version !== pkg.version) problems.push(`version ${server.version} differs from package version ${pkg.version}`);
  if (!npmPackage) {
    problems.push("packages has no npm entry");
  } else {
    if (npmPackage.identifier !== pkg.name) problems.push(`npm identifier ${npmPackage.identifier} differs from package name ${pkg.name}`);
    if (npmPackage.version !== pkg.version) problems.push(`npm package version ${npmPackage.version} differs from ${pkg.version}`);
    if (npmPackage.transport?.type !== "stdio") problems.push("npm package transport must be stdio");
  }
  if (typeof server.description !== "string" || server.description.length === 0 || server.description.length > 100) {
    problems.push("description must be 1 to 100 characters");
  }
  if ((server.title ?? "").length > 100) problems.push("title must be at most 100 characters");
  if (!/\/server\.schema\.json$/.test(server.$schema ?? "")) problems.push("$schema must point to server.schema.json");
  for (const icon of server.icons ?? []) {
    const local = String(icon.src).match(/^https:\/\/raw\.githubusercontent\.com\/[^/]+\/[^/]+\/[^/]+\/(.+)$/)?.[1];
    if (local && !fileExists(local)) problems.push(`icon ${local} does not exist in the repository`);
  }
  for (const variable of npmPackage?.environmentVariables ?? []) {
    if (!configurationText.includes(`\`${variable.name}\``)) {
      problems.push(`environment variable ${variable.name} is not documented in docs/configuration.md`);
    }
  }
  return problems;
}
