import type { AdminDashboard } from "@sondohub/contracts";
import { MonitorSmartphone } from "lucide-react";
import { formatNumber } from "../format.ts";
import BigNumber from "./BigNumber.tsx";
import DashboardCard from "./DashboardCard.tsx";

type OpenSessionsCardProps = { sessions: AdminDashboard["sessions"]; className?: string };

/** Sessões que ainda valem agora, em quantas pessoas, e a divisão entre computador e celular. */
export default function OpenSessionsCard({ sessions, className }: OpenSessionsCardProps) {
  const desktopShare = sessions.open ? Math.round((sessions.desktop / sessions.open) * 100) : 0;
  const mobileShare = sessions.open ? 100 - desktopShare : 0;

  return (
    <DashboardCard
      icon={MonitorSmartphone}
      title="Sessões abertas agora"
      subtitle="Não revogadas e não vencidas"
      className={className}
    >
      <BigNumber value={formatNumber(sessions.open)} note={`em ${formatNumber(sessions.people)} pessoas`} />
      <div className="mt-auto pt-4">
        <div className="flex h-2 gap-0.5 overflow-hidden rounded bg-muted" aria-hidden>
          <b className="bg-linear-to-r from-(--grad-a) to-primary" style={{ flex: sessions.desktop }} />
          <b className="bg-(--grad-b)" style={{ flex: sessions.mobile }} />
        </div>
        <p className="pt-2 text-[12.5px] text-muted-foreground">
          {sessions.open
            ? `Computador ${desktopShare}% e celular ${mobileShare}%`
            : "Nenhuma sessão aberta"}
        </p>
      </div>
    </DashboardCard>
  );
}
