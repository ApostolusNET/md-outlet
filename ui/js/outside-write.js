/**
 * Retry API writes that require explicit confirm for paths outside the package.
 */
import { apiFetch, t } from "./i18n.js";

/**
 * @param {string} url
 * @param {Record<string, unknown>} body
 * @returns {Promise<{ ok: boolean, cancelled: boolean, res: Response, data: any }>}
 */
export async function postJsonWithOutsideConfirm(url, body) {
  const send = (confirmOutside) =>
    apiFetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...body, confirmOutside }),
    });

  let res = await send(false);
  let data = await res.json().catch(() => ({}));
  if (res.status === 409 && data && data.code === "OUTSIDE_PACKAGE") {
    const path = data.path || "";
    if (
      !confirm(t("toast.outsidePackageConfirm", { path }))
    ) {
      return { ok: false, cancelled: true, res, data };
    }
    res = await send(true);
    data = await res.json().catch(() => ({}));
  }
  return { ok: res.ok, cancelled: false, res, data };
}
