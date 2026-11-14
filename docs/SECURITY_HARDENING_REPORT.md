# 安全強化實作報告（2026-11-14）

## 基準
上游 Fork `main` HEAD：`4a05ab7afcfa98105c778d38d6526d339e56892b`。
工作分支：`security/hardening-2026-11-14`。僅檢查公開程式碼，未接觸正式 Cloudflare/Meta 帳號。

## 已實作（需 CI 檢查）
- 初次建立管理員：加入高強度 ADMIN_SETUP_TOKEN，未設定 fail-closed；網頁輸入初始化碼，建帳後不可再次 setup。
- Session 綁定目前密碼雜湊的簽署版次，改密碼立即撤銷全部舊 Session。
- Webhook 串流讀取限制 1 MiB；D1→Queue 使用事件持久狀態與派工 claim；Queue 失敗可重送，Cron 每 5 分鐘修復 pending。
- 全域發送上限改成有安全預設值，避免 null 設定被當無上限。
- 部署腳本移除 Shell 字串拼接，--env 白名單僅 staging。
- CI Node 改用 24，另加 npm audit 與 Dependabot；保留測試。
- 重要改動附對應安全回歸測試。

## 未完成／殘餘風險
1. 根目錄與 admin 的 Vite 已在安全分支提升至 8.3.8，Hono 4.13.18，並重新產生 lockfile；須以最新 CI 成果再次驗證。
2. `drizzle-kit` 的間接 `esbuild@0.18.20`／棄用依賴需在上游或替代方案解決。
3. Queue→Meta API 無法保證端對端 exactly-once；Meta 已發出但本地狀態寫入失敗時仍存在重送可能，後續需鎖／lease／reconciliation。
4. 目前只有 pending 補送，DLQ、通知／告警、人工恢復 UI 尚未實作。
5. 已新增超過 90 天的 Automation Run 個資遮蔽及超過 180 天的稽核 IP 遮蔽；仍缺完整指定個人資料刪除、自動化事件識別碼保存期限、全面輸入長度限制、安全標頭與部署沙箱測試。
6. 加入 CodeQL 靜態分析與官方 Actions SHA pin，需確認 GitHub Code Scanning 權限及 CI 結果。
7. 2026-11-14 GitHub Actions 在舊鎖定檔下完整 234 項測試及建置已通過；重新鎖定依賴後 CI 持續驗證。npm audit 新鎖定檔：root 11 moderate / 0 high，admin 0，production 0。尚未做 Workers 真實環境測試。

## 安全公告
- https://github.com/vitejs/vite/security/advisories/GHSA-p4f5-76q4-ffq7
- https://github.com/advisories/GHSA-67mh-4wv8-2f99

這是階段性工程修補，不代表所有資安漏洞已清零，也不代表已可正式上線。
