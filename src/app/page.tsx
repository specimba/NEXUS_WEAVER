"use client";

import { AppShell } from "@/components/nexus/app-shell";
import { useNexus } from "@/components/nexus/store";
import { StudioView } from "@/components/nexus/studio-view";
import { CommandView } from "@/components/nexus/command-view";
import { PipelineView } from "@/components/nexus/pipeline-view";
import { ComplianceView } from "@/components/nexus/compliance-view";
import { GalleryView } from "@/components/nexus/gallery-view";
import { MonitorView } from "@/components/nexus/monitor-view";
import { LibraryView } from "@/components/nexus/library-view";
import { CostLabView } from "@/components/nexus/cost-lab-view";
import { PacksView } from "@/components/nexus/packs-view";

export default function Home() {
  const view = useNexus((s) => s.view);
  return (
    <AppShell>
      {view === "studio" ? <StudioView /> : null}
      {view === "library" ? <LibraryView /> : null}
      {view === "packs" ? <PacksView /> : null}
      {view === "command" ? <CommandView /> : null}
      {view === "pipeline" ? <PipelineView /> : null}
      {view === "compliance" ? <ComplianceView /> : null}
      {view === "costlab" ? <CostLabView /> : null}
      {view === "gallery" ? <GalleryView /> : null}
      {view === "monitor" ? <MonitorView /> : null}
    </AppShell>
  );
}
