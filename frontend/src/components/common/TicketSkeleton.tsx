// Skeleton component for ticket cards when loading
export default function TicketSkeleton() {
    return (
        <div className="bg-white rounded-lg shadow-md overflow-hidden animate-pulse">
            {/* Image skeleton */}
            <div className="w-full h-48 bg-gray-200"></div>

            {/* Content skeleton */}
            <div className="p-6">
                {/* Title skeleton */}
                <div className="h-6 bg-gray-200 rounded w-3/4 mb-4"></div>

                {/* Info lines skeleton */}
                <div className="space-y-2 mb-4">
                    <div className="h-4 bg-gray-200 rounded w-full"></div>
                    <div className="h-4 bg-gray-200 rounded w-5/6"></div>
                    <div className="h-4 bg-gray-200 rounded w-2/3"></div>
                </div>

                {/* Status badge skeleton */}
                <div className="h-6 bg-gray-200 rounded w-1/3 mb-4"></div>

                {/* Button skeleton */}
                <div className="h-10 bg-gray-200 rounded"></div>
            </div>
        </div>
    )
}
