import { USER_PAGE_SIZES, type UserPageSize } from "@sondohub/contracts";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button.tsx";

type UsersPaginationProps = {
  pageNumber: number;
  hasPrevious: boolean;
  hasNext: boolean;
  onPrevious: () => void;
  onNext: () => void;
  pageSize: UserPageSize;
  onPageSizeChange: (size: UserPageSize) => void;
};

export default function UsersPagination({
  pageNumber,
  hasPrevious,
  hasNext,
  onPrevious,
  onNext,
  pageSize,
  onPageSizeChange,
}: UsersPaginationProps) {
  return (
    <nav aria-label="Paginação" className="flex flex-wrap items-center justify-between gap-3 text-sm">
      <label className="flex items-center gap-2 text-muted-foreground">
        Itens por página
        <select
          value={pageSize}
          // As opções só têm valores de USER_PAGE_SIZES, então a conversão é segura.
          onChange={(event) => onPageSizeChange(Number(event.target.value) as UserPageSize)}
          className="h-9 rounded-[10px] border border-input bg-card px-2.5 font-semibold text-foreground"
        >
          {USER_PAGE_SIZES.map((size) => (
            <option key={size} value={size}>
              {size}
            </option>
          ))}
        </select>
      </label>

      <div className="flex items-center gap-2">
        <span className="mr-1 text-muted-foreground">Página {pageNumber}</span>
        <Button variant="outline" size="icon-lg" aria-label="Página anterior" disabled={!hasPrevious} onClick={onPrevious}>
          <ChevronLeft />
        </Button>
        <Button variant="outline" size="icon-lg" aria-label="Próxima página" disabled={!hasNext} onClick={onNext}>
          <ChevronRight />
        </Button>
      </div>
    </nav>
  );
}
