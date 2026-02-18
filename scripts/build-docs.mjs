import { promises as fs } from "node:fs";
import path from "node:path";
import { marked } from "marked";

const rootDir = process.cwd();
const siteDir = path.join(rootDir, "site");
const rulesDir = path.join(rootDir, "docs", "rules");

function htmlShell(title, nav, body) {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${title}</title>
  <style>
    :root { color-scheme: light; }
    body { margin: 0; font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif; line-height: 1.6; color: #111827; background: #f8fafc; }
    .layout { max-width: 980px; margin: 0 auto; padding: 32px 20px; }
    header { margin-bottom: 20px; }
    nav { display: flex; gap: 12px; flex-wrap: wrap; margin-bottom: 18px; }
    nav a { color: #1d4ed8; text-decoration: none; font-weight: 600; }
    nav a:hover { text-decoration: underline; }
    article { background: #ffffff; border: 1px solid #e5e7eb; border-radius: 10px; padding: 22px; box-shadow: 0 1px 2px rgba(0,0,0,0.04); }
    h1, h2, h3 { line-height: 1.25; }
    pre { background: #0f172a; color: #e2e8f0; overflow-x: auto; padding: 12px; border-radius: 8px; }
    code { font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, Liberation Mono, monospace; }
    table { border-collapse: collapse; }
    th, td { border: 1px solid #d1d5db; padding: 6px 10px; }
  </style>
</head>
<body>
  <div class="layout">
    <header>
      <nav>${nav}</nav>
    </header>
    <article>
      ${body}
    </article>
  </div>
</body>
</html>`;
}

async function ensureCleanDir(dirPath) {
  await fs.rm(dirPath, { recursive: true, force: true });
  await fs.mkdir(dirPath, { recursive: true });
}

async function readUtf8(filePath) {
  return fs.readFile(filePath, "utf8");
}

async function main() {
  await ensureCleanDir(siteDir);
  await fs.mkdir(path.join(siteDir, "rules"), { recursive: true });

  const readmeMarkdown = await readUtf8(path.join(rootDir, "README.md"));
  const ruleFiles = (await fs.readdir(rulesDir)).filter((name) => name.endsWith(".md")).sort();

  const ruleLinks = ruleFiles
    .map((fileName) => {
      const base = fileName.replace(/\.md$/i, "");
      return `<li><a href="./rules/${base}.html">${base}</a></li>`;
    })
    .join("\n");

  const readmeHtml = marked.parse(readmeMarkdown);
  const indexBody = `${readmeHtml}\n<h2>Rules</h2>\n<ul>${ruleLinks}</ul>`;
  const nav = `<a href="./index.html">Home</a>`;

  await fs.writeFile(path.join(siteDir, "index.html"), htmlShell("markdownlint-shell", nav, indexBody), "utf8");

  for (const ruleFile of ruleFiles) {
    const rulePath = path.join(rulesDir, ruleFile);
    const ruleMarkdown = await readUtf8(rulePath);
    const ruleHtml = marked.parse(ruleMarkdown);
    const base = ruleFile.replace(/\.md$/i, "");

    const ruleNav = `<a href="../index.html">Home</a> <a href="./${base}.html">${base}</a>`;
    const rendered = htmlShell(`${base} | markdownlint-shell`, ruleNav, ruleHtml);

    await fs.writeFile(path.join(siteDir, "rules", `${base}.html`), rendered, "utf8");
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
