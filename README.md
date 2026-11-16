# Instagram Comment DM Bot

**繁體中文** | [English](README.en.md)

[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

**自架的 Instagram 自動化工具：有人在你的貼文留言命中關鍵字時，自動公開回覆並私訊對方——完整跑在 Cloudflare Workers 上。**

為「單一管理者管理自己的 Instagram 專業帳號」而設計。不依賴第三方 SaaS、沒有按訊息計費：你自己的 Meta App、你自己的 Cloudflare 帳號、你自己的資料。

## 正式環境部署（2026-11）
本 Fork 目前**只維護一套正式 Cloudflare Worker**：`ig-comment-dm-bot`。
原版「Deploy to Cloudflare」按鈕會導向上游專案，無法部署本 Fork 的安全修補，
因此不提供該按鈕；請使用 Codespaces + `npm run deploy`。

**2026 年新建 Meta App**：優先確認「Manage messaging & content on Instagram → API setup with
Unified login」。此流程可不連結 Facebook Page，但一般需要 Business Portfolio；
System User Token 使用 `graph.facebook.com` 與 `instagram_manage_*` 權限。
**不要在 Graph API Explorer 的 `graph.instagram.com` 用新 Unified App 產生 Instagram Login Token**，
否則可能出現 `Invalid platform app`。見 [完整授權／部署步驟](docs/UNIFIED_LOGIN_GUIDE.md)。

> 舊有 Instagram Login（`graph.instagram.com`、`instagram_business_*`）為不同整合方式；
> 若已有可用的舊 App，可手動配置該模式，禁止混用兩種權杖和 API Host。
> 建議先取得新 Token 並完成唯讀健康檢查，再部署程式；正式 DB/Queue/Secrets 不會自動清除。

## 功能

- **每篇貼文獨立的關鍵字自動化** —— 支援 `contains_any`／`exact_any`／`all_comments` 比對模式，含文字正規化與排除條件。
- **支援排程貼文** —— Instagram API 看不到未發布的貼文，因此可事先建立「待命自動化」（貼文一上線即自動綁定，連第一則留言都不漏），或設定套用到所有新貼文的全帳號預設。
- **每位留言者一次性公開回覆＋一則私訊**，公開回覆支援多變體輪替，私訊可選配可點擊的連結按鈕。
- **限時動態自動化** —— 有人回應限動且訊息含關鍵字時自動私訊（逐則限動設定；限動 24 小時過期後自動暫停）。
- **冪等設計** —— webhook 事件與自動化執行都有去重機制，Meta 重送 webhook 不會造成重複回覆。
- **自動重試與退避**（30 秒／2 分／10 分）處理 Meta API 暫時性失敗；永久性錯誤（token 失效、權限、政策）立即停止不重試。
- **熔斷與緊急停止** —— 連續失敗自動停用該自動化；管理後台有一鍵全面停止開關。
- **管理後台**（React SPA，路徑 `/admin`）—— 登入、貼文列表與同步、自動化編輯器、執行紀錄（含每次 Meta API 呼叫的錯誤細節）。
- **內建安全性** —— webhook HMAC 簽章驗證（constant-time）、PBKDF2 密碼雜湊、HttpOnly Session Cookie、CSRF 防護、rate limiting、含機密遮蔽的結構化 log。

## 架構

```text
Instagram 留言
      │  webhook（簽章驗證）
      ▼
Cloudflare Worker (Hono) ──▶ Cloudflare Queue ──▶ Consumer：關鍵字比對
      │                                             ├─ 公開回覆（Meta API）
      ▼                                             └─ 私訊 DM（Meta API）
Cloudflare D1 (SQLite)  ◀── 執行紀錄、API 呼叫紀錄、audit logs
      ▲
Cron：每日貼文同步 · Token 到期檢查
```

技術棧：Cloudflare Workers · Hono · D1（Drizzle ORM）· Queues · Cron Triggers · React + Vite 管理後台。

## 前置需求

- **Cloudflare 帳號**（免費方案即可——Queues 免費版每日 10,000 次佇列操作、訊息保留 24 小時，個人帳號用量綽綽有餘；重度用量再升級 Workers Paid），並已完成 `npx wrangler login`。
- **Meta 開發者 App**（已加入 Instagram 產品）與一個你管理的 **Instagram 專業帳號**。
- **Node.js 24 LTS**（建置／CI 使用）。

## Quick Start

### 1. Cloudflare（Codespaces，僅正式環境）

```bash
git checkout security/hardening-2026-11-14
git pull --ff-only origin security/hardening-2026-11-14
npm ci
npm ci --prefix admin
npm test && npm run lint && npm run typecheck && npm run build

npx wrangler whoami
# 若尚未登入：npx wrangler login --device
```

**部署前先完成 [Unified Login Token 操作](docs/UNIFIED_LOGIN_GUIDE.md)**，
並以 `npm run check-meta` 唯讀驗證；禁止以舊的 System User／Instagram Login Token 混用。
部署腳本會先確認並綁定現有的 `ig-comment-dm-db` D1 UUID，保留舊資料。

```bash
npx wrangler secret put INSTAGRAM_ACCOUNT_ACCESS_TOKEN
npx wrangler secret put INSTAGRAM_ACCOUNT_ID
npx wrangler secret put INSTAGRAM_APP_SECRET
# WEBHOOK_VERIFY_TOKEN、ADMIN_SESSION_SECRET 已存在且未輪替時不必重設
npm run deploy
```

所有機密透過終端機互動輸入，**不要直接把 Token 放進命令列參數、Git 或截圖**。
`INSTAGRAM_APP_SECRET` 是目前要接收 Webhook 的 Meta App Secret；若你換了 App，
必須一併核對這個值與 Meta Dashboard 的 Webhook 設定。

### 2. Meta App / Instagram
使用 2026 年新 App 的 **Unified Login**，依照
[docs/UNIFIED_LOGIN_GUIDE.md](docs/UNIFIED_LOGIN_GUIDE.md) 建立 Config ID／授權 IG 資產／取得
System User Access Token。**Unified Login 不要求 FB 粉專，但通常要求 Business Portfolio。**

Webhook Callback URL：
`https://ig-comment-dm-bot.treeseed8800.workers.dev/api/webhooks/meta/instagram`
（若 Cloudflare 帳號或網域不同，請改用你自己的正式 Worker 網址）。
Webhook Verify Token 必須與 Cloudflare 的 `WEBHOOK_VERIFY_TOKEN` 完全相同。
至少訂閱 `comments`；限動功能另核對 `messages` 及 API 權限。

驗證 Callback URL 和測試通知成功**不代表一般帳號的真實留言事件已送達**。
需額外確認 IG 資產授權、App 存取層級、可用的帳號訂閱／事件訂閱方式。
正式評論與私訊權限是否需要 App Review，應以目前 App 的 Meta 後台顯示為準。

### 3. 建立管理者帳號

**首次部署完成後立刻**打開 `https://<你的網域>/admin`。在還沒有任何管理者帳號時，登入頁會顯示一次性的**首次啟動設定表單**：輸入初始化憑證（`ADMIN_SETUP_TOKEN`）、Email 與密碼（至少 12 字元）即建立唯一的管理者帳號並自動登入。帳號建立後這個表單就永久消失——全程不需要 terminal。

> 安全性：沒有正確的 `ADMIN_SETUP_TOKEN` 無法初始化。請使用高熵隨機值，不可重用任何密碼；完成後可用 `npx wrangler secret delete ADMIN_SETUP_TOKEN` 撤除初始化 Secret。

CLI 備援（例如不想用網頁表單時）：

```bash
# 互動式：輸入 Email 與密碼，產出 admin-insert.sql
#（密碼雜湊含 `$`，務必用 --file 套用，不要貼進 --command）
npm run create-admin
npx wrangler d1 execute DB --remote --file=admin-insert.sql && rm admin-insert.sql
```

**變更密碼**：點後台頁首的 Email → 帳號設定。本系統不提供忘記密碼重設——請妥善保管密碼（若遺失，需要重新部署、從頭設置）。

### 4. 驗證

```bash
npm run check-meta    # 唯讀健康檢查：token 有效性、帳號、貼文
```

接著開啟 `https://<你的網域>/admin` 登入，同步貼文、建立自動化，再用另一個帳號在貼文下留言關鍵字測試。

## 本機開發

```bash
cp .dev.vars.example .dev.vars    # 填入本機開發機密（已被 gitignore）
npx wrangler d1 migrations apply ig-comment-dm-db --local
npm run dev                        # wrangler dev
npm run test                       # vitest（單元＋整合測試）
npm run lint && npm run typecheck
```

注意：`wrangler dev` 不會強制所有正式 Workers 限制（例如 PBKDF2 單次 100k 迭代上限）。認證相關流程請務必在部署後的 Worker 上實測。

## 文件

- [`docs/faq.md`](docs/faq.md) —— 常見問答：費用、合規、功能邊界、疑難排解。
- [`spec.md`](spec.md) —— 完整技術規格：資料模型、API、比對規則、重試與熔斷語意。
- [`CLAUDE.md`](CLAUDE.md) —— 給 AI coding agent 的初始化步驟與專案規則（Claude Code 會自動讀取）。

## 安全性說明

所有機密只存在 Cloudflare Secrets（正式環境）或 `.dev.vars`（本機，已被 gitignore）——永不寫入被 git 追蹤的檔案。`wrangler.jsonc` 只以預設值提交進版控；首次部署時 wrangler 會把自動建立的 `database_id` 寫回檔內。若你會貢獻程式碼回來，請先執行 `git update-index --skip-worktree wrangler.jsonc`，確保寫回的個人資源 ID 永不進 commit。

## License

[MIT](LICENSE)


## 安全性強化（Fork 維護）

- Web 初始管理員設定需要 Cloudflare Secret `ADMIN_SETUP_TOKEN`（至少 32 字元高熵隨機值），完成後可移除。
- 改密碼會撤銷所有舊 Session Cookie，使用者需重新登入。
- 即使 D1 系統設定未建立，公開回覆預設每分鐘 20 則／每日 300 則，DM 每分鐘 10 則／每日 100 則（可透過資料庫系統設定調整）。
- Webhook 請求本文最多 1 MiB，Queue 發送失敗的事件會保留待重送，Cron 每 5 分鐘補送；極端情況仍可能因外部 API 的「成功但回應遺失」而重送，不能宣稱 exactly-once。
- 部署指令的 `--env` 僅接受 `staging`，避免將不可信字串拼入 Shell。
- 參見 `docs/SECURITY_HARDENING_REPORT.md`，部署前仍需 npm audit、CI、正式環境驗證；未驗證前不要接正式 IG 帳號。

### Queue 失敗隔離

部署腳本會建立 `ig-comment-events-dlq`（staging 為 `ig-comment-events-staging-dlq`）。Queue Consumer 超過 3 次失敗會送到 DLQ，請於 Cloudflare 儀表板監控／手動檢查，**不要直接大量重播未核對發送狀態的事件**，避免重複公開回覆／DM。

## 2026/11 部署差異
- `wrangler.jsonc` 已移除 `env.staging`，`npm run deploy -- --env staging` 將被拒絕。
- 新 Unified Login 預設 `META_LOGIN_MODE=unified`、`META_BASE_URL=https://graph.facebook.com`、`META_GRAPH_API_VERSION=v27.0`。
- `INSTAGRAM_ACCOUNT_ID` 指向獲授權的 IG 專業帳號，不能使用 System User 的 `/me` ID。
- Cloudflare 原有 Staging Worker 若仍存在，刪除設定檔不會主動刪除它，也不會刪除任何 D1 或 Queue。
