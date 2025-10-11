import { beforeEach, describe, expect, it, vi } from "vitest";
import {
    getStrongBeatIndexes,
    newBeatsFromTempoGroup,
    TempoGroupsFromMeasures,
    getNewMeasuresFromCreatedBeats,
    getLastBeatOfTempoGroup,
    _createBeatsWithOneMeasure,
    _createWithoutMeasuresSeconds,
    _createWithoutMeasuresTempo,
    TempoGroup,
} from "../TempoGroup/TempoGroup";
import type Measure from "../../../global/classes/Measure";
import { measureIsMixedMeter } from "../TempoGroup/TempoGroup";
import type Beat from "../../../global/classes/Beat";
import { measureIsSameTempo } from "../TempoGroup/TempoGroup";
import { measureHasOneTempo } from "../TempoGroup/TempoGroup";
import { NewBeatArgs } from "@/db-functions";
import { faker } from "@faker-js/faker";
import { SEED_AMOUNT, seedObj, describeDbTests, schema } from "@/test/base";
import { getBeats } from "@/db-functions/beat";
import { getMeasures } from "@/db-functions/measures";
import { getTestWithHistory } from "@/test/history";
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
describe("newBeatsFromTempoGroup", () => {
    const fakeData = (seed?: number, endTempo: boolean = false) => {
        faker.seed(seed);
        const output = {
            tempo: faker.helpers.arrayElement([
                faker.number.int({ min: 32, max: 240 }),
                faker.number.float({ min: 32, max: 240 }),
            ]),
            numRepeats: faker.number.int({ min: 1, max: 200 }),
            bigBeatsPerMeasure: faker.number.int({ min: 1, max: 32 }),
            ...(endTempo && {
                endTempo: faker.number.int({ min: 32, max: 240 }),
            }),
        };
        faker.seed();
        return output;
    };
    describe("should create beats with constant tempo", () => {
        it.for([
            { tempo: 120, numRepeats: 1, bigBeatsPerMeasure: 4 },
            { tempo: 120, numRepeats: 2, bigBeatsPerMeasure: 4 },
            ...Array(SEED_AMOUNT)
                .fill(0)
                .map((_, i) => fakeData(i)),
        ])(
            "%# - {tempo: $tempo, numRepeats: $numRepeats, bigBeatsPerMeasure: $bigBeatsPerMeasure}",
            (args) => {
                const result = newBeatsFromTempoGroup(args);
                const expectedTotalBeats =
                    args.bigBeatsPerMeasure * args.numRepeats + 1;
                expect(result).toHaveLength(expectedTotalBeats);
                result.forEach((beat: NewBeatArgs, index: number) => {
                    expect(beat.duration).toBe(60 / args.tempo);
                    expect(beat.include_in_measure).toBe(true);
                });
            },
        );
    });

    it("should create beats with changing tempo with endTempo", () => {
        const result = newBeatsFromTempoGroup({
            tempo: 120,
            numRepeats: 1,
            bigBeatsPerMeasure: 4,
            endTempo: 80,
        });
        const expectedTotalBeats = 4 * 1 + 1;
        expect(result).toHaveLength(expectedTotalBeats);

        const expectedDurations = [
            60 / 120, //
            60 / 110,
            60 / 100,
            60 / 90,
            60 / 80,
        ].map((d) => Number(d.toFixed(8)));

        result.forEach((beat: NewBeatArgs, index: number) => {
            expect(Number(beat.duration.toFixed(8)), `index: ${index}`).toBe(
                expectedDurations[index],
            );
            expect(beat.include_in_measure).toBe(true);
        });
    });

    describe("should handle multiple repeats with changing tempo", () => {
        it.for([
            { tempo: 100, numRepeats: 2, bigBeatsPerMeasure: 3, endTempo: 70 },
            ...Array.from({ length: SEED_AMOUNT }, (_, i) => fakeData(i, true)),
        ])(
            "%# - {tempo: $tempo, numRepeats: $numRepeats, bigBeatsPerMeasure: $bigBeatsPerMeasure, endTempo: $endTempo}",
            (args) => {
                const result = newBeatsFromTempoGroup(args);
                const expectedTotalBeats =
                    args.bigBeatsPerMeasure * args.numRepeats + 1;
                expect(result).toHaveLength(expectedTotalBeats);
                const tempoDelta =
                    (args.tempo - args.endTempo!) / (expectedTotalBeats - 1);
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
        const result = newBeatsFromTempoGroup({
            tempo: 120,
            numRepeats: 1,
            bigBeatsPerMeasure: 1,
        });
        expect(result).toHaveLength(2);
        expect(result[0].duration).toBe(0.5);
        expect(result[1].duration).toBe(0.5);
        expect(result[0].include_in_measure).toBe(true);
    });

    it("should handle edge case with very fast tempo", () => {
        const result = newBeatsFromTempoGroup({
            tempo: 240,
            numRepeats: 1,
            bigBeatsPerMeasure: 2,
        });
        expect(result).toHaveLength(3);
        result.forEach((beat: NewBeatArgs) => {
            expect(beat.duration).toBe(0.25); // 60/240 = 0.25
            expect(beat.include_in_measure).toBe(true);
        });
    });

    it("should handle edge case with very slow tempo", () => {
        const result = newBeatsFromTempoGroup({
            tempo: 30,
            numRepeats: 1,
            bigBeatsPerMeasure: 2,
        });
        expect(result).toHaveLength(3);
        result.forEach((beat: NewBeatArgs) => {
            expect(beat.duration).toBe(2); // 60/30 = 2
            expect(beat.include_in_measure).toBe(true);
        });
    });

    it("should handle tempo decrease with beats approaching but not reaching target", () => {
        const result = newBeatsFromTempoGroup({
            tempo: 180,
            numRepeats: 1,
            bigBeatsPerMeasure: 3,
            endTempo: 120,
        });
        expect(result).toHaveLength(4);

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
            ({ strongBeatIndexes, expectedDurations, bigBeatsPerMeasure }) => {
                const result = newBeatsFromTempoGroup({
                    tempo: 120,
                    numRepeats: 1,
                    bigBeatsPerMeasure,
                    strongBeatIndexes,
                });
                expect(result).toHaveLength(bigBeatsPerMeasure + 1); // 1 repeat * 4 beats
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
            const result = newBeatsFromTempoGroup({
                tempo: 120,
                numRepeats: 1,
                bigBeatsPerMeasure: 4,
                strongBeatIndexes: [1],
            });
            expect(result).toHaveLength(5); // 1 repeat * 4 beats
            const expectedDurations = [0.5, 0.75, 0.5, 0.5];
            result.forEach((beat: NewBeatArgs, index: number) => {
                expect(beat.duration, `index: ${index}`).toBe(
                    expectedDurations[index] ?? Math.min(...expectedDurations),
                );
                expect(beat.include_in_measure).toBe(true);
            });
        });
    });

    describe("Seeded tests", () => {
        const generate = (seed?: number) => {
            faker.seed(seed);
            const bigBeatsPerMeasure = faker.number.int({ min: 5, max: 35 });
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

            const result = newBeatsFromTempoGroup({
                tempo: expectedValues.tempo,
                numRepeats: expectedValues.numRepeats,
                bigBeatsPerMeasure: expectedValues.bigBeatsPerMeasure,
                strongBeatIndexes: expectedValues.strongBeatIndexes,
            });
            expect(result).toHaveLength(
                expectedValues.bigBeatsPerMeasure * expectedValues.numRepeats +
                    1,
            );

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
                expect(result[createdBeatIndex].include_in_measure).toBe(true);
            }
        });
    });
});

describe("getNewMeasuresFromCreatedBeats", () => {
    // Helper function to create a mock beat
    const createMockBeat = (id: number): Beat => ({
        id,
        position: faker.number.int({ min: 1, max: 100 }),
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

        const result = getNewMeasuresFromCreatedBeats({
            createdBeats: beats,
            numOfRepeats: 1,
            bigBeatsPerMeasure: 4,
        });

        expect(result).toHaveLength(2);
        expect(result[0]).toEqual({
            start_beat: 1,
        });
        expect(result[1]).toEqual({
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

        const result = getNewMeasuresFromCreatedBeats({
            createdBeats: beats,
            numOfRepeats: 2,
            bigBeatsPerMeasure: 4,
        });

        expect(result).toHaveLength(3);
        expect(result[0]).toEqual({
            start_beat: 1,
        });
        expect(result[1]).toEqual({
            start_beat: 5,
        });
        expect(result[2]).toEqual({
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

        const result = getNewMeasuresFromCreatedBeats({
            createdBeats: beats,
            numOfRepeats: 3,
            bigBeatsPerMeasure: 1,
        });

        expect(result).toHaveLength(4);
        expect(result[0]).toEqual({ start_beat: 1 });
        expect(result[1]).toEqual({ start_beat: 2 });
        expect(result[2]).toEqual({ start_beat: 3 });
        expect(result[3]).toEqual({ start_beat: 4, is_ghost: 1 });
    });

    it("should handle large number of beats per measure", () => {
        const beats = Array.from({ length: 17 }, (_, i) =>
            createMockBeat(i + 1),
        );

        const result = getNewMeasuresFromCreatedBeats({
            createdBeats: beats,
            numOfRepeats: 2,
            bigBeatsPerMeasure: 8,
        });

        expect(result).toHaveLength(3);
        expect(result[0]).toEqual({ start_beat: 1 });
        expect(result[1]).toEqual({ start_beat: 9 });
        expect(result[2]).toEqual({ start_beat: 17, is_ghost: 1 });
    });

    it("should handle edge case with single repeat and single beat", () => {
        const beats = [createMockBeat(1), createMockBeat(2)];

        const result = getNewMeasuresFromCreatedBeats({
            createdBeats: beats,
            numOfRepeats: 1,
            bigBeatsPerMeasure: 1,
        });

        expect(result).toHaveLength(2);
        expect(result[0]).toEqual({ start_beat: 1 });
        expect(result[1]).toEqual({ start_beat: 2, is_ghost: 1 });
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
            const result = getNewMeasuresFromCreatedBeats({
                createdBeats: expectedValues.beats,
                numOfRepeats: expectedValues.numOfRepeats,
                bigBeatsPerMeasure: expectedValues.bigBeatsPerMeasure,
            });
            expect(result).toHaveLength(expectedValues.numOfRepeats + 1);
            for (let i = 0; i < result.length - 1; i++) {
                expect(result[i]).toMatchObject({
                    start_beat:
                        expectedValues.beats[
                            i * expectedValues.bigBeatsPerMeasure
                        ].id,
                });
            }
            expect(result[result.length - 1]).toMatchObject({
                start_beat:
                    expectedValues.beats[expectedValues.beats.length - 1].id,
                is_ghost: 1,
            });
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
});

describeDbTests("Create without measures", (it) => {
    const testWithHistory = getTestWithHistory(it, [
        schema.beats,
        schema.measures,
        schema.pages,
    ]);

    describe("createBeatsWithOneMeasure", () => {
        testWithHistory(
            "should create beats and one measure with first beat",
            async ({ db }) => {
                const newBeats: NewBeatArgs[] = [
                    { duration: 0.5, include_in_measure: true },
                    { duration: 0.5, include_in_measure: true },
                    { duration: 0.5, include_in_measure: true },
                ];
                const startingPosition = 0;

                await _createBeatsWithOneMeasure({
                    newBeats,
                    startingPosition,
                });

                const beats = await getBeats({ db });
                const measures = await getMeasures({ db });

                // +1 for the FIRST_BEAT
                expect(beats).toHaveLength(newBeats.length + 1);
                expect(measures).toHaveLength(1);

                // Skip first beat (FIRST_BEAT) and verify created beats
                const createdBeats = beats.slice(1);
                createdBeats.forEach((beat, index) => {
                    expect(beat.duration).toBe(0.5);
                    expect(beat.include_in_measure).toBe(true);
                    expect(beat.position).toBe(index + 1); // positions start at 1 after FIRST_BEAT
                });

                // Verify measure was created with first created beat (not FIRST_BEAT)
                expect(measures[0].start_beat).toBe(createdBeats[0].id);
                expect(measures[0].rehearsal_mark).toBeNull();
            },
        );

        testWithHistory(
            "should create beats and one measure with custom name",
            async ({ db }) => {
                const newBeats: NewBeatArgs[] = [
                    { duration: 0.6, include_in_measure: true },
                ];
                const startingPosition = 10;
                const name = "Test Measure";

                await _createBeatsWithOneMeasure({
                    newBeats,
                    startingPosition,
                    name,
                });

                const beats = await getBeats({ db });
                const measures = await getMeasures({ db });

                // +1 for the FIRST_BEAT
                expect(beats).toHaveLength(newBeats.length + 1);
                expect(measures).toHaveLength(1);

                // Verify created beat starts at position after startingPosition
                expect(beats[1].position).toBe(11); // position after startingPosition

                // Verify measure has the custom name
                expect(measures[0].rehearsal_mark).toBe("Test Measure");
            },
        );

        testWithHistory(
            "should create beats with varying durations",
            async ({ db }) => {
                const newBeats: NewBeatArgs[] = [
                    { duration: 0.5, include_in_measure: true },
                    { duration: 0.75, include_in_measure: true },
                ];
                const startingPosition = 5;

                await _createBeatsWithOneMeasure({
                    newBeats,
                    startingPosition,
                });

                const beats = await getBeats({ db });
                const measures = await getMeasures({ db });

                // +1 for the FIRST_BEAT
                expect(beats).toHaveLength(newBeats.length + 1);
                expect(beats[1].duration).toBe(0.5);
                expect(beats[2].duration).toBe(0.75);

                expect(measures).toHaveLength(1);
            },
        );

        testWithHistory("should handle single beat", async ({ db }) => {
            const newBeats: NewBeatArgs[] = [
                { duration: 1.0, include_in_measure: true },
            ];
            const startingPosition = 0;

            await _createBeatsWithOneMeasure({
                newBeats,
                startingPosition,
            });

            const beats = await getBeats({ db });
            const measures = await getMeasures({ db });

            // +1 for the FIRST_BEAT
            expect(beats).toHaveLength(newBeats.length + 1);
            expect(measures).toHaveLength(1);
            // Measure should start with the created beat (not FIRST_BEAT)
            expect(measures[0].start_beat).toBe(beats[1].id);
        });
    });

    describe("_createWithoutMeasuresSeconds", () => {
        testWithHistory(
            "should create beats with total duration distributed evenly",
            async ({ db }) => {
                const startingPosition = 0;
                const numberOfBeats = 4;
                const totalDurationSeconds = 2.0;

                await _createWithoutMeasuresSeconds({
                    startingPosition,
                    numberOfBeats,
                    totalDurationSeconds,
                });

                const beats = await getBeats({ db });
                const measures = await getMeasures({ db });

                // +1 for the FIRST_BEAT at position 0
                expect(beats).toHaveLength(numberOfBeats + 1);
                expect(measures).toHaveLength(1);

                // Skip first beat (FIRST_BEAT) and check created beats
                const createdBeats = beats.slice(1);
                const expectedDuration = totalDurationSeconds / numberOfBeats;
                createdBeats.forEach((beat) => {
                    expect(beat.duration).toBe(expectedDuration);
                });

                // Verify total duration of created beats
                const totalDuration = createdBeats.reduce(
                    (sum, beat) => sum + beat.duration,
                    0,
                );
                expect(totalDuration).toBeCloseTo(totalDurationSeconds, 10);
            },
        );

        testWithHistory(
            "should create beats with custom name",
            async ({ db }) => {
                const startingPosition = 0;
                const numberOfBeats = 3;
                const totalDurationSeconds = 3.0;
                const name = "Intro";

                await _createWithoutMeasuresSeconds({
                    startingPosition,
                    numberOfBeats,
                    name,
                    totalDurationSeconds,
                });

                const beats = await getBeats({ db });
                const measures = await getMeasures({ db });

                // +1 for the FIRST_BEAT
                expect(beats).toHaveLength(numberOfBeats + 1);
                expect(measures).toHaveLength(1);
                expect(measures[0].rehearsal_mark).toBe("Intro");

                // Skip first beat and check created beats - each should be 1 second
                const createdBeats = beats.slice(1);
                createdBeats.forEach((beat) => {
                    expect(beat.duration).toBe(1.0);
                });
            },
        );

        testWithHistory(
            "should handle single beat with total duration",
            async ({ db }) => {
                const startingPosition = 0;
                const numberOfBeats = 1;
                const totalDurationSeconds = 2.5;

                await _createWithoutMeasuresSeconds({
                    startingPosition,
                    numberOfBeats,
                    totalDurationSeconds,
                });

                const beats = await getBeats({ db });
                const measures = await getMeasures({ db });

                // +1 for the FIRST_BEAT
                expect(beats).toHaveLength(numberOfBeats + 1);
                expect(measures).toHaveLength(1);
                // The second beat (index 1) should have duration 2.5
                expect(beats[1].duration).toBe(2.5);
            },
        );

        testWithHistory(
            "should handle many beats with small durations",
            async ({ db }) => {
                const startingPosition = 0;
                const numberOfBeats = 16;
                const totalDurationSeconds = 4.0;

                await _createWithoutMeasuresSeconds({
                    startingPosition,
                    numberOfBeats,
                    totalDurationSeconds,
                });

                const beats = await getBeats({ db });
                const measures = await getMeasures({ db });

                // +1 for the FIRST_BEAT
                expect(beats).toHaveLength(numberOfBeats + 1);
                expect(measures).toHaveLength(1);

                // Skip first beat and check created beats
                const createdBeats = beats.slice(1);
                createdBeats.forEach((beat) => {
                    expect(beat.duration).toBe(0.25);
                });
            },
        );

        testWithHistory(
            "should create beats starting at non-zero position",
            async ({ db }) => {
                const startingPosition = 100;
                const numberOfBeats = 2;
                const totalDurationSeconds = 1.0;

                await _createWithoutMeasuresSeconds({
                    startingPosition,
                    numberOfBeats,
                    totalDurationSeconds,
                });

                const beats = await getBeats({ db });

                // +1 for the FIRST_BEAT
                expect(beats).toHaveLength(numberOfBeats + 1);
                // Skip first beat and check positions
                expect(beats[1].position).toBe(101); // position after startingPosition
                expect(beats[2].position).toBe(102);
            },
        );
    });

    describe("_createWithoutMeasuresTempo", () => {
        testWithHistory("should create beats at 120 BPM", async ({ db }) => {
            const startingPosition = 0;
            const totalNumberOfBeats = 4;
            const tempoBpm = 120;

            await _createWithoutMeasuresTempo({
                startingPosition,
                totalNumberOfBeats,
                tempoBpm,
            });

            const beats = await getBeats({ db });
            const measures = await getMeasures({ db });

            // +1 for the FIRST_BEAT
            expect(beats).toHaveLength(totalNumberOfBeats + 1);
            expect(measures).toHaveLength(1);

            // Skip first beat and check created beats
            const createdBeats = beats.slice(1);
            const expectedDuration = 60 / tempoBpm;
            createdBeats.forEach((beat) => {
                expect(beat.duration).toBe(expectedDuration);
            });
        });

        testWithHistory("should create beats at 180 BPM", async ({ db }) => {
            const startingPosition = 0;
            const totalNumberOfBeats = 8;
            const tempoBpm = 180;

            await _createWithoutMeasuresTempo({
                startingPosition,
                totalNumberOfBeats,
                tempoBpm,
            });

            const beats = await getBeats({ db });

            // +1 for the FIRST_BEAT
            expect(beats).toHaveLength(totalNumberOfBeats + 1);

            // Skip first beat and check created beats
            const createdBeats = beats.slice(1);
            const expectedDuration = 60 / tempoBpm;
            createdBeats.forEach((beat) => {
                expect(beat.duration).toBeCloseTo(expectedDuration, 10);
            });
        });

        testWithHistory(
            "should create beats at 60 BPM (slow tempo)",
            async ({ db }) => {
                const startingPosition = 0;
                const totalNumberOfBeats = 4;
                const tempoBpm = 60;

                await _createWithoutMeasuresTempo({
                    startingPosition,
                    totalNumberOfBeats,
                    tempoBpm,
                });

                const beats = await getBeats({ db });

                // +1 for the FIRST_BEAT
                expect(beats).toHaveLength(totalNumberOfBeats + 1);

                // Skip first beat and check created beats
                const createdBeats = beats.slice(1);
                createdBeats.forEach((beat) => {
                    expect(beat.duration).toBe(1.0);
                });
            },
        );

        testWithHistory(
            "should create beats at 240 BPM (fast tempo)",
            async ({ db }) => {
                const startingPosition = 0;
                const totalNumberOfBeats = 4;
                const tempoBpm = 240;

                await _createWithoutMeasuresTempo({
                    startingPosition,
                    totalNumberOfBeats,
                    tempoBpm,
                });

                const beats = await getBeats({ db });

                // +1 for the FIRST_BEAT
                expect(beats).toHaveLength(totalNumberOfBeats + 1);

                // Skip first beat and check created beats
                const createdBeats = beats.slice(1);
                createdBeats.forEach((beat) => {
                    expect(beat.duration).toBe(0.25);
                });
            },
        );

        testWithHistory(
            "should create beats with custom name",
            async ({ db }) => {
                const startingPosition = 0;
                const totalNumberOfBeats = 3;
                const tempoBpm = 100;
                const name = "Verse 1";

                await _createWithoutMeasuresTempo({
                    startingPosition,
                    totalNumberOfBeats,
                    tempoBpm,
                    name,
                });

                const beats = await getBeats({ db });
                const measures = await getMeasures({ db });

                // +1 for the FIRST_BEAT
                expect(beats).toHaveLength(totalNumberOfBeats + 1);
                expect(measures).toHaveLength(1);
                expect(measures[0].rehearsal_mark).toBe("Verse 1");

                // Skip first beat and check created beats
                const createdBeats = beats.slice(1);
                createdBeats.forEach((beat) => {
                    expect(beat.duration).toBe(0.6);
                });
            },
        );

        testWithHistory(
            "should create single beat at given tempo",
            async ({ db }) => {
                const startingPosition = 0;
                const totalNumberOfBeats = 1;
                const tempoBpm = 90;

                await _createWithoutMeasuresTempo({
                    startingPosition,
                    totalNumberOfBeats,
                    tempoBpm,
                });

                const beats = await getBeats({ db });
                const measures = await getMeasures({ db });

                // +1 for the FIRST_BEAT
                expect(beats).toHaveLength(totalNumberOfBeats + 1);
                expect(measures).toHaveLength(1);

                // Check the created beat (index 1)
                expect(beats[1].duration).toBeCloseTo(60 / 90, 10);
            },
        );

        testWithHistory(
            "should create many beats at given tempo",
            async ({ db }) => {
                const startingPosition = 0;
                const totalNumberOfBeats = 32;
                const tempoBpm = 140;

                await _createWithoutMeasuresTempo({
                    startingPosition,
                    totalNumberOfBeats,
                    tempoBpm,
                });

                const beats = await getBeats({ db });

                // +1 for the FIRST_BEAT
                expect(beats).toHaveLength(totalNumberOfBeats + 1);

                // Skip first beat and check created beats
                const createdBeats = beats.slice(1);
                const expectedDuration = 60 / tempoBpm;
                createdBeats.forEach((beat) => {
                    expect(beat.duration).toBeCloseTo(expectedDuration, 10);
                });
            },
        );

        testWithHistory(
            "should create beats starting at non-zero position",
            async ({ db }) => {
                const startingPosition = 50;
                const totalNumberOfBeats = 3;
                const tempoBpm = 120;

                await _createWithoutMeasuresTempo({
                    startingPosition,
                    totalNumberOfBeats,
                    tempoBpm,
                });

                const beats = await getBeats({ db });

                // +1 for the FIRST_BEAT
                expect(beats).toHaveLength(totalNumberOfBeats + 1);
                // Skip first beat and check positions
                expect(beats[1].position).toBe(51); // position after startingPosition
                expect(beats[2].position).toBe(52);
                expect(beats[3].position).toBe(53);
            },
        );

        testWithHistory(
            "should handle floating point tempo",
            async ({ db }) => {
                const startingPosition = 0;
                const totalNumberOfBeats = 4;
                const tempoBpm = 132.5;

                await _createWithoutMeasuresTempo({
                    startingPosition,
                    totalNumberOfBeats,
                    tempoBpm,
                });

                const beats = await getBeats({ db });

                // +1 for the FIRST_BEAT
                expect(beats).toHaveLength(totalNumberOfBeats + 1);

                // Skip first beat and check created beats
                const createdBeats = beats.slice(1);
                const expectedDuration = 60 / tempoBpm;
                createdBeats.forEach((beat) => {
                    expect(beat.duration).toBeCloseTo(expectedDuration, 10);
                });
            },
        );
    });
});
