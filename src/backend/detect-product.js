export function detectProduct(cmPath = "", showCommandsOutput = "") {
  const haystack = `${cmPath}\n${showCommandsOutput}`.toLowerCase();

  if (haystack.includes("unity version control") || haystack.includes("unityvc")) {
    return "Unity Version Control";
  }

  if (haystack.includes("plastic")) {
    return "Plastic SCM";
  }

  return "Unity Version Control / Plastic SCM";
}
