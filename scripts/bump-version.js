#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Read package.json
const packageJsonPath = path.join(__dirname, '..', 'package.json');
const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));

// Parse current version
const [major, minor, patch] = packageJson.version.split('.').map(Number);

// Increment patch version
const newVersion = `${major}.${minor}.${patch + 1}`;

// Update package.json
packageJson.version = newVersion;
fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2) + '\n');

console.log(`✅ Updated package.json: ${packageJson.version} → ${newVersion}`);

// Update service worker
const swPath = path.join(__dirname, '..', 'public', 'sw.js');
let swContent = fs.readFileSync(swPath, 'utf8');

// Replace cache name with new version
swContent = swContent.replace(
  /const CACHE_NAME = 'crystal-fin-buddy-v\d+';/,
  `const CACHE_NAME = 'crystal-fin-buddy-v${newVersion.replace(/\./g, '')}';`
);

fs.writeFileSync(swPath, swContent);

console.log(`✅ Updated sw.js cache version to v${newVersion.replace(/\./g, '')}`);
console.log(`\n🎉 New version: ${newVersion}`);

