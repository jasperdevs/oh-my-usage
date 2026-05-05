import { BoxRenderable, createCliRenderer, TextRenderable } from "@opentui/core";
import type { UsageReport } from "../types";
import { renderSummary } from "../commands/render";

export async function runDashboard(report: UsageReport): Promise<void> {
  const renderer = await createCliRenderer({
    exitOnCtrlC: true,
    clearOnShutdown: true,
    targetFps: 30,
    backgroundColor: "#07090d",
  });

  const root = new BoxRenderable(renderer, {
    id: "root",
    flexDirection: "column",
    width: "100%",
    height: "100%",
    backgroundColor: "#07090d",
    padding: 1,
    gap: 1,
  });

  const header = new BoxRenderable(renderer, {
    id: "header",
    height: 5,
    width: "100%",
    border: true,
    borderColor: "#10a7ff",
    backgroundColor: "#0b0f16",
    padding: 1,
    title: " oh-my-usage ",
  });

  header.add(
    new TextRenderable(renderer, {
      id: "header-text",
      content: `Subscription usage, local tokens, and cost estimates\n${report.records.length} records scanned · q quits · r refreshes`,
      fg: "#f8fafc",
      width: "100%",
      height: 2,
    }),
  );

  const body = new BoxRenderable(renderer, {
    id: "body",
    flexGrow: 1,
    width: "100%",
    border: true,
    borderColor: "#293241",
    backgroundColor: "#090d13",
    padding: 1,
  });

  const bodyText = new TextRenderable(renderer, {
    id: "body-text",
    content: renderSummary(report),
    fg: "#e5e7eb",
    width: "100%",
    height: "100%",
  });

  body.add(bodyText);
  root.add(header);
  root.add(body);
  renderer.root.add(root);
  renderer.start();

  renderer.on("key", (data: Buffer) => {
    const key = data.toString("utf8");
    if (key === "q" || key === "\u0003") {
      renderer.destroy();
    }
    if (key === "r") {
      bodyText.content = renderSummary(report);
      renderer.requestRender();
    }
  });
}
