import { beforeEach, describe, expect, it, vi } from "vitest";
import {
    getStrongBeatIndexes,
    _newAndUpdatedBeatsFromTempoGroup,
    TempoGroupsFromMeasures,
    getNewMeasuresFromCreatedBeats,
    getLastBeatOfTempoGroup,
    TempoGroup,
    tempoGroupForNoMeasures,
    _lastMeasureIsGhost,
    ExistingItems,
} from "../TempoGroup/TempoGroup";
import type Measure from "../../../global/classes/Measure";
import { measureIsMixedMeter } from "../TempoGroup/TempoGroup";
import type Beat from "../../../global/classes/Beat";
import { measureIsSameTempo } from "../TempoGroup/TempoGroup";
import { measureHasOneTempo } from "../TempoGroup/TempoGroup";
import { NewBeatArgs } from "@/db-functions";
import { faker } from "@faker-js/faker";
import { SEED_AMOUNT, seedObj } from "@/test/base";
import fc from "fast-check";

describe("TempoGroupsFromMeasures", () => {
    describe("real tempo groups", () => {
        // Helper function to create a mock beat
        const createMockBeat = (duration: number): Beat => ({
            id: Math.random(),
            position: Math.random(),
            duration,
            includeInMeasure: true,
            notes: null,
            index: Math.random(),
            timestamp: Math.random(),
        });

        // Helper function to create a mock measure
        const createMockMeasure = ({
            beats,
            rehearsalMark = null,
            number = 1,
            id = Math.random(),
        }: {
            beats: Beat[];
            rehearsalMark?: string | null;
            number?: number;
            id?: number;
        }): Measure => ({
            id,
            startBeat: beats[0],
            number,
            rehearsalMark,
            notes: null,
            duration: beats.reduce((sum, beat) => sum + beat.duration, 0),
            counts: beats.length,
            beats,
            timestamp: Math.random(),
            isGhost: false,
        });

        it("should return empty array for empty input", () => {
            expect(TempoGroupsFromMeasures([])).toEqual([]);
        });

        it("should create single group for measures with same tempo and beats", () => {
            const measures = [
                createMockMeasure({
                    beats: [createMockBeat(0.5), createMockBeat(0.5)],
                    rehearsalMark: "A",
                    number: 1,
                    id: 1,
                }),
                createMockMeasure({
                    beats: [createMockBeat(0.5), createMockBeat(0.5)],
                    number: 2,
                    id: 2,
                }),
            ];

            const result = TempoGroupsFromMeasures(measures);

            expect(result).toHaveLength(1);
            expect(result[0]).toEqual({
                type: "real",
                name: "A",
                tempo: 120, // 60/0.5
                bigBeatsPerMeasure: 2,
                numOfRepeats: 2,
                strongBeatIndexes: undefined,
                measureRangeString: "m 1-2",
                measures: measures,
            });
        });

        it("should create new group when rehearsal mark is present", () => {
            const measures = [
                createMockMeasure({
                    beats: [createMockBeat(0.5), createMockBeat(0.5)],
                    number: 1,
                    id: 1,
                }),
                createMockMeasure({
                    beats: [createMockBeat(0.5), createMockBeat(0.5)],
                    rehearsalMark: "A",
                    number: 2,
                    id: 2,
                }),
            ];

            const result = TempoGroupsFromMeasures(measures);

            expect(result).toHaveLength(2);
            expect(result[0]).toEqual({
                type: "real",
                name: "",
                tempo: 120,
                bigBeatsPerMeasure: 2,
                numOfRepeats: 1,
                strongBeatIndexes: undefined,
                measureRangeString: "m 1",
                measures: [measures[0]],
            });
            expect(result[1]).toEqual({
                type: "real",
                name: "A",
                tempo: 120,
                bigBeatsPerMeasure: 2,
                numOfRepeats: 1,
                strongBeatIndexes: undefined,
                measureRangeString: "m 2",
                measures: [measures[1]],
            });
        });

        it("should create new group when number of beats changes", () => {
            const measures = [
                createMockMeasure({
                    beats: [createMockBeat(0.5), createMockBeat(0.5)],
                    number: 1,
                    id: 1,
                }),
                createMockMeasure({
                    beats: [
                        createMockBeat(0.5),
                        createMockBeat(0.5),
                        createMockBeat(0.5),
                    ],
                    number: 2,
                    id: 2,
                }),
            ];

            const result = TempoGroupsFromMeasures(measures);

            expect(result).toHaveLength(2);
            expect(result[0]).toEqual({
                type: "real",
                name: "",
                tempo: 120,
                bigBeatsPerMeasure: 2,
                numOfRepeats: 1,
                strongBeatIndexes: undefined,
                measureRangeString: "m 1",
                measures: [measures[0]],
            });
            expect(result[1]).toEqual({
                type: "real",
                name: "",
                tempo: 120,
                bigBeatsPerMeasure: 3,
                numOfRepeats: 1,
                strongBeatIndexes: undefined,
                measureRangeString: "m 2",
                measures: [measures[1]],
            });
        });

        it("should create new group when tempo changes between measures", () => {
            const measures = [
                createMockMeasure({
                    beats: [createMockBeat(0.5), createMockBeat(0.5)],
                    number: 1,
                    id: 1,
                }),
                createMockMeasure({
                    beats: [createMockBeat(0.4), createMockBeat(0.4)],
                    number: 2,
                    id: 2,
                }),
            ];

            const result = TempoGroupsFromMeasures(measures);

            expect(result).toHaveLength(2);
            expect(result[0]).toEqual({
                type: "real",
                name: "",
                tempo: 120,
                bigBeatsPerMeasure: 2,
                numOfRepeats: 1,
                strongBeatIndexes: undefined,
                measureRangeString: "m 1",
                measures: [measures[0]],
            });
            expect(result[1]).toEqual({
                type: "real",
                name: "",
                tempo: 150, // 60/0.4
                bigBeatsPerMeasure: 2,
                numOfRepeats: 1,
                strongBeatIndexes: undefined,
                measureRangeString: "m 2",
                measures: [measures[1]],
            });
        });

        it("should handle accelerando within a measure", () => {
            const measures = [
                createMockMeasure({
                    beats: [createMockBeat(0.5), createMockBeat(0.5)],
                    number: 1,
                    id: 1,
                }),
                createMockMeasure({
                    beats: [createMockBeat(0.5), createMockBeat(0.4)],
                    number: 2,
                    id: 2,
                }),
            ];

            const result = TempoGroupsFromMeasures(measures);

            expect(result).toHaveLength(2);
            expect(result[0]).toEqual({
                type: "real",
                name: "",
                tempo: 120,
                bigBeatsPerMeasure: 2,
                numOfRepeats: 1,
                strongBeatIndexes: undefined,
                measureRangeString: "m 1",
                measures: [measures[0]],
            });
            expect(result[1]).toEqual({
                type: "real",
                name: "",
                tempo: 120,
                bigBeatsPerMeasure: 2,
                numOfRepeats: 1,
                strongBeatIndexes: undefined,
                manualTempos: [120, 150],
                measureRangeString: "m 2",
                measures: [measures[1]],
            });
        });

        it("should handle ritardando within a measure", () => {
            const measures = [
                createMockMeasure({
                    beats: [createMockBeat(0.5), createMockBeat(0.6)],
                    number: 1,
                    id: 1,
                }),
            ];

            const result = TempoGroupsFromMeasures(measures);

            expect(result).toHaveLength(1);
            expect(result[0]).toEqual({
                type: "real",
                name: "",
                tempo: 120,
                manualTempos: [120, 100],
                bigBeatsPerMeasure: 2,
                numOfRepeats: 1,
                strongBeatIndexes: undefined,
                measureRangeString: "m 1",
                measures: [measures[0]],
            });
        });

        it("should handle multiple tempo changes and rehearsal marks", () => {
            const measures = [
                createMockMeasure({
                    beats: [createMockBeat(0.5), createMockBeat(0.5)],
                    number: 1,
                    id: 1,
                }),
                createMockMeasure({
                    beats: [createMockBeat(0.4), createMockBeat(0.4)],
                    rehearsalMark: "A",
                    number: 2,
                    id: 2,
                }),
                createMockMeasure({
                    beats: [createMockBeat(0.4), createMockBeat(0.4)],
                    number: 3,
                    id: 3,
                }),
                createMockMeasure({
                    beats: [createMockBeat(0.4), createMockBeat(0.3)],
                    number: 4,
                    id: 4,
                }),
                createMockMeasure({
                    beats: [createMockBeat(0.3), createMockBeat(0.3)],
                    rehearsalMark: "B",
                    number: 5,
                    id: 5,
                }),
                createMockMeasure({
                    beats: [createMockBeat(0.3), createMockBeat(0.3)],
                    number: 6,
                    id: 6,
                }),
                createMockMeasure({
                    beats: [createMockBeat(0.3), createMockBeat(0.3)],
                    number: 7,
                    id: 7,
                }),
            ];

            const result = TempoGroupsFromMeasures(measures);

            expect(result).toHaveLength(4);
            expect(result[0]).toEqual({
                type: "real",
                name: "",
                tempo: 120,
                bigBeatsPerMeasure: 2,
                numOfRepeats: 1,
                strongBeatIndexes: undefined,
                measureRangeString: "m 1",
                measures: [measures[0]],
            });
            expect(result[1]).toEqual({
                type: "real",
                name: "A",
                tempo: 150,
                bigBeatsPerMeasure: 2,
                numOfRepeats: 2,
                strongBeatIndexes: undefined,
                measureRangeString: "m 2-3",
                measures: [measures[1], measures[2]],
            });
            expect(result[2]).toEqual({
                type: "real",
                name: "",
                tempo: 150,
                manualTempos: [150, 200],
                bigBeatsPerMeasure: 2,
                numOfRepeats: 1,
                strongBeatIndexes: undefined,
                measureRangeString: "m 4",
                measures: [measures[3]],
            });
            expect(result[3]).toEqual({
                type: "real",
                name: "B",
                tempo: 200,
                bigBeatsPerMeasure: 2,
                numOfRepeats: 3,
                strongBeatIndexes: undefined,
                measureRangeString: "m 5-7",
                measures: [measures[4], measures[5], measures[6]],
            });
        });

        it("should handle gradual tempo changes across multiple beats", () => {
            const measures = [
                createMockMeasure({
                    beats: [
                        createMockBeat(0.6),
                        createMockBeat(0.45),
                        createMockBeat(0.36),
                    ],
                    number: 1,
                }),
                createMockMeasure({
                    beats: [
                        createMockBeat(0.3),
                        createMockBeat(0.3),
                        createMockBeat(0.3),
                    ],
                    number: 2,
                }),
            ];

            const result = TempoGroupsFromMeasures(measures);

            expect(result).toHaveLength(2);
            expect(result[0]).toMatchObject({
                type: "real",
                name: "",
                tempo: 100,
                manualTempos: [100, 133.33, 166.67].map(
                    (t) => Math.round(t * 100) / 100,
                ),
                bigBeatsPerMeasure: 3,
                numOfRepeats: 1,
                strongBeatIndexes: undefined,
                measureRangeString: "m 1",
                measures: [measures[0]],
            });
            expect(result[1]).toMatchObject({
                type: "real",
                name: "",
                tempo: 200,
                bigBeatsPerMeasure: 3,
                numOfRepeats: 1,
                strongBeatIndexes: undefined,
                measureRangeString: "m 2",
                measures: [measures[1]],
            });
        });

        it("should handle gradual tempo changes across multiple beats", () => {
            const measures = [
                createMockMeasure({
                    beats: [
                        createMockBeat(0.375), // 160 BPM
                        createMockBeat(0.4), // 150 BPM
                        createMockBeat(0.429), // 140 BPM
                    ],
                    number: 1,
                }),
                createMockMeasure({
                    beats: [
                        createMockBeat(0.5), // 120 BPM
                        createMockBeat(0.5),
                        createMockBeat(0.5),
                    ],
                    number: 2,
                }),
                createMockMeasure({
                    beats: [
                        createMockBeat(0.6), // 100 BPM
                        createMockBeat(0.6),
                        createMockBeat(0.6),
                    ],
                    number: 3,
                }),
                createMockMeasure({
                    beats: [
                        createMockBeat(0.75), // 80 BPM
                        createMockBeat(0.75),
                        createMockBeat(0.75),
                    ],
                    number: 4,
                }),
            ];

            const result = TempoGroupsFromMeasures(measures);

            expect(result).toHaveLength(4);
            expect(result[0]).toMatchObject({
                type: "real",
                name: "",
                tempo: 160,
                manualTempos: [160, 150, 139.86],
                bigBeatsPerMeasure: 3,
                numOfRepeats: 1,
                strongBeatIndexes: undefined,
                measureRangeString: "m 1",
                measures: [measures[0]],
            });
            expect(result[1]).toMatchObject({
                type: "real",
                name: "",
                tempo: 120,
                bigBeatsPerMeasure: 3,
                numOfRepeats: 1,
                strongBeatIndexes: undefined,
                measureRangeString: "m 2",
                measures: [measures[1]],
            });
            expect(result[2]).toMatchObject({
                type: "real",
                name: "",
                tempo: 100,
                bigBeatsPerMeasure: 3,
                numOfRepeats: 1,
                strongBeatIndexes: undefined,
                measureRangeString: "m 3",
                measures: [measures[2]],
            });
            expect(result[3]).toMatchObject({
                type: "real",
                name: "",
                tempo: 80,
                bigBeatsPerMeasure: 3,
                numOfRepeats: 1,
                strongBeatIndexes: undefined,
                measureRangeString: "m 4",
                measures: [measures[3]],
            });
        });

        const beatArraysToMockMeasures = (durations: number[][]) => {
            return durations.map((durations, i) => {
                return createMockMeasure({
                    beats: durations.map((duration) =>
                        createMockBeat(duration),
                    ),
                    number: i + 1,
                    id: i + 1,
                });
            });
        };

        it.each([
            {
                durations: [
                    [0.75, 0.75, 0.5],
                    [0.75, 0.75, 0.5],
                    [0.5, 0.5, 0.75],
                    [0.5, 0.5, 0.75],
                ],
                expected: [
                    {
                        type: "real",
                        name: "",
                        tempo: 120,
                        bigBeatsPerMeasure: 3,
                        numOfRepeats: 2,
                        strongBeatIndexes: [0, 1],
                        measureRangeString: "m 1-2",
                        measures: (measures: Measure[]) => [
                            measures[0],
                            measures[1],
                        ],
                    },
                    {
                        type: "real",
                        name: "",
                        tempo: 120,
                        bigBeatsPerMeasure: 3,
                        numOfRepeats: 2,
                        strongBeatIndexes: [2],
                        measureRangeString: "m 3-4",
                        measures: (measures: Measure[]) => [
                            measures[2],
                            measures[3],
                        ],
                    },
                ],
            },
            {
                durations: [
                    [0.75, 0.75, 0.5],
                    [0.75, 0.75, 0.5],
                ],
                expected: [
                    {
                        type: "real",
                        name: "",
                        tempo: 120,
                        bigBeatsPerMeasure: 3,
                        numOfRepeats: 2,
                        strongBeatIndexes: [0, 1],
                        measureRangeString: "m 1-2",
                        measures: (measures: Measure[]) => [
                            measures[0],
                            measures[1],
                        ],
                    },
                ],
            },
        ])("should handle tempo changes", ({ durations, expected }) => {
            const measures = beatArraysToMockMeasures(durations);
            const result = TempoGroupsFromMeasures(measures);
            expect(result).toEqual(
                expected.map((exp) => ({
                    ...exp,
                    measures: exp.measures(measures),
                })),
            );
        });
    });

    describe("ghost tempo groups", () => {
        const createMockBeat = (id: number, duration: number): Beat => ({
            id,
            position: Math.random(),
            duration,
            includeInMeasure: true,
            notes: null,
            index: Math.random(),
            timestamp: Math.random(),
        });

        // Helper function to create a mock measure
        const createMockMeasure = ({
            beats,
            rehearsalMark = null,
            number = 1,
            id = Math.random(),
            isGhost = false,
        }: {
            beats: Beat[];
            rehearsalMark?: string | null;
            number: number | null;
            id?: number;
            isGhost?: boolean;
        }): Measure =>
            ({
                id,
                startBeat: beats[0],
                number,
                rehearsalMark,
                notes: null,
                duration: beats.reduce((sum, beat) => sum + beat.duration, 0),
                counts: beats.length,
                beats,
                timestamp: Math.random(),
                isGhost,
            }) as Measure;

        describe("Only ghost groups", () => {
            it.for([
                {
                    beats: Array.from({ length: 10 }, (_, i) =>
                        createMockBeat(i, 0.5),
                    ),
                },
                {
                    beats: Array.from({ length: 20 }, (_, i) =>
                        createMockBeat(i, 0.123),
                    ),
                },
            ])("should create a ghost tempo group", ({ beats }) => {
                const measure: Measure = {
                    id: 1,
                    beats,
                    number: null,
                    rehearsalMark: null,
                    startBeat: beats[0],
                    notes: null,
                    isGhost: true,
                    duration: beats.reduce(
                        (sum, beat) => sum + beat.duration,
                        0,
                    ),
                    counts: beats.length,
                    timestamp: Math.random(),
                };
                const result = TempoGroupsFromMeasures([measure]);
                expect(result).toHaveLength(1);
                expect(result[0]).toMatchObject({
                    type: "ghost",
                    measures: [measure],
                    numOfRepeats: 1,
                    measureRangeString: null,
                    name: "",
                    tempo: Math.round((60 / beats[0].duration) * 1000) / 1000,
                    bigBeatsPerMeasure: beats.length,
                });
            });
        });

        describe("Mix of real and ghost groups", () => {
            it("should create a ghost tempo group in between real groups", () => {
                const measures = [
                    createMockMeasure({
                        beats: Array.from({ length: 4 }, (_, i) =>
                            createMockBeat(i, 0.5),
                        ),
                        number: 1,
                    }),
                    createMockMeasure({
                        beats: Array.from({ length: 4 }, (_, i) =>
                            createMockBeat(i, 0.5),
                        ),
                        number: 2,
                    }),
                    createMockMeasure({
                        beats: Array.from({ length: 4 }, (_, i) =>
                            createMockBeat(i, 0.5),
                        ),
                        number: null,
                        isGhost: true,
                    }),
                    createMockMeasure({
                        beats: Array.from({ length: 4 }, (_, i) =>
                            createMockBeat(i, 0.5),
                        ),
                        number: 3,
                    }),
                ];
                const expectedTempoGroups: TempoGroup[] = [
                    {
                        type: "real",
                        name: "",
                        tempo: 120,
                        bigBeatsPerMeasure: 4,
                        numOfRepeats: 2,
                        strongBeatIndexes: undefined,
                        measureRangeString: "m 1-2",
                        measures: [measures[0], measures[1]],
                    },
                    {
                        type: "ghost",
                        name: "",
                        tempo: 120,
                        bigBeatsPerMeasure: 4,
                        numOfRepeats: 1,
                        strongBeatIndexes: undefined,
                        measures: [measures[2]],
                        measureRangeString: null,
                    },
                    {
                        type: "real",
                        name: "",
                        tempo: 120,
                        bigBeatsPerMeasure: 4,
                        numOfRepeats: 1,
                        strongBeatIndexes: undefined,
                        measureRangeString: "m 3",
                        measures: [measures[3]],
                    },
                ];
                const result = TempoGroupsFromMeasures(measures);
                expect(result).toHaveLength(expectedTempoGroups.length);
                expect(result).toMatchObject(expectedTempoGroups);
            });

            it("should create a ghost tempo group at the start", () => {
                const measures = [
                    createMockMeasure({
                        beats: Array.from({ length: 4 }, (_, i) =>
                            createMockBeat(i, 0.5),
                        ),
                        number: null,
                        isGhost: true,
                    }),
                    createMockMeasure({
                        beats: Array.from({ length: 4 }, (_, i) =>
                            createMockBeat(i, 0.5),
                        ),
                        number: 1,
                    }),
                    createMockMeasure({
                        beats: Array.from({ length: 4 }, (_, i) =>
                            createMockBeat(i, 0.5),
                        ),
                        number: 2,
                    }),
                ];
                const expectedTempoGroups: TempoGroup[] = [
                    {
                        type: "ghost",
                        name: "",
                        tempo: 120,
                        bigBeatsPerMeasure: 4,
                        numOfRepeats: 1,
                        strongBeatIndexes: undefined,
                        measures: [measures[0]],
                        measureRangeString: null,
                    },
                    {
                        type: "real",
                        name: "",
                        tempo: 120,
                        bigBeatsPerMeasure: 4,
                        numOfRepeats: 2,
                        strongBeatIndexes: undefined,
                        measureRangeString: "m 1-2",
                        measures: [measures[1], measures[2]],
                    },
                ];
                const result = TempoGroupsFromMeasures(measures);
                expect(result).toHaveLength(expectedTempoGroups.length);
                expect(result).toMatchObject(expectedTempoGroups);
            });

            it("should create a ghost tempo group at the end", () => {
                const measures = [
                    createMockMeasure({
                        beats: Array.from({ length: 4 }, (_, i) =>
                            createMockBeat(i, 0.5),
                        ),
                        number: 1,
                    }),
                    createMockMeasure({
                        beats: Array.from({ length: 4 }, (_, i) =>
                            createMockBeat(i, 0.5),
                        ),
                        number: 2,
                    }),
                    createMockMeasure({
                        beats: Array.from({ length: 4 }, (_, i) =>
                            createMockBeat(i, 0.5),
                        ),
                        number: null,
                        isGhost: true,
                    }),
                ];
                const expectedTempoGroups: TempoGroup[] = [
                    {
                        type: "real",
                        name: "",
                        tempo: 120,
                        bigBeatsPerMeasure: 4,
                        numOfRepeats: 2,
                        strongBeatIndexes: undefined,
                        measureRangeString: "m 1-2",
                        measures: [measures[0], measures[1]],
                    },
                    {
                        type: "ghost",
                        name: "",
                        tempo: 120,
                        bigBeatsPerMeasure: 4,
                        numOfRepeats: 1,
                        strongBeatIndexes: undefined,
                        measures: [measures[2]],
                        measureRangeString: null,
                    },
                ];
                const result = TempoGroupsFromMeasures(measures);
                expect(result).toHaveLength(expectedTempoGroups.length);
                expect(result).toMatchObject(expectedTempoGroups);
            });

            it("should create multiple ghost tempo groups in different positions", () => {
                const measures = [
                    createMockMeasure({
                        beats: Array.from({ length: 4 }, (_, i) =>
                            createMockBeat(i, 0.5),
                        ),
                        number: null,
                        isGhost: true,
                    }),
                    createMockMeasure({
                        beats: Array.from({ length: 4 }, (_, i) =>
                            createMockBeat(i, 0.5),
                        ),
                        number: 1,
                    }),
                    createMockMeasure({
                        beats: Array.from({ length: 4 }, (_, i) =>
                            createMockBeat(i, 0.5),
                        ),
                        number: null,
                        isGhost: true,
                    }),
                    createMockMeasure({
                        beats: Array.from({ length: 4 }, (_, i) =>
                            createMockBeat(i, 0.5),
                        ),
                        number: 2,
                    }),
                    createMockMeasure({
                        beats: Array.from({ length: 4 }, (_, i) =>
                            createMockBeat(i, 0.5),
                        ),
                        number: null,
                        isGhost: true,
                    }),
                ];
                const expectedTempoGroups: TempoGroup[] = [
                    {
                        type: "ghost",
                        name: "",
                        tempo: 120,
                        bigBeatsPerMeasure: 4,
                        numOfRepeats: 1,
                        strongBeatIndexes: undefined,
                        measures: [measures[0]],
                        measureRangeString: null,
                    },
                    {
                        type: "real",
                        name: "",
                        tempo: 120,
                        bigBeatsPerMeasure: 4,
                        numOfRepeats: 1,
                        strongBeatIndexes: undefined,
                        measureRangeString: "m 1",
                        measures: [measures[1]],
                    },
                    {
                        type: "ghost",
                        name: "",
                        tempo: 120,
                        bigBeatsPerMeasure: 4,
                        numOfRepeats: 1,
                        strongBeatIndexes: undefined,
                        measures: [measures[2]],
                        measureRangeString: null,
                    },
                    {
                        type: "real",
                        name: "",
                        tempo: 120,
                        bigBeatsPerMeasure: 4,
                        numOfRepeats: 1,
                        strongBeatIndexes: undefined,
                        measureRangeString: "m 2",
                        measures: [measures[3]],
                    },
                    {
                        type: "ghost",
                        name: "",
                        tempo: 120,
                        bigBeatsPerMeasure: 4,
                        numOfRepeats: 1,
                        strongBeatIndexes: undefined,
                        measures: [measures[4]],
                        measureRangeString: null,
                    },
                ];
                const result = TempoGroupsFromMeasures(measures);
                expect(result).toHaveLength(expectedTempoGroups.length);
                expect(result).toMatchObject(expectedTempoGroups);
            });

            it("should handle multiple consecutive ghost tempo groups", () => {
                const measures = [
                    createMockMeasure({
                        beats: Array.from({ length: 4 }, (_, i) =>
                            createMockBeat(i, 0.5),
                        ),
                        number: 1,
                    }),
                    createMockMeasure({
                        beats: Array.from({ length: 4 }, (_, i) =>
                            createMockBeat(i, 0.5),
                        ),
                        number: null,
                        isGhost: true,
                    }),
                    createMockMeasure({
                        beats: Array.from({ length: 4 }, (_, i) =>
                            createMockBeat(i, 0.5),
                        ),
                        number: null,
                        isGhost: true,
                    }),
                    createMockMeasure({
                        beats: Array.from({ length: 4 }, (_, i) =>
                            createMockBeat(i, 0.5),
                        ),
                        number: 2,
                    }),
                ];
                const expectedTempoGroups: TempoGroup[] = [
                    {
                        type: "real",
                        name: "",
                        tempo: 120,
                        bigBeatsPerMeasure: 4,
                        numOfRepeats: 1,
                        strongBeatIndexes: undefined,
                        measureRangeString: "m 1",
                        measures: [measures[0]],
                    },
                    {
                        type: "ghost",
                        name: "",
                        tempo: 120,
                        bigBeatsPerMeasure: 4,
                        numOfRepeats: 1,
                        strongBeatIndexes: undefined,
                        measures: [measures[1]],
                        measureRangeString: null,
                    },
                    {
                        type: "ghost",
                        name: "",
                        tempo: 120,
                        bigBeatsPerMeasure: 4,
                        numOfRepeats: 1,
                        strongBeatIndexes: undefined,
                        measures: [measures[2]],
                        measureRangeString: null,
                    },
                    {
                        type: "real",
                        name: "",
                        tempo: 120,
                        bigBeatsPerMeasure: 4,
                        numOfRepeats: 1,
                        strongBeatIndexes: undefined,
                        measureRangeString: "m 2",
                        measures: [measures[3]],
                    },
                ];
                const result = TempoGroupsFromMeasures(measures);
                expect(result).toHaveLength(expectedTempoGroups.length);
                expect(result).toMatchObject(expectedTempoGroups);
            });

            it("should handle ghost tempo groups with different time signatures", () => {
                const measures = [
                    createMockMeasure({
                        beats: Array.from({ length: 4 }, (_, i) =>
                            createMockBeat(i, 0.5),
                        ),
                        number: 1,
                    }),
                    createMockMeasure({
                        beats: Array.from({ length: 3 }, (_, i) =>
                            createMockBeat(i, 0.5),
                        ),
                        number: null,
                        isGhost: true,
                    }),
                    createMockMeasure({
                        beats: Array.from({ length: 4 }, (_, i) =>
                            createMockBeat(i, 0.5),
                        ),
                        number: 2,
                    }),
                ];
                const expectedTempoGroups: TempoGroup[] = [
                    {
                        type: "real",
                        name: "",
                        tempo: 120,
                        bigBeatsPerMeasure: 4,
                        numOfRepeats: 1,
                        strongBeatIndexes: undefined,
                        measureRangeString: "m 1",
                        measures: [measures[0]],
                    },
                    {
                        type: "ghost",
                        name: "",
                        tempo: 120,
                        bigBeatsPerMeasure: 3,
                        numOfRepeats: 1,
                        strongBeatIndexes: undefined,
                        measures: [measures[1]],
                        measureRangeString: null,
                    },
                    {
                        type: "real",
                        name: "",
                        tempo: 120,
                        bigBeatsPerMeasure: 4,
                        numOfRepeats: 1,
                        strongBeatIndexes: undefined,
                        measureRangeString: "m 2",
                        measures: [measures[2]],
                    },
                ];
                const result = TempoGroupsFromMeasures(measures);
                expect(result).toHaveLength(expectedTempoGroups.length);
                expect(result).toMatchObject(expectedTempoGroups);
            });
        });
    });

    describe("property-based tests", () => {
        // Helper function to create a mock beat for property tests
        const createMockBeat = (index: number, duration: number): Beat => ({
            id: Math.random(),
            position: index * duration,
            duration,
            includeInMeasure: true,
            notes: null,
            index,
            timestamp: index * duration,
        });

        // Helper function to create a mock measure for property tests
        const createMockMeasure = ({
            beats,
            rehearsalMark = null,
            number,
            isGhost,
        }: {
            beats: Beat[];
            rehearsalMark?: string | null;
            number: number;
            isGhost: boolean;
        }): Measure => {
            const baseMeasure = {
                id: Math.random(),
                startBeat: beats[0],
                rehearsalMark,
                notes: null,
                duration: beats.reduce((sum, beat) => sum + beat.duration, 0),
                counts: beats.length,
                beats,
                timestamp: Math.random(),
            };

            if (isGhost) {
                return {
                    ...baseMeasure,
                    isGhost: true as const,
                    number: null,
                };
            } else {
                return {
                    ...baseMeasure,
                    isGhost: false as const,
                    number,
                };
            }
        };

        // Arbitrary for generating a measure
        const arbMeasure = fc
            .record({
                numBeats: fc.integer({ min: 1, max: 8 }),
                beatDuration: fc.double({ min: 0.1, max: 2, noNaN: true }),
                rehearsalMark: fc.oneof(
                    fc.constant(null),
                    fc.string({ minLength: 1, maxLength: 3 }),
                ),
                number: fc.integer({ min: 1, max: 100 }),
                isGhost: fc.boolean(),
            })
            .map(
                ({
                    numBeats,
                    beatDuration,
                    rehearsalMark,
                    number,
                    isGhost,
                }) => {
                    const beats = Array.from({ length: numBeats }, (_, i) =>
                        createMockBeat(i, beatDuration),
                    );
                    return createMockMeasure({
                        beats,
                        rehearsalMark,
                        number,
                        isGhost,
                    });
                },
            );

        it("should preserve all measures in output groups", () => {
            fc.assert(
                fc.property(
                    fc.array(arbMeasure, { minLength: 1, maxLength: 20 }),
                    (measures) => {
                        const result = TempoGroupsFromMeasures(measures);
                        const outputMeasures = result.flatMap(
                            (g) => g.measures || [],
                        );

                        // All input measures should appear in output
                        expect(outputMeasures.length).toBe(measures.length);

                        // Check that all measures are preserved (by id)
                        const inputIds = measures.map((m) => m.id).sort();
                        const outputIds = outputMeasures
                            .map((m) => m.id)
                            .sort();
                        expect(outputIds).toEqual(inputIds);
                    },
                ),
            );
        });

        it("should preserve measure order", () => {
            fc.assert(
                fc.property(
                    fc.array(arbMeasure, { minLength: 1, maxLength: 20 }),
                    (measures) => {
                        const result = TempoGroupsFromMeasures(measures);
                        const outputMeasures = result.flatMap(
                            (g) => g.measures || [],
                        );

                        // Measures should appear in the same order
                        const inputIds = measures.map((m) => m.id);
                        const outputIds = outputMeasures.map((m) => m.id);
                        expect(outputIds).toEqual(inputIds);
                    },
                ),
            );
        });

        it("should never create empty tempo groups", () => {
            fc.assert(
                fc.property(
                    fc.array(arbMeasure, { minLength: 1, maxLength: 20 }),
                    (measures) => {
                        const result = TempoGroupsFromMeasures(measures);

                        // No tempo group should be empty
                        result.forEach((group) => {
                            expect(group.measures).toBeDefined();
                            expect(group.measures!.length).toBeGreaterThan(0);
                            expect(group.numOfRepeats).toBeGreaterThan(0);
                        });
                    },
                ),
            );
        });

        it("should ensure all measures in a group have the same beat count", () => {
            fc.assert(
                fc.property(
                    fc.array(arbMeasure, { minLength: 1, maxLength: 20 }),
                    (measures) => {
                        const result = TempoGroupsFromMeasures(measures);

                        // Within each group, all measures should have same beat count
                        result.forEach((group) => {
                            expect(group.measures).toBeDefined();
                            const beatCounts = group.measures!.map(
                                (m) => m.beats.length,
                            );
                            const uniqueBeatCounts = new Set(beatCounts);
                            expect(uniqueBeatCounts.size).toBe(1);
                            expect(group.bigBeatsPerMeasure).toBe(
                                group.measures![0].beats.length,
                            );
                        });
                    },
                ),
            );
        });

        it("should ensure numOfRepeats matches actual measure count", () => {
            fc.assert(
                fc.property(
                    fc.array(arbMeasure, { minLength: 1, maxLength: 20 }),
                    (measures) => {
                        const result = TempoGroupsFromMeasures(measures);

                        // numOfRepeats should match the actual number of measures
                        result.forEach((group) => {
                            expect(group.measures).toBeDefined();
                            expect(group.numOfRepeats).toBe(
                                group.measures!.length,
                            );
                        });
                    },
                ),
            );
        });

        it("should ensure ghost groups have type 'ghost' and real groups have type 'real'", () => {
            fc.assert(
                fc.property(
                    fc.array(arbMeasure, { minLength: 1, maxLength: 20 }),
                    (measures) => {
                        const result = TempoGroupsFromMeasures(measures);

                        result.forEach((group) => {
                            expect(group.measures).toBeDefined();
                            if (group.measures!.some((m) => m.isGhost)) {
                                expect(group.type).toBe("ghost");
                            } else {
                                expect(group.type).toBe("real");
                            }
                        });
                    },
                ),
            );
        });

        it("should ensure real groups have measureRangeString and ghost groups have null", () => {
            fc.assert(
                fc.property(
                    fc.array(arbMeasure, { minLength: 1, maxLength: 20 }),
                    (measures) => {
                        const result = TempoGroupsFromMeasures(measures);

                        result.forEach((group) => {
                            if (group.type === "ghost") {
                                expect(group.measureRangeString).toBe(null);
                            } else {
                                expect(group.measureRangeString).not.toBe(null);
                            }
                        });
                    },
                ),
            );
        });

        it("should calculate tempo correctly from beat durations", () => {
            fc.assert(
                fc.property(
                    fc.array(arbMeasure, { minLength: 1, maxLength: 20 }),
                    (measures) => {
                        const result = TempoGroupsFromMeasures(measures);

                        result.forEach((group) => {
                            expect(group.measures).toBeDefined();
                            const firstMeasure = group.measures![0];
                            const firstBeat = firstMeasure.beats[0];
                            const expectedTempo =
                                Math.round((60 / firstBeat.duration) * 1000) /
                                1000;

                            // Allow small floating point differences
                            expect(
                                Math.abs(group.tempo - expectedTempo),
                            ).toBeLessThan(0.01);
                        });
                    },
                ),
            );
        });

        it("should handle sequences with only real measures", () => {
            const arbRealMeasure = fc
                .record({
                    numBeats: fc.integer({ min: 1, max: 8 }),
                    beatDuration: fc.double({ min: 0.1, max: 2, noNaN: true }),
                    rehearsalMark: fc.oneof(
                        fc.constant(null),
                        fc.string({ minLength: 1, maxLength: 3 }),
                    ),
                    number: fc.integer({ min: 1, max: 100 }),
                })
                .map(({ numBeats, beatDuration, rehearsalMark, number }) => {
                    const beats = Array.from({ length: numBeats }, (_, i) =>
                        createMockBeat(i, beatDuration),
                    );
                    return createMockMeasure({
                        beats,
                        rehearsalMark,
                        number,
                        isGhost: false,
                    });
                });

            fc.assert(
                fc.property(
                    fc.array(arbRealMeasure, { minLength: 1, maxLength: 20 }),
                    (measures) => {
                        const result = TempoGroupsFromMeasures(measures);

                        // All groups should be real
                        result.forEach((group) => {
                            expect(group.type).toBe("real");
                            expect(group.measureRangeString).not.toBe(null);
                        });
                    },
                ),
            );
        });

        it("should handle sequences with only ghost measures", () => {
            const arbGhostMeasure = fc
                .record({
                    numBeats: fc.integer({ min: 1, max: 8 }),
                    beatDuration: fc.double({ min: 0.1, max: 2, noNaN: true }),
                    rehearsalMark: fc.oneof(
                        fc.constant(null),
                        fc.string({ minLength: 1, maxLength: 3 }),
                    ),
                    number: fc.integer({ min: 1, max: 100 }),
                })
                .map(({ numBeats, beatDuration, rehearsalMark, number }) => {
                    const beats = Array.from({ length: numBeats }, (_, i) =>
                        createMockBeat(i, beatDuration),
                    );
                    return createMockMeasure({
                        beats,
                        rehearsalMark,
                        number,
                        isGhost: true,
                    });
                });

            fc.assert(
                fc.property(
                    fc.array(arbGhostMeasure, { minLength: 1, maxLength: 20 }),
                    (measures) => {
                        const result = TempoGroupsFromMeasures(measures);

                        // All groups should be ghost
                        result.forEach((group) => {
                            expect(group.type).toBe("ghost");
                            expect(group.measureRangeString).toBe(null);
                        });
                    },
                ),
            );
        });
    });
});

describe("getStrongBeatIndexes", () => {
    // Helper function to create a mock beat (reusing from other tests)
    const createMockBeat = (duration: number): Beat => ({
        id: Math.random(),
        position: Math.random(),
        duration,
        includeInMeasure: true,
        notes: null,
        index: Math.random(),
        timestamp: Math.random(),
    });

    // Helper function to create a mock measure (reusing from other tests)
    const createMockMeasure = ({
        beats,
        rehearsalMark = null,
    }: {
        beats: Beat[];
        rehearsalMark?: string | null;
    }): Measure => ({
        id: Math.random(),
        startBeat: beats[0],
        number: Math.random(),
        rehearsalMark,
        notes: null,
        duration: beats.reduce((sum, beat) => sum + beat.duration, 0),
        counts: beats.length,
        beats,
        timestamp: Math.random(),
        isGhost: false,
    });
    // Spy on console.error
    const consoleErrorSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});

    // Clear mock calls between tests
    beforeEach(() => {
        consoleErrorSpy.mockClear();
    });

    it("should return correct indexes for 7/8 time (2+2+3 pattern)", () => {
        const measure = createMockMeasure({
            beats: [
                createMockBeat(0.4), // short
                createMockBeat(0.4), // short
                createMockBeat(0.6), // long (1.5x)
            ],
        });
        expect(getStrongBeatIndexes(measure)).toEqual([2]);
    });

    it("should return correct indexes for 7/8 time (3+2+2 pattern)", () => {
        const measure = createMockMeasure({
            beats: [
                createMockBeat(0.6), // long (1.5x)
                createMockBeat(0.4), // short
                createMockBeat(0.4), // short
            ],
        });
        expect(getStrongBeatIndexes(measure)).toEqual([0]);
    });

    it("should return correct indexes for 10/8 time (3+2+3+2 pattern)", () => {
        const measure = createMockMeasure({
            beats: [
                createMockBeat(0.6), // long
                createMockBeat(0.4), // short
                createMockBeat(0.6), // long
                createMockBeat(0.4), // short
            ],
        });
        expect(getStrongBeatIndexes(measure)).toEqual([0, 2]);
    });

    it("should return correct indexes for 8/8 time (3+3+2 pattern)", () => {
        const measure = createMockMeasure({
            beats: [
                createMockBeat(0.6), // long
                createMockBeat(0.6), // long
                createMockBeat(0.4), // short
            ],
        });
        expect(getStrongBeatIndexes(measure)).toEqual([0, 1]);
    });

    it("should return empty array and log error for non-mixed meter (all same duration)", () => {
        const measure = createMockMeasure({
            beats: [
                createMockBeat(0.5),
                createMockBeat(0.5),
                createMockBeat(0.5),
            ],
        });
        expect(getStrongBeatIndexes(measure)).toEqual([]);
        expect(consoleErrorSpy).toHaveBeenCalledWith(
            "Measure is not a mixed meter",
            measure,
        );
    });

    it("should return empty array and log error for measure with three different durations", () => {
        const measure = createMockMeasure({
            beats: [
                createMockBeat(0.4),
                createMockBeat(0.5),
                createMockBeat(0.6),
            ],
        });
        expect(getStrongBeatIndexes(measure)).toEqual([]);
        expect(consoleErrorSpy).toHaveBeenCalledWith(
            "Measure is not a mixed meter",
            measure,
        );
    });

    it("should return empty array and log error for empty measure", () => {
        const measure = createMockMeasure({
            beats: [],
        });
        expect(getStrongBeatIndexes(measure)).toEqual([]);
        expect(consoleErrorSpy).toHaveBeenCalledWith(
            "Measure is not a mixed meter",
            measure,
        );
    });

    it("should return empty array and log error for single beat measure", () => {
        const measure = createMockMeasure({
            beats: [createMockBeat(0.5)],
        });
        expect(getStrongBeatIndexes(measure)).toEqual([]);
        expect(consoleErrorSpy).toHaveBeenCalledWith(
            "Measure is not a mixed meter",
            measure,
        );
    });
});

// Import the function we're testing

describe("measureIsMixedMeter", () => {
    // Helper function to create a mock beat (reusing from TempoGroup.test.ts)
    const createMockBeat = (duration: number): Beat => ({
        id: Math.random(),
        position: Math.random(),
        duration,
        includeInMeasure: true,
        notes: null,
        index: Math.random(),
        timestamp: Math.random(),
    });

    // Helper function to create a mock measure (reusing from TempoGroup.test.ts)
    const createMockMeasure = ({
        beats,
        rehearsalMark = null,
    }: {
        beats: Beat[];
        rehearsalMark?: string | null;
    }): Measure => ({
        id: Math.random(),
        startBeat: beats[0],
        number: Math.random(),
        rehearsalMark,
        notes: null,
        duration: beats.reduce((sum, beat) => sum + beat.duration, 0),
        counts: beats.length,
        beats,
        timestamp: Math.random(),
        isGhost: false,
    });
    it("should return false for measure with single duration", () => {
        const measure = createMockMeasure({
            beats: [
                createMockBeat(0.5),
                createMockBeat(0.5),
                createMockBeat(0.5),
            ],
        });
        expect(measureIsMixedMeter(measure)).toBe(false);
    });

    it("should return true for 3:2 ratio (exact values)", () => {
        const measure = createMockMeasure({
            beats: [
                createMockBeat(0.4), // shorter duration
                createMockBeat(0.6), // longer duration (1.5x)
                createMockBeat(0.4),
            ],
        });
        expect(measureIsMixedMeter(measure)).toBe(true);
    });

    it("should return true for 3:2 ratio with floating point imprecision", () => {
        const measure = createMockMeasure({
            beats: [
                createMockBeat(0.4),
                createMockBeat(0.6000000001), // slightly over 1.5x
                createMockBeat(0.4),
            ],
        });
        expect(measureIsMixedMeter(measure)).toBe(true);
    });

    it("should return false for ratio close to but not 3:2", () => {
        const measure = createMockMeasure({
            beats: [
                createMockBeat(0.4),
                createMockBeat(0.65), // ratio > 1.5
                createMockBeat(0.4),
            ],
        });
        expect(measureIsMixedMeter(measure)).toBe(false);
    });

    it("should return false for more than two different durations", () => {
        const measure = createMockMeasure({
            beats: [
                createMockBeat(0.4),
                createMockBeat(0.6),
                createMockBeat(0.5), // third different duration
            ],
        });
        expect(measureIsMixedMeter(measure)).toBe(false);
    });

    it("should return false for empty measure", () => {
        const measure = createMockMeasure({
            beats: [],
        });
        expect(measureIsMixedMeter(measure)).toBe(false);
    });

    it("should return false for single beat measure", () => {
        const measure = createMockMeasure({
            beats: [createMockBeat(0.5)],
        });
        expect(measureIsMixedMeter(measure)).toBe(false);
    });

    it("should handle reversed order of durations", () => {
        const measure = createMockMeasure({
            beats: [
                createMockBeat(0.6), // longer duration first
                createMockBeat(0.4), // shorter duration second
                createMockBeat(0.6),
            ],
        });
        expect(measureIsMixedMeter(measure)).toBe(true);
    });
});

// Import the function we're testing

describe("measureHasOneTempo", () => {
    // Helper function to create a mock beat (reusing from other tests)
    const createMockBeat = (duration: number): Beat => ({
        id: Math.random(),
        position: Math.random(),
        duration,
        includeInMeasure: true,
        notes: null,
        index: Math.random(),
        timestamp: Math.random(),
    });

    // Helper function to create a mock measure (reusing from other tests)
    const createMockMeasure = ({
        beats,
        rehearsalMark = null,
    }: {
        beats: Beat[];
        rehearsalMark?: string | null;
    }): Measure => ({
        id: Math.random(),
        startBeat: beats[0],
        number: Math.random(),
        rehearsalMark,
        notes: null,
        duration: beats.reduce((sum, beat) => sum + beat.duration, 0),
        counts: beats.length,
        beats,
        timestamp: Math.random(),
        isGhost: false,
    });

    it("should return true for measure with all beats having same duration", () => {
        const measure = createMockMeasure({
            beats: [
                createMockBeat(0.5),
                createMockBeat(0.5),
                createMockBeat(0.5),
            ],
        });
        expect(measureHasOneTempo(measure)).toBe(true);
    });

    it("should return false for measure with different beat durations", () => {
        const measure = createMockMeasure({
            beats: [
                createMockBeat(0.5),
                createMockBeat(0.6),
                createMockBeat(0.5),
            ],
        });
        expect(measureHasOneTempo(measure)).toBe(false);
    });

    it("should return true for measure with single beat", () => {
        const measure = createMockMeasure({
            beats: [createMockBeat(0.5)],
        });
        expect(measureHasOneTempo(measure)).toBe(true);
    });

    it("should return true for empty measure", () => {
        const measure = createMockMeasure({
            beats: [],
        });
        expect(measureHasOneTempo(measure)).toBe(true);
    });

    it("should return false for measure with very small duration differences", () => {
        const measure = createMockMeasure({
            beats: [
                createMockBeat(0.5),
                createMockBeat(0.5000001), // Tiny difference
                createMockBeat(0.5),
            ],
        });
        expect(measureHasOneTempo(measure)).toBe(false);
    });

    it("should return true for measure with same durations but different other properties", () => {
        const measure = createMockMeasure({
            beats: [
                { ...createMockBeat(0.5), notes: "note1" },
                { ...createMockBeat(0.5), notes: "note2" },
                { ...createMockBeat(0.5), notes: "note3" },
            ],
        });
        expect(measureHasOneTempo(measure)).toBe(true);
    });
});

// Import the function we're testing

describe("measureIsSameTempo", () => {
    // Helper function to create a mock beat (reusing from other tests)
    const createMockBeat = (duration: number): Beat => ({
        id: Math.random(),
        position: Math.random(),
        duration,
        includeInMeasure: true,
        notes: null,
        index: Math.random(),
        timestamp: Math.random(),
    });

    // Helper function to create a mock measure (reusing from other tests)
    const createMockMeasure = ({
        beats,
        rehearsalMark = null,
        number = 1,
    }: {
        beats: Beat[];
        rehearsalMark?: string | null;
        number?: number;
    }): Measure => ({
        id: Math.random(),
        startBeat: beats[0],
        number,
        rehearsalMark,
        notes: null,
        duration: beats.reduce((sum, beat) => sum + beat.duration, 0),
        counts: beats.length,
        beats,
        timestamp: Math.random(),
        isGhost: false,
    });

    describe("Regular tempo measures", () => {
        it("should return true when both measures have the same tempo", () => {
            const measure1 = createMockMeasure({
                beats: [
                    createMockBeat(0.5), // 120 BPM
                    createMockBeat(0.5),
                ],
                number: 1,
            });
            const measure2 = createMockMeasure({
                beats: [
                    createMockBeat(0.5), // 120 BPM
                    createMockBeat(0.5),
                ],
                number: 2,
            });
            expect(measureIsSameTempo(measure1, measure2)).toBe(true);
        });

        it("should return false when measures have different tempos", () => {
            const measure1 = createMockMeasure({
                beats: [
                    createMockBeat(0.5), // 120 BPM
                    createMockBeat(0.5),
                ],
                number: 1,
            });
            const measure2 = createMockMeasure({
                beats: [
                    createMockBeat(0.4), // 150 BPM
                    createMockBeat(0.4),
                ],
                number: 2,
            });
            expect(measureIsSameTempo(measure1, measure2)).toBe(false);
        });

        it("should return false when first measure has varying tempos", () => {
            const measure1 = createMockMeasure({
                beats: [
                    createMockBeat(0.5), // 120 BPM
                    createMockBeat(0.4), // 150 BPM
                ],
                number: 1,
            });
            const measure2 = createMockMeasure({
                beats: [
                    createMockBeat(0.5), // 120 BPM
                    createMockBeat(0.5),
                ],
                number: 2,
            });
            expect(measureIsSameTempo(measure1, measure2)).toBe(false);
        });

        it("should return false when second measure has varying tempos", () => {
            const measure1 = createMockMeasure({
                beats: [
                    createMockBeat(0.5), // 120 BPM
                    createMockBeat(0.5),
                ],
                number: 1,
            });
            const measure2 = createMockMeasure({
                beats: [
                    createMockBeat(0.5), // 120 BPM
                    createMockBeat(0.4), // 150 BPM
                ],
                number: 2,
            });
            expect(measureIsSameTempo(measure1, measure2)).toBe(false);
        });
    });

    describe("Mixed meter measures", () => {
        it("should return true for identical 7/8 measures (2+2+3 pattern)", () => {
            const measure1 = createMockMeasure({
                beats: [
                    createMockBeat(0.4), // short
                    createMockBeat(0.4), // short
                    createMockBeat(0.6), // long
                ],
                number: 1,
            });
            const measure2 = createMockMeasure({
                beats: [
                    createMockBeat(0.4), // short
                    createMockBeat(0.4), // short
                    createMockBeat(0.6), // long
                ],
                number: 2,
            });
            expect(measureIsSameTempo(measure1, measure2)).toBe(true);
        });

        it("should return true for identical 7/8 measures (3+2+2 pattern)", () => {
            const measure1 = createMockMeasure({
                beats: [
                    createMockBeat(0.6), // long
                    createMockBeat(0.4), // short
                    createMockBeat(0.4), // short
                ],
                number: 1,
            });
            const measure2 = createMockMeasure({
                beats: [
                    createMockBeat(0.6), // long
                    createMockBeat(0.4), // short
                    createMockBeat(0.4), // short
                ],
                number: 2,
            });
            expect(measureIsSameTempo(measure1, measure2)).toBe(true);
        });

        it("should return false for different mixed meter patterns with same total duration", () => {
            const measure1 = createMockMeasure({
                beats: [
                    createMockBeat(0.4), // short
                    createMockBeat(0.4), // short
                    createMockBeat(0.6), // long (2+2+3)
                ],
                number: 1,
            });
            const measure2 = createMockMeasure({
                beats: [
                    createMockBeat(0.6), // long
                    createMockBeat(0.4), // short
                    createMockBeat(0.4), // short (3+2+2)
                ],
                number: 2,
            });
            expect(measureIsSameTempo(measure1, measure2)).toBe(false);
        });

        it("should return true for 10/8 measures with same pattern (3+2+3+2)", () => {
            const measure1 = createMockMeasure({
                beats: [
                    createMockBeat(0.6), // long
                    createMockBeat(0.4), // short
                    createMockBeat(0.6), // long
                    createMockBeat(0.4), // short
                ],
                number: 1,
            });
            const measure2 = createMockMeasure({
                beats: [
                    createMockBeat(0.6), // long
                    createMockBeat(0.4), // short
                    createMockBeat(0.6), // long
                    createMockBeat(0.4), // short
                ],
                number: 2,
            });
            expect(measureIsSameTempo(measure1, measure2)).toBe(true);
        });

        it("should return false when comparing mixed meter to regular meter", () => {
            const mixedMeter = createMockMeasure({
                beats: [
                    createMockBeat(0.6), // long
                    createMockBeat(0.4), // short
                    createMockBeat(0.4), // short
                ],
                number: 1,
            });
            const regularMeter = createMockMeasure({
                beats: [
                    createMockBeat(0.5),
                    createMockBeat(0.5),
                    createMockBeat(0.5),
                ],
                number: 2,
            });
            expect(measureIsSameTempo(mixedMeter, regularMeter)).toBe(false);
        });

        it("should return false for mixed meter measures with different base tempos", () => {
            const measure1 = createMockMeasure({
                beats: [
                    createMockBeat(0.4), // short
                    createMockBeat(0.4), // short
                    createMockBeat(0.6), // long
                ],
                number: 1,
            });
            const measure2 = createMockMeasure({
                beats: [
                    createMockBeat(0.3), // short (faster tempo)
                    createMockBeat(0.3), // short
                    createMockBeat(0.45), // long
                ],
                number: 2,
            });
            expect(measureIsSameTempo(measure1, measure2)).toBe(false);
        });
    });

    describe("Edge cases", () => {
        it("should return false when first measure is empty", () => {
            const measure1 = createMockMeasure({
                beats: [],
                number: 1,
            });
            const measure2 = createMockMeasure({
                beats: [createMockBeat(0.5), createMockBeat(0.5)],
                number: 2,
            });
            expect(measureIsSameTempo(measure1, measure2)).toBe(false);
        });

        it("should return false when second measure is empty", () => {
            const measure1 = createMockMeasure({
                beats: [createMockBeat(0.5), createMockBeat(0.5)],
                number: 1,
            });
            const measure2 = createMockMeasure({
                beats: [],
                number: 2,
            });
            expect(measureIsSameTempo(measure1, measure2)).toBe(false);
        });

        it("should handle floating point precision in regular tempo calculations", () => {
            const measure1 = createMockMeasure({
                beats: [
                    createMockBeat(0.5), // 120 BPM
                    createMockBeat(0.5),
                ],
                number: 1,
            });
            const measure2 = createMockMeasure({
                beats: [
                    createMockBeat(0.500001), // Should be considered same
                    createMockBeat(0.500001),
                ],
                number: 2,
            });
            expect(measureIsSameTempo(measure1, measure2)).toBe(true);
        });

        it("should handle floating point precision in mixed meter calculations", () => {
            const measure1 = createMockMeasure({
                beats: [
                    createMockBeat(0.4),
                    createMockBeat(0.4),
                    createMockBeat(0.6),
                ],
                number: 1,
            });
            const measure2 = createMockMeasure({
                beats: [
                    createMockBeat(0.400001),
                    createMockBeat(0.400001),
                    createMockBeat(0.600001),
                ],
                number: 2,
            });
            expect(measureIsSameTempo(measure1, measure2)).toBe(true);
        });

        it("should return true for single beat measures with same tempo", () => {
            const measure1 = createMockMeasure({
                beats: [createMockBeat(0.5)], // 120 BPM
                number: 1,
            });
            const measure2 = createMockMeasure({
                beats: [createMockBeat(0.5)], // 120 BPM
                number: 2,
            });
            expect(measureIsSameTempo(measure1, measure2)).toBe(true);
        });
    });
});
describe("_newAndUpdatedBeatsFromTempoGroup", () => {
    const fakeData = (seed?: number, endTempo: boolean = false) => {
        faker.seed(seed);
        const output = {
            tempo: faker.helpers.arrayElement([
                faker.number.int({ min: 32, max: 240 }),
                faker.number.float({ min: 32, max: 240 }),
            ]),
            numRepeats: faker.number.int({ min: 1, max: 200 }),
            bigBeatsPerMeasure: faker.number.int({ min: 1, max: 32 }),
            fromCreate: true,
            shouldUpdate: false,
            ...(endTempo && {
                endTempo: faker.number.int({ min: 32, max: 240 }),
            }),
        };
        faker.seed();
        return output;
    };

    describe("Creating new beats (fromCreate: true, no existing beats)", () => {
        describe("should create beats with constant tempo", () => {
            it.for([
                {
                    tempo: 120,
                    numRepeats: 1,
                    bigBeatsPerMeasure: 4,
                    fromCreate: true,

                    shouldUpdate: false,
                },
                {
                    tempo: 120,
                    numRepeats: 2,
                    bigBeatsPerMeasure: 4,
                    fromCreate: true,

                    shouldUpdate: false,
                },
                ...Array(SEED_AMOUNT)
                    .fill(0)
                    .map((_, i) => fakeData(i)),
            ])(
                "%# - {tempo: $tempo, numRepeats: $numRepeats, bigBeatsPerMeasure: $bigBeatsPerMeasure}",
                (args) => {
                    const { newBeats: result, modifiedBeats } =
                        _newAndUpdatedBeatsFromTempoGroup(args);
                    const expectedTotalBeats =
                        args.bigBeatsPerMeasure * args.numRepeats + 1;
                    expect(result).toHaveLength(expectedTotalBeats);
                    expect(modifiedBeats).toHaveLength(0);
                    result.forEach((beat: NewBeatArgs, index: number) => {
                        expect(beat.duration).toBe(60 / args.tempo);
                        expect(beat.include_in_measure).toBe(true);
                    });
                },
            );
        });

        it("should create beats with changing tempo with endTempo", () => {
            const { newBeats: result, modifiedBeats } =
                _newAndUpdatedBeatsFromTempoGroup({
                    tempo: 120,
                    numRepeats: 1,
                    bigBeatsPerMeasure: 4,
                    endTempo: 80,
                    fromCreate: true,

                    shouldUpdate: false,
                });
            const expectedTotalBeats = 4 * 1 + 1;
            expect(result).toHaveLength(expectedTotalBeats);
            expect(modifiedBeats).toHaveLength(0);

            const expectedDurations = [
                60 / 120, //
                60 / 110,
                60 / 100,
                60 / 90,
                60 / 80,
            ].map((d) => Number(d.toFixed(8)));

            result.forEach((beat: NewBeatArgs, index: number) => {
                expect(
                    Number(beat.duration.toFixed(8)),
                    `index: ${index}`,
                ).toBe(expectedDurations[index]);
                expect(beat.include_in_measure).toBe(true);
            });
        });

        describe("should handle multiple repeats with changing tempo", () => {
            it.for([
                {
                    tempo: 100,
                    numRepeats: 2,
                    bigBeatsPerMeasure: 3,
                    endTempo: 70,
                    fromCreate: true,

                    shouldUpdate: false,
                },
                ...Array.from({ length: SEED_AMOUNT }, (_, i) =>
                    fakeData(i, true),
                ),
            ])(
                "%# - {tempo: $tempo, numRepeats: $numRepeats, bigBeatsPerMeasure: $bigBeatsPerMeasure, endTempo: $endTempo}",
                (args) => {
                    const { newBeats: result, modifiedBeats } =
                        _newAndUpdatedBeatsFromTempoGroup(args);
                    const expectedTotalBeats =
                        args.bigBeatsPerMeasure * args.numRepeats + 1;
                    expect(result).toHaveLength(expectedTotalBeats);
                    expect(modifiedBeats).toHaveLength(0);
                    const tempoDelta =
                        (args.tempo - args.endTempo!) /
                        (expectedTotalBeats - 1);
                    const expectedTempos = Array.from(
                        { length: expectedTotalBeats },
                        (_, i) => args.tempo - tempoDelta * i,
                    );

                    const expectedDurations = [
                        ...expectedTempos
                            .map((tempo) => 60 / tempo)
                            .map((d) => Number(d.toFixed(8))),
                        60 / args.endTempo!,
                    ];

                    result.forEach((beat: NewBeatArgs, index: number) => {
                        expect(
                            Number(beat.duration.toFixed(8)),
                            `index: ${index}`,
                        ).toBe(expectedDurations[index]);
                        expect(beat.include_in_measure).toBe(true);
                    });
                },
            );
        });

        it("should handle edge case with single beat per measure", () => {
            const { newBeats: result, modifiedBeats } =
                _newAndUpdatedBeatsFromTempoGroup({
                    tempo: 120,
                    numRepeats: 1,
                    bigBeatsPerMeasure: 1,
                    fromCreate: true,

                    shouldUpdate: false,
                });
            expect(result).toHaveLength(2);
            expect(modifiedBeats).toHaveLength(0);
            expect(result[0].duration).toBe(0.5);
            expect(result[1].duration).toBe(0.5);
            expect(result[0].include_in_measure).toBe(true);
        });

        it("should handle edge case with very fast tempo", () => {
            const { newBeats: result, modifiedBeats } =
                _newAndUpdatedBeatsFromTempoGroup({
                    tempo: 240,
                    numRepeats: 1,
                    bigBeatsPerMeasure: 2,
                    fromCreate: true,

                    shouldUpdate: false,
                });
            expect(result).toHaveLength(3);
            expect(modifiedBeats).toHaveLength(0);
            result.forEach((beat: NewBeatArgs) => {
                expect(beat.duration).toBe(0.25); // 60/240 = 0.25
                expect(beat.include_in_measure).toBe(true);
            });
        });

        it("should handle edge case with very slow tempo", () => {
            const { newBeats: result, modifiedBeats } =
                _newAndUpdatedBeatsFromTempoGroup({
                    tempo: 30,
                    numRepeats: 1,
                    bigBeatsPerMeasure: 2,
                    fromCreate: true,

                    shouldUpdate: false,
                });
            expect(result).toHaveLength(3);
            expect(modifiedBeats).toHaveLength(0);
            result.forEach((beat: NewBeatArgs) => {
                expect(beat.duration).toBe(2); // 60/30 = 2
                expect(beat.include_in_measure).toBe(true);
            });
        });

        it("should handle tempo decrease with beats approaching but not reaching target", () => {
            const { newBeats: result, modifiedBeats } =
                _newAndUpdatedBeatsFromTempoGroup({
                    tempo: 180,
                    numRepeats: 1,
                    bigBeatsPerMeasure: 3,
                    fromCreate: true,

                    shouldUpdate: false,
                    endTempo: 120,
                });
            expect(result).toHaveLength(4);
            expect(modifiedBeats).toHaveLength(0);

            // With 3 beats going from 180 to 120, the tempo delta is -20
            // Since tempo changes AFTER each repeat (not each beat):
            // All beats in first repeat: 180
            const expectedDurations = [
                60 / 180, //
                60 / 160,
                60 / 140,
                60 / 120,
            ].map((d) => Number(d.toFixed(8)));

            result.forEach((beat: NewBeatArgs, index: number) => {
                expect(Number(beat.duration.toFixed(8))).toBe(
                    expectedDurations[index],
                );
                expect(beat.include_in_measure).toBe(true);
            });
        });

        describe("mixed meter", () => {
            it.each([
                {
                    bigBeatsPerMeasure: 4,
                    strongBeatIndexes: [1],
                    expectedDurations: [0.5, 0.75, 0.5, 0.5],
                },
                {
                    bigBeatsPerMeasure: 4,
                    strongBeatIndexes: [1, 3],
                    expectedDurations: [0.5, 0.75, 0.5, 0.75],
                },
                {
                    bigBeatsPerMeasure: 3,
                    strongBeatIndexes: [0, 1],
                    expectedDurations: [0.75, 0.75, 0.5],
                },
            ])(
                "should handle mixed meter",
                ({
                    strongBeatIndexes,
                    expectedDurations,
                    bigBeatsPerMeasure,
                }) => {
                    const { newBeats: result, modifiedBeats } =
                        _newAndUpdatedBeatsFromTempoGroup({
                            tempo: 120,
                            numRepeats: 1,
                            bigBeatsPerMeasure,
                            strongBeatIndexes,
                            fromCreate: true,

                            shouldUpdate: false,
                        });
                    expect(result).toHaveLength(bigBeatsPerMeasure + 1); // 1 repeat * 4 beats
                    expect(modifiedBeats).toHaveLength(0);
                    result.forEach((beat: NewBeatArgs, index: number) => {
                        expect(beat.duration, `index: ${index}`).toBe(
                            expectedDurations[index] ??
                                Math.min(...expectedDurations),
                        );
                        expect(beat.include_in_measure).toBe(true);
                    });
                },
            );

            it("should handle mixed meter with two long beats", () => {
                const { newBeats: result, modifiedBeats } =
                    _newAndUpdatedBeatsFromTempoGroup({
                        tempo: 120,
                        numRepeats: 1,
                        bigBeatsPerMeasure: 4,
                        strongBeatIndexes: [1],
                        fromCreate: true,

                        shouldUpdate: false,
                    });
                expect(result).toHaveLength(5); // 1 repeat * 4 beats
                expect(modifiedBeats).toHaveLength(0);
                const expectedDurations = [0.5, 0.75, 0.5, 0.5];
                result.forEach((beat: NewBeatArgs, index: number) => {
                    expect(beat.duration, `index: ${index}`).toBe(
                        expectedDurations[index] ??
                            Math.min(...expectedDurations),
                    );
                    expect(beat.include_in_measure).toBe(true);
                });
            });
        });

        describe("Seeded tests", () => {
            const generate = (seed?: number) => {
                faker.seed(seed);
                const bigBeatsPerMeasure = faker.number.int({
                    min: 5,
                    max: 35,
                });
                const possibleStrongBeatIndexes = Array.from(
                    { length: bigBeatsPerMeasure },
                    (_, i) => i,
                );
                const strongBeatIndexes = faker.helpers.uniqueArray(
                    possibleStrongBeatIndexes,
                    faker.number.int({
                        min: 0,
                        max: possibleStrongBeatIndexes.length,
                    }),
                );
                const tempo = faker.number.int({ min: 32, max: 240 });
                const numRepeats = faker.number.int({ min: 1, max: 200 });

                const smallBeatDuration = 60 / tempo;
                const strongBeatDuration = smallBeatDuration * 1.5;
                const expectedMeasureDurations = Array(bigBeatsPerMeasure)
                    .fill(smallBeatDuration)
                    .map((duration, index) =>
                        strongBeatIndexes.includes(index)
                            ? strongBeatDuration
                            : duration,
                    );

                const output = {
                    bigBeatsPerMeasure,
                    numRepeats,
                    strongBeatIndexes,
                    tempo,
                    expectedMeasureDurations,
                    smallBeatDuration,
                    strongBeatDuration,
                };
                faker.seed();
                return output;
            };
            it.for(seedObj)("%# - {seed: $seed}", (args) => {
                const expectedValues = generate(args.seed);

                const { newBeats: result, modifiedBeats } =
                    _newAndUpdatedBeatsFromTempoGroup({
                        tempo: expectedValues.tempo,
                        numRepeats: expectedValues.numRepeats,
                        bigBeatsPerMeasure: expectedValues.bigBeatsPerMeasure,
                        strongBeatIndexes: expectedValues.strongBeatIndexes,
                        fromCreate: true,

                        shouldUpdate: false,
                    });
                expect(result).toHaveLength(
                    expectedValues.bigBeatsPerMeasure *
                        expectedValues.numRepeats +
                        1,
                );
                expect(modifiedBeats).toHaveLength(0);

                for (
                    let createdBeatIndex = 0;
                    createdBeatIndex < result.length;
                    createdBeatIndex++
                ) {
                    const beatIndex =
                        createdBeatIndex % expectedValues.bigBeatsPerMeasure;

                    if (
                        expectedValues.strongBeatIndexes.includes(beatIndex) &&
                        createdBeatIndex !== result.length - 1 // Last beat should always be a small beat
                    )
                        expect(
                            result[createdBeatIndex].duration,
                            `createdBeatIndex: ${createdBeatIndex}`,
                        ).toBe(expectedValues.strongBeatDuration);
                    else
                        expect(
                            result[createdBeatIndex].duration,
                            `createdBeatIndex: ${createdBeatIndex}`,
                        ).toBe(expectedValues.smallBeatDuration);
                    expect(result[createdBeatIndex].include_in_measure).toBe(
                        true,
                    );
                }
            });
        });
    }); // End of "Creating new beats"

    describe("Updating existing beats (fromCreate: false, with existing beats)", () => {
        describe("should update all existing beats with constant tempo", () => {
            it("should update existing beats and create no new beats when all beats exist", () => {
                // Create existing beats at positions 10-13 (4 beats)
                const existingBeats = Array.from({ length: 4 }, (_, i) => ({
                    id: i + 1,
                    position: i + 10,
                }));

                const { newBeats, modifiedBeats } =
                    _newAndUpdatedBeatsFromTempoGroup({
                        tempo: 120,
                        numRepeats: 1,
                        bigBeatsPerMeasure: 4,
                        fromCreate: false,

                        shouldUpdate: true,
                        startingPosition: 10,
                        existingItems: { beats: existingBeats },
                    });

                expect(newBeats).toHaveLength(0);
                expect(modifiedBeats).toHaveLength(4);
                modifiedBeats.forEach((beat, index) => {
                    expect(beat.id).toBe(existingBeats[index].id);
                    expect(beat.duration).toBe(60 / 120);
                    expect(beat.include_in_measure).toBe(true);
                });
            });

            it("should update existing beats and create new beats when only some beats exist", () => {
                // Create existing beats at positions 10-11 (2 beats)
                const existingBeats = Array.from({ length: 2 }, (_, i) => ({
                    id: i + 1,
                    position: i + 10,
                }));

                const { newBeats, modifiedBeats } =
                    _newAndUpdatedBeatsFromTempoGroup({
                        tempo: 120,
                        numRepeats: 1,
                        bigBeatsPerMeasure: 4,
                        fromCreate: false,

                        shouldUpdate: true,
                        startingPosition: 10,
                        existingItems: { beats: existingBeats },
                    });

                expect(modifiedBeats).toHaveLength(2);
                expect(newBeats).toHaveLength(2);

                // Check modified beats
                modifiedBeats.forEach((beat, index) => {
                    expect(beat.id).toBe(existingBeats[index].id);
                    expect(beat.duration).toBe(60 / 120);
                    expect(beat.include_in_measure).toBe(true);
                });

                // Check new beats
                newBeats.forEach((beat) => {
                    expect(beat.duration).toBe(60 / 120);
                    expect(beat.include_in_measure).toBe(true);
                });
            });

            it("should only consider beats at or after starting position", () => {
                // Create beats at positions 5-15 (11 beats)
                const existingBeats = Array.from({ length: 11 }, (_, i) => ({
                    id: i + 1,
                    position: i + 5,
                }));

                const { newBeats, modifiedBeats } =
                    _newAndUpdatedBeatsFromTempoGroup({
                        tempo: 120,
                        numRepeats: 1,
                        bigBeatsPerMeasure: 4,
                        fromCreate: false,

                        shouldUpdate: true,
                        startingPosition: 10,
                        existingItems: { beats: existingBeats },
                    });

                // Only beats from position 10-15 (6 beats) should be considered
                // We need 4 beats, so 4 should be modified, 0 should be created
                expect(modifiedBeats).toHaveLength(4);
                expect(newBeats).toHaveLength(0);

                // Check that we only modified beats starting from position 10
                expect(modifiedBeats[0].id).toBe(6); // Position 10 is the 6th beat (index 5 + 1)
            });

            it("should handle multiple repeats with existing beats", () => {
                const existingBeats = Array.from({ length: 8 }, (_, i) => ({
                    id: i + 1,
                    position: i + 1,
                }));

                const { newBeats, modifiedBeats } =
                    _newAndUpdatedBeatsFromTempoGroup({
                        tempo: 120,
                        numRepeats: 2,
                        bigBeatsPerMeasure: 4,
                        fromCreate: false,

                        shouldUpdate: true,
                        startingPosition: 0,
                        existingItems: { beats: existingBeats },
                    });

                expect(modifiedBeats).toHaveLength(8);
                expect(newBeats).toHaveLength(0);
                modifiedBeats.forEach((beat) => {
                    expect(beat.duration).toBe(60 / 120);
                    expect(beat.include_in_measure).toBe(true);
                });
            });
        });

        describe("should update existing beats with changing tempo", () => {
            it("should handle endTempo with all existing beats", () => {
                const existingBeats = Array.from({ length: 4 }, (_, i) => ({
                    id: i + 1,
                    position: i + 1,
                }));

                const { newBeats, modifiedBeats } =
                    _newAndUpdatedBeatsFromTempoGroup({
                        tempo: 120,
                        numRepeats: 1,
                        bigBeatsPerMeasure: 4,
                        endTempo: 80,
                        fromCreate: false,

                        shouldUpdate: true,
                        startingPosition: 0,
                        existingItems: { beats: existingBeats },
                    });

                expect(modifiedBeats).toHaveLength(4);
                expect(newBeats).toHaveLength(0);

                const expectedDurations = [
                    60 / 120,
                    60 / 110,
                    60 / 100,
                    60 / 90,
                ].map((d) => Number(d.toFixed(8)));

                modifiedBeats.forEach((beat, index) => {
                    expect(
                        Number(beat.duration!.toFixed(8)),
                        `index: ${index}`,
                    ).toBe(expectedDurations[index]);
                    expect(beat.include_in_measure).toBe(true);
                });
            });

            it("should handle endTempo with partial existing beats", () => {
                const existingBeats = Array.from({ length: 2 }, (_, i) => ({
                    id: i + 1,
                    position: i + 1,
                }));

                const { newBeats, modifiedBeats } =
                    _newAndUpdatedBeatsFromTempoGroup({
                        tempo: 120,
                        numRepeats: 1,
                        bigBeatsPerMeasure: 4,
                        endTempo: 80,
                        fromCreate: false,

                        shouldUpdate: true,
                        startingPosition: 0,
                        existingItems: { beats: existingBeats },
                    });

                expect(modifiedBeats).toHaveLength(2);
                expect(newBeats).toHaveLength(2);

                const expectedDurations = [
                    60 / 120,
                    60 / 110,
                    60 / 100,
                    60 / 90,
                ].map((d) => Number(d.toFixed(8)));

                // Check modified beats
                modifiedBeats.forEach((beat, index) => {
                    expect(
                        Number(beat.duration!.toFixed(8)),
                        `index: ${index}`,
                    ).toBe(expectedDurations[index]);
                    expect(beat.include_in_measure).toBe(true);
                });

                // Check new beats
                newBeats.forEach((beat, index) => {
                    expect(
                        Number(beat.duration.toFixed(8)),
                        `index: ${index + 2}`,
                    ).toBe(expectedDurations[index + 2]);
                    expect(beat.include_in_measure).toBe(true);
                });
            });

            it("should handle multiple repeats with endTempo and existing beats", () => {
                const existingBeats = Array.from({ length: 6 }, (_, i) => ({
                    id: i + 1,
                    position: i + 1,
                }));

                const { newBeats, modifiedBeats } =
                    _newAndUpdatedBeatsFromTempoGroup({
                        tempo: 100,
                        numRepeats: 2,
                        bigBeatsPerMeasure: 3,
                        endTempo: 70,
                        fromCreate: false,

                        shouldUpdate: true,
                        startingPosition: 0,
                        existingItems: { beats: existingBeats },
                    });

                expect(modifiedBeats).toHaveLength(6);
                expect(newBeats).toHaveLength(0);

                const tempoDelta = (70 - 100) / 6;
                const expectedTempos = Array.from(
                    { length: 6 },
                    (_, i) => 100 + tempoDelta * i,
                );
                const expectedDurations = expectedTempos.map((tempo) =>
                    Number((60 / tempo).toFixed(8)),
                );

                modifiedBeats.forEach((beat, index) => {
                    expect(
                        Number(beat.duration!.toFixed(8)),
                        `index: ${index}`,
                    ).toBe(expectedDurations[index]);
                    expect(beat.include_in_measure).toBe(true);
                });
            });
        });

        describe("should handle mixed meter with existing beats", () => {
            it("should update beats with mixed meter pattern", () => {
                const existingBeats = Array.from({ length: 4 }, (_, i) => ({
                    id: i + 1,
                    position: i + 1,
                }));

                const { newBeats, modifiedBeats } =
                    _newAndUpdatedBeatsFromTempoGroup({
                        tempo: 120,
                        numRepeats: 1,
                        bigBeatsPerMeasure: 4,
                        strongBeatIndexes: [1],
                        fromCreate: false,

                        shouldUpdate: true,
                        startingPosition: 0,
                        existingItems: { beats: existingBeats },
                    });

                expect(modifiedBeats).toHaveLength(4);
                expect(newBeats).toHaveLength(0);

                const expectedDurations = [0.5, 0.75, 0.5, 0.5];
                modifiedBeats.forEach((beat, index) => {
                    expect(beat.duration, `index: ${index}`).toBe(
                        expectedDurations[index],
                    );
                    expect(beat.include_in_measure).toBe(true);
                });
            });

            it("should update beats with mixed meter and multiple strong beats", () => {
                const existingBeats = Array.from({ length: 4 }, (_, i) => ({
                    id: i + 1,
                    position: i + 1,
                }));

                const { newBeats, modifiedBeats } =
                    _newAndUpdatedBeatsFromTempoGroup({
                        tempo: 120,
                        numRepeats: 1,
                        bigBeatsPerMeasure: 4,
                        strongBeatIndexes: [1, 3],
                        fromCreate: false,

                        shouldUpdate: true,
                        startingPosition: 0,
                        existingItems: { beats: existingBeats },
                    });

                expect(modifiedBeats).toHaveLength(4);
                expect(newBeats).toHaveLength(0);

                const expectedDurations = [0.5, 0.75, 0.5, 0.75];
                modifiedBeats.forEach((beat, index) => {
                    expect(beat.duration, `index: ${index}`).toBe(
                        expectedDurations[index],
                    );
                    expect(beat.include_in_measure).toBe(true);
                });
            });

            it("should handle mixed meter with partial existing beats", () => {
                const existingBeats = Array.from({ length: 2 }, (_, i) => ({
                    id: i + 1,
                    position: i + 1,
                }));

                const { newBeats, modifiedBeats } =
                    _newAndUpdatedBeatsFromTempoGroup({
                        tempo: 120,
                        numRepeats: 1,
                        bigBeatsPerMeasure: 4,
                        strongBeatIndexes: [1, 3],
                        fromCreate: false,

                        shouldUpdate: true,
                        startingPosition: 0,
                        existingItems: { beats: existingBeats },
                    });

                expect(modifiedBeats).toHaveLength(2);
                expect(newBeats).toHaveLength(2);

                const expectedDurations = [0.5, 0.75, 0.5, 0.75];

                // Check modified beats
                modifiedBeats.forEach((beat, index) => {
                    expect(beat.duration, `index: ${index}`).toBe(
                        expectedDurations[index],
                    );
                    expect(beat.include_in_measure).toBe(true);
                });

                // Check new beats
                newBeats.forEach((beat, index) => {
                    expect(beat.duration, `index: ${index + 2}`).toBe(
                        expectedDurations[index + 2],
                    );
                    expect(beat.include_in_measure).toBe(true);
                });
            });
        });

        describe("edge cases with existing beats", () => {
            it("should handle starting position with no beats after it", () => {
                const existingBeats = Array.from({ length: 3 }, (_, i) => ({
                    id: i + 1,
                    position: i + 1,
                }));

                const { newBeats, modifiedBeats } =
                    _newAndUpdatedBeatsFromTempoGroup({
                        tempo: 120,
                        numRepeats: 1,
                        bigBeatsPerMeasure: 2,
                        fromCreate: false,

                        shouldUpdate: true,
                        startingPosition: 10, // After all existing beats
                        existingItems: { beats: existingBeats },
                    });

                // No beats at or after position 10, so all should be new
                expect(modifiedBeats).toHaveLength(0);
                expect(newBeats).toHaveLength(2);
            });

            it("should handle empty existing beats array", () => {
                const { newBeats, modifiedBeats } =
                    _newAndUpdatedBeatsFromTempoGroup({
                        tempo: 120,
                        numRepeats: 1,
                        bigBeatsPerMeasure: 4,
                        fromCreate: false,

                        shouldUpdate: true,
                        startingPosition: 0,
                        existingItems: { beats: [] },
                    });

                // With no existing beats, all should be new
                expect(modifiedBeats).toHaveLength(0);
                expect(newBeats).toHaveLength(4);
            });

            it("should handle very fast tempo with existing beats", () => {
                const existingBeats = Array.from({ length: 2 }, (_, i) => ({
                    id: i + 1,
                    position: i + 1,
                }));

                const { newBeats, modifiedBeats } =
                    _newAndUpdatedBeatsFromTempoGroup({
                        tempo: 240,
                        numRepeats: 1,
                        bigBeatsPerMeasure: 2,
                        fromCreate: false,

                        shouldUpdate: true,
                        startingPosition: 0,
                        existingItems: { beats: existingBeats },
                    });

                expect(modifiedBeats).toHaveLength(2);
                expect(newBeats).toHaveLength(0);
                modifiedBeats.forEach((beat) => {
                    expect(beat.duration).toBe(0.25); // 60/240 = 0.25
                    expect(beat.include_in_measure).toBe(true);
                });
            });

            it("should handle very slow tempo with existing beats", () => {
                const existingBeats = Array.from({ length: 2 }, (_, i) => ({
                    id: i + 1,
                    position: i + 1,
                }));

                const { newBeats, modifiedBeats } =
                    _newAndUpdatedBeatsFromTempoGroup({
                        tempo: 30,
                        numRepeats: 1,
                        bigBeatsPerMeasure: 2,
                        fromCreate: false,

                        shouldUpdate: true,
                        startingPosition: 0,
                        existingItems: { beats: existingBeats },
                    });

                expect(modifiedBeats).toHaveLength(2);
                expect(newBeats).toHaveLength(0);
                modifiedBeats.forEach((beat) => {
                    expect(beat.duration).toBe(2); // 60/30 = 2
                    expect(beat.include_in_measure).toBe(true);
                });
            });
        });

        describe("seeded tests with existing beats", () => {
            const generateWithExisting = (
                seed?: number,
                percentExisting: number = 0.5,
            ) => {
                faker.seed(seed);
                const bigBeatsPerMeasure = faker.number.int({
                    min: 2,
                    max: 20,
                });
                const numRepeats = faker.number.int({ min: 1, max: 10 });
                const totalBeatsNeeded = bigBeatsPerMeasure * numRepeats;
                const numExistingBeats = Math.floor(
                    totalBeatsNeeded * percentExisting,
                );

                const existingBeats = Array.from(
                    { length: numExistingBeats },
                    (_, i) => ({
                        id: i + 1,
                        position: i + 1,
                    }),
                );

                const tempo = faker.number.int({ min: 32, max: 240 });
                const hasEndTempo = faker.datatype.boolean();
                const endTempo = hasEndTempo
                    ? faker.number.int({ min: 32, max: 240 })
                    : undefined;

                const output = {
                    tempo,
                    numRepeats,
                    bigBeatsPerMeasure,
                    endTempo,
                    fromCreate: false,

                    shouldUpdate: true,
                    startingPosition: 0,
                    existingItems: { beats: existingBeats },
                    numExistingBeats,
                    totalBeatsNeeded,
                };
                faker.seed();
                return output;
            };

            it.for(
                Array.from({ length: SEED_AMOUNT }, (_, i) => ({ seed: i })),
            )("%# - seed: $seed - all beats exist", (args) => {
                const testData = generateWithExisting(args.seed, 1.0);
                const { newBeats, modifiedBeats } =
                    _newAndUpdatedBeatsFromTempoGroup(testData);

                expect(modifiedBeats).toHaveLength(testData.totalBeatsNeeded);
                expect(newBeats).toHaveLength(0);

                modifiedBeats.forEach((beat) => {
                    expect(beat.include_in_measure).toBe(true);
                    expect(beat.duration).toBeGreaterThan(0);
                });
            });

            it.for(
                Array.from({ length: SEED_AMOUNT }, (_, i) => ({ seed: i })),
            )("%# - seed: $seed - half beats exist", (args) => {
                const testData = generateWithExisting(args.seed, 0.5);
                const { newBeats, modifiedBeats } =
                    _newAndUpdatedBeatsFromTempoGroup(testData);

                expect(modifiedBeats.length + newBeats.length).toBe(
                    testData.totalBeatsNeeded,
                );
                expect(modifiedBeats).toHaveLength(testData.numExistingBeats);
                expect(newBeats).toHaveLength(
                    testData.totalBeatsNeeded - testData.numExistingBeats,
                );

                modifiedBeats.forEach((beat) => {
                    expect(beat.include_in_measure).toBe(true);
                    expect(beat.duration).toBeGreaterThan(0);
                });

                newBeats.forEach((beat) => {
                    expect(beat.include_in_measure).toBe(true);
                    expect(beat.duration).toBeGreaterThan(0);
                });
            });

            it.for(
                Array.from({ length: SEED_AMOUNT }, (_, i) => ({ seed: i })),
            )("%# - seed: $seed - quarter beats exist", (args) => {
                const testData = generateWithExisting(args.seed, 0.25);
                const { newBeats, modifiedBeats } =
                    _newAndUpdatedBeatsFromTempoGroup(testData);

                expect(modifiedBeats.length + newBeats.length).toBe(
                    testData.totalBeatsNeeded,
                );
                expect(modifiedBeats).toHaveLength(testData.numExistingBeats);

                modifiedBeats.forEach((beat) => {
                    expect(beat.include_in_measure).toBe(true);
                    expect(beat.duration).toBeGreaterThan(0);
                });

                newBeats.forEach((beat) => {
                    expect(beat.include_in_measure).toBe(true);
                    expect(beat.duration).toBeGreaterThan(0);
                });
            });
        });
    });

    describe("fromCreate behavior differences", () => {
        it("fromCreate: true should add extra beat at end", () => {
            const { newBeats } = _newAndUpdatedBeatsFromTempoGroup({
                tempo: 120,
                numRepeats: 1,
                bigBeatsPerMeasure: 4,
                fromCreate: true,

                shouldUpdate: false,
                startingPosition: 0,
            });

            // Should have 4 beats + 1 extra beat
            expect(newBeats).toHaveLength(5);
        });

        it("fromCreate: false should not add extra beat at end", () => {
            const { newBeats } = _newAndUpdatedBeatsFromTempoGroup({
                tempo: 120,
                numRepeats: 1,
                bigBeatsPerMeasure: 4,
                fromCreate: false,

                shouldUpdate: true,
                startingPosition: 0,
            });

            // Should have exactly 4 beats, no extra
            expect(newBeats).toHaveLength(4);
        });

        it("fromCreate: true with existing beats should add extra beat if needed", () => {
            const existingBeats = Array.from({ length: 3 }, (_, i) => ({
                id: i + 1,
                position: i + 1,
            }));

            const { newBeats, modifiedBeats } =
                _newAndUpdatedBeatsFromTempoGroup({
                    tempo: 120,
                    numRepeats: 1,
                    bigBeatsPerMeasure: 4,
                    fromCreate: true,

                    shouldUpdate: true,
                    startingPosition: 0,
                    existingItems: { beats: existingBeats },
                });

            expect(modifiedBeats).toHaveLength(3);
            // Should create 1 regular beat + 1 extra beat
            expect(newBeats).toHaveLength(2);
        });

        it("fromCreate: true with all existing beats should still add extra beat", () => {
            const existingBeats = Array.from({ length: 4 }, (_, i) => ({
                id: i + 1,
                position: i + 1,
            }));

            const { newBeats, modifiedBeats } =
                _newAndUpdatedBeatsFromTempoGroup({
                    tempo: 120,
                    numRepeats: 1,
                    bigBeatsPerMeasure: 4,
                    fromCreate: true,

                    shouldUpdate: true,
                    startingPosition: 0,
                    existingItems: { beats: existingBeats },
                });

            expect(modifiedBeats).toHaveLength(4);
            // Should create 1 extra beat at the end
            expect(newBeats).toHaveLength(1);
        });
    });
});

describe("getNewMeasuresFromCreatedBeats", () => {
    // Helper function to create a mock beat
    const createMockBeat = (id: number, position?: number): Beat => ({
        id,
        position: position ?? faker.number.int({ min: 1, max: 100 }),
        duration: 0.5,
        includeInMeasure: true,
        notes: null,
        index: faker.number.int({ min: 1, max: 100 }),
        timestamp: faker.number.float({ min: 1, max: 100 }),
    });

    it("should create one measure for single repeat", () => {
        const beats = [
            createMockBeat(1),
            createMockBeat(2),
            createMockBeat(3),
            createMockBeat(4),
            createMockBeat(5),
        ];

        const { newMeasureArgs } = getNewMeasuresFromCreatedBeats({
            createdBeats: beats,
            numOfRepeats: 1,
            bigBeatsPerMeasure: 4,
            existingItems: {
                measures: [],
                beats: [],
            },
        });

        expect(newMeasureArgs).toHaveLength(2);
        expect(newMeasureArgs[0]).toEqual({
            start_beat: 1,
        });
        expect(newMeasureArgs[1]).toEqual({
            start_beat: 5,
            is_ghost: 1,
        });
    });

    it("should create multiple measures for multiple repeats", () => {
        const beats = [
            createMockBeat(1),
            createMockBeat(2),
            createMockBeat(3),
            createMockBeat(4),
            createMockBeat(5),
            createMockBeat(6),
            createMockBeat(7),
            createMockBeat(8),
            createMockBeat(9),
        ];

        const { newMeasureArgs } = getNewMeasuresFromCreatedBeats({
            createdBeats: beats,
            numOfRepeats: 2,
            bigBeatsPerMeasure: 4,
            existingItems: {
                measures: [],
                beats: [],
            },
        });

        expect(newMeasureArgs).toHaveLength(3);
        expect(newMeasureArgs[0]).toEqual({
            start_beat: 1,
        });
        expect(newMeasureArgs[1]).toEqual({
            start_beat: 5,
        });
        expect(newMeasureArgs[2]).toEqual({
            start_beat: 9,
            is_ghost: 1,
        });
    });

    it("should handle single beat per measure", () => {
        const beats = [
            createMockBeat(1),
            createMockBeat(2),
            createMockBeat(3),
            createMockBeat(4),
        ];

        const { newMeasureArgs } = getNewMeasuresFromCreatedBeats({
            createdBeats: beats,
            numOfRepeats: 3,
            bigBeatsPerMeasure: 1,
            existingItems: {
                measures: [],
                beats: [],
            },
        });

        expect(newMeasureArgs).toHaveLength(4);
        expect(newMeasureArgs[0]).toEqual({ start_beat: 1 });
        expect(newMeasureArgs[1]).toEqual({ start_beat: 2 });
        expect(newMeasureArgs[2]).toEqual({ start_beat: 3 });
        expect(newMeasureArgs[3]).toEqual({ start_beat: 4, is_ghost: 1 });
    });

    it("should handle large number of beats per measure", () => {
        const beats = Array.from({ length: 17 }, (_, i) =>
            createMockBeat(i + 1),
        );

        const { newMeasureArgs } = getNewMeasuresFromCreatedBeats({
            createdBeats: beats,
            numOfRepeats: 2,
            bigBeatsPerMeasure: 8,
            existingItems: {
                measures: [],
                beats: [],
            },
        });

        expect(newMeasureArgs).toHaveLength(3);
        expect(newMeasureArgs[0]).toEqual({ start_beat: 1 });
        expect(newMeasureArgs[1]).toEqual({ start_beat: 9 });
        expect(newMeasureArgs[2]).toEqual({ start_beat: 17, is_ghost: 1 });
    });

    it("should handle edge case with single repeat and single beat", () => {
        const beats = [createMockBeat(1), createMockBeat(2)];

        const { newMeasureArgs } = getNewMeasuresFromCreatedBeats({
            createdBeats: beats,
            numOfRepeats: 1,
            bigBeatsPerMeasure: 1,
            existingItems: {
                measures: [],
                beats: [],
            },
        });

        expect(newMeasureArgs).toHaveLength(2);
        expect(newMeasureArgs[0]).toEqual({ start_beat: 1 });
        expect(newMeasureArgs[1]).toEqual({ start_beat: 2, is_ghost: 1 });
    });

    describe("Seeded tests", () => {
        const generate = (seed?: number) => {
            faker.seed(seed);
            const bigBeatsPerMeasure = faker.number.int({ min: 1, max: 35 });
            const numOfRepeats = faker.number.int({ min: 1, max: 200 });
            const beats = Array.from(
                { length: bigBeatsPerMeasure * numOfRepeats + 1 },
                (_, i) => createMockBeat(i + 1),
            );
            faker.seed();
            return { bigBeatsPerMeasure, numOfRepeats, beats };
        };
        it.for(seedObj)("%# - {seed: $seed}", (args) => {
            const expectedValues = generate(args.seed);
            const { newMeasureArgs } = getNewMeasuresFromCreatedBeats({
                createdBeats: expectedValues.beats,
                numOfRepeats: expectedValues.numOfRepeats,
                bigBeatsPerMeasure: expectedValues.bigBeatsPerMeasure,
                existingItems: {
                    measures: [],
                    beats: [],
                },
            });
            expect(newMeasureArgs).toHaveLength(
                expectedValues.numOfRepeats + 1,
            );
            for (let i = 0; i < newMeasureArgs.length - 1; i++) {
                expect(newMeasureArgs[i]).toMatchObject({
                    start_beat:
                        expectedValues.beats[
                            i * expectedValues.bigBeatsPerMeasure
                        ].id,
                });
            }
            expect(newMeasureArgs[newMeasureArgs.length - 1]).toMatchObject({
                start_beat:
                    expectedValues.beats[expectedValues.beats.length - 1].id,
                is_ghost: 1,
            });
        });
    });

    describe("with existing items", () => {
        it("should replace the last measure if it is a ghost", () => {
            const oldBeats = Array.from({ length: 10 }, (_, i) =>
                createMockBeat(i + 1, i),
            );
            const existingItems: ExistingItems = {
                measures: [
                    {
                        id: 1,
                        isGhost: false,
                        startBeat: oldBeats[0],
                    },
                    {
                        id: 2,
                        isGhost: false,
                        startBeat: oldBeats[4],
                    },
                    {
                        id: 3,
                        isGhost: false,
                        startBeat: oldBeats[8],
                    },
                    {
                        id: 4,
                        isGhost: true,
                        startBeat: oldBeats[oldBeats.length - 1],
                    },
                ],
                beats: oldBeats.map((beat) => ({
                    id: beat.id,
                    position: beat.position,
                })),
            };
            const newBeats = [];
            // create 8 new measures
            for (let i = 11; i <= 19; i++) newBeats.push(createMockBeat(i));

            const { newMeasureArgs, modifiedMeasureArgs } =
                getNewMeasuresFromCreatedBeats({
                    createdBeats: newBeats,
                    numOfRepeats: 2,
                    bigBeatsPerMeasure: 4,
                    existingItems,
                });

            expect(modifiedMeasureArgs).toHaveLength(1);
            expect(modifiedMeasureArgs[0]).toEqual({
                id: 4,
                is_ghost: 0,
            });

            expect(newMeasureArgs).toHaveLength(2);

            expect(newMeasureArgs[0]).toMatchObject({
                start_beat: 15,
            });
            expect(newMeasureArgs[1]).toMatchObject({
                start_beat: 19,
                is_ghost: 1,
            });
        });

        it("should replace ghost measures with property-based testing", () => {
            // Create arbitraries for property-based testing
            const beatArbitrary = fc.record({
                id: fc.integer({ min: 1, max: 1000 }),
                position: fc.integer({ min: 0, max: 1000 }),
                duration: fc.float({
                    min: Math.fround(0.1),
                    max: Math.fround(10),
                }),
                includeInMeasure: fc.constant(true),
                notes: fc.constant(null),
                index: fc.integer({ min: 0, max: 1000 }),
                timestamp: fc.float({
                    min: Math.fround(0),
                    max: Math.fround(1000),
                }),
            });

            const measureArbitrary = fc.record({
                id: fc.integer({ min: 1, max: 100 }),
                isGhost: fc.boolean(),
                startBeat: beatArbitrary,
            });

            const existingItemsArbitrary = fc.record({
                measures: fc.array(measureArbitrary, {
                    minLength: 0,
                    maxLength: 10,
                }),
                beats: fc.array(
                    fc.record({
                        id: fc.integer({ min: 1, max: 1000 }),
                        position: fc.integer({ min: 0, max: 1000 }),
                    }),
                    { minLength: 0, maxLength: 50 },
                ),
            });

            const testParamsArbitrary = fc
                .record({
                    createdBeats: fc.array(beatArbitrary, {
                        minLength: 1,
                        maxLength: 20,
                    }),
                    numOfRepeats: fc.integer({ min: 1, max: 5 }),
                    bigBeatsPerMeasure: fc.integer({ min: 2, max: 8 }),
                    existingItems: existingItemsArbitrary,
                })
                .filter(
                    ({ createdBeats, numOfRepeats, bigBeatsPerMeasure }) => {
                        // Ensure we have enough beats for the number of repeats plus one extra for the ghost measure
                        const totalBeatsNeeded =
                            numOfRepeats * bigBeatsPerMeasure + 1;

                        // Ensure all beats have unique IDs
                        const uniqueIds = new Set(
                            createdBeats.map((beat) => beat.id),
                        );
                        const hasUniqueIds =
                            uniqueIds.size === createdBeats.length;

                        // Ensure all beats have unique positions
                        const uniquePositions = new Set(
                            createdBeats.map((beat) => beat.position),
                        );
                        const hasUniquePositions =
                            uniquePositions.size === createdBeats.length;

                        return (
                            createdBeats.length >= totalBeatsNeeded &&
                            hasUniqueIds &&
                            hasUniquePositions
                        );
                    },
                );

            fc.assert(
                fc.property(
                    testParamsArbitrary,
                    ({
                        createdBeats,
                        numOfRepeats,
                        bigBeatsPerMeasure,
                        existingItems,
                    }) => {
                        const { newMeasureArgs, modifiedMeasureArgs } =
                            getNewMeasuresFromCreatedBeats({
                                createdBeats,
                                numOfRepeats,
                                bigBeatsPerMeasure,
                                existingItems,
                            });

                        // Property 1: If the measure with highest position is ghost, it should be modified
                        // Use the same logic as _getLastMeasure to find the last measure
                        const lastMeasure =
                            existingItems.measures.length > 0
                                ? existingItems.measures.reduce(
                                      (last, current) => {
                                          if (
                                              current.startBeat.position >
                                              last.startBeat.position
                                          ) {
                                              return current;
                                          } else if (
                                              current.startBeat.position ===
                                              last.startBeat.position
                                          ) {
                                              // When positions are equal, prefer the one that appears later in the array
                                              return current;
                                          } else {
                                              return last;
                                          }
                                      },
                                      existingItems.measures[0],
                                  )
                                : undefined;

                        if (lastMeasure && lastMeasure.isGhost) {
                            expect(modifiedMeasureArgs).toHaveLength(1);
                            expect(modifiedMeasureArgs[0].id).toBe(
                                lastMeasure.id,
                            );
                            expect(modifiedMeasureArgs[0].is_ghost).toBe(0);
                        }

                        // Property 2: Number of new measures should match numOfRepeats (plus ghost measure)
                        // When replacing a ghost measure, we create numOfRepeats - 1 new measures (since first repeat replaces ghost) plus 1 ghost
                        // When not replacing, we create numOfRepeats new measures (all repeats) plus 1 ghost
                        const expectedNewMeasures =
                            lastMeasure && lastMeasure.isGhost
                                ? numOfRepeats // numOfRepeats - 1 for repeats + 1 for ghost = numOfRepeats total
                                : numOfRepeats + 1; // Regular case: all repeats plus ghost
                        expect(newMeasureArgs).toHaveLength(
                            expectedNewMeasures,
                        );

                        // Property 3: Last new measure should always be a ghost
                        const lastNewMeasure =
                            newMeasureArgs[newMeasureArgs.length - 1];
                        expect(lastNewMeasure.is_ghost).toBe(1);

                        // Property 4: Start beats should be from createdBeats at correct intervals
                        // When replacing a ghost measure, the first new measure starts at the second repeat's beat
                        const startIndex =
                            lastMeasure && lastMeasure.isGhost ? 1 : 0;
                        for (let i = 0; i < newMeasureArgs.length - 1; i++) {
                            // -1 to exclude ghost measure
                            const expectedStartBeat =
                                createdBeats[
                                    (startIndex + i) * bigBeatsPerMeasure
                                ].id;
                            expect(newMeasureArgs[i].start_beat).toBe(
                                expectedStartBeat,
                            );
                        }

                        // Property 5: Ghost measure should start at the last beat
                        const lastBeat = createdBeats[createdBeats.length - 1];
                        expect(lastNewMeasure.start_beat).toBe(lastBeat.id);

                        // Property 6: If no existing measures or last measure is not ghost, no modifications
                        if (
                            !existingItems.measures.length ||
                            !lastMeasure?.isGhost
                        ) {
                            expect(modifiedMeasureArgs).toHaveLength(0);
                        }

                        return true; // Property holds
                    },
                ),
                { numRuns: 100 },
            );
        });
    });
});

describe("getLastBeatOfTempoGroup", () => {
    // Helper function to create a mock beat
    const createMockBeat = (duration: number): Beat => ({
        id: Math.random(),
        position: Math.random(),
        duration,
        includeInMeasure: true,
        notes: null,
        index: Math.random(),
        timestamp: Math.random(),
    });

    // Helper function to create a mock measure
    const createMockMeasure = ({
        beats,
        rehearsalMark = null,
        number = 1,
        id = Math.random(),
    }: {
        beats: Beat[];
        rehearsalMark?: string | null;
        number?: number;
        id?: number;
    }): Measure => ({
        id,
        startBeat: beats[0],
        number,
        rehearsalMark,
        notes: null,
        duration: beats.reduce((sum, beat) => sum + beat.duration, 0),
        counts: beats.length,
        beats,
        timestamp: Math.random(),
        isGhost: false,
    });

    it("should return undefined for tempo group with no measures", () => {
        const tempoGroup = {
            name: "Test",
            tempo: 120,
            bigBeatsPerMeasure: 4,
            numOfRepeats: 1,
            measures: [],
            measureRangeString: "",
            type: "real" as const,
        };

        expect(getLastBeatOfTempoGroup(tempoGroup)).toBeUndefined();
    });

    it("should return undefined for tempo group with undefined measures", () => {
        const tempoGroup = {
            name: "Test",
            tempo: 120,
            bigBeatsPerMeasure: 4,
            numOfRepeats: 1,
            measureRangeString: "",
        };

        expect(getLastBeatOfTempoGroup(tempoGroup as any)).toBeUndefined();
    });

    it("should return the last beat of the last measure in the tempo group", () => {
        const beats1 = [createMockBeat(0.5), createMockBeat(0.5)];
        const beats2 = [
            createMockBeat(0.5),
            createMockBeat(0.5),
            createMockBeat(0.5),
        ];

        const measures = [
            createMockMeasure({ beats: beats1 }),
            createMockMeasure({ beats: beats2 }),
        ];

        const tempoGroup = {
            name: "Test",
            tempo: 120,
            bigBeatsPerMeasure: 4,
            numOfRepeats: 1,
            measures,
            measureRangeString: "m 1-2",
            type: "real" as const,
        };

        const result = getLastBeatOfTempoGroup(tempoGroup);
        expect(result).toBeDefined();
        expect(result).toBe(beats2[beats2.length - 1]);
    });

    it("should return the last beat of a single measure tempo group", () => {
        const beats = [createMockBeat(0.5), createMockBeat(0.5)];
        const measure = createMockMeasure({ beats });

        const tempoGroup = {
            name: "Test",
            tempo: 120,
            bigBeatsPerMeasure: 2,
            numOfRepeats: 1,
            measures: [measure],
            measureRangeString: "m 1",
            type: "real" as const,
        };

        const result = getLastBeatOfTempoGroup(tempoGroup);
        expect(result).toBeDefined();
        expect(result).toBe(beats[beats.length - 1]);
    });

    it("Exact number of existing beats and new beats", () => {
        const args = {
            tempo: 120,
            numRepeats: 4,
            bigBeatsPerMeasure: 4,
            startingPosition: 1,
            fromCreate: true,
            shouldUpdate: true,
            existingItems: {
                measures: [],
                beats: [
                    {
                        id: 0,
                        position: 0,
                        duration: 0,
                        includeInMeasure: true,
                        notes: null,
                        index: 0,
                        timestamp: 0,
                    },
                    {
                        id: 1,
                        position: 1,
                        duration: 0.3,
                        includeInMeasure: true,
                        notes: null,
                        index: 1,
                        timestamp: 0,
                    },
                    {
                        id: 2,
                        position: 2,
                        duration: 0.3,
                        includeInMeasure: true,
                        notes: null,
                        index: 2,
                        timestamp: 0.3,
                    },
                    {
                        id: 3,
                        position: 3,
                        duration: 0.3,
                        includeInMeasure: true,
                        notes: null,
                        index: 3,
                        timestamp: 0.6,
                    },
                    {
                        id: 4,
                        position: 4,
                        duration: 0.3,
                        includeInMeasure: true,
                        notes: null,
                        index: 4,
                        timestamp: 0.8999999999999999,
                    },
                    {
                        id: 5,
                        position: 5,
                        duration: 0.3,
                        includeInMeasure: true,
                        notes: null,
                        index: 5,
                        timestamp: 1.2,
                    },
                    {
                        id: 6,
                        position: 6,
                        duration: 0.3,
                        includeInMeasure: true,
                        notes: null,
                        index: 6,
                        timestamp: 1.5,
                    },
                    {
                        id: 7,
                        position: 7,
                        duration: 0.3,
                        includeInMeasure: true,
                        notes: null,
                        index: 7,
                        timestamp: 1.8,
                    },
                    {
                        id: 8,
                        position: 8,
                        duration: 0.3,
                        includeInMeasure: true,
                        notes: null,
                        index: 8,
                        timestamp: 2.1,
                    },
                    {
                        id: 9,
                        position: 9,
                        duration: 0.3,
                        includeInMeasure: true,
                        notes: null,
                        index: 9,
                        timestamp: 2.4,
                    },
                    {
                        id: 10,
                        position: 10,
                        duration: 0.3,
                        includeInMeasure: true,
                        notes: null,
                        index: 10,
                        timestamp: 2.6999999999999997,
                    },
                    {
                        id: 11,
                        position: 11,
                        duration: 0.3,
                        includeInMeasure: true,
                        notes: null,
                        index: 11,
                        timestamp: 2.9999999999999996,
                    },
                    {
                        id: 12,
                        position: 12,
                        duration: 0.3,
                        includeInMeasure: true,
                        notes: null,
                        index: 12,
                        timestamp: 3.2999999999999994,
                    },
                    {
                        id: 13,
                        position: 13,
                        duration: 0.3,
                        includeInMeasure: true,
                        notes: null,
                        index: 13,
                        timestamp: 3.599999999999999,
                    },
                    {
                        id: 14,
                        position: 14,
                        duration: 0.3,
                        includeInMeasure: true,
                        notes: null,
                        index: 14,
                        timestamp: 3.899999999999999,
                    },
                    {
                        id: 15,
                        position: 15,
                        duration: 0.3,
                        includeInMeasure: true,
                        notes: null,
                        index: 15,
                        timestamp: 4.199999999999999,
                    },
                    {
                        id: 16,
                        position: 16,
                        duration: 0.3,
                        includeInMeasure: true,
                        notes: null,
                        index: 16,
                        timestamp: 4.499999999999999,
                    },
                ],
            },
        };

        const { newBeats, modifiedBeats } =
            _newAndUpdatedBeatsFromTempoGroup(args);

        expect(newBeats, "should create a single beat").toHaveLength(1);
        const newBeat = newBeats[0];
        expect(
            newBeat.duration,
            "new beat should have same duration as the tempo group",
        ).toBe(0.5);
        expect(modifiedBeats).toHaveLength(16);
        const expectedIds = [
            1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17,
        ];
        modifiedBeats.forEach((beat) => {
            expect(
                beat.duration,
                "modified beat should have same duration as the tempo group",
            ).toBe(0.5);
            expect(expectedIds, "modified beat ID should be [1,16]").toContain(
                beat.id,
            );
        });
    });
});

describe("tempoGroupForNoMeasures", () => {
    describe("from seconds", () => {
        it("should create a tempo group from seconds", () => {
            const tempoGroup = tempoGroupForNoMeasures({
                numberOfBeats: 10,
                totalDurationSeconds: 5,
            });
            expect(tempoGroup.tempo).toBe(120);
            expect(tempoGroup.numOfRepeats).toBe(1);
            expect(tempoGroup.bigBeatsPerMeasure).toBe(10);
            expect(tempoGroup.type).toBe("ghost");
            expect(tempoGroup.name).toBe("");
        });
        it("broad tests", () => {
            fc.assert(
                fc.property(
                    fc.record({
                        numberOfBeats: fc.integer({ min: 1 }),
                        name: fc.option(fc.string(), { nil: undefined }),
                        totalDurationSeconds: fc.float({
                            min: Math.fround(0.00001),
                        }),
                    }),
                    (args) => {
                        const tempoGroup = tempoGroupForNoMeasures(args);

                        expect(tempoGroup.name).toEqual(
                            args.name == null ? "" : args.name,
                        );
                        expect(tempoGroup.tempo).toBe(
                            (args.numberOfBeats / args.totalDurationSeconds) *
                                60,
                        );
                        expect(tempoGroup.type).toEqual("ghost");
                        expect(tempoGroup.numOfRepeats).toBe(1);
                        expect(tempoGroup.bigBeatsPerMeasure).toBe(
                            args.numberOfBeats,
                        );
                    },
                ),
            );
        });
    });
    describe("from tempo", () => {
        it("should create a tempo group from seconds", () => {
            const tempoGroup = tempoGroupForNoMeasures({
                numberOfBeats: 10,
                tempoBpm: 120,
            });
            expect(tempoGroup.tempo).toBe(120);
            expect(tempoGroup.numOfRepeats).toBe(1);
            expect(tempoGroup.bigBeatsPerMeasure).toBe(10);
            expect(tempoGroup.type).toBe("ghost");
            expect(tempoGroup.name).toBe("");
        });
        it("broad tests", () => {
            fc.assert(
                fc.property(
                    fc.record({
                        numberOfBeats: fc.integer({ min: 1 }),
                        name: fc.option(fc.string(), { nil: undefined }),
                        tempoBpm: fc.integer({ min: 1 }),
                    }),
                    (args) => {
                        const tempoGroup = tempoGroupForNoMeasures(args);

                        expect(tempoGroup.name).toEqual(
                            args.name == null ? "" : args.name,
                        );
                        expect(tempoGroup.tempo).toBe(args.tempoBpm);
                        expect(tempoGroup.type).toEqual("ghost");
                        expect(tempoGroup.numOfRepeats).toBe(1);
                        expect(tempoGroup.bigBeatsPerMeasure).toBe(
                            args.numberOfBeats,
                        );
                    },
                ),
            );
        });
    });
});

describe("_lastMeasureIsGhost", () => {
    // Helper function to create a mock beat for these tests
    const createBeat = (id: number, position: number): Beat => ({
        id,
        position,
        duration: 0.5,
        includeInMeasure: true,
        notes: null,
        index: 0,
        timestamp: position,
    });

    // Helper function to create a mock measure for these tests
    const createMeasure = (
        id: number,
        isGhost: boolean,
        beatPosition: number,
    ): Pick<Measure, "id" | "isGhost" | "startBeat"> => ({
        id,
        isGhost,
        startBeat: createBeat(id, beatPosition),
    });

    describe("base examples", () => {
        it("should return true when the last measure is a ghost measure", () => {
            const existingItems = {
                measures: [
                    createMeasure(1, false, 0),
                    createMeasure(2, false, 10),
                    createMeasure(3, true, 20), // Last by position, is ghost
                ],
                beats: [createBeat(1, 0), createBeat(2, 10), createBeat(3, 20)],
            };

            expect(_lastMeasureIsGhost({ existingItems })).toBe(true);
        });

        it("should return false when the last measure is not a ghost measure", () => {
            const existingItems = {
                measures: [
                    createMeasure(1, false, 0),
                    createMeasure(2, true, 10), // Ghost but not last
                    createMeasure(3, false, 20), // Last by position, not ghost
                ],
                beats: [createBeat(1, 0), createBeat(2, 10), createBeat(3, 20)],
            };

            expect(_lastMeasureIsGhost({ existingItems })).toBe(false);
        });

        it("should return correct value when measures are out of order in array", () => {
            const existingItems = {
                measures: [
                    createMeasure(2, false, 20), // Actually second by position
                    createMeasure(1, false, 0), // Actually first by position
                    createMeasure(3, true, 30), // Last by position, is ghost
                ],
                beats: [createBeat(1, 0), createBeat(2, 20), createBeat(3, 30)],
            };

            expect(_lastMeasureIsGhost({ existingItems })).toBe(true);
        });

        it("should handle single measure that is ghost", () => {
            const existingItems = {
                measures: [createMeasure(1, true, 0)],
                beats: [createBeat(1, 0)],
            };

            expect(_lastMeasureIsGhost({ existingItems })).toBe(true);
        });

        it("should handle single measure that is not ghost", () => {
            const existingItems = {
                measures: [createMeasure(1, false, 0)],
                beats: [createBeat(1, 0)],
            };

            expect(_lastMeasureIsGhost({ existingItems })).toBe(false);
        });
    });

    describe("property-based tests", () => {
        // Arbitrary for generating a measure with minimal required fields
        const arbMinimalMeasure = fc.record({
            id: fc.integer({ min: 1 }),
            isGhost: fc.boolean(),
            beatPosition: fc.float({ min: 0, max: 1000, noNaN: true }),
        });

        it("should always return the isGhost value of the measure with highest startBeat.position", () => {
            fc.assert(
                fc.property(
                    fc
                        .array(arbMinimalMeasure, {
                            minLength: 1,
                            maxLength: 20,
                        })
                        .map((measures) => {
                            // Ensure positions are unique by adding index
                            return measures.map((m, idx) => ({
                                ...m,
                                beatPosition: m.beatPosition + idx * 1000,
                            }));
                        }),
                    (measures) => {
                        const existingItems = {
                            measures: measures.map((m) =>
                                createMeasure(m.id, m.isGhost, m.beatPosition),
                            ),
                            beats: measures.map((m) =>
                                createBeat(m.id, m.beatPosition),
                            ),
                        };

                        const result = _lastMeasureIsGhost({ existingItems });

                        // Find the measure with the highest position manually
                        const lastMeasure = measures.reduce((last, current) =>
                            current.beatPosition > last.beatPosition
                                ? current
                                : last,
                        );

                        expect(result).toBe(lastMeasure.isGhost);
                    },
                ),
            );
        });

        it("should return the same value when measures are in any order", () => {
            fc.assert(
                fc.property(
                    fc
                        .array(arbMinimalMeasure, {
                            minLength: 1,
                            maxLength: 20,
                        })
                        .map((measures) => {
                            // Ensure positions are unique by adding index
                            return measures.map((m, idx) => ({
                                ...m,
                                beatPosition: m.beatPosition + idx * 1000,
                            }));
                        }),
                    (measures) => {
                        const existingItemsInOrder = {
                            measures: measures.map((m) =>
                                createMeasure(m.id, m.isGhost, m.beatPosition),
                            ),
                            beats: measures.map((m) =>
                                createBeat(m.id, m.beatPosition),
                            ),
                        };

                        // Create a shuffled version
                        const shuffled = [...measures].reverse();
                        const existingItemsShuffled = {
                            measures: shuffled.map((m) =>
                                createMeasure(m.id, m.isGhost, m.beatPosition),
                            ),
                            beats: shuffled.map((m) =>
                                createBeat(m.id, m.beatPosition),
                            ),
                        };

                        const resultInOrder = _lastMeasureIsGhost({
                            existingItems: existingItemsInOrder,
                        });
                        const resultShuffled = _lastMeasureIsGhost({
                            existingItems: existingItemsShuffled,
                        });

                        expect(resultInOrder).toBe(resultShuffled);
                    },
                ),
                { verbose: 2 },
            );
        });
    });
});
