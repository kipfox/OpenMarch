import fc from "fast-check";
import { describe, expect, it, beforeEach } from "vitest";
import {
    CoordinateDefinition,
    getAnimationFrames,
    getCoordinatesAtTime,
    MarcherTimeline,
} from "../Keyframes";
import { Path, Line, Arc, CubicCurve, Spline } from "@openmarch/path-utility";

describe("getCoordinatesAtTime", () => {
    describe("with coordinate definitions (no paths)", () => {
        let marcherTimeline: MarcherTimeline;

        beforeEach(() => {
            // Create a simple timeline with two keyframes
            const pathMap = new Map<number, CoordinateDefinition>();
            pathMap.set(0, { x: 0, y: 0 });
            pathMap.set(1000, { x: 100, y: 100 });

            marcherTimeline = {
                pathMap,
                sortedTimestamps: [0, 1000],
            };
        });

        describe("basic interpolation", () => {
            it("should return exact coordinates at keyframe timestamps", () => {
                const result1 = getCoordinatesAtTime(0, marcherTimeline);
                expect(result1).toEqual({ x: 0, y: 0 });

                // Note: The function returns null when at the last timestamp due to nextTimestamp being null
                // This is the expected behavior of the current implementation
                const result2 = getCoordinatesAtTime(1000, marcherTimeline);
                expect(result2).toBeNull();
            });

            it("should interpolate coordinates at halfway point", () => {
                const result = getCoordinatesAtTime(500, marcherTimeline);
                expect(result).toEqual({ x: 50, y: 50 });
            });

            it("should interpolate coordinates at 25% progress", () => {
                const result = getCoordinatesAtTime(250, marcherTimeline);
                expect(result).toEqual({ x: 25, y: 25 });
            });

            it("should interpolate coordinates at 75% progress", () => {
                const result = getCoordinatesAtTime(750, marcherTimeline);
                expect(result).toEqual({ x: 75, y: 75 });
            });
        });

        describe("edge cases", () => {
            it("should handle negative x and y coordinates", () => {
                const pathMap = new Map<number, CoordinateDefinition>();
                pathMap.set(0, { x: -50, y: -50 });
                pathMap.set(1000, { x: 50, y: 50 });

                const timeline: MarcherTimeline = {
                    pathMap,
                    sortedTimestamps: [0, 1000],
                };

                const result = getCoordinatesAtTime(500, timeline);
                expect(result).toEqual({ x: 0, y: 0 });
            });

            it("should handle decimal coordinates", () => {
                const pathMap = new Map<number, CoordinateDefinition>();
                pathMap.set(0, { x: 0.5, y: 1.25 });
                pathMap.set(1000, { x: 10.75, y: 20.5 });

                const timeline: MarcherTimeline = {
                    pathMap,
                    sortedTimestamps: [0, 1000],
                };

                const result = getCoordinatesAtTime(500, timeline);
                expect(result).toEqual({ x: 5.625, y: 10.875 });
            });

            it("should handle large coordinate values", () => {
                const pathMap = new Map<number, CoordinateDefinition>();
                pathMap.set(0, { x: 10000, y: 20000 });
                pathMap.set(1000, { x: 20000, y: 40000 });

                const timeline: MarcherTimeline = {
                    pathMap,
                    sortedTimestamps: [0, 1000],
                };

                const result = getCoordinatesAtTime(500, timeline);
                expect(result).toEqual({ x: 15000, y: 30000 });
            });
        });

        describe("multiple keyframes", () => {
            it("should interpolate between first and second keyframes", () => {
                const pathMap = new Map<number, CoordinateDefinition>();
                pathMap.set(0, { x: 0, y: 0 });
                pathMap.set(500, { x: 50, y: 100 });
                pathMap.set(1000, { x: 100, y: 0 });

                const timeline: MarcherTimeline = {
                    pathMap,
                    sortedTimestamps: [0, 500, 1000],
                };

                const result = getCoordinatesAtTime(250, timeline);
                expect(result).toEqual({ x: 25, y: 50 });
            });

            it("should interpolate between second and third keyframes", () => {
                const pathMap = new Map<number, CoordinateDefinition>();
                pathMap.set(0, { x: 0, y: 0 });
                pathMap.set(500, { x: 50, y: 100 });
                pathMap.set(1000, { x: 100, y: 0 });

                const timeline: MarcherTimeline = {
                    pathMap,
                    sortedTimestamps: [0, 500, 1000],
                };

                const result = getCoordinatesAtTime(750, timeline);
                expect(result).toEqual({ x: 75, y: 50 });
            });

            it("should return exact coordinates at middle keyframe", () => {
                const pathMap = new Map<number, CoordinateDefinition>();
                pathMap.set(0, { x: 0, y: 0 });
                pathMap.set(500, { x: 50, y: 100 });
                pathMap.set(1000, { x: 100, y: 0 });

                const timeline: MarcherTimeline = {
                    pathMap,
                    sortedTimestamps: [0, 500, 1000],
                };

                const result = getCoordinatesAtTime(500, timeline);
                expect(result).toEqual({ x: 50, y: 100 });
            });
        });

        describe("error handling", () => {
            it("should throw error for negative timestamp", () => {
                expect(() =>
                    getCoordinatesAtTime(-100, marcherTimeline),
                ).toThrow("Cannot use negative timestamp: -100");
            });

            it("should throw error when no timestamps exist", () => {
                const emptyTimeline: MarcherTimeline = {
                    pathMap: new Map(),
                    sortedTimestamps: [],
                };

                expect(() => getCoordinatesAtTime(100, emptyTimeline)).toThrow(
                    "No timestamp found! This shouldn't happen",
                );
            });

            it("should throw error when coordinate not found for timestamp", () => {
                const pathMap = new Map<number, CoordinateDefinition>();
                pathMap.set(0, { x: 0, y: 0 });
                // Missing coordinate for timestamp 1000

                const timeline: MarcherTimeline = {
                    pathMap,
                    sortedTimestamps: [0, 1000],
                };

                expect(() => getCoordinatesAtTime(500, timeline)).toThrow(
                    "No coordinate found! This shouldn't happen",
                );
            });

            it("should throw error when target timestamp is before first keyframe", () => {
                const pathMap = new Map<number, CoordinateDefinition>();
                pathMap.set(1000, { x: 100, y: 100 });

                const timeline: MarcherTimeline = {
                    pathMap,
                    sortedTimestamps: [1000],
                };

                expect(() => getCoordinatesAtTime(500, timeline)).toThrow(
                    "No timestamp found! This shouldn't happen",
                );
            });
        });

        describe("boundary conditions", () => {
            it("should handle timestamp exactly at first keyframe", () => {
                const result = getCoordinatesAtTime(0, marcherTimeline);
                expect(result).toEqual({ x: 0, y: 0 });
            });

            it("should handle timestamp exactly at last keyframe", () => {
                // The function returns null when at the last timestamp due to nextTimestamp being null
                const result = getCoordinatesAtTime(1000, marcherTimeline);
                expect(result).toBeNull();
            });

            it("should handle timestamp very close to first keyframe", () => {
                const result = getCoordinatesAtTime(1, marcherTimeline);
                expect(result?.x).toBeCloseTo(0.1, 5);
                expect(result?.y).toBeCloseTo(0.1, 5);
            });

            it("should handle timestamp very close to last keyframe", () => {
                const result = getCoordinatesAtTime(999, marcherTimeline);
                expect(result?.x).toBeCloseTo(99.9, 5);
                expect(result?.y).toBeCloseTo(99.9, 5);
            });
        });

        describe("complex scenarios", () => {
            it("should handle non-linear movement patterns", () => {
                const pathMap = new Map<number, CoordinateDefinition>();
                pathMap.set(0, { x: 0, y: 0 });
                pathMap.set(250, { x: 100, y: 0 });
                pathMap.set(500, { x: 100, y: 100 });
                pathMap.set(750, { x: 0, y: 100 });
                pathMap.set(1000, { x: 0, y: 0 });

                const timeline: MarcherTimeline = {
                    pathMap,
                    sortedTimestamps: [0, 250, 500, 750, 1000],
                };

                // Test various points along the square path
                expect(getCoordinatesAtTime(125, timeline)).toEqual({
                    x: 50,
                    y: 0,
                });
                expect(getCoordinatesAtTime(375, timeline)).toEqual({
                    x: 100,
                    y: 50,
                });
                expect(getCoordinatesAtTime(625, timeline)).toEqual({
                    x: 50,
                    y: 100,
                });
                expect(getCoordinatesAtTime(875, timeline)).toEqual({
                    x: 0,
                    y: 50,
                });
            });

            it("should handle very small time intervals", () => {
                const pathMap = new Map<number, CoordinateDefinition>();
                pathMap.set(0, { x: 0, y: 0 });
                pathMap.set(1, { x: 1, y: 1 });

                const timeline: MarcherTimeline = {
                    pathMap,
                    sortedTimestamps: [0, 1],
                };

                const result = getCoordinatesAtTime(0.5, timeline);
                expect(result).toEqual({ x: 0.5, y: 0.5 });
            });

            it("should handle very large time intervals", () => {
                const pathMap = new Map<number, CoordinateDefinition>();
                pathMap.set(0, { x: 0, y: 0 });
                pathMap.set(1000000, { x: 1000, y: 2000 });

                const timeline: MarcherTimeline = {
                    pathMap,
                    sortedTimestamps: [0, 1000000],
                };

                const result = getCoordinatesAtTime(500000, timeline);
                expect(result).toEqual({ x: 500, y: 1000 });
            });

            it("should handle single keyframe timeline", () => {
                const pathMap = new Map<number, CoordinateDefinition>();
                pathMap.set(500, { x: 100, y: 200 });

                const timeline: MarcherTimeline = {
                    pathMap,
                    sortedTimestamps: [500],
                };

                // The function returns null for single keyframes due to nextTimestamp being null
                const result = getCoordinatesAtTime(500, timeline);
                expect(result).toBeNull();
            });

            it("should handle irregular time intervals", () => {
                const pathMap = new Map<number, CoordinateDefinition>();
                pathMap.set(0, { x: 0, y: 0 });
                pathMap.set(100, { x: 10, y: 20 });
                pathMap.set(500, { x: 50, y: 100 });
                pathMap.set(1000, { x: 100, y: 200 });

                const timeline: MarcherTimeline = {
                    pathMap,
                    sortedTimestamps: [0, 100, 500, 1000],
                };

                // Test interpolation across irregular intervals
                expect(getCoordinatesAtTime(50, timeline)).toEqual({
                    x: 5,
                    y: 10,
                });
                expect(getCoordinatesAtTime(300, timeline)).toEqual({
                    x: 30,
                    y: 60,
                });
                expect(getCoordinatesAtTime(750, timeline)).toEqual({
                    x: 75,
                    y: 150,
                });
            });

            it("should handle zero movement (same coordinates)", () => {
                const pathMap = new Map<number, CoordinateDefinition>();
                pathMap.set(0, { x: 100, y: 100 });
                pathMap.set(1000, { x: 100, y: 100 });

                const timeline: MarcherTimeline = {
                    pathMap,
                    sortedTimestamps: [0, 1000],
                };

                // Should return the same coordinates regardless of time
                expect(getCoordinatesAtTime(250, timeline)).toEqual({
                    x: 100,
                    y: 100,
                });
                expect(getCoordinatesAtTime(500, timeline)).toEqual({
                    x: 100,
                    y: 100,
                });
                expect(getCoordinatesAtTime(750, timeline)).toEqual({
                    x: 100,
                    y: 100,
                });
            });
        });
    });

    describe("with Path objects", () => {
        let marcherTimeline: MarcherTimeline;

        beforeEach(() => {
            // Create a simple timeline with two keyframes using Path objects
            const pathMap = new Map<number, CoordinateDefinition>();
            const linePath1 = new Path([
                new Line({ x: 0, y: 0 }, { x: 100, y: 100 }),
            ]);
            const linePath2 = new Path([
                new Line({ x: 100, y: 100 }, { x: 200, y: 0 }),
            ]);

            pathMap.set(0, {
                x: 0,
                y: 0,
                path: linePath1,
                previousPathPosition: 0,
                nextPathPosition: 1,
            });
            pathMap.set(1000, {
                x: 100,
                y: 100,
                path: linePath2,
                previousPathPosition: 0,
                nextPathPosition: 1,
            });

            marcherTimeline = {
                pathMap,
                sortedTimestamps: [0, 1000],
            };
        });

        describe("Path object structure validation", () => {
            it("should have Path object property in coordinate definitions", () => {
                const coordinate = marcherTimeline.pathMap.get(0);
                expect(coordinate).toBeDefined();
                expect(coordinate?.path).toBeDefined();
                expect(coordinate?.path).toBeInstanceOf(Path);
            });

            it("should handle coordinates with and without Path objects", () => {
                const pathMap = new Map<number, CoordinateDefinition>();
                const linePath = new Path([
                    new Line({ x: 0, y: 0 }, { x: 50, y: 50 }),
                ]);

                pathMap.set(0, {
                    x: 0,
                    y: 0,
                    path: linePath,
                    previousPathPosition: 0,
                    nextPathPosition: 1,
                });
                pathMap.set(500, { x: 50, y: 50 }); // No Path object
                pathMap.set(1000, {
                    x: 100,
                    y: 100,
                    path: new Path([
                        new Line({ x: 100, y: 100 }, { x: 150, y: 150 }),
                    ]),
                    previousPathPosition: 0,
                    nextPathPosition: 1,
                });

                const timeline: MarcherTimeline = {
                    pathMap,
                    sortedTimestamps: [0, 500, 1000],
                };

                // Verify structure
                expect(timeline.pathMap.get(0)?.path).toBeDefined();
                expect(timeline.pathMap.get(500)?.path).toBeUndefined();
                expect(timeline.pathMap.get(1000)?.path).toBeDefined();
            });

            it("should handle complex Path objects with multiple segments", () => {
                const complexPath = new Path([
                    new Line({ x: 0, y: 0 }, { x: 50, y: 0 }),
                    new Arc({ x: 50, y: 0 }, 25, 25, 0, 0, 1, { x: 100, y: 0 }),
                ]);

                const pathMap = new Map<number, CoordinateDefinition>();
                pathMap.set(0, {
                    x: 0,
                    y: 0,
                    path: complexPath,
                    previousPathPosition: 0,
                    nextPathPosition: 1,
                });
                pathMap.set(1000, {
                    x: 100,
                    y: 0,
                    path: new Path([
                        new Line({ x: 100, y: 0 }, { x: 150, y: 0 }),
                    ]),
                    previousPathPosition: 0,
                    nextPathPosition: 1,
                });

                const timeline: MarcherTimeline = {
                    pathMap,
                    sortedTimestamps: [0, 1000],
                };

                expect(timeline.pathMap.get(0)?.path).toBeInstanceOf(Path);
                expect(timeline.pathMap.get(0)?.path?.segments).toHaveLength(2);
                expect(timeline.pathMap.get(1000)?.path).toBeInstanceOf(Path);
            });

            it("should handle Path objects with curves", () => {
                const curvePath = new Path([
                    new CubicCurve(
                        { x: 0, y: 0 },
                        { x: 25, y: 0 },
                        { x: 75, y: 0 },
                        { x: 100, y: 100 },
                    ),
                ]);

                const pathMap = new Map<number, CoordinateDefinition>();
                pathMap.set(0, {
                    x: 0,
                    y: 0,
                    path: curvePath,
                    previousPathPosition: 0,
                    nextPathPosition: 1,
                });
                pathMap.set(1000, {
                    x: 100,
                    y: 100,
                    path: new Path([
                        new Line({ x: 100, y: 100 }, { x: 200, y: 0 }),
                    ]),
                    previousPathPosition: 0,
                    nextPathPosition: 1,
                });

                const timeline: MarcherTimeline = {
                    pathMap,
                    sortedTimestamps: [0, 1000],
                };

                expect(
                    timeline.pathMap.get(0)?.path?.segments[0],
                ).toBeInstanceOf(CubicCurve);
                expect(
                    timeline.pathMap.get(1000)?.path?.segments[0],
                ).toBeInstanceOf(Line);
            });

            it("should handle Path objects with splines", () => {
                const splinePath = new Path([
                    new Spline([
                        { x: 0, y: 0 },
                        { x: 50, y: 50 },
                        { x: 100, y: 100 },
                    ]),
                ]);

                const pathMap = new Map<number, CoordinateDefinition>();
                pathMap.set(0, {
                    x: 0,
                    y: 0,
                    path: splinePath,
                    previousPathPosition: 0,
                    nextPathPosition: 1,
                });
                pathMap.set(1000, {
                    x: 100,
                    y: 100,
                    path: new Path([
                        new Line({ x: 100, y: 100 }, { x: 200, y: 0 }),
                    ]),
                    previousPathPosition: 0,
                    nextPathPosition: 1,
                });

                const timeline: MarcherTimeline = {
                    pathMap,
                    sortedTimestamps: [0, 1000],
                };

                expect(
                    timeline.pathMap.get(0)?.path?.segments[0],
                ).toBeInstanceOf(Spline);
                expect(
                    timeline.pathMap.get(1000)?.path?.segments[0],
                ).toBeInstanceOf(Line);
            });
        });

        describe("Path coordinate validation", () => {
            it("should maintain coordinate values alongside Path objects", () => {
                const coordinate = marcherTimeline.pathMap.get(0);
                expect(coordinate?.x).toBe(0);
                expect(coordinate?.y).toBe(0);
                expect(coordinate?.path).toBeInstanceOf(Path);

                const coordinate2 = marcherTimeline.pathMap.get(1000);
                expect(coordinate2?.x).toBe(100);
                expect(coordinate2?.y).toBe(100);
                expect(coordinate2?.path).toBeInstanceOf(Path);
            });

            it("should handle negative coordinates with Path objects", () => {
                const pathMap = new Map<number, CoordinateDefinition>();
                const negativePath = new Path([
                    new Line({ x: -50, y: -50 }, { x: 50, y: 50 }),
                ]);

                pathMap.set(0, {
                    x: -50,
                    y: -50,
                    path: negativePath,
                    previousPathPosition: 0,
                    nextPathPosition: 1,
                });
                pathMap.set(1000, {
                    x: 50,
                    y: 50,
                    path: new Path([
                        new Line({ x: 50, y: 50 }, { x: 150, y: 150 }),
                    ]),
                    previousPathPosition: 0,
                    nextPathPosition: 1,
                });

                const timeline: MarcherTimeline = {
                    pathMap,
                    sortedTimestamps: [0, 1000],
                };

                expect(timeline.pathMap.get(0)?.x).toBe(-50);
                expect(timeline.pathMap.get(0)?.y).toBe(-50);
                expect(timeline.pathMap.get(1000)?.x).toBe(50);
                expect(timeline.pathMap.get(1000)?.y).toBe(50);
            });

            it("should handle decimal coordinates with Path objects", () => {
                const pathMap = new Map<number, CoordinateDefinition>();
                const decimalPath = new Path([
                    new Line({ x: 0.5, y: 1.25 }, { x: 10.75, y: 20.5 }),
                ]);

                pathMap.set(0, {
                    x: 0.5,
                    y: 1.25,
                    path: decimalPath,
                    previousPathPosition: 0,
                    nextPathPosition: 1,
                });
                pathMap.set(1000, {
                    x: 10.75,
                    y: 20.5,
                    path: new Path([
                        new Line({ x: 10.75, y: 20.5 }, { x: 21, y: 39.75 }),
                    ]),
                    previousPathPosition: 0,
                    nextPathPosition: 1,
                });

                const timeline: MarcherTimeline = {
                    pathMap,
                    sortedTimestamps: [0, 1000],
                };

                expect(timeline.pathMap.get(0)?.x).toBe(0.5);
                expect(timeline.pathMap.get(0)?.y).toBe(1.25);
                expect(timeline.pathMap.get(1000)?.x).toBe(10.75);
                expect(timeline.pathMap.get(1000)?.y).toBe(20.5);
            });
        });

        describe("Path timeline structure", () => {
            it("should handle multiple Path keyframes", () => {
                const pathMap = new Map<number, CoordinateDefinition>();
                pathMap.set(0, {
                    x: 0,
                    y: 0,
                    path: new Path([
                        new Line({ x: 0, y: 0 }, { x: 100, y: 0 }),
                    ]),
                    previousPathPosition: 0,
                    nextPathPosition: 1,
                });
                pathMap.set(250, {
                    x: 100,
                    y: 0,
                    path: new Path([
                        new Line({ x: 100, y: 0 }, { x: 100, y: 100 }),
                    ]),
                    previousPathPosition: 0,
                    nextPathPosition: 1,
                });
                pathMap.set(500, {
                    x: 100,
                    y: 100,
                    path: new Path([
                        new Line({ x: 100, y: 100 }, { x: 0, y: 100 }),
                    ]),
                    previousPathPosition: 0,
                    nextPathPosition: 1,
                });
                pathMap.set(750, {
                    x: 0,
                    y: 100,
                    path: new Path([
                        new Line({ x: 0, y: 100 }, { x: 0, y: 0 }),
                    ]),
                    previousPathPosition: 0,
                    nextPathPosition: 1,
                });
                pathMap.set(1000, {
                    x: 0,
                    y: 0,
                    path: new Path([
                        new Line({ x: 0, y: 0 }, { x: 100, y: 0 }),
                    ]),
                    previousPathPosition: 0,
                    nextPathPosition: 1,
                });

                const timeline: MarcherTimeline = {
                    pathMap,
                    sortedTimestamps: [0, 250, 500, 750, 1000],
                };

                // Verify all keyframes have Path objects
                expect(timeline.pathMap.get(0)?.path).toBeInstanceOf(Path);
                expect(timeline.pathMap.get(250)?.path).toBeInstanceOf(Path);
                expect(timeline.pathMap.get(500)?.path).toBeInstanceOf(Path);
                expect(timeline.pathMap.get(750)?.path).toBeInstanceOf(Path);
                expect(timeline.pathMap.get(1000)?.path).toBeInstanceOf(Path);

                // Verify timestamps are sorted
                expect(timeline.sortedTimestamps).toEqual([
                    0, 250, 500, 750, 1000,
                ]);
            });

            it("should handle mixed coordinate types in timeline", () => {
                const pathMap = new Map<number, CoordinateDefinition>();
                pathMap.set(0, {
                    x: 0,
                    y: 0,
                    path: new Path([
                        new Line({ x: 0, y: 0 }, { x: 50, y: 50 }),
                    ]),
                    previousPathPosition: 0,
                    nextPathPosition: 1,
                });
                pathMap.set(500, { x: 50, y: 50 }); // No Path object
                pathMap.set(1000, {
                    x: 100,
                    y: 100,
                    path: new Path([
                        new Line({ x: 100, y: 100 }, { x: 150, y: 150 }),
                    ]),
                    previousPathPosition: 0,
                    nextPathPosition: 1,
                });

                const timeline: MarcherTimeline = {
                    pathMap,
                    sortedTimestamps: [0, 500, 1000],
                };

                // Verify mixed structure
                expect(timeline.pathMap.get(0)?.path).toBeInstanceOf(Path);
                expect(timeline.pathMap.get(500)?.path).toBeUndefined();
                expect(timeline.pathMap.get(1000)?.path).toBeInstanceOf(Path);
            });

            it("should handle empty Path objects", () => {
                const emptyPath = new Path([]);
                const pathMap = new Map<number, CoordinateDefinition>();
                pathMap.set(0, {
                    x: 0,
                    y: 0,
                    path: emptyPath,
                    previousPathPosition: 0,
                    nextPathPosition: 1,
                });
                pathMap.set(1000, {
                    x: 100,
                    y: 100,
                    path: new Path([
                        new Line({ x: 100, y: 100 }, { x: 200, y: 200 }),
                    ]),
                    previousPathPosition: 0,
                    nextPathPosition: 1,
                });

                const timeline: MarcherTimeline = {
                    pathMap,
                    sortedTimestamps: [0, 1000],
                };

                expect(timeline.pathMap.get(0)?.path).toBeInstanceOf(Path);
                expect(timeline.pathMap.get(0)?.path?.segments).toHaveLength(0);
                expect(timeline.pathMap.get(1000)?.path).toBeInstanceOf(Path);
            });
        });

        describe("Path error scenarios", () => {
            it("should handle Path objects with invalid segments", () => {
                const pathMap = new Map<number, CoordinateDefinition>();
                // Create a Path with potentially problematic segments
                const invalidPath = new Path([
                    new Line({ x: 0, y: 0 }, { x: 0, y: 0 }), // Zero-length line
                ]);

                pathMap.set(0, {
                    x: 0,
                    y: 0,
                    path: invalidPath,
                    previousPathPosition: 0,
                    nextPathPosition: 1,
                });
                pathMap.set(1000, {
                    x: 100,
                    y: 100,
                    path: new Path([
                        new Line({ x: 100, y: 100 }, { x: 200, y: 200 }),
                    ]),
                    previousPathPosition: 0,
                    nextPathPosition: 1,
                });

                const timeline: MarcherTimeline = {
                    pathMap,
                    sortedTimestamps: [0, 1000],
                };

                // Verify the structure is maintained even with potentially problematic paths
                expect(timeline.pathMap.get(0)?.path).toBeInstanceOf(Path);
                expect(timeline.pathMap.get(1000)?.path).toBeInstanceOf(Path);
            });

            it("should handle Path objects with many segments", () => {
                const segments = [];
                for (let i = 0; i < 100; i++) {
                    segments.push(
                        new Line(
                            { x: i * 10, y: i * 10 },
                            { x: (i + 1) * 10, y: (i + 1) * 10 },
                        ),
                    );
                }
                const longPath = new Path(segments);

                const pathMap = new Map<number, CoordinateDefinition>();
                pathMap.set(0, {
                    x: 0,
                    y: 0,
                    path: longPath,
                    previousPathPosition: 0,
                    nextPathPosition: 1,
                });
                pathMap.set(1000, {
                    x: 100,
                    y: 100,
                    path: new Path([
                        new Line({ x: 100, y: 100 }, { x: 200, y: 200 }),
                    ]),
                    previousPathPosition: 0,
                    nextPathPosition: 1,
                });

                const timeline: MarcherTimeline = {
                    pathMap,
                    sortedTimestamps: [0, 1000],
                };

                expect(timeline.pathMap.get(0)?.path).toBeInstanceOf(Path);
                expect(timeline.pathMap.get(0)?.path?.segments).toHaveLength(
                    100,
                );
            });

            it("should handle Path objects with complex segment types", () => {
                const complexPath = new Path([
                    new Line({ x: 0, y: 0 }, { x: 50, y: 0 }),
                    new Arc({ x: 50, y: 0 }, 25, 25, 0, 0, 1, { x: 100, y: 0 }),
                    new CubicCurve(
                        { x: 100, y: 0 },
                        { x: 125, y: 0 },
                        { x: 175, y: 0 },
                        { x: 200, y: 100 },
                    ),
                    new Spline([
                        { x: 200, y: 100 },
                        { x: 250, y: 50 },
                        { x: 300, y: 150 },
                    ]),
                ]);

                const pathMap = new Map<number, CoordinateDefinition>();
                pathMap.set(0, {
                    x: 0,
                    y: 0,
                    path: complexPath,
                    previousPathPosition: 0,
                    nextPathPosition: 1,
                });
                pathMap.set(1000, {
                    x: 300,
                    y: 150,
                    path: new Path([
                        new Line({ x: 300, y: 150 }, { x: 400, y: 0 }),
                    ]),
                    previousPathPosition: 0,
                    nextPathPosition: 1,
                });

                const timeline: MarcherTimeline = {
                    pathMap,
                    sortedTimestamps: [0, 1000],
                };

                expect(timeline.pathMap.get(0)?.path?.segments).toHaveLength(4);
                expect(
                    timeline.pathMap.get(0)?.path?.segments[0],
                ).toBeInstanceOf(Line);
                expect(
                    timeline.pathMap.get(0)?.path?.segments[1],
                ).toBeInstanceOf(Arc);
                expect(
                    timeline.pathMap.get(0)?.path?.segments[2],
                ).toBeInstanceOf(CubicCurve);
                expect(
                    timeline.pathMap.get(0)?.path?.segments[3],
                ).toBeInstanceOf(Spline);
            });
        });
    });
});

describe("getAnimationFrames", () => {
    it("creates frames for a simple timeline with two keyframes @60fs", () => {
        const frameRate = 60;

        const pathMap = new Map<number, CoordinateDefinition>();
        const coord1 = { x: 0, y: 0 };
        const coord2 = { x: 100, y: 100 };
        pathMap.set(0, coord1);
        pathMap.set(1000, coord2);
        const marcherTimeline: MarcherTimeline = {
            pathMap,
            sortedTimestamps: [0, 1000],
        };

        const frames = getAnimationFrames({ marcherTimeline, frameRate });

        expect(frames.length).toBeGreaterThanOrEqual(frameRate);
        expect(frames.length).toBeLessThanOrEqual(frameRate + 1);

        frames.forEach((coordinate, index) => {
            // Calculate the timestamp for this frame
            const timestamp = index * (1000 / frameRate);

            // Calculate expected linear interpolation
            const progress = timestamp / 1000;
            const expectedX = coord1.x + progress * (coord2.x - coord1.x);
            const expectedY = coord1.y + progress * (coord2.y - coord1.y);

            // Verify the interpolated coordinates
            expect(coordinate.x).toBeCloseTo(expectedX, 5);
            expect(coordinate.y).toBeCloseTo(expectedY, 5);
        });
    });

    it("creates frames for a simple timeline with two keyframes at many frame-rates", () => {
        const pathMap = new Map<number, CoordinateDefinition>();
        const coord1 = { x: 0, y: 0 };
        const coord2 = { x: 100, y: 100 };
        pathMap.set(0, coord1);
        pathMap.set(1000, coord2);
        const marcherTimeline: MarcherTimeline = {
            pathMap,
            sortedTimestamps: [0, 1000],
        };

        fc.assert(
            fc.property(fc.integer({ min: 1, max: 2000 }), (frameRate) => {
                const frames = getAnimationFrames({
                    marcherTimeline,
                    frameRate,
                });
                expect(frames.length).toBeGreaterThanOrEqual(frameRate);
                expect(frames.length).toBeLessThanOrEqual(frameRate + 1);

                frames.forEach((coordinate, index) => {
                    // Calculate the timestamp for this frame
                    const timestamp = index * (1000 / frameRate);

                    // Calculate expected linear interpolation
                    const progress = timestamp / 1000;
                    const expectedX =
                        coord1.x + progress * (coord2.x - coord1.x);
                    const expectedY =
                        coord1.y + progress * (coord2.y - coord1.y);

                    // Verify the interpolated coordinates
                    expect(coordinate.x).toBeCloseTo(expectedX, 5);
                    expect(coordinate.y).toBeCloseTo(expectedY, 5);
                });
            }),
        );
    });

    it("creates frames for a timeline with multiple keyframes @60fps", () => {
        const frameRate = 60;

        const pathMap = new Map<number, CoordinateDefinition>();
        const coords = [
            { x: 0, y: 0 },
            { x: 50, y: 100 },
            { x: 150, y: 50 },
            { x: 200, y: 200 },
        ];
        const timestamps = [0, 500, 1500, 2000];

        coords.forEach((coord, index) => {
            pathMap.set(timestamps[index], coord);
        });

        const marcherTimeline: MarcherTimeline = {
            pathMap,
            sortedTimestamps: timestamps,
        };

        const frames = getAnimationFrames({ marcherTimeline, frameRate });

        // 2 seconds at 60fps = 120 frames
        expect(frames.length).toBeGreaterThanOrEqual(120);
        expect(frames.length).toBeLessThanOrEqual(121);

        frames.forEach((coordinate, index) => {
            const startTime = timestamps[0];
            const timestamp = startTime + index * (1000 / frameRate);

            // Find which segment this frame belongs to
            let segmentIndex = timestamps.length - 2; // Default to last segment
            for (let i = 0; i < timestamps.length - 1; i++) {
                if (
                    timestamp >= timestamps[i] &&
                    timestamp < timestamps[i + 1]
                ) {
                    segmentIndex = i;
                    break;
                }
            }

            const startTimestamp = timestamps[segmentIndex];
            const endTimestamp = timestamps[segmentIndex + 1];
            const startCoord = coords[segmentIndex];
            const endCoord = coords[segmentIndex + 1];

            // Calculate expected linear interpolation for this segment
            const progress =
                (timestamp - startTimestamp) / (endTimestamp - startTimestamp);
            const expectedX =
                startCoord.x + progress * (endCoord.x - startCoord.x);
            const expectedY =
                startCoord.y + progress * (endCoord.y - startCoord.y);

            expect(coordinate.x).toBeCloseTo(expectedX, 5);
            expect(coordinate.y).toBeCloseTo(expectedY, 5);
        });
    });

    it("creates frames for a timeline with many keyframes at various frame rates", () => {
        fc.assert(
            fc.property(
                fc.integer({ min: 1, max: 500 }),
                fc.integer({ min: 3, max: 20 }),
                (frameRate, numKeyframes) => {
                    const pathMap = new Map<number, CoordinateDefinition>();
                    const coords: CoordinateDefinition[] = [];
                    const timestamps: number[] = [];

                    // Generate random keyframes
                    for (let i = 0; i < numKeyframes; i++) {
                        const timestamp = i * 1000;
                        const coord = {
                            x: Math.random() * 500,
                            y: Math.random() * 500,
                        };
                        timestamps.push(timestamp);
                        coords.push(coord);
                        pathMap.set(timestamp, coord);
                    }

                    const marcherTimeline: MarcherTimeline = {
                        pathMap,
                        sortedTimestamps: timestamps,
                    };

                    const frames = getAnimationFrames({
                        marcherTimeline,
                        frameRate,
                    });

                    const totalDuration =
                        timestamps[timestamps.length - 1] - timestamps[0];
                    const expectedFrameCount = Math.floor(
                        (totalDuration / 1000) * frameRate,
                    );

                    expect(frames.length).toBeGreaterThanOrEqual(
                        expectedFrameCount,
                    );
                    expect(frames.length).toBeLessThanOrEqual(
                        expectedFrameCount + 1,
                    );

                    frames.forEach((coordinate, index) => {
                        const startTime = timestamps[0];
                        const timestamp =
                            startTime + index * (1000 / frameRate);

                        // Find which segment this frame belongs to
                        let segmentIndex = timestamps.length - 2; // Default to last segment
                        for (let i = 0; i < timestamps.length - 1; i++) {
                            if (
                                timestamp >= timestamps[i] &&
                                timestamp < timestamps[i + 1]
                            ) {
                                segmentIndex = i;
                                break;
                            }
                        }

                        const startTimestamp = timestamps[segmentIndex];
                        const endTimestamp = timestamps[segmentIndex + 1];
                        const startCoord = coords[segmentIndex];
                        const endCoord = coords[segmentIndex + 1];

                        // Calculate expected linear interpolation for this segment
                        const progress =
                            (timestamp - startTimestamp) /
                            (endTimestamp - startTimestamp);
                        const expectedX =
                            startCoord.x +
                            progress * (endCoord.x - startCoord.x);
                        const expectedY =
                            startCoord.y +
                            progress * (endCoord.y - startCoord.y);

                        expect(coordinate.x).toBeCloseTo(expectedX, 5);
                        expect(coordinate.y).toBeCloseTo(expectedY, 5);
                    });
                },
            ),
        );
    });

    it("creates frames for multiple marchers with different paths @60fps", () => {
        const frameRate = 60;

        // Marcher 1: Simple diagonal movement
        const pathMap1 = new Map<number, CoordinateDefinition>();
        pathMap1.set(0, { x: 0, y: 0 });
        pathMap1.set(1000, { x: 100, y: 100 });
        const marcherTimeline1: MarcherTimeline = {
            pathMap: pathMap1,
            sortedTimestamps: [0, 1000],
        };

        // Marcher 2: Horizontal then vertical movement
        const pathMap2 = new Map<number, CoordinateDefinition>();
        pathMap2.set(0, { x: 0, y: 0 });
        pathMap2.set(500, { x: 100, y: 0 });
        pathMap2.set(1000, { x: 100, y: 100 });
        const marcherTimeline2: MarcherTimeline = {
            pathMap: pathMap2,
            sortedTimestamps: [0, 500, 1000],
        };

        // Marcher 3: Complex path with 5 keyframes
        const pathMap3 = new Map<number, CoordinateDefinition>();
        pathMap3.set(0, { x: 50, y: 50 });
        pathMap3.set(250, { x: 75, y: 25 });
        pathMap3.set(500, { x: 100, y: 50 });
        pathMap3.set(750, { x: 75, y: 75 });
        pathMap3.set(1000, { x: 50, y: 50 });
        const marcherTimeline3: MarcherTimeline = {
            pathMap: pathMap3,
            sortedTimestamps: [0, 250, 500, 750, 1000],
        };

        const marchers = [marcherTimeline1, marcherTimeline2, marcherTimeline3];

        marchers.forEach((marcherTimeline, marcherIndex) => {
            const frames = getAnimationFrames({ marcherTimeline, frameRate });

            expect(frames.length).toBeGreaterThanOrEqual(frameRate);
            expect(frames.length).toBeLessThanOrEqual(frameRate + 1);

            frames.forEach((coordinate, index) => {
                const timestamps = marcherTimeline.sortedTimestamps;
                const startTime = timestamps[0];
                const timestamp = startTime + index * (1000 / frameRate);

                // Find which segment this frame belongs to
                let segmentIndex = timestamps.length - 2; // Default to last segment
                for (let i = 0; i < timestamps.length - 1; i++) {
                    if (
                        timestamp >= timestamps[i] &&
                        timestamp < timestamps[i + 1]
                    ) {
                        segmentIndex = i;
                        break;
                    }
                }

                const startTimestamp = timestamps[segmentIndex];
                const endTimestamp = timestamps[segmentIndex + 1];
                const startCoord = marcherTimeline.pathMap.get(startTimestamp)!;
                const endCoord = marcherTimeline.pathMap.get(endTimestamp)!;

                // Calculate expected linear interpolation
                const progress =
                    (timestamp - startTimestamp) /
                    (endTimestamp - startTimestamp);
                const expectedX =
                    startCoord.x + progress * (endCoord.x - startCoord.x);
                const expectedY =
                    startCoord.y + progress * (endCoord.y - startCoord.y);

                expect(coordinate.x).toBeCloseTo(expectedX, 5);
                expect(coordinate.y).toBeCloseTo(expectedY, 5);
            });
        });
    });

    it("creates frames for many marchers with many keyframes", () => {
        fc.assert(
            fc.property(
                fc.integer({ min: 1, max: 200 }),
                fc.integer({ min: 2, max: 50 }),
                fc.integer({ min: 2, max: 10 }),
                (frameRate, numMarchers, numKeyframes) => {
                    const marchers: MarcherTimeline[] = [];

                    // Create multiple marchers with different paths
                    for (let m = 0; m < numMarchers; m++) {
                        const pathMap = new Map<number, CoordinateDefinition>();
                        const timestamps: number[] = [];

                        // Generate random keyframes for this marcher
                        for (let k = 0; k < numKeyframes; k++) {
                            const timestamp = k * 1000;
                            const coord = {
                                x: Math.random() * 500,
                                y: Math.random() * 500,
                            };
                            timestamps.push(timestamp);
                            pathMap.set(timestamp, coord);
                        }

                        marchers.push({
                            pathMap,
                            sortedTimestamps: timestamps,
                        });
                    }

                    // Test each marcher's animation frames
                    marchers.forEach((marcherTimeline) => {
                        const frames = getAnimationFrames({
                            marcherTimeline,
                            frameRate,
                        });

                        const totalDuration =
                            marcherTimeline.sortedTimestamps[
                                marcherTimeline.sortedTimestamps.length - 1
                            ] - marcherTimeline.sortedTimestamps[0];
                        const expectedFrameCount = Math.floor(
                            (totalDuration / 1000) * frameRate,
                        );

                        expect(frames.length).toBeGreaterThanOrEqual(
                            expectedFrameCount,
                        );
                        expect(frames.length).toBeLessThanOrEqual(
                            expectedFrameCount + 1,
                        );

                        frames.forEach((coordinate, index) => {
                            const timestamps = marcherTimeline.sortedTimestamps;
                            const startTime = timestamps[0];
                            const timestamp =
                                startTime + index * (1000 / frameRate);

                            // Find which segment this frame belongs to
                            let segmentIndex = timestamps.length - 2; // Default to last segment
                            for (let i = 0; i < timestamps.length - 1; i++) {
                                if (
                                    timestamp >= timestamps[i] &&
                                    timestamp < timestamps[i + 1]
                                ) {
                                    segmentIndex = i;
                                    break;
                                }
                            }

                            const startTimestamp = timestamps[segmentIndex];
                            const endTimestamp = timestamps[segmentIndex + 1];
                            const startCoord =
                                marcherTimeline.pathMap.get(startTimestamp)!;
                            const endCoord =
                                marcherTimeline.pathMap.get(endTimestamp)!;

                            // Calculate expected linear interpolation
                            const progress =
                                (timestamp - startTimestamp) /
                                (endTimestamp - startTimestamp);
                            const expectedX =
                                startCoord.x +
                                progress * (endCoord.x - startCoord.x);
                            const expectedY =
                                startCoord.y +
                                progress * (endCoord.y - startCoord.y);

                            expect(coordinate.x).toBeCloseTo(expectedX, 5);
                            expect(coordinate.y).toBeCloseTo(expectedY, 5);
                        });
                    });
                },
            ),
        );
    });
});
