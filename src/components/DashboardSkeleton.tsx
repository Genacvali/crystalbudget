import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export function DashboardSkeleton() {
  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Summary Cards Skeleton */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
        {[1, 2, 3].map((i) => (
          <Card key={i} className="p-4 sm:p-6">
            <Skeleton className="h-4 w-32 mb-2" />
            <Skeleton className="h-8 w-24 mb-2" />
            <Skeleton className="h-3 w-40" />
          </Card>
        ))}
      </div>

      {/* Quick Actions Skeleton */}
      <div className="flex gap-2 sm:gap-3">
        <Skeleton className="flex-1 h-12" />
        <Skeleton className="flex-1 h-12" />
        <Skeleton className="h-12 w-20" />
      </div>

      {/* Tabs Skeleton */}
      <div className="space-y-3 sm:space-y-4">
        <Skeleton className="h-10 w-full" />
        
        {/* Income Sources Skeleton */}
        <div className="space-y-2">
          <Skeleton className="h-6 w-48 mb-3" />
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-2 sm:gap-2.5">
            {[1, 2].map((i) => (
              <Card key={i} className="p-4">
                <Skeleton className="h-5 w-32 mb-3" />
                <div className="space-y-2">
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-4 w-3/4" />
                  <Skeleton className="h-2 w-full mt-2" />
                </div>
              </Card>
            ))}
          </div>
        </div>

        {/* Categories Skeleton */}
        <div className="space-y-2">
          <div className="flex items-center justify-between mb-3">
            <Skeleton className="h-6 w-48" />
            <Skeleton className="h-8 w-32" />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2 sm:gap-3">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <Card key={i} className="p-3">
                <Skeleton className="h-5 w-full mb-3" />
                <div className="space-y-2">
                  <Skeleton className="h-3 w-full" />
                  <Skeleton className="h-2 w-full" />
                  <Skeleton className="h-3 w-2/3" />
                </div>
              </Card>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

