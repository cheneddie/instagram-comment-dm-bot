# 安全測試矩陣（未實際執行者一律 NOT TESTED）

| 情境 | 測試位置／指令 | 狀態 |
|---|---|---|
| 未設 ADMIN_SETUP_TOKEN 阻止建帳 | tests/integration/auth.test.ts | NOT TESTED |
| 錯誤初始化碼禁止搶註 | tests/integration/auth.test.ts | NOT TESTED |
| 密碼變更後舊 Session 失效 | tests/integration/auth.test.ts | NOT TESTED |
| 全域 DM 預設每分鐘上限 | tests/unit/send-gate.test.ts | NOT TESTED |
| Webhook 超大請求 413 | tests/integration/webhook-receive.test.ts | NOT TESTED |
| Queue 首次失敗、Meta 重送補送 | tests/integration/webhook-receive.test.ts | NOT TESTED |
| 定期 Outbox 補送／並發 claim | 待加整合測試 | NOT TESTED |
| 部署 --env 非法字串防注入 | 待加單元測試 | NOT TESTED |
| Lint／Typecheck／Unit／Integration／Build | GitHub CI | NOT TESTED |
| root/admin npm audit | GitHub Security checks | NOT TESTED |
| Cloudflare 真實部署與 Meta DM | 手動 staging 驗證 | NOT TESTED |
