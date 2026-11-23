export async function request(method, path, body) {
  const options = { method };
  if (body !== undefined) {
    options.headers = { "Content-Type": "application/json" };
    options.body = JSON.stringify(body);
  }

  try {
    const response = await fetch(path, options);
    const text = await response.text();
    let data = null;
    if (text) {
      try {
        data = JSON.parse(text);
      } catch {
        data = text;
      }
    }
    return { ok: response.ok, status: response.status, data };
  } catch {
    return { ok: false, networkError: true };
  }
}

export function responseError(result) {
  if (result.networkError) return "无法连接服务";
  const message = result.data?.message || `服务返回 HTTP ${result.status}`;
  const details = result.data?.details;
  return typeof details === "string" && details.trim() ? `${message}（${details.trim()}）` : message;
}
