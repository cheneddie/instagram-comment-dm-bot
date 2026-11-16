# Claude Code 指令

本專案為 Instagram Comment DM Bot：留言命中關鍵字即自動公開回覆並發送私訊，
跑在 Cloudflare Workers（Hono + D1/Drizzle + Queues + Cron），管理後台為 React SPA
（`admin/`，由 ASSETS binding 供應）。完整技術規格見 `spec.md`，安裝與部署見 `README.md`。

## Clone 後初始化（新環境必做）

1. 安裝依賴：`npm ci` 與 `npm ci --prefix admin`。
2. 正式環境統一部署，已移除 staging：不需手動建立或命名任何 Cloudflare 資源：`npm run deploy`（`scripts/deploy.mjs`）會自動建立缺少的 Queue 與 D1——wrangler 自動開通會在首次部署時建立資料庫並把 `database_id` 寫回 `wrangler.jsonc`。若會對本 repo 提交程式碼，先執行 `git update-index --skip-worktree wrangler.jsonc`，避免寫回的個人資源 ID 被提交。
3. `cp .dev.vars.example .dev.vars`，填入本機開發用機密（同樣不進版控）。
4. 正式環境機密逐一 `wrangler secret put <NAME>`：`INSTAGRAM_APP_SECRET`、`WEBHOOK_VERIFY_TOKEN`、`INSTAGRAM_ACCOUNT_ACCESS_TOKEN`、`INSTAGRAM_ACCOUNT_ID`、`ADMIN_SESSION_SECRET`、`ADMIN_SETUP_TOKEN`（首次初始化用）。2026 年新 App 的 Unified Login 以 graph.facebook.com、v27、instagram_manage_* 權限運作；先完成 docs/UNIFIED_LOGIN_GUIDE.md 的 Token 健康檢查才部署。設定後約 30 秒才生效，勿立即以舊回應誤判。
5. 套用資料庫 migrations：`wrangler d1 migrations apply ig-comment-dm-db --local`（本機）；正式環境改用 `npm run deploy`（一次完成 admin 建置、`--remote` migrations 與部署）。
6. 建立管理者帳號：部署後開 `/admin`——資料庫沒有任何管理者時，登入頁顯示一次性的首次啟動設定表單（`POST /api/admin/auth/setup`，僅在 `admin_users` 為空時允許）。CLI 備援：`npm run create-admin`（產出 `admin-insert.sql`）→ `npx wrangler d1 execute DB --local --file=admin-insert.sql`（正式改 `--remote`）→ 套用後刪檔。務必用 `--file`、不要貼進 `--command`（密碼雜湊含 `$`，會被 shell 展開打爛）。
7. 驗證環境：`npm run check-meta`（Meta token 健康檢查）→ `npm run test` → `npm run dev`。

## 機密與設定規則

- 機密一律走 `.dev.vars`（本機）或 `wrangler secret put`（正式），永不寫入任何被 git 追蹤的檔案、不傳到前端、不寫進 log。
- `wrangler.jsonc` 在版控中只允許 placeholder 值——本機真實部署值以 `git update-index --skip-worktree wrangler.jsonc` 保護（意味著 git 不會回報此檔的變更；要提交結構性修改前，先 `git update-index --no-skip-worktree wrangler.jsonc`，確認 diff 只含 placeholder 後再提交，完成後重新設回 skip-worktree）。

## 開發注意事項

- Workers 正式 runtime 的限制在 `wrangler dev` 測不出來（例：PBKDF2 單次迭代上限 100,000、禁止執行期 WASM 編譯、全域 fetch 需綁定 this）。認證與加密相關變更務必部署後實測。
- 提供驗證證據：指令、輸出結果、UI 螢幕截圖，以及已知殘留風險。
- 審查重點：功能性錯誤、安全與隱私風險、auth／權限／密鑰／網路邊界、資料驗證與錯誤處理、缺失的測試。

## 2026/11 認證模式與環境政策
- 僅正式環境；`npm run deploy` 不接受 --env staging，不得清除既有 D1/Queue/Secrets。
- 預設新 App Unified Login，Token 的 `/me` 是 System User，不能作為 IG 帳號 ID；需要指定 `INSTAGRAM_ACCOUNT_ID`（或使用 `/me/assigned_instagram_accounts` 唯讀查詢）。
- `src/meta/config.ts` 強制 loginMode 與 API Host 一致；Webhook / Queue 略過事件會留下不含個資的原因。
- 若新 App 顯示 `Invalid platform app`，先檢查 Meta App 是否強制 Unified Login，**不要將 Graph API Explorer 舊的 Instagram Login Token 視為新 App 的正確憑證**。
