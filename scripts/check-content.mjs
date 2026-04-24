#!/usr/bin/env node

import { readFileSync } from "node:fs";

const checks = [
  {
    path: "public/index.html",
    label: "Canonical/OG/JSON-LD still use pages.dev",
    pattern: /https:\/\/worksmart\.pages\.dev/gi,
    guidance: "Replace with your real production domain in meta tags and JSON-LD.",
  },
  {
    path: "public/index.html",
    label: "Placeholder contact email still present",
    pattern: /hello@worksmart\.example/gi,
    guidance: "Replace with your production contact email.",
  },
  {
    path: "public/index.html",
    label: "Placeholder office address still present",
    pattern: /100 Market Street, Suite 400/gi,
    guidance: "Replace with your real office or service location.",
  },
  {
    path: "public/robots.txt",
    label: "Sitemap still points to pages.dev",
    pattern: /https:\/\/worksmart\.pages\.dev\/sitemap\.xml/gi,
    guidance: "Update sitemap URL to your production domain.",
  },
  {
    path: "public/sitemap.xml",
    label: "Sitemap location still points to pages.dev",
    pattern: /https:\/\/worksmart\.pages\.dev\//gi,
    guidance: "Update <loc> to your production domain root.",
  },
];

let issues = 0;

for (const check of checks) {
  const contents = readFileSync(check.path, "utf8");
  const matches = [...contents.matchAll(check.pattern)];
  if (matches.length > 0) {
    issues += matches.length;
    console.log(`\n[FLAG] ${check.label}`);
    console.log(`File: ${check.path}`);
    console.log(`Count: ${matches.length}`);
    console.log(`Action: ${check.guidance}`);
  }
}

if (issues > 0) {
  console.log(`\nContent audit found ${issues} placeholder hit(s).`);
  process.exit(1);
}

console.log("Content audit passed: no tracked placeholders found.");
