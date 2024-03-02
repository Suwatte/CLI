import * as fs from "fs";
import { render } from "mustache";
import path from "path";

// Function to generate HTML from template and JSON data
export const generateHTML = async (folder?: string | undefined) => {
  // Set up directories and file paths
  const BASE_PATH = process.cwd();
  const OUT_DIR = path.join(BASE_PATH, folder ?? "stt");
  const listInfo = path.join(OUT_DIR, "runners.json");
  const indexHtml = path.join(OUT_DIR, "index.html");
  const TEMPLATE_DIRECTORY = path.join(path.dirname(__dirname), "/templates");
  const templatePath = path.join(TEMPLATE_DIRECTORY, "template.html");
  const cssPath = path.join(TEMPLATE_DIRECTORY, "main.css");

  // Load the JSON data and template
  const data: any = JSON.parse(fs.readFileSync(listInfo, "utf8"));
  const template = fs.readFileSync(templatePath, "utf8");

  // Filter runners based on environment type
  const info = {
    listName: data.listName,

    trackers: data.runners.filter(
      (runner: any) => runner.environment === "tracker"
    ),
    sources: data.runners.filter(
      (runner: any) => runner.environment === "source"
    ),
  };

  // Render the template with the filtered data
  const output: string = render(template, info);

  // Write the output HTML and copy the CSS to the output directory
  fs.writeFileSync(indexHtml, output);
  fs.copyFileSync(cssPath, path.join(OUT_DIR, "main.css"));
};
