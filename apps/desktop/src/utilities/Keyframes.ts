import { IPath } from "@openmarch/path-utility";

type Coordinate = { x: number; y: number };
export type CoordinateDefinition = {
    x: number;
    y: number;
    path?: IPath;
    previousPathPosition?: number;
    nextPathPosition?: number;
};

/**
 * A timeline of coordinates for a marcher.
 *
 * @param pathMap A map of timestamps to coordinates.
 * @param sortedTimestamps A sorted array of timestamps. This is used to speed up the search for the surrounding timestamps.
 */
export type MarcherTimeline = {
    pathMap: Map<number, CoordinateDefinition>;
    sortedTimestamps: number[];
};

const PathLengthCache = new WeakMap<IPath, number>();

/**
 * Get the coordinates at a given time for a marcher.
 *
 * @param timestampMilliseconds The time in milliseconds.
 * @param marcherTimeline The timeline of coordinates for the marcher.
 * @returns The coordinates at the given time.
 */
export const getCoordinatesAtTime = (
    timestampMilliseconds: number,
    marcherTimeline: MarcherTimeline,
): Coordinate | null => {
    if (timestampMilliseconds < 0)
        throw new Error(
            `Cannot use negative timestamp: ${timestampMilliseconds}`,
        );

    const { current: currentTimestamp, next: nextTimestamp } =
        findSurroundingTimestamps({
            sortedTimestamps: marcherTimeline.sortedTimestamps,
            targetTimestamp: timestampMilliseconds,
        });

    if (currentTimestamp === null)
        throw new Error("No timestamp found! This shouldn't happen");
    // Likely the end, return false
    if (!nextTimestamp) return null;

    const previousCoordinate = marcherTimeline.pathMap.get(currentTimestamp);
    const nextCoordinate = marcherTimeline.pathMap.get(nextTimestamp);

    if (previousCoordinate === undefined || nextCoordinate === undefined)
        throw new Error("No coordinate found! This shouldn't happen");

    const keyframeProgress =
        nextTimestamp !== null
            ? (timestampMilliseconds - currentTimestamp) /
              (nextTimestamp - currentTimestamp)
            : 0;

    if (keyframeProgress < 0 || keyframeProgress > 1)
        throw new Error(
            "Keyframe progress is out of bounds! This shouldn't happen",
        );

    let interpolatedCoordinate: Coordinate;
    if (nextCoordinate.path) {
        const nextPath = nextCoordinate.path;
        const destinationPathPosition = nextCoordinate.nextPathPosition;
        const previousPathPosition = previousCoordinate.previousPathPosition;

        let pathLength = PathLengthCache.get(nextPath);
        if (pathLength === undefined) {
            pathLength = nextPath.getTotalLength();
            PathLengthCache.set(nextPath, pathLength);
        }

        const previousPathPositionToUse = previousPathPosition ?? 0;
        const destinationPathPositionToUse = destinationPathPosition ?? 1;
        const currentPathPosition =
            (destinationPathPositionToUse - previousPathPositionToUse) *
                keyframeProgress +
            previousPathPositionToUse;

        if (pathLength === undefined) {
            throw new Error("Could not calculate path length");
        }

        const interpolatedSvgLength = pathLength * currentPathPosition;
        const point = nextPath.getPointAtLength(interpolatedSvgLength);
        interpolatedCoordinate = { x: point.x, y: point.y };
    } else {
        interpolatedCoordinate = {
            x:
                previousCoordinate.x +
                keyframeProgress * (nextCoordinate.x - previousCoordinate.x),
            y:
                previousCoordinate.y +
                keyframeProgress * (nextCoordinate.y - previousCoordinate.y),
        };
    }

    return interpolatedCoordinate;
};

/**
 * Binary search algorithm to find the timestamps surrounding a target.
 *
 * @param params.timestamps - Sorted array of timestamps
 * @param params.targetTimestamp - The target timestamp to search for
 * @returns An object with the timestamp at or before the target (`current`)
 *          and the timestamp immediately after the target (`next`).
 *          Returns null for either if not found.
 */
export function findSurroundingTimestamps({
    sortedTimestamps,
    targetTimestamp,
}: {
    sortedTimestamps: number[];
    targetTimestamp: number;
}): { current: number | null; next: number | null } {
    let low = 0;
    let high = sortedTimestamps.length - 1;

    if (sortedTimestamps.length === 0) {
        return { current: null, next: null };
    }

    // If target is before the first element
    if (targetTimestamp < sortedTimestamps[0]) {
        return { current: null, next: sortedTimestamps[0] };
    }

    // If target is after or at the last element
    if (targetTimestamp >= sortedTimestamps[high]) {
        return { current: sortedTimestamps[high], next: null };
    }

    while (low <= high) {
        const mid = Math.floor((low + high) / 2);
        const midT = sortedTimestamps[mid];

        if (midT === targetTimestamp) {
            return { current: midT, next: sortedTimestamps[mid + 1] ?? null };
        }

        if (midT < targetTimestamp) {
            low = mid + 1;
        } else {
            high = mid - 1;
        }
    }

    // At this point, high < low.
    // timestamps[high] is the value before the target.
    // timestamps[low] is the value after the target.
    return { current: sortedTimestamps[high], next: sortedTimestamps[low] };
}

/**
 * A map of marcher IDs to their coordinates at a given timestamp.
 *
 * ```ts
 * const timestamp = 1000;
 * const marcherId = 1;
 * const coordinate = map.get(timestamp).get(marcherId);
 * ```
 */
export type CoordinatesByMarcherIdByTimestamp = Map<
    number,
    Map<number, Coordinate>
>;
/**
 * Generate coordinates for a page.
 *
 * @param page - The page to generate coordinates for.
 * @param sampleRatePerSecond - The sample rate per second.
 * @returns The coordinates for the page.
 */
export function generateCoordinatesForPage({
    page,
    sampleRatePerSecond = 30,
    marcherTimelinesByMarcherId,
}: {
    page: { timestamp: number; duration: number };
    sampleRatePerSecond?: number;
    marcherTimelinesByMarcherId: Map<number, MarcherTimeline>;
}) {
    const coordinatesByMarcherIdByTimestamp: CoordinatesByMarcherIdByTimestamp =
        new Map();

    const startTime = page.timestamp * 1000; // Convert to milliseconds
    const endTime = (page.timestamp + page.duration) * 1000; // Convert to milliseconds
    const timeInterval = 1000 / sampleRatePerSecond; // Milliseconds between samples
    console.debug("startTime", startTime);
    console.debug("endTime", endTime);
    console.debug("timeInterval", timeInterval);
    console.debug("marcherTimelinesByMarcherId", marcherTimelinesByMarcherId);

    for (
        let currentTime = startTime;
        currentTime <= endTime;
        currentTime += timeInterval
    ) {
        console.debug("currentTime", currentTime);
        for (const [
            marcherId,
            marcherTimeline,
        ] of marcherTimelinesByMarcherId.entries()) {
            console.debug("marcherId", marcherId);
            const coordinate = getCoordinatesAtTime(
                currentTime,
                marcherTimeline,
            );
            if (!coordinate) continue;

            if (!coordinatesByMarcherIdByTimestamp.has(currentTime))
                coordinatesByMarcherIdByTimestamp.set(currentTime, new Map());
            coordinatesByMarcherIdByTimestamp
                .get(currentTime)!
                .set(marcherId, coordinate);
        }
    }
    console.debug(
        "coordinatesByMarcherIdByTimestamp",
        coordinatesByMarcherIdByTimestamp,
    );
    return coordinatesByMarcherIdByTimestamp;
}

/**
 * Efficient coordinate lookup system that avoids binary search on every frame.
 * Uses a stateful iterator pattern to track current position and only advance when needed.
 */
export class CoordinateLookup {
    private availableTimestamps: number[];
    private currentIndex: number = 0;

    constructor(
        private coordinatesByMarcherIdByTimestamp: CoordinatesByMarcherIdByTimestamp,
    ) {
        this.availableTimestamps = Array.from(
            coordinatesByMarcherIdByTimestamp.keys(),
        ).sort((a, b) => a - b);
    }

    /**
     * Get coordinates for a marcher at a specific timestamp.
     * Efficiently finds the position without binary search by tracking current index.
     */
    getCoordinates(
        timestampMilliseconds: number,
        marcherId: number,
    ): Coordinate | null {
        if (this.availableTimestamps.length === 0) {
            return null;
        }

        // Fast path: if we're at the exact timestamp, return immediately
        const currentTimestamp = this.availableTimestamps[this.currentIndex];
        if (currentTimestamp === timestampMilliseconds) {
            return this.getCoordinatesAtTimestamp(currentTimestamp, marcherId);
        }

        // Advance or retreat the index to find the right position
        this.seekToTimestamp(timestampMilliseconds);

        const current = this.availableTimestamps[this.currentIndex];
        const next = this.availableTimestamps[this.currentIndex + 1];

        if (current === undefined) {
            return null;
        }

        // Get coordinates at the current timestamp
        const currentCoordinates = this.getCoordinatesAtTimestamp(
            current,
            marcherId,
        );
        if (!currentCoordinates) {
            return null;
        }

        // If no next timestamp or we're at the exact timestamp, return current coordinates
        if (next === undefined || current === timestampMilliseconds) {
            return currentCoordinates;
        }

        // Get coordinates at the next timestamp
        const nextCoordinates = this.getCoordinatesAtTimestamp(next, marcherId);
        if (!nextCoordinates) {
            return currentCoordinates;
        }

        // Calculate interpolation progress
        const progress = (timestampMilliseconds - current) / (next - current);

        // Interpolate between the two coordinates
        return {
            x:
                currentCoordinates.x +
                progress * (nextCoordinates.x - currentCoordinates.x),
            y:
                currentCoordinates.y +
                progress * (nextCoordinates.y - currentCoordinates.y),
        };
    }

    private getCoordinatesAtTimestamp(
        timestamp: number,
        marcherId: number,
    ): Coordinate | null {
        return (
            this.coordinatesByMarcherIdByTimestamp
                .get(timestamp)
                ?.get(marcherId) || null
        );
    }

    private seekToTimestamp(targetTimestamp: number): void {
        // If we're already at the right position, don't seek
        const currentTimestamp = this.availableTimestamps[this.currentIndex];
        if (
            currentTimestamp !== undefined &&
            currentTimestamp <= targetTimestamp
        ) {
            const nextTimestamp =
                this.availableTimestamps[this.currentIndex + 1];
            if (
                nextTimestamp === undefined ||
                nextTimestamp > targetTimestamp
            ) {
                return; // We're already in the right position
            }
        }

        // Reset to beginning if we're past the target
        if (
            currentTimestamp !== undefined &&
            currentTimestamp > targetTimestamp
        ) {
            this.currentIndex = 0;
        }

        // Advance to the right position
        while (this.currentIndex < this.availableTimestamps.length - 1) {
            const current = this.availableTimestamps[this.currentIndex];
            const next = this.availableTimestamps[this.currentIndex + 1];

            if (
                current <= targetTimestamp &&
                (next === undefined || next > targetTimestamp)
            ) {
                break; // Found the right position
            }

            this.currentIndex++;
        }
    }
}

/**
 * Get coordinates for a marcher at a specific timestamp, interpolating between pre-calculated coordinates if necessary.
 * This is the old function kept for backward compatibility, but it's inefficient for animation.
 *
 * @deprecated Use CoordinateLookup class for better performance during animation
 */
export function getCoordinatesFromPreCalculated(
    timestampMilliseconds: number,
    marcherId: number,
    coordinatesByMarcherIdByTimestamp: CoordinatesByMarcherIdByTimestamp,
): Coordinate | null {
    // Get all available timestamps
    const availableTimestamps = Array.from(
        coordinatesByMarcherIdByTimestamp.keys(),
    ).sort((a, b) => a - b);

    if (availableTimestamps.length === 0) {
        return null;
    }

    // Find surrounding timestamps
    const { current, next } = findSurroundingTimestamps({
        sortedTimestamps: availableTimestamps,
        targetTimestamp: timestampMilliseconds,
    });

    if (current === null) {
        return null;
    }

    // Get coordinates at the current timestamp
    const currentCoordinates = coordinatesByMarcherIdByTimestamp
        .get(current)
        ?.get(marcherId);
    if (!currentCoordinates) {
        return null;
    }

    // If no next timestamp or we're at the exact timestamp, return current coordinates
    if (next === null || current === timestampMilliseconds) {
        return currentCoordinates;
    }

    // Get coordinates at the next timestamp
    const nextCoordinates = coordinatesByMarcherIdByTimestamp
        .get(next)
        ?.get(marcherId);
    if (!nextCoordinates) {
        return currentCoordinates;
    }

    // Calculate interpolation progress
    const progress = (timestampMilliseconds - current) / (next - current);

    // Interpolate between the two coordinates
    return {
        x:
            currentCoordinates.x +
            progress * (nextCoordinates.x - currentCoordinates.x),
        y:
            currentCoordinates.y +
            progress * (nextCoordinates.y - currentCoordinates.y),
    };
}
