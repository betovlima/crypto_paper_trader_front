import { requestJson } from "./client";

export function getPublicConfiguration() {
  return requestJson("/api/v1/config");
}

export function resetApplication(adminKey) {
  return requestJson("/api/v1/admin/reset", {
    method: "POST",
    headers: { "X-Admin-Key": adminKey },
  });
}
