# AI 開發代理｜Instagram Comment DM Bot 資安強化工作指令（2026-11-14）

目標 Repository：https://github.com/cheneddie/instagram-comment-dm-bot

**重要：從目前最新分支 HEAD/lockfile 核對事實，不要直接信任舊審查的漏洞版本。未通過 CI 的修改不能宣稱完成。**

## 安全工作準則
1. 在獨立 `security/*` 分支開發；不得直接 merge main。不得讀取或曝光 Cloudflare/Meta 真實 Secret，不發真實訊息。
2. 每一個發現記錄：檔案、行號、觸發條件、風險、測試、修補方案、CI 證據、殘餘風險。
3. 保留 React、Vite、Hono、Drizzle、Workers、D1、Queues 架構與 Meta 官方 Graph API；修復不可任意刪除功能。
4. 不可跳過或修改測試為「永遠 PASS」，不准用無內容的 stub 偽裝完成。

## Phase A｜依賴與 CI（P1）
- 全面核對 root/admin 兩份 lockfile 與 npm audit、GitHub Advisories、OSV。
- 優先修補已公告 Vite `GHSA-p4f5-76q4-ffq7`；2026-11-10 官方指出 8.1.5 有條件受影響，8.1.7 以上已修補。更新兩份 lockfile 後驗證 `npm ci`。
- 處理間接 `esbuild@0.18.20`（`drizzle-kit`→`@esbuild-kit`）的已知公告，必要時追蹤上游或替代依賴。
- 將 Node 和 Actions 升級為受支持版本，使用 SHA 鎖定 Actions、最小 permissions；加入 Dependabot、CodeQL 或等效掃描、SBOM。
- 確認 `npm run lint`、`npm run typecheck`、`npm test`、`npm run build`。

## Phase B｜身份與 Session（P0）
- 初始管理員必須使用 Cloudflare Secret `ADMIN_SETUP_TOKEN`，>=32 高熵字元、預設拒絕、固定時間比較、驗完再昂貴 hash，保留原子建帳。
- 舊 Session 撤銷：變更密碼後現有 Cookie 全部失效，前端需提示重新登入。
- 修補缺失的 auth、CSRF、rate limiting、XSS；密碼與 Token 不得寫 log。

## Phase C｜Webhook／Queue（P1）
- 原始 HMAC-SHA256 驗簽、大小限制、事件唯一鍵與原子派工 claim。
- D1 成功但 Queue 失敗可持久補送，提供定期回收、重試、事件追蹤。
- 針對 Worker 崩潰、送後寫 DB 失敗、Queue 重複消費、Meta API 成功但回應遺失設計可恢復狀態。
- 導入 Dead Letter Queue／監控告警；切勿誤宣稱跨 Meta API exactly-once，清楚揭露殘餘限制。

## Phase D｜防濫發與隱私（P1／P2）
- 預設非空的全域每分鐘／每日公開回覆與 DM 上限、原子計數、緊急停止、熔斷機制。
- 全面檢查 SQL/URL/路由授權/部署命令注入與 Unicode/JSON 長度上限。
- 為 Webhook payload、原始留言、IG ID、Automation Runs、API Attempt 建立保留期限與刪除流程。
- 重要個資與 Token 禁止寫日誌；避免把 access token 放在可被代理記錄的 GET URL。

## 交付與驗收
- Draft PR、`docs/SECURITY_HARDENING_REPORT.md`、`docs/SECURITY_TEST_MATRIX.md`。
- 每個項目逐項標註 PASS／FAIL／NOT TESTED，寫明實際測試指令、GitHub Actions log 與殘餘風險。
- 先執行驗證再決定是否可合併；一律不自動合併 main。
