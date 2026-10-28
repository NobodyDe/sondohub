import type { CreateAppInput } from "@sondohub/contracts";
import { useState } from "react";
import { useWatch, type Control } from "react-hook-form";
import { previewIconUrl } from "../app-form.ts";
import { AppAccessCard } from "../../shared/AppAccessList.tsx";
import AppIcon from "./AppIcon.tsx";

export default function AppPreview({
  control,
}: {
  control: Control<CreateAppInput>;
}) {
  const [slug, name, url, iconUrl, levels, description] = useWatch({
    control,
    name: ["slug", "name", "url", "iconUrl", "levels", "description"],
  });
  // Estado só da prévia: dá para clicar no seletor e ver como fica, sem tocar no formulário.
  const [level, setLevel] = useState<number | null>(1);
  const displayName = name.trim() || "Nome do aplicativo";

  return (
    <aside
      aria-labelledby="preview-title"
      className="flex flex-col gap-5 rounded-[14px] bg-sunken p-5 lg:sticky lg:top-10 lg:self-start"
    >
      <h2 id="preview-title" className="text-base font-bold">
        Como as pessoas vão ver
      </h2>

      <div className="flex flex-col gap-2">
        <span className="text-[13px] font-semibold text-ink-label">
          No launcher
        </span>
        <div className="flex items-center gap-3.5 border border-border bg-sidebar p-5">
          <AppIcon
            name={displayName}
            src={previewIconUrl(url, iconUrl)}
            className="size-13 rounded-[14px] text-xl"
          />
          <div className="flex min-w-0 flex-col gap-1">
            <span className="truncate text-[17px] font-bold">
              {displayName}
            </span>
            <span className="truncate text-xs font-semibold text-muted-foreground">
              {url || "Endereço do aplicativo"}
            </span>
            {description.trim() && (
              <p className="text-sm leading-relaxed text-ink-body">
                {description}
              </p>
            )}
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <span className="text-[13px] font-semibold text-ink-label">
          No cadastro de usuário
        </span>
        <AppAccessCard
          app={{ slug: slug || "preview", name: displayName, levels }}
          colorClassName="bg-g-sky"
          level={level}
          onLevelChange={setLevel}
        />
      </div>
    </aside>
  );
}
