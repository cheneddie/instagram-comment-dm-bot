# Instagram Comment DM Bot (Fork)

[繁體中文部署說明](README.md) | English

This maintained fork targets **one production Cloudflare Worker** (`ig-comment-dm-bot`) and does **not**
offer the upstream repository's one-click deployment button.

For a **new Meta app (late 2026)**, use the **Instagram API with Unified Login** where available.
Unlike the legacy Instagram Login, Unified Login uses a System User Access Token,
`graph.facebook.com`, and `instagram_manage_*` permissions. A Facebook Page is not required
for Unified Login, but a Business Portfolio is generally required by its app setup.
Do not use the old Instagram token generator in Graph API Explorer for a new Unified app.

**Important:** Meta App configuration and granting access to your Instagram professional account
must be completed in Meta Developer Dashboard. A successful webhook test is NOT proof
that real comments will be delivered.

Follow the maintained [Chinese setup and troubleshooting guide](docs/UNIFIED_LOGIN_GUIDE.md)
and [production-only deployment steps](README.md#quick-start).

Production deployment:
```bash
git checkout security/hardening-2026-11-14
git pull --ff-only origin security/hardening-2026-11-14
npm ci && npm ci --prefix admin
npm test && npm run lint && npm run typecheck && npm run build
# Set the correct Meta secrets interactively with npx wrangler secret put ...
npm run deploy
```

No staging deployments are supported. The script binds an existing production D1
database before deployment to avoid accidental data loss. Do not paste Meta tokens,
app secrets, or admin passwords into GitHub.

License: [MIT](LICENSE).
