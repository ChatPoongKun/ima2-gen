import type { GenerateItem } from "../../types";
import { getGalleryItemKey } from "../../lib/galleryNavigation";

type SidebarHistoryImageCardProps = {
  item: GenerateItem;
  active: boolean;
  selectLabel: string;
  deleteLabel: string;
  setRef: (key: string, node: HTMLButtonElement | null) => void;
  onSelect: (item: GenerateItem) => void;
  onDelete: (item: GenerateItem) => void;
};

export function SidebarHistoryImageCard({
  item,
  active,
  selectLabel,
  deleteLabel,
  setRef,
  onSelect,
  onDelete,
}: SidebarHistoryImageCardProps) {
  const key = getGalleryItemKey(item);

  return (
    <div className="sidebar-history__item">
      <button
        ref={(node) => setRef(key, node)}
        type="button"
        className={`sidebar-history__thumb${active ? " active" : ""}`}
        onClick={() => onSelect(item)}
        aria-label={selectLabel}
      >
        <img
          src={item.thumb || item.url || item.image}
          alt=""
          loading="lazy"
          decoding="async"
        />
      </button>
      <button
        type="button"
        className="sidebar-history__delete"
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          onDelete(item);
        }}
        aria-label={deleteLabel}
        title={deleteLabel}
      >
        x
      </button>
    </div>
  );
}
