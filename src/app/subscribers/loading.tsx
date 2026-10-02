import { TableSkeleton } from "@/components/skeletons";

export default function Loading() {
  return <TableSkeleton cards={3} rows={8} />;
}
