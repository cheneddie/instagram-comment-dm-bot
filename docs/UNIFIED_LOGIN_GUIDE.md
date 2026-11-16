# 2026 年 Meta 新 App：Unified Login + 正式 Worker 操作指引

> 更新：2026-11-16。以 Meta Dashboard 實際可用的登入方式為準。本 Fork 只部署正式環境。
> 若你的新 App 在 Graph API Explorer 選 `graph.instagram.com` 並顯示 `Invalid platform app`，
> **先不要重新部署或刪除 D1**，這通常是新 App 使用了不適用的舊 Instagram Login 授權路徑。

## 1. 釐清新舊登入方式

| | 舊 Instagram Login | 2026 新 App Unified Login |
|---|---|---|
| Meta 後台 | API setup with Instagram login | API setup with Unified login |
| Facebook 粉絲專頁 | 不需要 | 不需要 |
| Business Portfolio | 視 App 類型 | 新 App 設定通常要求 |
| Token 類型 | Instagram User token | Business Integration System User token |
| Graph API host | graph.instagram.com | graph.facebook.com |
| 基本權限 | instagram_business_basic | instagram_basic |
| 留言權限 | instagram_business_manage_comments | instagram_manage_comments |
| 訊息權限 | instagram_business_manage_messages | instagram_manage_messages |

**不要混用**兩種模式的 Token、權限名稱、API Host 或授權 URL。
新 App 可能不再提供舊 Instagram Login；請以 Meta 後台的實際配置選單為準。

## 2. 取得正確的新 App 權杖（不使用舊 Instagram Token Generator）

1. 前往 https://developers.facebook.com/apps/，進入新建立的 Meta App。
2. 開啟 **Use cases → Manage messaging & content on Instagram → Customize**。
3. 若看到 **API setup with Unified login**，就使用這個流程。不要在 Graph API Explorer 的
   `graph.instagram.com` 嘗試「Generate Instagram Access Token」。
4. 依 Meta UI 綁定或建立 **Business Portfolio**（不代表必須建立 Facebook Page）。
5. 在 **Unified Login** 建立／選擇 Instagram API 配置，確認授權資產包含目標
   Instagram Business／Creator 專業帳號；取得並記錄 **Configuration ID**。
6. 依 UI 建立登入 URL、註冊合法的 HTTPS Redirect URL，完成該配置的登入與資產授權。
   若介面要求選擇 **System User Access Token**，依 UI 完成，確認 Token 所屬 App 與授權的 IG 資產。
7. 授權需包含 `instagram_basic`、`instagram_manage_comments`、
   `instagram_manage_messages` 等實際要使用的權限。某些資產探索方式還需要
   `business_management`；若沒有它，請使用明確的 `INSTAGRAM_ACCOUNT_ID`。
8. 請將新 Token 只儲存在 Cloudflare Secrets 或臨時隱藏輸入；勿貼到聊天、Git、
   Issue、截圖。Meta App Secret 由 **App settings → Basic** 取得，供 Webhook HMAC 驗簽使用。

**遇到 `Invalid platform app`**：
- 確認 App 是否只有 Unified Login，沒有舊 Instagram Login。
- 確認不是將 Meta App ID 當成舊 Instagram Login 專用 App ID。
- 由 Unified Login 配置產生的登入 URL 授權，不要改成舊 `instagram.com/oauth/authorize` 手工登入。
- 若仍出錯，檢查配置 ID、Redirect URI、App 綁定的 Portfolio 與該 IG 資產，不是重建 Worker。

## 3. 先進行唯讀 Token 檢查

在 Codespaces 輸入：

```bash
npm ci
npx wrangler d1 execute DB --remote \
  --command "SELECT instagram_account_id, username FROM instagram_accounts;"
```

上面查到的是**既有 D1 綁定的 IG 專業帳號 ID**，不是 System User 的 /me ID。
若新 Token 已授權同一個帳號，使用它作為 `INSTAGRAM_ACCOUNT_ID`。
若不同，先停止：現有資料庫含舊規則，不應自動換帳號。

```bash
read -rsp "新 Meta System User Token: " IG_TOKEN
echo
read -rp "Instagram Professional Account ID: " IG_ID
INSTAGRAM_ACCOUNT_ACCESS_TOKEN="$IG_TOKEN" INSTAGRAM_ACCOUNT_ID="$IG_ID" \
  META_LOGIN_MODE=unified META_BASE_URL=https://graph.facebook.com \
  META_GRAPH_API_VERSION=v27.0 npm run check-meta
unset IG_TOKEN IG_ID
```

成功標準：程式能從 `graph.facebook.com/v27.0/{IG_ID}` 取得正確 IG 專業帳號，
並讀取該帳號媒體。若返回 HTTP 190，表示 Token 無效、過期或與該 App／主機不符；
若返回 10、200 或資產錯誤，請先解決授權／權限，不要重新部署。

## 4. 設定 Cloudflare Secrets 與 Webhook

```bash
npx wrangler secret put INSTAGRAM_ACCOUNT_ACCESS_TOKEN
npx wrangler secret put INSTAGRAM_ACCOUNT_ID
npx wrangler secret put INSTAGRAM_APP_SECRET
```

- 第一個使用已驗證的 **Unified Login System User Token**。
- 第二個使用已驗證的 **Instagram Professional Account ID**。
- 第三個使用 **新 Meta App 的 App Secret**，不是舊 App 的 Secret。
- `WEBHOOK_VERIFY_TOKEN` 若新 App Webhook 使用既有值，可以保留；若不同，要兩端一致。
- `ADMIN_SESSION_SECRET` 不須重新設定，也不應刪除原管理員資料。

在 Meta 的 Instagram Webhooks 設定：
```text
Callback URL:
https://ig-comment-dm-bot.treeseed8800.workers.dev/api/webhooks/meta/instagram
```
並訂閱 `comments`；若使用限動功能，再確認 `messages` 與訊息權限。
**Callback Test 成功不代表真實留言會送達**；依實際登入模式檢查 App 層級與 IG 資產訂閱、Access Level。

## 5. 唯一正式環境部署

```bash
git status --short
# 若 wrangler.jsonc 有本機自動寫入的 DB ID，先備份：
cp wrangler.jsonc /tmp/ig-wrangler-backup.jsonc
git update-index --no-skip-worktree wrangler.jsonc
# 確認本機僅有 database_id 等 Wrangler 自動修改後，才可 git restore wrangler.jsonc
git restore wrangler.jsonc
git pull --ff-only origin security/hardening-2026-11-14
npm ci
npm ci --prefix admin
npm test
npm run lint
npm run typecheck
npm run build
npx wrangler whoami
npm run deploy
```

**請勿在已有其他重要未提交修改的工作目錄直接執行 restore。**
部署腳本會在部署前查找 `ig-comment-dm-db` 並重新綁定 Cloudflare 現有的 UUID；
不會刪掉既有 D1，也不會使用 `staging`。

部署後驗證：
```bash
npx wrangler d1 execute DB --remote --command "SELECT COUNT(*) AS media_total FROM instagram_media;"
npx wrangler tail --format pretty
```
請使用測試留言帳號及啟用的單篇規則驗證；只在 Meta 真實留言通知與 DM 都確認成功後，才開啟大範圍自動化。

## 6. 官方與實例資料

- Meta Instagram Platform Changelog：https://developers.facebook.com/docs/instagram/platform/instagram-api/changelog/
- Meta IG User 權杖／主機差異：https://developers.facebook.com/docs/instagram-platform/instagram-graph-api/reference/ig-user/
- 2026/10/29 新 App 強制 Unified Login 現場回報：https://github.com/gitroomhq/postiz-app/issues/2350
