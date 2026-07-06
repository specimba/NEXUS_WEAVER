"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useNexus } from "./store";
import { STYLES, ASPECTS, PROMPT_TEMPLATES } from "@/lib/nexus-types";
import type { ViewId } from "@/lib/nexus-types";
import { cn } from "@/lib/utils";
import {
  Search,
  Sparkles,
  LayoutDashboard,
  Workflow,
  ShieldCheck,
  Images,
  Activity,
  Wand2,
  RotateCcw,
  Download,
  LayoutGrid,
  Keyboard,
  Palette,
  Ratio,
  Clock,
  Star,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

interface CommandItem {
  id: string;
  label: string;
  shortcut?: string;
  icon: typeof Sparkles;
  category: string;
  action: () => void;
}

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const view = useNexus((s) => s.view);
  const setView = useNexus((s) => s.setView);
  const setPrompt = useNexus((s) => s.setPrompt);
  const loadSettings = useNexus((s) => s.loadSettings);
  const running = useNexus((s) => s.running);

  const navigateCmds: { id: ViewId; label: string; icon: typeof Sparkles }[] = [
    { id: "studio", label: "Go to Studio", icon: Sparkles },
    { id: "command", label: "Go to Command Center", icon: LayoutDashboard },
    { id: "pipeline", label: "Go to Pipeline", icon: Workflow },
    { id: "compliance", label: "Go to Compliance", icon: ShieldCheck },
    { id: "gallery", label: "Go to Gallery", icon: Images },
    { id: "monitor", label: "Go to Monitor", icon: Activity },
  ];

  const actionCmds: { id: string; label: string; icon: typeof Sparkles; shortcut?: string; action: () => void }[] = [
    {
      id: "run",
      label: "Run Pipeline",
      icon: Wand2,
      shortcut: "⌘↵",
      action: () => {
        // trigger via keyboard event
        window.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", metaKey: true }));
      },
    },
    {
      id: "enhance",
      label: "Enhance Prompt",
      icon: Wand2,
      action: () => {
        setView("studio");
        // small delay then click enhance
        setTimeout(() => {
          const btn = document.querySelector('[data-action="enhance"]') as HTMLButtonElement;
          btn?.click();
        }, 100);
      },
    },
    {
      id: "templates",
      label: "Open Templates",
      icon: LayoutGrid,
      action: () => {
        setView("studio");
      },
    },
    {
      id: "history",
      label: "View Prompt History",
      icon: Clock,
      action: () => {
        setView("studio");
      },
    },
    {
      id: "download-last",
      label: "Download Last Evidence",
      icon: Download,
      action: () => {
        const result = useNexus.getState().result;
        if (result?.evidence) {
          const blob = new Blob([JSON.stringify(result.evidence, null, 2)], {
            type: "application/json",
          });
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url;
          a.download = `nexus-evidence-${result.id.slice(-8)}.json`;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
        }
      },
    },
  ];

  const styleCmds = STYLES.map((s) => ({
    id: `style-${s}`,
    label: `Set style: ${s}`,
    icon: Palette,
    category: "Style",
    action: () => {
      useNexus.getState().setStyle(s);
      setView("studio");
    },
  }));

  const aspectCmds = ASPECTS.map((a) => ({
    id: `aspect-${a.id}`,
    label: `Set aspect: ${a.id} (${a.label})`,
    icon: Ratio,
    category: "Aspect",
    action: () => {
      useNexus.getState().setAspect(a.id);
      setView("studio");
    },
  }));

  const templateCmds = PROMPT_TEMPLATES.map((t) => ({
    id: `tpl-${t.id}`,
    label: `Template: ${t.title}`,
    icon: Star,
    category: "Template",
    action: () => {
      loadSettings({ prompt: t.prompt, style: t.style, aspect: t.aspect });
      setView("studio");
    },
  }));

  const allItems: CommandItem[] = [
    ...navigateCmds.map((n) => ({
      id: n.id,
      label: n.label,
      icon: n.icon,
      category: "Navigate",
      action: () => setView(n.id),
    })),
    ...actionCmds.map((a) => ({
      id: a.id,
      label: a.label,
      shortcut: a.shortcut,
      icon: a.icon,
      category: "Action",
      action: a.action,
    })),
    ...styleCmds,
    ...aspectCmds,
    ...templateCmds,
  ];

  const q = query.trim().toLowerCase();
  const filtered = q
    ? allItems.filter(
        (item) =>
          item.label.toLowerCase().includes(q) ||
          item.category.toLowerCase().includes(q)
      )
    : allItems;

  // Reset selected when filtered changes
  useEffect(() => {
    setSelected(0);
  }, [query]);

  // Global keyboard handler
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setOpen((v) => !v);
        setQuery("");
      }
      if (e.key === "Escape" && open) {
        e.preventDefault();
        setOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  // Focus input when opened
  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  // Scroll selected item into view
  useEffect(() => {
    if (listRef.current) {
      const el = listRef.current.querySelector(`[data-idx="${selected}"]`);
      el?.scrollIntoView({ block: "nearest" });
    }
  }, [selected]);

  const execute = useCallback(
    (item: CommandItem) => {
      item.action();
      setOpen(false);
    },
    []
  );

  const handleKey = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelected((s) => Math.min(s + 1, filtered.length - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelected((s) => Math.max(s - 1, 0));
      } else if (e.key === "Enter" && filtered[selected]) {
        e.preventDefault();
        execute(filtered[selected]);
      }
    },
    [filtered, selected, execute]
  );

  // Group filtered items by category
  const grouped: { category: string; items: CommandItem[] }[] = [];
  for (const item of filtered) {
    const last = grouped[grouped.length - 1];
    if (last && last.category === item.category) {
      last.items.push(item);
    } else {
      grouped.push({ category: item.category, items: [item] });
    }
  }

  let globalIdx = 0;

  return (
    <AnimatePresence>
      {open ? (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="fixed inset-0 z-[60] bg-black/60 backdrop-blur-sm"
            onClick={() => setOpen(false)}
          />
          {/* Palette */}
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: -8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: -8 }}
            transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
            className="fixed left-1/2 top-[18%] z-[61] w-full max-w-lg -translate-x-1/2 overflow-hidden rounded-2xl border border-border/60 nexus-card shadow-2xl"
          >
            {/* Search input */}
            <div className="flex items-center gap-3 border-b border-border/40 px-4 py-3">
              <Search className="h-4 w-4 text-muted-foreground" />
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={handleKey}
                placeholder="Type a command or search…"
                className="flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground/60"
              />
              <kbd className="rounded border border-border/50 bg-background/60 px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
                ESC
              </kbd>
            </div>

            {/* Results */}
            <div
              ref={listRef}
              className="nexus-scroll max-h-80 overflow-y-auto p-2"
            >
              {filtered.length === 0 ? (
                <div className="py-8 text-center text-sm text-muted-foreground">
                  No results for &ldquo;{query}&rdquo;
                </div>
              ) : (
                grouped.map((group) => (
                  <div key={group.category}>
                    <div className="px-2 pb-1 pt-2 font-mono text-[9px] uppercase tracking-[0.2em] text-muted-foreground/60">
                      {group.category}
                    </div>
                    {group.items.map((item) => {
                      const idx = globalIdx++;
                      const isSelected = idx === selected;
                      const Icon = item.icon;
                      return (
                        <button
                          key={item.id}
                          data-idx={idx}
                          onClick={() => execute(item)}
                          onMouseEnter={() => setSelected(idx)}
                          className={cn(
                            "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm transition",
                            isSelected
                              ? "bg-primary/12 text-foreground"
                              : "text-muted-foreground hover:text-foreground"
                          )}
                        >
                          <Icon
                            className={cn(
                              "h-4 w-4 shrink-0",
                              isSelected ? "text-primary" : "text-muted-foreground"
                            )}
                          />
                          <span className="flex-1 truncate">{item.label}</span>
                          {item.shortcut ? (
                            <kbd className="shrink-0 rounded border border-border/50 bg-background/60 px-1.5 py-0.5 font-mono text-[9px] text-muted-foreground">
                              {item.shortcut}
                            </kbd>
                          ) : null}
                        </button>
                      );
                    })}
                  </div>
                ))
              )}
            </div>

            {/* Footer hint */}
            <div className="flex items-center justify-between border-t border-border/40 px-4 py-2 text-[9px] text-muted-foreground/60">
              <span>Navigate with ↑↓ · Enter to select</span>
              <span className="flex items-center gap-1">
                <Keyboard className="h-3 w-3" /> <kbd>⌘K</kbd> to toggle
              </span>
            </div>
          </motion.div>
        </>
      ) : null}
    </AnimatePresence>
  );
}
