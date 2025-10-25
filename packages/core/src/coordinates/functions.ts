import { assert } from "../utils";
import type { MarcherPage, Page, PageAnimationCache } from "./types";

export const _getCoordinateAtPageTimestamp = ({
    pageTimestamp,
    pageDuration,
    previousPage,
    currentPage,
}: {
    pageTimestamp: number;
    pageDuration: number;
    previousPage: { x: number; y: number };
    currentPage: { x: number; y: number };
}) => {
    assert(pageTimestamp >= 0, "Page timestamp must be positive");
    assert(pageDuration > 0, "Page duration must be positive");
    assert(
        pageDuration <= pageTimestamp,
        "Page duration must be less than or equal to page timestamp",
    );

    const progress = pageTimestamp / pageDuration;

    // Interpolate between the previous and current page coordinates
    const x = previousPage.x + (currentPage.x - previousPage.x) * progress;
    const y = previousPage.y + (currentPage.y - previousPage.y) * progress;

    return { x, y };
};
export const _buildCacheForPage = ({
    previousMarcherPageByMarcherId,
    currentMarcherPageByMarcherId,
    pageDuration,
    frameRate = 60,
}: {
    previousMarcherPageByMarcherId: Record<number, MarcherPage>;
    currentMarcherPageByMarcherId: Record<number, MarcherPage>;
    pageDuration: number;
    frameRate?: number;
}): PageAnimationCache => {
    const frameCount = pageDuration * frameRate;
    const marcherCoordinates: Record<number, Float32Array> = {};

    // First, allocate an array for each marcher
    const secondsPerFrame = 1 / frameRate;
    for (const marcherId of Object.keys(previousMarcherPageByMarcherId)) {
        const previousMarcherPage =
            previousMarcherPageByMarcherId[Number(marcherId)];
        const currentMarcherPage =
            currentMarcherPageByMarcherId[Number(marcherId)];
        if (!previousMarcherPage || !currentMarcherPage) {
            console.warn(
                `Previous or current marcher page not found for marcher id ${marcherId}`,
            );
            continue;
        }
        const coordinateArray = new Float32Array(frameCount * 2);

        for (let i = 0; i < frameCount; i++) {
            const pageTimestamp = i * secondsPerFrame;
            const coordinate = _getCoordinateAtPageTimestamp({
                pageTimestamp: pageTimestamp,
                pageDuration: pageDuration,
                previousPage: previousMarcherPage,
                currentPage: currentMarcherPage,
            });
            coordinateArray[i * 2] = coordinate.x;
            coordinateArray[i * 2 + 1] = coordinate.y;
        }

        marcherCoordinates[Number(marcherId)] = coordinateArray;
    }

    // Second, fill each array as needed
    // (Assuming in the future we'll do interpolation here - but for now they're just allocated.)
    return { frameRate, frameCount, marcherCoordinates };
};
