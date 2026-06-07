import { readFile } from "node:fs/promises";
import type { Express, Request, Response } from "express";
import { atomicWriteJson } from "../lib/atomicWrite.js";
import { requireRuntimeContext, type RouteRuntimeContext } from "../lib/runtimeContext.js";

async function readConfig(path: string): Promise<Record<string, any>> {
  try {
    const value = JSON.parse(await readFile(path, "utf8"));
    return value && typeof value === "object" && !Array.isArray(value) ? value : {};
  } catch {
    return {};
  }
}

export function registerNetworkSettingsRoutes(app: Express, ctxRaw: RouteRuntimeContext) {
  const ctx = requireRuntimeContext(ctxRaw);

  app.get("/api/settings/network", async (_req: Request, res: Response) => {
    const config = await readConfig(ctx.config.storage.configFile);
    res.json({
      allowExternalAccess: config.server?.allowExternalAccess === true,
      currentHost: ctx.config.server.host,
      envOverride: Boolean(process.env.IMA2_HOST),
      restartRequired: false,
    });
  });

  app.put("/api/settings/network", async (req: Request, res: Response) => {
    if (typeof req.body?.allowExternalAccess !== "boolean") {
      return res.status(400).json({ error: "allowExternalAccess must be a boolean" });
    }
    const config = await readConfig(ctx.config.storage.configFile);
    const allowExternalAccess = req.body.allowExternalAccess;
    config.server = {
      ...(config.server || {}),
      allowExternalAccess,
      host: allowExternalAccess ? "0.0.0.0" : "127.0.0.1",
    };
    await atomicWriteJson(ctx.config.storage.configFile, config);
    res.json({
      allowExternalAccess,
      currentHost: ctx.config.server.host,
      nextHost: config.server.host,
      envOverride: Boolean(process.env.IMA2_HOST),
      restartRequired: config.server.host !== ctx.config.server.host,
    });
  });
}
