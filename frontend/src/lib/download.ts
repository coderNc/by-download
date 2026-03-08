import { API_BASE_URL } from "@/lib/constants";

export function getTaskDownloadUrl(taskId: string) {
  return `${API_BASE_URL}/tasks/${taskId}/file`;
}

export function triggerBrowserDownload(taskId: string) {
  if (typeof document === "undefined") {
    return;
  }

  const link = document.createElement("a");
  link.href = getTaskDownloadUrl(taskId);
  link.rel = "noopener noreferrer";
  link.style.display = "none";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}
