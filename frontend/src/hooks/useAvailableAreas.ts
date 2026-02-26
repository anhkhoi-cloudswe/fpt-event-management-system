import { useEffect, useState } from 'react';

export interface AvailableArea {
    areaId: number;
    areaName: string;
    venueName: string;
    floor?: string;
    capacity?: number;
    status: string;
}

/**
 * Hook to fetch available venue areas for a given time slot and capacity
 * @param startTime - Event start time (format: YYYY-MM-DD HH:MM:SS)
 * @param endTime - Event end time (format: YYYY-MM-DD HH:MM:SS)
 * @param expectedCapacity - Required capacity (optional, default: 0)
 * @returns Object with areas array, loading state, and error
 * 
 * Example:
 * const { areas, loading, error } = useAvailableAreas(
 *   '2026-02-15 10:00:00',
 *   '2026-02-15 12:00:00',
 *   100  // Show only areas with capacity >= 100
 * );
 */
export const useAvailableAreas = (
    startTime: string | null,
    endTime: string | null,
    expectedCapacity: number = 0
) => {
    const [areas, setAreas] = useState<AvailableArea[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!startTime || !endTime) return;

        const fetchAvailableAreas = async () => {
            setLoading(true);
            setError(null);
            try {
                const params = new URLSearchParams();
                params.append('startTime', startTime);
                params.append('endTime', endTime);
                if (expectedCapacity > 0) {
                    params.append('expectedCapacity', expectedCapacity.toString());
                }

                const token = localStorage.getItem('token');
                const response = await fetch(
                    `/api/events/available-areas?${params.toString()}`,
                    {
                        method: 'GET',
                        headers: {
                            'Authorization': `Bearer ${token}`,
                            'Content-Type': 'application/json',
                        },
                    }
                );

                if (!response.ok) {
                    throw new Error(`Failed to fetch available areas: ${response.statusText}`);
                }

                const data = await response.json();
                setAreas(data.availableAreas || []);
            } catch (err) {
                setError(err instanceof Error ? err.message : 'Failed to fetch areas');
                setAreas([]);
            } finally {
                setLoading(false);
            }
        };

        fetchAvailableAreas();
    }, [startTime, endTime, expectedCapacity]);

    return { areas, loading, error };
};

export default useAvailableAreas;
