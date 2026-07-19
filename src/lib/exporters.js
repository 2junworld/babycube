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
  const header = ["날짜", "끼니", "시간", "제공량(g)", "섭취량(g)", "섭취율(%)", "시판 제품", "시판 팩수", "시판 환산g"];
  const rows = [header];
  Object.keys(state.logs).sort().forEach((date) => {
    (state.logs[date] || []).forEach((log) => {
      const prov = logProvideG(log);
      const pct = prov ? Math.round((log.intakeG / prov) * 100) : 0;
      const productItems = log.items.filter((it) => it.source === "product");
      const productNames = productItems.map((it) => it.productName).join(" · ");
      const productPacks = productItems.reduce((s, it) => s + it.qty, 0);
      const productG = productItems.reduce((s, it) => s + it.qty * it.packG, 0);
      rows.push([date, log.label, log.time, prov, log.intakeG, pct, productNames, productPacks || "", productG || ""]);
    });
  });
  return rows.map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n");
}
