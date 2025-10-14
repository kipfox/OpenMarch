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
import { describe, expect, it } from "vitest";
import {
    _createFromTempoGroup,
    _createWithoutMeasures,
} from "../TempoGroup/TempoGroup";
import fc from "fast-check";
import { eq, not } from "drizzle-orm";

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

    describe("ghost tempo groups", () => {
        const testCreateWithoutMeasure = async (
            {
                db,
                numberOfBeats,
                durationInSeconds,
                tempoBpm,
                name,
            }: {
                db: DbConnection;
                numberOfBeats: number;
                durationInSeconds: number;
                tempoBpm: number;
                name: string;
            },
            type: "seconds" | "tempo",
        ) => {
            if (type === "seconds")
                await _createWithoutMeasures({
                    startingPosition: 0,
                    numberOfBeats,
                    totalDurationSeconds: durationInSeconds,
                    name,
                });
            else
                await _createWithoutMeasures({
                    startingPosition: 0,
                    numberOfBeats,
                    tempoBpm,
                    name,
                });

            const allBeats = await db
                .select()
                .from(schema.beats)
                .orderBy(schema.beats.position);
            const allMeasures = await db.query.measures.findMany();

            expect(
                allBeats,
                "There should be one beat more than the created beats",
            ).toHaveLength(
                numberOfBeats + 1, // +1 for the FIRST_BEAT
            );
            expect(allMeasures, "Should only have two measures").toHaveLength(
                1,
            );
            expect(
                allMeasures[0].start_beat,
                "The measure start beat should be beat right after the first beat",
            ).toBe(allBeats[1].id);
            expect(allMeasures[0].is_ghost).toBeTruthy();

            const expectedDuration =
                type === "seconds"
                    ? durationInSeconds / numberOfBeats
                    : 60 / tempoBpm;
            const expectedMessage =
                type === "seconds"
                    ? "Duration should be 'durationInSeconds / numberOfBeats'"
                    : "Duration should be '60 / tempoBpm'";
            allBeats.forEach((beat, index) => {
                if (index === 0) {
                    expect(beat.duration).toBe(0);
                } else {
                    expect(
                        beat.duration,
                        expectedMessage +
                            ` - {beatId: ${beat.id}, position: ${beat.position}}`,
                    ).toBe(expectedDuration);
                }
                expect(
                    beat.position,
                    "Expect position to match index (to show constant positions)",
                ).toBe(index);
            });
        };

        it("GHOST SECONDS - works with any number of big beats per measure and number of repeats", async ({
            db,
        }) => {
            await fc.assert(
                fc
                    .asyncProperty(
                        fc.record({
                            name: fc.string({ minLength: 1, maxLength: 100 }),
                            numberOfBeats: fc.integer({ min: 1, max: 100 }),
                            durationInSeconds: fc.float({
                                min: Math.fround(0.0001),
                                max: Math.fround(50),
                                noNaN: true,
                            }),
                        }),
                        async (args) => {
                            await testCreateWithoutMeasure(
                                { db, tempoBpm: -1, ...args },
                                "seconds",
                            );
                        },
                    )
                    .afterEach(async () => await deleteAllBeatsAndMeasures(db)),
                { verbose: 2 },
            );
        });

        it("GHOST TEMPO - works with any number of big beats per measure and number of repeats", async ({
            db,
        }) => {
            await fc.assert(
                fc
                    .asyncProperty(
                        fc.record({
                            name: fc.string({ minLength: 1, maxLength: 100 }),
                            numberOfBeats: fc.integer({ min: 1, max: 100 }),
                            tempoBpm: fc.float({
                                min: Math.fround(1),
                                max: Math.fround(500),
                                noNaN: true,
                            }),
                        }),
                        async (args) => {
                            await testCreateWithoutMeasure(
                                { db, durationInSeconds: -1, ...args },
                                "tempo",
                            );
                        },
                    )
                    .afterEach(async () => await deleteAllBeatsAndMeasures(db)),
                { verbose: 2 },
            );
        });
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
        const minTempoGroupsNum = 1;
        const maxTempoGroupsNum = 50;
        it.only("should create a tempo group at the start", async ({ db }) => {
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
                            numberOfMeasures: 10,
                            // args.numberOfMeasuresArr[
                            //     i % args.numberOfMeasuresArr.length
                            // ],
                        });
                    }

                    await createGhostMeasureAndBeat({ db });
                    const measuresBefore = await db
                        .select()
                        .from(schema.measures);
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

                    expect(measuresAfter).toHaveLength(
                        measuresBefore.length + args.numberOfRepeats + 1, // +1 for the ghost measure
                    );
                    expect(beatsAfter).toHaveLength(
                        beatsBefore.length +
                            args.newBeatsPerMeasure * args.numberOfRepeats +
                            1, // +1 for the ghost beat
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

                        // Check if it is properly far away from previous measure
                        const nextBeat =
                            beatRecord[(i + 1) * args.newBeatsPerMeasure + 1];
                        expect(
                            nextBeat.position,
                            "The position should be properly far away from previous measure",
                        ).toBe(startBeat.position + args.newBeatsPerMeasure);
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

                    // // Ensure the old measures were not modified
                    // for (
                    //     let i = args.numberOfRepeats;
                    //     i < measuresBefore.length;
                    //     i++
                    // ) {
                    //     const oldMeasure = measuresBefore.find(
                    //         (m) => m.id === measuresAfter[i].measures.id,
                    //     );
                    //     if (!oldMeasure) {
                    //         throw new Error(
                    //             `Old measure not found for measure ${measuresAfter[i].measures.id}`,
                    //         );
                    //     }
                    //     expect(
                    //         measuresAfter[i].measures,
                    //         "Old measure should not be modified",
                    //     ).toMatchObject(oldMeasure);
                    // }
                },
            );

            await fc.assert(
                property.afterEach(
                    async () => await deleteAllBeatsAndMeasures(db),
                ),
            );
        });
    });

    describe("Create at the middle", () => {});

    describe("Create at the end", () => {});
});
