import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { isModalEnabled, getModalBaseUrl } from "@/lib/modal-client";
import fs from "fs";
import path from "path";
import os from "os";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Track CPU usage between calls (module-level so it persists across requests)
let prevCpu: { user: number; system: number; time: number } | null = null;
// Throttle metric sample writes — one per 30s max
let lastSampleAt = 0;

function cpuPercentage(): number {
  try {
    const cpu = process.cpuUsage();
    const now = Date.now();
    const userMs = cpu.user / 1000; // microseconds → ms
    const sysMs = cpu.system / 1000;
    if (prevCpu) {
      const elapsed = now - prevCpu.time;
      if (elapsed > 0) {
        // % of one core (can exceed 100 on multi-core for the process)
        const total = userMs + sysMs - prevCpu.user - prevCpu.system;
        const pct = (total / elapsed) * 100;
        prevCpu = { user: userMs, system: sysMs, time: now };
        return Math.max(0, Math.round(pct * 10) / 10);
      }
    }
    prevCpu = { user: userMs, system: sysMs, time: now };
    return 0;
  } catch {
    return 0;
  }
}

function dbFileSizeMB(): number {
  try {
    const dbPath = path.join(process.cwd(), "db", "custom.db");
    if (fs.existsSync(dbPath)) {
      const stat = fs.statSync(dbPath);
      return Math.round((stat.size / (1024 * 1024)) * 100) / 100;
    }
  } catch {
    /* ignore */
  }
  return 0;
}

function galleryImagesCount(): number {
  try {
    const dir = path.join(process.cwd(), "public", "gallery");
    if (fs.existsSync(dir)) {
      return fs.readdirSync(dir).filter((f) => f.endsWith(".png")).length;
    }
  } catch {
    /* ignore */
  }
  return 0;
}

export async function GET() {
  try {
    const [totalGens, totalEvents] = await Promise.all([
      db.generation.count(),
      db.auditEvent.count(),
    ]);

    const mem = process.memoryUsage();
    const loadAvg = os.loadavg();
    const cpus = os.cpus();
    const cpuPct = cpuPercentage();
    const rssMB = Math.round((mem.rss / (1024 * 1024)) * 10) / 10;
    const heapUsedMB = Math.round((mem.heapUsed / (1024 * 1024)) * 10) / 10;
    const heapTotalMB = Math.round((mem.heapTotal / (1024 * 1024)) * 10) / 10;
    const externalMB = Math.round((mem.external / (1024 * 1024)) * 10) / 10;
    const dbSize = dbFileSizeMB();
    const galleryImgs = galleryImagesCount();
    const totalMemMB = Math.round((os.totalmem() / (1024 * 1024)) * 10) / 10;
    const freeMemMB = Math.round((os.freemem() / (1024 * 1024)) * 10) / 10;

    // Persist a metric sample (throttled: at most one per ~30s).
    // Wrapped in try/catch so a DB issue never degrades the health endpoint.
    const now = Date.now();
    if (now - lastSampleAt > 30_000) {
      lastSampleAt = now;
      try {
        await db.metricSample.create({
          data: {
            cpuPercent: cpuPct,
            rssMB,
            heapUsedMB,
            heapTotalMB,
            externalMB,
            load1m: Math.round(loadAvg[0] * 100) / 100,
            load5m: Math.round(loadAvg[1] * 100) / 100,
            load15m: Math.round(loadAvg[2] * 100) / 100,
            freeMemMB,
            totalMemMB,
            dbSizeMB: dbSize,
            galleryImgs,
            generations: totalGens,
            auditEvents: totalEvents,
            uptimeSec: Math.round(process.uptime() * 10) / 10,
          },
        });
        // Trim to the most recent 720 samples (~6 hours at 30s interval).
        // Use a simpler deleteMany based on a cutoff timestamp.
        const cutoff = new Date(now - 6 * 60 * 60 * 1000);
        await db.metricSample.deleteMany({ where: { createdAt: { lt: cutoff } } });
      } catch {
        /* sample write failure is non-fatal — never degrade health endpoint */
      }
    }

    return NextResponse.json({
      status: "ok",
      service: "nexus-visual-weaver",
      version: "2.3.0",
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
      db: {
        generations: totalGens,
        auditEvents: totalEvents,
        sizeMB: dbSize,
      },
      storage: {
        galleryImages: galleryImgs,
      },
      process: {
        pid: process.pid,
        cpuPercent: cpuPct,
        memory: {
          rssMB,
          heapUsedMB,
          heapTotalMB,
          externalMB,
        },
      },
      system: {
        platform: process.platform,
        nodeVersion: process.version,
        cpuCores: cpus.length,
        cpuModel: cpus[0]?.model ?? "unknown",
        loadAvg: {
          "1m": Math.round(loadAvg[0] * 100) / 100,
          "5m": Math.round(loadAvg[1] * 100) / 100,
          "15m": Math.round(loadAvg[2] * 100) / 100,
        },
        totalMemMB,
        freeMemMB,
      },
      models: {
        generator: isModalEnabled()
          ? "FLUX.1-schnell (Modal H100 GPU)"
          : "FLUX.2 Klein (z-ai images.generations)",
        safety: "ST3GG (z-ai chat completions)",
        judge: "MiniCPM-V 2.6 (z-ai vision)",
        aggregator: "Nemotron-Nano (z-ai chat completions)",
      },
      modal: {
        enabled: isModalEnabled(),
        baseUrl: getModalBaseUrl(),
      },
    });
  } catch (e) {
    return NextResponse.json(
      { status: "degraded", error: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    );
  }
}
