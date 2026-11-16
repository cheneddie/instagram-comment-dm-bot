// Meta API 登入模式與 API Host 必須成對；禁止把 System User 權杖送到 Instagram Login 主機。
// 2026 年新建立 Meta App 多採 Unified Login；舊 App 才可能仍採 Instagram Login。
export function resolveMetaBaseUrl(mode: string | undefined, configured?: string): string {
  const selected = mode ?? 'instagram';
  if (selected !== 'instagram' && selected !== 'unified') {
    throw new Error('META_LOGIN_MODE 只接受 instagram 或 unified');
  }
  const expected = selected === 'unified'
    ? 'https://graph.facebook.com'
    : 'https://graph.instagram.com';
  if (configured && configured !== expected) {
    throw new Error(`META_BASE_URL 與 META_LOGIN_MODE=${selected} 不一致，拒絕向錯誤 API Host 發送權杖`);
  }
  return expected;
}
