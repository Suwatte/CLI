#!/usr/bin/env node

import { Command } from "commander";
import { build } from "./commands/build";
import { serve } from "./commands/serve";
const json = require("../package.json");

const program = new Command();

program.name("daisuke").description("Suwatte Dev Tools").version(json.version);

program
  .command("build")
  .alias("b")
  .description("Builds valid runners in project directory")
  .option(
    "--noList",
    "Skips generating the supporting files for hosting this source list."
  )
  .option("-f, --folder <folder>", "Change the output folder")
  .action(build);

program
  .command("serve")
  .alias("s")
  .description("Builds & Serves a List on the local network")
  .option("-p, --port <string>", "Port server should run on.")
  .action(serve);

program.parse(process.argv);
