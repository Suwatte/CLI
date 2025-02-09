import * as path from "path";
import * as fs from "fs";
import * as fsExtra from "fs-extra";
import emulate from "@suwatte/emulator";
import { createHash } from "crypto";
import browserify from "browserify";
import { evaluateEnvironment } from "../utils/evaluateEnvironment";
import { generateHTML } from "../utils/generateHTML";
import { compile } from "../utils/compile";
import chalk from "chalk";
type config = {
  noList?: any;
  folder?: string;
};
const TEMP_DIR = "__temp__";
const OUT_DIR = "stt";
const EXCLUDED_MODULES = [
  "cheerio",
  "lodash",
  "he",
  "fs",
  "axios",
  "crypto-js",
  "moment",
];
export const build = async (config: config) => {
  console.info(chalk.yellow.bold("Building..."));
  const BASE_PATH = process.cwd();

  const tempDir = path.join(BASE_PATH, TEMP_DIR);
  const outDir = path.join(BASE_PATH, config.folder ?? OUT_DIR);
  // Clear Temp Directory
  fs.rmSync(tempDir, { recursive: true, force: true });
  fs.mkdirSync(tempDir, { recursive: true });

  let failed = false;
  try {
    await compile(tempDir);
    const runnerDir = path.join(tempDir, "runners");

    // Clear Out Dir & Re-add directories
    await fs.promises.rm(outDir, { recursive: true, force: true });
    await fs.promises.mkdir(outDir, { recursive: true });

    const outRunnersDir = path.join(outDir, "runners");
    await fs.promises.mkdir(outRunnersDir, { recursive: true });

    // Bundle with browserify
    await bundle(outDir, runnerDir);

    if (config.noList) {
      console.info(chalk.green.bold("Built Runners!"));
      return;
    }
    generateList(runnerDir, outDir);

    // Delete Temp
    fs.promises.rm(tempDir, { recursive: true, force: true });

    // Copy Assets
    const assetsDirectory = path.join(BASE_PATH, "assets");
    if (fsExtra.existsSync(assetsDirectory)) {
      const dest = path.join(outDir, "assets");
      fsExtra.copy(assetsDirectory, dest, { overwrite: true });
    }

    // HTML
    try {
      await generateHTML();
      console.info(chalk.green.bold("Built Runners!"));
    } catch (err: any) {
      console.error(chalk.red.bold("Failed to prepare HTML"));
      console.error(chalk.red.bold(`${err.message}`));
    }
  } catch (err: any) {
    console.error(chalk.red.bold("Failed to build runners"));
    console.error(chalk.red.bold(`${err.message}`));
    failed = true;
  } finally {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  }

  if (failed) {
    process.exit(-1);
  }
};

// Bundle with browserify
const bundle = async (outDir: string, runnerDir: string) => {
  const directory = await fs.promises.readdir(runnerDir);
  const promises = directory.map((folder) =>
    bundleRunner(folder, runnerDir, outDir)
  );

  await Promise.all(promises);
};

const bundleRunner = async (
  subfolder: string,
  directory: string,
  outDir: string
) => {
  // The Location of the transpiled folder
  const folderDir = path.join(directory, subfolder);

  // Ensure that the folder is a directory
  const isDirectory = (await fs.promises.stat(folderDir)).isDirectory();
  if (!isDirectory) {
    return;
  }

  const targetFile = path.join(folderDir, "index.js");
  const targetExists = await fs.promises.stat(targetFile).then(
    () => true,
    () => false
  );

  if (!targetExists) {
    return;
  }

  const outRunnersDir = path.join(outDir, "runners");
  const outPath = path.join(outRunnersDir, `${subfolder}.stt`);

  // Browserify
  const b = browserify({
    entries: [targetFile],
    standalone: "STTPackage",
  });

  EXCLUDED_MODULES.forEach((v) => b.exclude(v));

  // Write to file
  const stream = b.bundle();
  await new Promise<void>((resolve, reject) => {
    stream
      .pipe(fs.createWriteStream(outPath))
      .on("finish", resolve)
      .on("error", reject);
  });
};

// Generates Runner List
const generateList = (runnerDir: string, outDir: string) => {
  const timestamp = Date.now();
  const runners = fs
    .readdirSync(runnerDir)
    .map((folderName) => {
      const targetFile = path.join(runnerDir, folderName, "index.js");
      const targetExists = fs.existsSync(targetFile);

      if (!targetExists) {
        return;
      }
      const sttPackage = require(targetFile);
      const target = sttPackage.Target;
      const runner = emulate(target);
      return {
        ...runner.info,
        path: folderName,
        environment: evaluateEnvironment(runner),
      };
    })
    .map((v) => ({
      ...v,
      hash: createHash("sha256")
        .update(JSON.stringify(v) + timestamp.toString())
        .digest("hex"),
    }));

  let listName = "Runner List";
  const pathToPkgJS = path.join(process.cwd(), "package.json");

  if (fs.existsSync(pathToPkgJS)) {
    const pkgJSON = require(pathToPkgJS);
    if (pkgJSON.stt?.listName) {
      listName = pkgJSON.stt.listName;
    }
  }
  const list = {
    runners,
    listName,
  };
  const json = JSON.stringify(list);
  const outPath = path.join(outDir, "runners.json");
  fs.writeFileSync(outPath, json);
};
