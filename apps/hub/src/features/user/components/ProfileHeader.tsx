import type { MyProfile } from "@sondohub/contracts";
import UserAvatar from "@/components/UserAvatar.tsx";
import { formatDateTime } from "../format-date.ts";

export default function ProfileHeader({ profile }: { profile: MyProfile }) {
  return (
    <header className="flex flex-wrap items-center gap-6">
      {/* O anel em degradê é o único destaque da página; o resto fica discreto. */}
      <div className="rounded-full bg-g-ring p-[3px]">
        <UserAvatar
          name={profile.name}
          url={profile.avatarUrl}
          className="size-24 border-4 border-background text-3xl font-extrabold"
        />
      </div>
      <div className="flex min-w-0 flex-col gap-1">
        <h1 className="text-3xl font-extrabold tracking-tight">
          {profile.name}
        </h1>
        <span className="text-[15px] text-muted-foreground">
          {profile.email}
        </span>
        <span className="text-xs text-muted-foreground">
          Perfil atualizado em {formatDateTime(profile.updatedAt)}
        </span>
        {/* Upload da foto vem depois (Azure Blob). */}
        <button
          type="button"
          disabled
          title="Em breve"
          className="mt-1 self-start text-sm font-semibold text-link disabled:cursor-not-allowed disabled:opacity-50"
        >
          Trocar foto
        </button>
      </div>
    </header>
  );
}
