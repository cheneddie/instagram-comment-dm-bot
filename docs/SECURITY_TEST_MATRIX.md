# 安全測試矩陣（2026-11-14）

> 以下 PASS 指自動化測試或 workflow 成功，不代表正式 Workers／Meta API 已驗證；本文件更新屬純文件修改。

| 情境 | 證據 | 狀態 |
|---|---|---|
| 未設 ADMIN_SETUP_TOKEN 阻止建帳 | tests/integration/auth.test.ts；CI | PASS |
| 錯誤初始化碼禁止搶註 | tests/integration/auth.test.ts；CI | PASS |
| 密碼變更後舊 Session 失效 | tests/integration/auth.test.ts；CI | PASS |
| 全域 DM 預設每分鐘上限 | tests/unit/send-gate.test.ts；CI | PASS |
| Webhook 超大請求 413 | tests/integration/webhook-receive.test.ts；CI | PASS |
| Queue 首次失敗、Meta 重送補送 | tests/integration/webhook-receive.test.ts；CI | PASS |
| Outbox 定期補送／過期 claim 恢復／Queue 失敗 | tests/integration/webhook-recovery.test.ts；CI | PASS |
| 個資超期遮蔽（90 天）和舊稽核 IP 遮蔽（180 天） | tests/unit/cleanup.test.ts；CI | PASS |
| Lint、Typecheck、Unit、Integration、Build | [CI 43608474781](https://github.com/cheneddie/instagram-comment-dm-bot/actions/runs/43608474781)；240/240 tests | PASS |
| root/admin npm audit：High 以上 | [Security checks 43608474764](https://github.com/cheneddie/instagram-comment-dm-bot/actions/runs/43608474764) | PASS |
| npm audit（root 全部嚴重度） | 11 moderate 警示仍存在 | FAIL（未清零） |
| npm audit（admin 全部嚴重度） | Security checks；0 vulnerabilities | PASS |
| npm audit（production ≥moderate） | Security checks；0 vulnerabilities | PASS |
| CodeQL 工作流程執行 | [CodeQL 43608474800](https://github.com/cheneddie/instagram-comment-dm-bot/actions/runs/43608474800) | PASS（alerts 未核實） |
| DLQ／Cron 配置通過乾跑建置 | CI Build；實際 Queue 未建立 | PASS（靜態），NOT TESTED（部署） |
| 部署 --env 邊界的自動化安全測試 | 尚無直接單元測試 | NOT TESTED |
| Cloudflare Staging 真實部署 | 未接觸使用者資源 | NOT TESTED |
| Instagram 留言／DM／限時動態串接 | 未接觸正式 Meta 帳號 | NOT TESTED |
| 同步的 Meta 發送並發／中斷重入 | 尚未完成端到端冪等鎖 | NOT TESTED |
| GitHub main 分支保護 | 需由 Repo 管理者在 Settings 設定 | NOT TESTED |
