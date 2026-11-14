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
1. 根目錄與 admin 的 Vite 8.1.5 鎖定依賴**仍需更新**：確實受 GHSA-p4f5-76q4-ffq7 影響（於網路暴露開發伺服器的條件下），需用 npm 工具更新 lockfile、跑 CI。
2. `drizzle-kit` 的間接 `esbuild@0.18.20`／棄用依賴需在上游或替代方案解決。
3. Queue→Meta API 無法保證端對端 exactly-once；Meta 已發出但本地狀態寫入失敗時仍存在重送可能，後續需鎖／lease／reconciliation。
4. 目前只有 pending 補送，DLQ、通知／告警、人工恢復 UI 尚未實作。
5. 個資刪除機制、全套儲存期限、請求及輸入全域長度限制、安全標頭、完整 CodeQL 與部署沙箱測試仍待完成。
6. 尚未取得正式 CI pass 證據、npm audit 結果，也未做 Workers 真實環境回歸測試。

## 安全公告
- https://github.com/vitejs/vite/security/advisories/GHSA-p4f5-76q4-ffq7
- https://github.com/advisories/GHSA-67mh-4wv8-2f99

這是階段性工程修補，不代表所有資安漏洞已清零，也不代表已可正式上線。
