export type TrashKind = "product" | "category" | "brand";

export type TrashItem = {
  id: string;
  kind: TrashKind;
  name: string;
  deletedAt: string;
};
