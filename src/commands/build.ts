import * as path from 'node:path'
import { promises as fs } from 'node:fs'

import * as fsExtra from 'fs-extra'
import emulate from '@suwatte/emulator'
import { createHash } from 'crypto'
import * as esbuild from 'esbuild'
import { evaluateEnvironment } from '../utils/evaluateEnvironment'
import { generateHTML } from '../utils/generateHTML'
import chalk from 'chalk'
import Utils from '../utils/utils'
import typescript from 'typescript'

const plugin = require('node-stdlib-browser/helpers/esbuild/plugin')
const stdLibBrowser = require('node-stdlib-browser')

const crypto = require("crypto");

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
  "crypto-js"
];

export const build = async (config: config) => {
  console.info(chalk.yellow.bold("Building..."));

  let fsUtils: Utils = new Utils(true)
  const execTime = Utils.time('Execution time', Utils.headingFormat)

  const BASE_PATH = process.cwd();

  const tempDir = path.join(BASE_PATH, TEMP_DIR);
  const outDir = path.join(BASE_PATH, config.folder ?? OUT_DIR);
  // Clear Temp Directory
  await fsUtils.deleteFolderRecursive(tempDir);
  await fs.mkdir(tempDir, { recursive: true });

  let failed = false;
  try {
    const runnerDir = path.join(tempDir, "runners");

    // Clear Out Dir & Re-add directories
    await fsUtils.deleteFolderRecursive(outDir);
    await fs.mkdir(outDir, { recursive: true });

    // Bundle with esbuild
    const bundleTime = Utils.time('Bundle time', Utils.headingFormat);
    await bundle(runnerDir);
    bundleTime.end();

    if (config.noList) {
      return;
    }
    const listTime = Utils.time('Generate List time', Utils.headingFormat);
    await generateList(runnerDir, outDir);
    listTime.end();

    // Delete Temp
    await fsUtils.deleteFolderRecursive(tempDir);

    // Copy Assets
    const assetsDirectory = path.join(BASE_PATH, "assets");
    if (fsExtra.existsSync(assetsDirectory)) {
      const dest = path.join(outDir, "assets");
      await fsExtra.copy(assetsDirectory, dest, { overwrite: true });
    }

    // HTML
    try {
      const htmlTime = Utils.time('Generate HTML time', Utils.headingFormat);
      await generateHTML(config.folder);
      htmlTime.end();
    } catch (err: any) {
      console.error(chalk.red.bold("Failed to prepare HTML"));
      console.error(chalk.red.bold(`${err.message}`));
    }
  } catch (err: any) {
    console.error(chalk.red.bold("Failed to build runners"));
    console.error(chalk.red.bold(`${err.message}`));
    failed = true;
  } finally {
    if (await fs.stat(tempDir).then(() => true, () => false)) {
      await fsUtils.deleteFolderRecursive(tempDir);
    }
  }

  execTime.end()

  if (failed) {
    process.exit(-1);
  }
};

// Bundle with browserify
const bundle = async (outDir: string) => {
  const targetFiles = await findSourceEntryPoints();

  await esbuild.build({
    entryPoints: targetFiles,
    mainFields: ['main', 'module', 'browser'],
    bundle: true,
    minify: true,
    outdir: outDir,
    external: EXCLUDED_MODULES,
    format: 'iife',
    globalName: "_STTPackage",
    footer: {
      js: 'this.STTPackage = _STTPackage; if (typeof exports === \'object\' && typeof module !== \'undefined\') {module.exports.Target = this.STTPackage.Target;}'
    },
    plugins: [plugin(stdLibBrowser)],
  })
};

const findSourceEntryPoints = async () => {
  const tsConfigPath = "./tsconfig.json";
  // Read tsconfig.json
  const configFile = typescript.readConfigFile(
      tsConfigPath,
      typescript.sys.readFile
  );

  // Parse JSON string to actual TypeScript compiler options
  const parsedCommandLine = typescript.parseJsonConfigFileContent(
      configFile.config,
      typescript.sys,
      path.dirname(tsConfigPath)
  );

  const validFiles: { in: string, out: string }[] = []

  const validFilesPromises = parsedCommandLine.fileNames.map(async fileName => {
    let content = await fs.readFile(fileName, { encoding: 'utf8' });
    if (content.includes('class Target')) {
      validFiles.push({
        in: fileName,
        out: crypto.randomUUID()
      });
    }
  })
  await Promise.all(validFilesPromises)

  return validFiles;
}

// Generates Runner List
const generateList = async (runnerDir: string, outDir: string) => {
  const timestamp = Date.now();
  const outRunnersDir = path.join(outDir, "runners");
  await fs.mkdir(outRunnersDir, { recursive: true });

  const runners = await Promise.all((await fs
      .readdir(runnerDir))
      .map(async (folderName) => {
        const targetFile = path.join(runnerDir, folderName);

        const targetExists = fs.stat(targetFile);
        if (!targetExists) {
          return;
        }

        const sttPackage = require(targetFile);
        const target = sttPackage.Target;
        const runner = emulate(target);

        const targetObject = {
          ...runner.info,
          path: runner.info.name,
          environment: evaluateEnvironment(runner),
          hash: createHash("sha256")
              .update(JSON.stringify(runner.info) + timestamp.toString())
              .digest("hex"),
        };

        await fs.copyFile(targetFile, path.join(outRunnersDir, targetObject.path + ".stt"));

        return targetObject
      }));

  let listName = "Runner List";
  const pathToPkgJS = path.join(process.cwd(), "package.json");

  if (await fs.stat(pathToPkgJS)) {
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
  await fs.writeFile(outPath, json);
};