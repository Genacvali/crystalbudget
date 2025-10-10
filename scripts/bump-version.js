#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

try {
  // Read package.json
  const packageJsonPath = path.join(__dirname, '..', 'package.json');
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
  
  const oldVersion = packageJson.version;
  
  // Parse current version
  const [major, minor, patch] = oldVersion.split('.').map(Number);
  
  // Increment patch version
  const newVersion = `${major}.${minor}.${patch + 1}`;
  
  // Update package.json
  packageJson.version = newVersion;
  fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2) + '\n');
  
  console.log(`✅ Updated package.json: ${oldVersion} → ${newVersion}`);
  
  // Update service worker
  const swPath = path.join(__dirname, '..', 'public', 'sw.js');
  let swContent = fs.readFileSync(swPath, 'utf8');
  
  // Replace cache name with new version
  const newCacheName = `crystal-fin-buddy-v${newVersion.replace(/\./g, '')}`;
  swContent = swContent.replace(
    /const CACHE_NAME = 'crystal-fin-buddy-v\d+';/,
    `const CACHE_NAME = '${newCacheName}';`
  );
  
  fs.writeFileSync(swPath, swContent);
  
  console.log(`✅ Updated sw.js cache version to ${newCacheName}`);
  console.log(`\n🎉 New version: ${newVersion}`);
  
  process.exit(0);
} catch (error) {
  console.error('❌ Error updating version:', error.message);
  process.exit(1);
}

