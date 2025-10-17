import {
    createBeats,
    createMeasures,
    DbConnection,
    FIRST_BEAT_ID,
    getBeats,
    NewBeatArgs,
    NewMeasureArgs,
} from "@/db-functions";
import { describeDbTests, schema } from "@/test/base";
import { describe, expect } from "vitest";
import { _createFromTempoGroup } from "../TempoGroup/TempoGroup";
import fc from "fast-check";
import { eq, not } from "drizzle-orm";
import { measures } from "electron/database/migrations/schema";

const deleteAllBeatsAndMeasures = async (db: DbConnection) => {
    await db.delete(schema.measures);
    await db
        .delete(schema.beats)
        .where(not(eq(schema.beats.id, FIRST_BEAT_ID)));
};

describeDbTests("No existing beats", (it) => {
    it("REAL SINGLE - works with any number of big beats per measure and number of repeats", async ({
        db,
    }) => {
        await fc.assert(
            fc
                .asyncProperty(
                    fc.record({
                        bigBeatsPerMeasure: fc.integer({ min: 1, max: 20 }),
                        numberOfRepeats: fc.integer({ min: 1, max: 100 }),
                        newTempo: fc.integer({ min: 1, max: 500 }),
                    }),
                    async ({
                        bigBeatsPerMeasure,
                        numberOfRepeats,
                        newTempo,
                    }) => {
                        const allBeatsBefore = await getBeats({ db });
                        await _createFromTempoGroup({
                            tempoGroup: {
                                name: "",
                                tempo: newTempo,
                                bigBeatsPerMeasure,
                                numOfRepeats: numberOfRepeats,
                                type: "real",
                            },
                            existingItems: {
                                beats: allBeatsBefore,
                                measures: [],
                            },
                            dbParam: db,
                        });

                        const allBeats = await db
                            .select()
                            .from(schema.beats)
                            .orderBy(schema.beats.position);
                        const allMeasures = await db.query.measures.findMany();

                        const expectedNumberOfBeats =
                            allBeatsBefore.length +
                            bigBeatsPerMeasure * numberOfRepeats +
                            1;
                        expect(
                            allBeats,
                            "All beats should have the correct number of beats",
                        ).toHaveLength(expectedNumberOfBeats);
                        expect(
                            allMeasures,
                            "There should be the same number of measures as the number of repeats plus one",
                        ).toHaveLength(numberOfRepeats + 1);

                        allMeasures.forEach((measure, index) => {
                            if (index === allMeasures.length - 1) {
                                expect(
                                    measure.is_ghost,
                                    "The last measure should be a ghost",
                                ).toBe(1);
                            } else {
                                expect(
                                    measure.is_ghost,
                                    "All but the last measure should not be a ghost",
                                ).toBe(0);
                                expect(measure.start_beat).toBe(
                                    allBeats[index * bigBeatsPerMeasure + 1].id,
                                );
                            }
                        });
                        allBeats.forEach((beat, index) => {
                            if (index === 0) {
                                expect(beat.duration).toBe(0);
                            } else {
                                expect(beat.duration).toBe(60 / newTempo);
                            }
                            expect(beat.position).toBe(index);
                        });
                    },
                )
                .afterEach(async () => {
                    // delete all measures
                    await db.delete(schema.measures);
                    // delete all beats except the first beat
                    await db
                        .delete(schema.beats)
                        .where(not(eq(schema.beats.id, FIRST_BEAT_ID)));
                }),
            { verbose: 2 },
        );
    });
});

describeDbTests("Existing beats that are all ghost", (it) => {
    describe("There are exactly enough beats for the new tempo group", () => {
        it("basic example with 16 beats", async ({ db }) => {
            const existingBeats: NewBeatArgs[] = [];
            for (let i = 0; i < 16; i++)
                existingBeats.push({ duration: 0.123 });
            const createdBeats = await createBeats({
                db,
                newBeats: existingBeats,
            });

            await _createFromTempoGroup({
                tempoGroup: {
                    name: "",
                    tempo: 120,
                    bigBeatsPerMeasure: 4,
                    numOfRepeats: 4,
                    type: "real",
                },
                existingItems: { beats: createdBeats, measures: [] },
                dbParam: db,
            });

            const allBeats = await db.query.beats.findMany();
            const allMeasures = await db.query.measures.findMany();

            expect(allBeats).toHaveLength(createdBeats.length + 2);
            expect(allMeasures).toHaveLength(4 + 1);
        });

        it("REAL SINGLE - works with any number of big beats per measure and number of repeats", async ({
            db,
        }) => {
            await fc.assert(
                fc
                    .asyncProperty(
                        fc.record({
                            bigBeatsPerMeasure: fc.integer({ min: 1, max: 20 }),
                            numberOfRepeats: fc.integer({ min: 1, max: 100 }),
                            newTempo: fc.integer({ min: 1, max: 500 }),
                        }),
                        async ({
                            bigBeatsPerMeasure,
                            numberOfRepeats,
                            newTempo,
                        }) => {
                            const newBeats: NewBeatArgs[] = [];
                            for (
                                let i = 0;
                                i < bigBeatsPerMeasure * numberOfRepeats;
                                i++
                            )
                                newBeats.push({ duration: 0.123 });
                            // create the beats
                            const createdBeats = await createBeats({
                                db,
                                newBeats,
                            });

                            await _createFromTempoGroup({
                                tempoGroup: {
                                    name: "",
                                    tempo: newTempo,
                                    bigBeatsPerMeasure,
                                    numOfRepeats: numberOfRepeats,
                                    type: "real",
                                },
                                existingItems: {
                                    beats: createdBeats,
                                    measures: [],
                                },
                                dbParam: db,
                            });

                            const allBeats = await db
                                .select()
                                .from(schema.beats)
                                .orderBy(schema.beats.position);
                            const allMeasures =
                                await db.query.measures.findMany();

                            expect(allBeats).toHaveLength(
                                createdBeats.length + 2,
                            );
                            expect(allMeasures).toHaveLength(
                                numberOfRepeats + 1,
                            );

                            allMeasures.forEach((measure, index) => {
                                if (index === allMeasures.length - 1) {
                                    expect(
                                        measure.is_ghost,
                                        "The last measure should be a ghost",
                                    ).toBe(1);
                                } else {
                                    expect(
                                        measure.is_ghost,
                                        "All but the last measure should not be a ghost",
                                    ).toBe(0);
                                    expect(measure.start_beat).toBe(
                                        allBeats[index * bigBeatsPerMeasure + 1]
                                            .id,
                                    );
                                }
                            });
                            allBeats.forEach((beat, index) => {
                                if (index === 0) {
                                    expect(beat.duration).toBe(0);
                                } else {
                                    expect(beat.duration).toBe(60 / newTempo);
                                }
                                expect(beat.position).toBe(index);
                            });
                        },
                    )
                    .afterEach(async () => await deleteAllBeatsAndMeasures(db)),
                { verbose: 2 },
            );
        });

        // it.skip("GHOST TEMPO - works with any number of big beats per measure and number of repeats", async ({
        //     db,
        // }) => {
        //     await fc.assert(
        //         fc
        //             .asyncProperty(
        //                 fc.record({
        //                     name: fc.string({ minLength: 1, maxLength: 100 }),
        //                     numberOfBeats: fc.integer({ min: 1, max: 100 }),
        //                     tempoBpm: fc.float({ min: 1, max: 500 }),
        //                 }),
        //                 async (args) => {
        //                     await testCreateWithoutMeasure(
        //                         { db, durationInSeconds: -1, ...args },
        //                         "tempo",
        //                     );
        //                 },
        //             )
        //             .afterEach(async () => await deleteAllBeatsAndMeasures(db)),
        //         { verbose: 2 },
        //     );
        // });
    });

    // describe("There are one less than enough beats for the new tempo group", () => {});
    // describe("There are not enough beats for the new tempo group", () => {});
});

describeDbTests("Existing beats with existing measures", (it) => {
    const createMeasuresAndBeats = async ({
        db,
        beatsPerMeasure,
        duration,
        numberOfMeasures,
    }: {
        db: DbConnection;
        beatsPerMeasure: number;
        duration: number;
        numberOfMeasures: number;
    }) => {
        const existingBeats: NewBeatArgs[] = [];
        for (let i = 0; i < beatsPerMeasure * numberOfMeasures; i++)
            existingBeats.push({ duration });
        const createdBeats = await createBeats({
            db,
            newBeats: existingBeats,
        });
        const existingMeasures: NewMeasureArgs[] = [];
        for (let i = 0; i < numberOfMeasures; i++) {
            const index = i * beatsPerMeasure;

            if (createdBeats[index] === undefined)
                throw new Error(`No beat exists at index ${index}`);
            existingMeasures.push({
                start_beat: createdBeats[index].id,
            });
        }
        const createdMeasures = await createMeasures({
            db,
            newItems: existingMeasures,
        });
        return { createdBeats, createdMeasures };
    };

    const createGhostMeasureAndBeat = async ({ db }: { db: DbConnection }) => {
        const createdBeats = await createBeats({
            db,
            newBeats: [{ duration: 0.123 }],
        });
        const createdMeasures = await createMeasures({
            db,
            newItems: [{ start_beat: createdBeats[0].id, is_ghost: 1 }],
        });
        return { createdBeats, createdMeasures };
    };

    describe("create at the start", () => {
        it("should create a tempo group at the start - property based", async ({
            db,
        }) => {
            const durationArb = fc.float({
                min: Math.fround(0.01),
                max: Math.fround(2),
                noNaN: true,
            });
            const property = fc.asyncProperty(
                fc.record({
                    existingTempoGroupsNum: fc.integer({ min: 1, max: 3 }),
                    newTempo: fc.float({ min: 60, max: 180, noNaN: true }),
                    newBeatsPerMeasure: fc.integer({ min: 4, max: 20 }),
                    numberOfRepeats: fc.integer({ min: 4, max: 20 }),
                    newDurationArr: fc.array(durationArb, {
                        minLength: 1,
                        maxLength: 5,
                    }),
                    numberOfMeasuresArr: fc.array(
                        fc.integer({ min: 1, max: 15 }),
                        {
                            minLength: 1,
                            maxLength: 5,
                        },
                    ),
                    beatsPerMeasureArr: fc.array(
                        fc.integer({ min: 1, max: 20 }),
                        {
                            minLength: 1,
                            maxLength: 5,
                        },
                    ),
                }),
                async (args) => {
                    for (let i = 0; i < args.existingTempoGroupsNum; i++) {
                        await createMeasuresAndBeats({
                            db,
                            beatsPerMeasure:
                                args.beatsPerMeasureArr[
                                    i % args.beatsPerMeasureArr.length
                                ],
                            duration:
                                args.newDurationArr[
                                    i % args.newDurationArr.length
                                ],
                            numberOfMeasures:
                                args.numberOfMeasuresArr[
                                    i % args.numberOfMeasuresArr.length
                                ],
                        });
                    }

                    await createGhostMeasureAndBeat({ db });
                    const measuresBefore = await db
                        .select()
                        .from(schema.measures)
                        .innerJoin(
                            schema.beats,
                            eq(schema.measures.start_beat, schema.beats.id),
                        )
                        .orderBy(schema.beats.position);
                    const beatsBefore = await db
                        .select()
                        .from(schema.beats)
                        .orderBy(schema.beats.position);

                    await _createFromTempoGroup({
                        tempoGroup: {
                            name: "",
                            tempo: args.newTempo,
                            bigBeatsPerMeasure: args.newBeatsPerMeasure,
                            numOfRepeats: args.numberOfRepeats,
                            type: "real",
                        },
                        dbParam: db,
                        startingPosition: 0,
                        existingItems: {
                            beats: beatsBefore,
                            measures: measuresBefore.map((m) => ({
                                id: m.measures.id,
                                isGhost: Boolean(m.measures.is_ghost),
                                startBeat: {
                                    id: m.measures.start_beat,
                                    duration: 0.123,
                                    position: 0,
                                    includeInMeasure: true,
                                    notes: null,
                                    index: 0,
                                    timestamp: 0,
                                },
                            })),
                        },
                    });

                    const measuresAfter = await db
                        .select()
                        .from(schema.measures)
                        .innerJoin(
                            schema.beats,
                            eq(schema.measures.start_beat, schema.beats.id),
                        )
                        .orderBy(schema.beats.position);
                    const beatsAfter = await db
                        .select()
                        .from(schema.beats)
                        .orderBy(schema.beats.position);

                    expect(
                        measuresAfter,
                        "Number of measures should be the same as the number of repeats",
                    ).toHaveLength(
                        measuresBefore.length + args.numberOfRepeats, // No +1 because the ghost measure is already included
                    );
                    expect(
                        beatsAfter,
                        "should create the correct number of beats",
                    ).toHaveLength(
                        beatsBefore.length +
                            args.newBeatsPerMeasure * args.numberOfRepeats,
                    );

                    const beatRecord: Record<
                        number,
                        { id: number; position: number; duration: number }
                    > = {};
                    for (const beat of beatsAfter) {
                        beatRecord[beat.position] = {
                            id: beat.id,
                            position: beat.position,
                            duration: beat.duration,
                        };
                    }

                    // Check the new measures
                    for (let i = 0; i < args.numberOfRepeats; i++) {
                        expect(
                            measuresAfter[i].measures.is_ghost,
                            "New measure should not be a ghost",
                        ).toBeFalsy();
                        const startBeat =
                            beatRecord[i * args.newBeatsPerMeasure + 1];
                        expect(
                            measuresAfter[i].measures.start_beat,
                            "New measure should start at the correct beat",
                        ).toBe(startBeat.id);

                        if (i < measuresAfter.length - 1) {
                            // Check if it is properly far away from previous measure
                            const nextMeasure = measuresAfter[i + 1];
                            expect(
                                nextMeasure.beats.position,
                                "The position should be properly far away from previous measure",
                            ).toBe(
                                startBeat.position + args.newBeatsPerMeasure,
                            );
                        }
                    }

                    // Check the new beats
                    for (
                        let i = 1;
                        i < args.newBeatsPerMeasure * args.numberOfRepeats;
                        i++
                    ) {
                        expect(
                            beatsAfter[i].duration,
                            "New beat should have the correct duration",
                        ).toBe(60 / args.newTempo);
                        expect(
                            beatsAfter[i].position,
                            "New beat should have the correct position",
                        ).toBe(i);
                    }

                    // Ensure the old measures were not modified
                    for (
                        let i = args.numberOfRepeats + 1;
                        i < measuresBefore.length;
                        i++
                    ) {
                        const oldMeasure = measuresBefore.find(
                            (m) =>
                                m.measures.id === measuresAfter[i].measures.id,
                        );
                        if (!oldMeasure) {
                            throw new Error(
                                `Old measure not found for measure ${measuresAfter[i].measures.id}`,
                            );
                        }
                        expect(
                            measuresAfter[i].measures,
                            "Old measure should not be modified",
                        ).toMatchObject(oldMeasure);
                    }
                },
            );

            await fc.assert(
                property.afterEach(
                    async () => await deleteAllBeatsAndMeasures(db),
                ),
                { verbose: 2 },
            );
        });

        it.only("should create a tempo group at the start - simple example", async ({
            db,
        }) => {
            // Create the initial state as specified:
            // - 30 beats total (beat 0 has duration 0, beats 1-16 have duration 0.5, beats 17-29 have duration 0.4)
            // - 9 measures (8 real + 1 ghost at the end)

            // Create beats 1-16 with duration 0.5
            const initialNewBeats: NewBeatArgs[] = [];
            for (let i = 1; i <= 16; i++)
                initialNewBeats.push({
                    duration: 0.5,
                });

            for (let i = 17; i <= 29; i++) {
                initialNewBeats.push({
                    duration: 0.4,
                });
            }

            const createdBeats = await createBeats({
                db,
                startingPosition: 1,
                newBeats: initialNewBeats,
            });

            const measureStartPositions = [1, 5, 9, 13, 17, 20, 23, 26, 29];

            const initialNewMeasures: NewMeasureArgs[] =
                measureStartPositions.map((start_beat, i, arr) => ({
                    start_beat,
                    is_ghost: i === arr.length - 1 ? 1 : 0,
                }));
            await createMeasures({ db, newItems: initialNewMeasures });
            // Verify initial state
            const measuresBefore = await db
                .select()
                .from(schema.measures)
                .innerJoin(
                    schema.beats,
                    eq(schema.measures.start_beat, schema.beats.id),
                )
                .orderBy(schema.beats.position);
            const beatsBefore = await db
                .select()
                .from(schema.beats)
                .orderBy(schema.beats.position);

            expect(measuresBefore).toHaveLength(9);
            expect(beatsBefore).toHaveLength(30); // Our 30 beats plus the first beat

            const newTempo = 180;
            // Now create the tempo group: tempo 180, 5 beats per measure, 5 repeats at position 0
            await _createFromTempoGroup({
                tempoGroup: {
                    name: "",
                    tempo: newTempo,
                    bigBeatsPerMeasure: 5,
                    numOfRepeats: 5,
                    type: "real",
                },
                dbParam: db,
                startingPosition: 0,
                existingItems: {
                    beats: beatsBefore,
                    measures: measuresBefore.map((m, i) => ({
                        id: m.measures.id,
                        isGhost: Boolean(m.measures.is_ghost),
                        startBeat: {
                            ...m.beats,
                            timestamp: 0,
                            index: i,
                            includeInMeasure: true,
                        },
                    })),
                },
            });

            // Verify the result
            const measuresAfter = await db
                .select()
                .from(schema.measures)
                .innerJoin(
                    schema.beats,
                    eq(schema.measures.start_beat, schema.beats.id),
                )
                .orderBy(schema.beats.position);
            const beatsAfter = await db
                .select()
                .from(schema.beats)
                .orderBy(schema.beats.position);

            // Should have 9 original measures + 5 new measures = 14 total
            expect(measuresAfter).toHaveLength(14);

            // Should have 30 original beats + (5 beats per measure * 5 repeats) = 30 + 25 = 55 total
            expect(beatsAfter).toHaveLength(55);

            // Check the new tempo group beats (positions 0-24)
            // Each beat should have duration = 60/180 = 1/3 = 0.333...
            const expectedDuration = 60 / newTempo;
            for (let i = 1; i < 25; i++) {
                expect(
                    beatsAfter[i].duration,
                    "New beat should be the correct duration",
                ).toEqual(expectedDuration);
                expect(beatsAfter[i].position).toBe(i);
            }

            // Check that the new measures start at the correct positions
            for (let i = 0; i < 6; i++) {
                expect(
                    measuresAfter[i].measures.is_ghost,
                    `Measure ${i} should not be a ghost`,
                ).toBe(0); // Not ghost
                expect(
                    measuresAfter[i].beats.position,
                    `Measure ${i} should have correct position`,
                ).toBe(i * 5 + 1); // Position 1, 6, 11, 16, 21, 26
            }

            // Check that original measures are preserved (they should now start at position 25+)
            // The original measures should start at positions 25, 29, 33, 37, 41, 44, 47, 50, 53
            const expectedOriginalPositions = [
                26, 30, 34, 38, 42, 45, 48, 51, 54,
            ];
            for (let i = 0; i < 9; i++) {
                const measureIndex = 5 + i; // Skip the 5 new measures
                expect(measuresAfter[measureIndex].beats.position).toBe(
                    expectedOriginalPositions[i],
                );
            }

            // The last measure should still be a ghost
            expect(measuresAfter[13].measures.is_ghost).toBe(1);
        });
    });

    // describe("Create at the middle", () => {});

    // describe("Create at the end", () => {});
});
