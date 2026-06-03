import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import path from "node:path";

const apps = {
  "retail-copilot": {
    dockerfile: "apps/retail-copilot/Dockerfile",
    image: "contoso-retail-copilot"
  },
  "creative-writer": {
    dockerfile: "apps/creative-writer/Dockerfile",
    image: "contoso-creative-writer"
  },
  "app-service-ai": {
    dockerfile: "apps/app-service-ai/Dockerfile",
    image: "azure-app-service-ai-scenario"
  }
};

const [, , appKey = "retail-copilot", environment = "dev"] = process.argv;
const app = apps[appKey];

if (!app) {
  throw new Error(`Unknown app "${appKey}". Use ${Object.keys(apps).join(", ")}.`);
}

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = execFile(command, args, { cwd: process.cwd() }, (error, stdout, stderr) => {
      if (error) {
        reject(new Error(`${command} ${args.join(" ")} failed: ${stderr || error.message}`));
        return;
      }
      resolve({ stdout, stderr });
    });
    child.stdout?.pipe(process.stdout);
    child.stderr?.pipe(process.stderr);
  });
}

function sha256(filePath) {
  return new Promise((resolve, reject) => {
    const hash = createHash("sha256");
    createReadStream(filePath)
      .on("data", (chunk) => hash.update(chunk))
      .on("error", reject)
      .on("end", () => resolve(hash.digest("hex")));
  });
}

const tag = `${app.image}:${environment}`;
const outputDir = path.join("artifacts", "images", appKey, environment);
const archivePath = path.join(outputDir, `${app.image}-${environment}.tar`);
const metadataPath = path.join(outputDir, "metadata.json");

try {
  await mkdir(outputDir, { recursive: true });
  console.log(`Building ${tag} from ${app.dockerfile}`);
  await run("docker", ["build", "-f", app.dockerfile, "-t", tag, "."]);
  console.log(`Saving ${tag} to ${archivePath}`);
  await run("docker", ["save", "-o", archivePath, tag]);
  const digest = await sha256(archivePath);
  const metadata = {
    appKey,
    environment,
    imageTag: tag,
    archivePath,
    sha256: digest,
    generatedAt: new Date().toISOString(),
    note: "Local archive is useful for handoff/offline review, but Azure deployment still requires a registry image reference."
  };
  await writeFile(metadataPath, `${JSON.stringify(metadata, null, 2)}\n`);
  console.log(`Local image archive written: ${archivePath}`);
  console.log(`SHA256: ${digest}`);
} catch (error) {
  console.error(error.message);
  console.error("Docker must be installed and running to create a local image archive.");
  process.exit(1);
}
