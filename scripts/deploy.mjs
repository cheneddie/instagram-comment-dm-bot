#!/usr/bin/env node
// 正式環境唯一部署入口：npm run deploy。
// 不支援 --env staging，避免誤寫第二套 Worker/D1/Queue。
// 只做非破壞性部署與 migrations；不刪資料表、事件、Secrets。
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';

if (process.argv.length !== 2) {
  throw new Error('只支援正式環境：請使用 npm run deploy，不接受 --env 或其他參數。');
}

const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx';

function run(executable, args) {
  console.log('\n$ ' + [executable, ...args].join(' '));
  execFileSync(executable, args, { stdio: 'inherit', shell: false });
}

// 提交到 GitHub 的 wrangler.jsonc 不包含個人 D1 UUID。
// 重新拉取程式碼後，優先連回已存在的正式 DB，避免意外建立第二個資料庫。
function bindExistingProductionDb() {
  const configPath = 'wrangler.jsonc';
  const cfg = readFileSync(configPath, 'utf8');
  const nameLine = '"database_name": "ig-comment-dm-db"';
  const nameIdx = cfg.indexOf(nameLine);
  if (nameIdx === -1) throw new Error('缺少正式 D1 設定 ig-comment-dm-db');
  const ids = JSON.parse(execFileSync(npx, ['wrangler', 'd1', 'list', '--json'], {
    stdio: 'pipe', shell: false,
  }).toString());
  const existing = ids.find((x) => x.name === 'ig-comment-dm-db');
  if (!existing) {
    console.log('查無既有正式 D1；首次部署將交由 Wrangler 建立。');
    return;
  }
  const region = cfg.slice(nameIdx, nameIdx + 180);
  const configured = region.match(/"database_id"\s*:\s*"([^"]+)"/);
  if (configured) {
    if (configured[1] !== existing.uuid) {
      throw new Error('現有 wrangler.jsonc 的 DB ID 與 Cloudflare 正式資料庫不符，已中止部署。');
    }
    return;
  }
  const lineStart = cfg.lastIndexOf('\n', nameIdx) + 1;
  const indent = cfg.slice(lineStart, nameIdx);
  const insertAt = cfg.indexOf('\n', nameIdx);
  writeFileSync(configPath,
    cfg.slice(0, insertAt) + `\n${indent}"database_id": "${existing.uuid}",` + cfg.slice(insertAt));
  console.log('已連回既有正式 D1（不建立新資料庫、不清除資料）。');
}

bindExistingProductionDb();

for (const queueName of ['ig-comment-events', 'ig-comment-events-dlq']) {
  try {
    execFileSync(npx, ['wrangler', 'queues', 'create', queueName], { stdio: 'pipe', shell: false });
    console.log(`已建立 Queue：${queueName}`);
  } catch {
    console.log(`Queue ${queueName} 可能已存在；部署時會再驗證綁定。`);
  }
}

run(npm, ['ci', '--prefix', 'admin']);
run(npm, ['run', 'build', '--prefix', 'admin']);
run(npx, ['wrangler', 'deploy']);
// 首次部署由 Wrangler 自動建立 D1，必須在套用 migrations 前回填 UUID。
bindExistingProductionDb();
run(npx, ['wrangler', 'd1', 'migrations', 'apply', 'DB', '--remote']);
console.log('\n正式環境部署完成。請先驗證 /api/health、/admin 及 Meta Token，勿直接開啟大量回覆。');
