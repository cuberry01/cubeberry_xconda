import { DashboardSkeleton } from "@/components/skeletons";

// Xconda 대시보드가 루트(/)이므로 기본 로딩도 대시보드 골격을 사용합니다.
export default function Loading() {
  return <DashboardSkeleton />;
}
