/* 데이터 내보내기 (JSON 백업·CSV) */
import { logProvideG } from "../state/appState";

/* ----------------------------- 데이터 내보내기 ----------------------------- */
export function downloadFile(filename, content, mime) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function feedingLogsToCSV(state) {
  const header = ["날짜", "끼니", "시간", "제공량(g)", "섭취량(g)", "섭취율(%)"];
  const rows = [header];
  Object.keys(state.logs).sort().forEach((date) => {
    (state.logs[date] || []).forEach((log) => {
      const prov = logProvideG(log);
      const pct = prov ? Math.round((log.intakeG / prov) * 100) : 0;
      rows.push([date, log.label, log.time, prov, log.intakeG, pct]);
    });
  });
  return rows.map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n");
}
