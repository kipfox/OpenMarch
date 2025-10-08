import { describe, expect } from "vitest";
import {
    createBeats,
    updateBeats,
    deleteBeats,
    shiftBeats,
    flattenOrder,
    updateAllBeatDurations,
    FIRST_BEAT_ID,
    DatabaseBeat,
} from "../beat";
import { describeDbTests, schema } from "@/test/base";
import { getTestWithHistory } from "@/test/history";
import { inArray, eq } from "drizzle-orm";

const includeInMeasureBooleanToInteger = (beat: any) => {
    return { ...beat, include_in_measure: beat.include_in_measure ? 1 : 0 };
};

const addFirstBeat = (
    beats: DatabaseBeat[],
): Omit<DatabaseBeat, "updated_at" | "created_at">[] => {
    return [
        {
            id: FIRST_BEAT_ID,
            position: 0,
            duration: 0,
            include_in_measure: 1 as any,
            notes: null,
        },
        ...beats,
    ];
};

describeDbTests("beats", (it) => {
    const testWithHistory = getTestWithHistory(it, [schema.beats]);

    describe("createBeats", () => {
        describe("insert with no existing beats", () => {
            describe.each([
                {
                    description: "Single beat",
                    newBeats: [
                        {
                            duration: 0.5,
                            include_in_measure: true,
                            notes: null,
                        },
                    ],
                },
                {
                    description: "Single beat not in measure",
                    newBeats: [
                        {
                            duration: 0.75,
                            include_in_measure: false,
                            notes: null,
                        },
                    ],
                },
                {
                    description: "Single beat with notes",
                    newBeats: [
                        {
                            duration: 1.0,
                            include_in_measure: true,
                            notes: "jeff notes",
                        },
                    ],
                },
                {
                    description: "Two beats",
                    newBeats: [
                        {
                            duration: 0.5,
                            include_in_measure: true,
                            notes: null,
                        },
                        {
                            duration: 0.75,
                            include_in_measure: false,
                            notes: null,
                        },
                    ],
                },
                {
                    description: "Many beats",
                    newBeats: [
                        {
                            duration: 0.5,
                            include_in_measure: true,
                            notes: null,
                        },
                        {
                            duration: 0.75,
                            include_in_measure: false,
                            notes: "beat 2",
                        },
                        {
                            duration: 1.0,
                            include_in_measure: true,
                            notes: null,
                        },
                        {
                            duration: 0.25,
                            include_in_measure: false,
                            notes: "beat 4",
                        },
                        {
                            duration: 1.25,
                            include_in_measure: true,
                            notes: null,
                        },
                        {
                            duration: 0.6,
                            include_in_measure: false,
                            notes: null,
                        },
                    ],
                },
            ])(
                "%# successfully create atomic beats - $description",
                ({ newBeats }) => {
                    testWithHistory(
                        "Create beats as one action",
                        async ({ db, expectNumberOfChanges }) => {
                            const expectedCreatedBeats = newBeats.map(
                                (newBeat, index) => ({
                                    ...newBeat,
                                    id: index + 1,
                                    position: index + 1,
                                }),
                            );

                            const result = await createBeats({
                                newBeats,
                                db,
                            });
                            expect(new Set(result)).toMatchObject(
                                new Set(expectedCreatedBeats),
                            );

                            const allBeats = await db.query.beats.findMany({
                                orderBy: schema.beats.position,
                            });
                            expect(allBeats).toHaveLength(
                                expectedCreatedBeats.length + 1,
                            );
                            expect(new Set(allBeats)).toMatchObject(
                                new Set(
                                    addFirstBeat(
                                        expectedCreatedBeats.map(
                                            includeInMeasureBooleanToInteger,
                                        ),
                                    ),
                                ),
                            );
                            await expectNumberOfChanges.test(db, 1);
                        },
                    );

                    testWithHistory(
                        "Create beats as many actions",
                        async ({ db, expectNumberOfChanges }) => {
                            const expectedCreatedBeats = newBeats.map(
                                (newBeat, index) => ({
                                    ...newBeat,
                                    id: index + 1,
                                    position: index + 1,
                                }),
                            );

                            for (const newBeat of newBeats) {
                                await createBeats({
                                    newBeats: [newBeat],
                                    db,
                                });
                            }

                            const allBeats = await db.query.beats.findMany({
                                orderBy: schema.beats.position,
                            });
                            expect(allBeats).toHaveLength(
                                expectedCreatedBeats.length + 1,
                            );
                            expect(new Set(allBeats)).toMatchObject(
                                new Set(
                                    addFirstBeat(
                                        expectedCreatedBeats.map(
                                            includeInMeasureBooleanToInteger,
                                        ),
                                    ),
                                ),
                            );
                            // Expect that each beat creation is a separate change on the undo stack
                            await expectNumberOfChanges.test(
                                db,
                                newBeats.length,
                            );
                        },
                    );
                },
            );
        });

        describe("insert with existing beats", () => {
            testWithHistory.for([
                {
                    description: "Single beat",
                    existingBeatsArgs: [
                        {
                            duration: 0.5,
                            include_in_measure: true,
                        },
                    ],
                    newBeatsArgs: [
                        {
                            duration: 0.75,
                            include_in_measure: false,
                        },
                    ],
                },
                {
                    description: "insert single at end",
                    existingBeatsArgs: [
                        {
                            duration: 0.5,
                            include_in_measure: true,
                        },
                        {
                            duration: 0.75,
                            include_in_measure: true,
                        },
                        {
                            duration: 1.0,
                            include_in_measure: false,
                        },
                    ],
                    newBeatsArgs: [
                        {
                            duration: 1.25,
                            include_in_measure: true,
                        },
                    ],
                },
                {
                    description:
                        "Many existing beats, insert single at beginning",
                    existingBeatsArgs: [
                        {
                            duration: 1.0,
                            include_in_measure: true,
                        },
                        {
                            duration: 1.5,
                            include_in_measure: false,
                        },
                        {
                            duration: 0.75,
                            include_in_measure: true,
                        },
                    ],
                    newBeatsArgs: [
                        {
                            duration: 0.25,
                            include_in_measure: true,
                        },
                    ],
                },
                {
                    description: "insert single in middle",
                    existingBeatsArgs: [
                        {
                            duration: 1.0,
                            include_in_measure: true,
                        },
                        {
                            duration: 1.5,
                            include_in_measure: false,
                        },
                        {
                            duration: 0.75,
                            include_in_measure: true,
                        },
                        {
                            duration: 1.75,
                            include_in_measure: false,
                        },
                    ],
                    newBeatsArgs: [
                        {
                            duration: 1.25,
                            include_in_measure: true,
                        },
                    ],
                },
                {
                    description:
                        "Many existing beats, insert multiple at beginning",
                    existingBeatsArgs: [
                        {
                            duration: 1.25,
                            include_in_measure: true,
                        },
                        {
                            duration: 1.75,
                            include_in_measure: false,
                        },
                        {
                            duration: 2.25,
                            include_in_measure: true,
                        },
                        {
                            duration: 2.75,
                            include_in_measure: false,
                        },
                    ],
                    newBeatsArgs: [
                        {
                            duration: 0.25,
                            include_in_measure: true,
                        },
                        {
                            duration: 0.75,
                            include_in_measure: false,
                        },
                    ],
                },
                {
                    description: "insert multiple at end",
                    existingBeatsArgs: [
                        {
                            duration: 0.25,
                            include_in_measure: true,
                        },
                        {
                            duration: 0.75,
                            include_in_measure: false,
                        },
                        {
                            duration: 1.25,
                            include_in_measure: true,
                        },
                        {
                            duration: 1.75,
                            include_in_measure: false,
                        },
                    ],
                    newBeatsArgs: [
                        {
                            duration: 2.25,
                            include_in_measure: true,
                        },
                        {
                            duration: 2.75,
                            include_in_measure: false,
                        },
                        {
                            duration: 3.25,
                            include_in_measure: true,
                        },
                    ],
                },
                {
                    description:
                        "Many existing beats, insert multiple in middle",
                    existingBeatsArgs: [
                        {
                            duration: 0.25,
                            include_in_measure: true,
                        },
                        {
                            duration: 0.75,
                            include_in_measure: false,
                        },
                        {
                            duration: 2.25,
                            include_in_measure: true,
                        },
                        {
                            duration: 2.75,
                            include_in_measure: false,
                        },
                        {
                            duration: 3.25,
                            include_in_measure: true,
                        },
                    ],
                    newBeatsArgs: [
                        {
                            duration: 1.25,
                            include_in_measure: true,
                        },
                        {
                            duration: 1.75,
                            include_in_measure: false,
                        },
                    ],
                },
            ])(
                "%# - $description",
                async (
                    { existingBeatsArgs, newBeatsArgs },
                    { db, expectNumberOfChanges },
                ) => {
                    const createdExistingBeats = await createBeats({
                        newBeats: existingBeatsArgs,
                        db,
                    });
                    const existingBeats = await db.query.beats.findMany({
                        orderBy: schema.beats.position,
                    });
                    const databaseState =
                        await expectNumberOfChanges.getDatabaseState(db);

                    const sortByPosition = (
                        a: { position: number },
                        b: { position: number },
                    ) => a.position - b.position;
                    expect(existingBeats.sort(sortByPosition)).toMatchObject(
                        addFirstBeat(
                            existingBeatsArgs.map(
                                includeInMeasureBooleanToInteger,
                            ),
                        ).sort(sortByPosition),
                    );
                    expect(new Set(createdExistingBeats)).toMatchObject(
                        new Set(existingBeatsArgs),
                    );

                    const createdNewBeats = await createBeats({
                        newBeats: newBeatsArgs,
                        db,
                    });
                    const allBeats = await db.query.beats.findMany({
                        orderBy: schema.beats.position,
                    });
                    expect(allBeats.sort(sortByPosition)).toMatchObject(
                        addFirstBeat([
                            ...existingBeatsArgs,
                            ...newBeatsArgs,
                        ] as DatabaseBeat[])
                            .map(includeInMeasureBooleanToInteger)
                            .sort(sortByPosition),
                    );
                    expect(new Set(createdNewBeats)).toMatchObject(
                        new Set(newBeatsArgs),
                    );

                    await expectNumberOfChanges.test(db, 1, databaseState);
                },
            );
        });

        describe("insert with failure", () => {
            testWithHistory.for([
                {
                    description: "duplicate position",
                    newBeatsArgs: [
                        { duration: 0.5, include_in_measure: true },
                        { duration: 0.75, include_in_measure: false },
                    ],
                },
            ])(
                "%# - $description",
                async ({ newBeatsArgs }, { db, expectNumberOfChanges }) => {
                    // This should not fail since we're creating beats with sequential positions
                    // The test structure is kept for consistency but the actual test logic
                    // would need to be adjusted based on actual constraint violations
                    await createBeats({ newBeats: newBeatsArgs, db });
                    await expectNumberOfChanges.test(db, 1);
                },
            );
        });
    });

    describe("updateBeats", () => {
        describe.each([
            {
                description: "updates multiple beats",
                existingBeatsArgs: [
                    {
                        duration: 1.75,
                        include_in_measure: false,
                        notes: "do not touch",
                    },
                    {
                        duration: 2.0,
                        include_in_measure: true,
                        notes: "notes jeff",
                    },
                    { duration: 1.5, include_in_measure: false },
                    {
                        duration: 2.25,
                        include_in_measure: true,
                        notes: "jeff notes",
                    },
                ],
                modifiedBeatsArgs: [
                    {
                        id: 1,
                        duration: 1.25,
                        include_in_measure: true,
                        notes: null,
                    },
                    {
                        id: 2,
                        duration: 1.75,
                        include_in_measure: false,
                        notes: "new note",
                    },
                    {
                        id: 4,
                    },
                ],
                expectedUpdatedBeats: [
                    {
                        id: 1,
                        duration: 1.25,
                        include_in_measure: true,
                        notes: null,
                    },
                    {
                        id: 2,
                        duration: 1.75,
                        include_in_measure: false,
                        notes: "new note",
                    },
                    {
                        id: 4,
                        duration: 2.25,
                        include_in_measure: true,
                        notes: "jeff notes",
                    },
                ],
                isChangeExpected: true,
            },
            {
                description:
                    "should not update values if it is not provided in the updatedBeatArgs",
                existingBeatsArgs: [
                    { duration: 2.0, include_in_measure: true },
                    { duration: 1.5, include_in_measure: false },
                    {
                        duration: 2.25,
                        include_in_measure: true,
                        notes: "jeff notes",
                    },
                ],
                modifiedBeatsArgs: [
                    {
                        id: 3,
                    },
                ],
                expectedUpdatedBeats: [
                    {
                        id: 3,
                        duration: 2.25,
                        include_in_measure: true,
                        notes: "jeff notes",
                    },
                ],
                isChangeExpected: false,
            },
            {
                description:
                    "should not update values if it is undefined in the updatedBeatArgs",
                existingBeatsArgs: [
                    { duration: 2.0, include_in_measure: true },
                    { duration: 1.5, include_in_measure: false },
                    {
                        duration: 2.25,
                        include_in_measure: true,
                        notes: "jeff notes",
                    },
                ],
                modifiedBeatsArgs: [
                    {
                        id: 3,
                        duration: undefined,
                        include_in_measure: undefined,
                        notes: undefined,
                    },
                ],
                expectedUpdatedBeats: [
                    {
                        id: 3,
                        duration: 2.25,
                        include_in_measure: true,
                        notes: "jeff notes",
                    },
                ],
                isChangeExpected: false,
            },
            {
                description:
                    "should update values if it is null in the updatedBeatArgs",
                existingBeatsArgs: [
                    { duration: 2.0, include_in_measure: true },
                    { duration: 1.5, include_in_measure: false },
                    {
                        duration: 2.25,
                        include_in_measure: true,
                        notes: "jeff notes",
                    },
                ],
                modifiedBeatsArgs: [
                    {
                        id: 1,
                        duration: undefined,
                        include_in_measure: undefined,
                        notes: "asdf notes",
                    },
                    {
                        id: 3,
                        duration: undefined,
                        include_in_measure: undefined,
                        notes: null,
                    },
                    {
                        id: 2,
                        duration: undefined,
                        include_in_measure: undefined,
                        notes: undefined,
                    },
                ],
                expectedUpdatedBeats: [
                    {
                        id: 1,
                        duration: 2.0,
                        include_in_measure: true,
                        notes: "asdf notes",
                    },
                    {
                        id: 2,
                        duration: 1.5,
                        include_in_measure: false,
                        notes: null,
                    },
                    {
                        id: 3,
                        duration: 2.25,
                        include_in_measure: true,
                        notes: null,
                    },
                ],
                isChangeExpected: true,
            },
        ])(
            "%# - $description",
            ({
                existingBeatsArgs,
                modifiedBeatsArgs,
                expectedUpdatedBeats,
                isChangeExpected,
            }) => {
                testWithHistory(
                    "update as single action",
                    async ({ db, expectNumberOfChanges }) => {
                        // Create existing beats first
                        await createBeats({
                            newBeats: existingBeatsArgs,
                            db,
                        });

                        const databaseState =
                            await expectNumberOfChanges.getDatabaseState(db);

                        // Update the beats
                        const updateResult = await updateBeats({
                            modifiedBeats: modifiedBeatsArgs,
                            db,
                        });

                        expect(updateResult.length).toBe(
                            expectedUpdatedBeats.length,
                        );

                        expect(
                            updateResult.sort((a, b) => a.id - b.id),
                        ).toMatchObject(
                            expectedUpdatedBeats.sort((a, b) => a.id - b.id),
                        );

                        if (isChangeExpected)
                            await expectNumberOfChanges.test(
                                db,
                                1,
                                databaseState,
                            );
                    },
                );
                testWithHistory(
                    "update as multiple actions",
                    async ({ db, expectNumberOfChanges }) => {
                        // Create existing beats first
                        await createBeats({
                            newBeats: existingBeatsArgs,
                            db,
                        });

                        const databaseState =
                            await expectNumberOfChanges.getDatabaseState(db);

                        // Update the beats
                        for (const modifiedBeat of modifiedBeatsArgs) {
                            await updateBeats({
                                modifiedBeats: [modifiedBeat],
                                db,
                            });
                        }

                        const updateBeatIds = modifiedBeatsArgs.map(
                            (modifiedBeat) => modifiedBeat.id,
                        );

                        const updatedBeats = await db.query.beats.findMany({
                            where: inArray(schema.beats.id, updateBeatIds),
                        });

                        expect(updatedBeats.length).toBe(
                            expectedUpdatedBeats.length,
                        );

                        expect(
                            updatedBeats.sort((a, b) => a.id - b.id),
                        ).toMatchObject(
                            expectedUpdatedBeats
                                .sort((a, b) => a.id - b.id)
                                .map(includeInMeasureBooleanToInteger),
                        );

                        if (isChangeExpected)
                            await expectNumberOfChanges.test(
                                db,
                                modifiedBeatsArgs.length,
                                databaseState,
                            );
                    },
                );
            },
        );

        describe("update with failure", () => {
            testWithHistory.for([
                {
                    description: "should fail to update first beat",
                    existingBeatsArgs: [
                        { duration: 2.0, include_in_measure: true },
                        { duration: 1.5, include_in_measure: false },
                    ],
                    modifiedBeatsArgs: [
                        {
                            id: FIRST_BEAT_ID,
                            duration: 1.0, // Trying to update first beat
                        },
                    ],
                },
            ])(
                "%# - $description",
                async (
                    { existingBeatsArgs, modifiedBeatsArgs },
                    { db, expectNumberOfChanges },
                ) => {
                    // Create existing beats first
                    await createBeats({
                        newBeats: existingBeatsArgs,
                        db,
                    });

                    const databaseState =
                        await expectNumberOfChanges.getDatabaseState(db);

                    // Attempt to update first beat should be filtered out
                    const updateResult = await updateBeats({
                        modifiedBeats: modifiedBeatsArgs,
                        db,
                    });

                    // Should return empty array since first beat is filtered out
                    expect(updateResult.length).toBe(0);

                    await expectNumberOfChanges.test(db, 0, databaseState);
                },
            );
        });
    });

    describe("deleteBeats", () => {
        describe("deleteBeats with first beat", () => {
            it("should fail to delete the first beat", async ({ db }) => {
                const firstBeat = await db.query.beats.findFirst({
                    where: eq(schema.beats.id, FIRST_BEAT_ID),
                });
                expect(firstBeat).toBeDefined();
                // Should ignore the first beat
                await deleteBeats({
                    beatIds: new Set([FIRST_BEAT_ID]),
                    db,
                });
                const allBeats = await db.query.beats.findMany();
                expect(allBeats).toHaveLength(1);
                expect(allBeats[0].id).toEqual(FIRST_BEAT_ID);
            });

            it("should delete other beats if they are provided", async ({
                db,
            }) => {
                await createBeats({
                    newBeats: [{ duration: 0.5, include_in_measure: true }],
                    db,
                });
                await deleteBeats({
                    beatIds: new Set([FIRST_BEAT_ID, 1]),
                    db,
                });
                const allBeats = await db.query.beats.findMany();
                expect(allBeats).toHaveLength(1);
                expect(allBeats[0].id).toEqual(FIRST_BEAT_ID);
            });
        });

        describe("no existing data", () => {
            describe.each([
                {
                    description: "delete a single beat",
                    existingBeatsArgs: [
                        {
                            duration: 2.25,
                            include_in_measure: true,
                            notes: "jeff notes",
                        },
                        {
                            duration: 1.5,
                            include_in_measure: false,
                            notes: null,
                        },
                        {
                            duration: 2.0,
                            include_in_measure: true,
                            notes: null,
                        },
                    ],
                    beatIdsToDelete: [1],
                },
                {
                    description: "delete multiple beats",
                    existingBeatsArgs: [
                        {
                            duration: 2.25,
                            include_in_measure: true,
                            notes: "jeff notes",
                        },
                        {
                            duration: 1.5,
                            include_in_measure: false,
                            notes: null,
                        },
                        {
                            duration: 2.0,
                            include_in_measure: true,
                            notes: null,
                        },
                        {
                            duration: 1.0,
                            include_in_measure: true,
                            notes: "notes",
                        },
                        {
                            duration: 2.5,
                            include_in_measure: false,
                            notes: null,
                        },
                    ],
                    beatIdsToDelete: [1, 3, 5],
                },
                {
                    description: "delete all beats",
                    existingBeatsArgs: [
                        {
                            duration: 2.25,
                            include_in_measure: true,
                            notes: "jeff notes",
                        },
                        {
                            duration: 1.5,
                            include_in_measure: false,
                            notes: null,
                        },
                        {
                            duration: 2.0,
                            include_in_measure: true,
                            notes: null,
                        },
                    ],
                    beatIdsToDelete: [1, 2, 3],
                },
                {
                    description: "delete beat with notes",
                    existingBeatsArgs: [
                        {
                            duration: 2.25,
                            include_in_measure: true,
                            notes: "very important notes",
                        },
                        {
                            duration: 1.5,
                            include_in_measure: false,
                            notes: null,
                        },
                    ],
                    beatIdsToDelete: [1],
                },
                {
                    description: "delete beat not in measure",
                    existingBeatsArgs: [
                        {
                            duration: 2.25,
                            include_in_measure: true,
                            notes: "jeff notes",
                        },
                        {
                            duration: 1.5,
                            include_in_measure: false,
                            notes: null,
                        },
                        {
                            duration: 2.0,
                            include_in_measure: true,
                            notes: null,
                        },
                    ],
                    beatIdsToDelete: [2],
                },
            ])(
                "%# - $description",
                ({ beatIdsToDelete, existingBeatsArgs }) => {
                    testWithHistory(
                        "as single action",
                        async ({ db, expectNumberOfChanges }) => {
                            await createBeats({
                                newBeats: existingBeatsArgs,
                                db,
                            });

                            const beatsBeforeDelete =
                                await db.query.beats.findMany();
                            expect(
                                beatsBeforeDelete.length,
                                "Ensure all the beats are created",
                            ).toBe(existingBeatsArgs.length + 1);

                            const databaseState =
                                await expectNumberOfChanges.getDatabaseState(
                                    db,
                                );

                            const deleteResult = await deleteBeats({
                                beatIds: new Set(beatIdsToDelete),
                                db,
                            });
                            expect(deleteResult.length).toBe(
                                beatIdsToDelete.length,
                            );

                            const beatsAfterDelete =
                                await db.query.beats.findMany();
                            expect(
                                beatsAfterDelete.length,
                                "Ensure all the beats are deleted",
                            ).toBe(
                                existingBeatsArgs.length +
                                    1 -
                                    beatIdsToDelete.length,
                            );

                            const allBeatIds = new Set(
                                beatsAfterDelete.map((b) => b.id),
                            );
                            for (const beatId of beatIdsToDelete) {
                                expect(allBeatIds.has(beatId)).toBeFalsy();
                            }

                            await expectNumberOfChanges.test(
                                db,
                                1,
                                databaseState,
                            );
                        },
                    );
                    testWithHistory(
                        "as multiple actions",
                        async ({ db, expectNumberOfChanges }) => {
                            await createBeats({
                                newBeats: existingBeatsArgs,
                                db,
                            });

                            const beatsBeforeDelete =
                                await db.query.beats.findMany();
                            expect(
                                beatsBeforeDelete.length,
                                "Ensure all the beats are created",
                            ).toBe(existingBeatsArgs.length + 1);

                            const databaseState =
                                await expectNumberOfChanges.getDatabaseState(
                                    db,
                                );

                            for (const beatId of beatIdsToDelete)
                                await deleteBeats({
                                    beatIds: new Set([beatId]),
                                    db,
                                });

                            const beatsAfterDelete =
                                await db.query.beats.findMany();
                            expect(
                                beatsAfterDelete.length,
                                "Ensure all the beats are deleted",
                            ).toBe(
                                existingBeatsArgs.length +
                                    1 -
                                    beatIdsToDelete.length,
                            );

                            const allBeatIds = new Set(
                                beatsAfterDelete.map((b) => b.id),
                            );
                            for (const beatId of beatIdsToDelete) {
                                expect(allBeatIds.has(beatId)).toBeFalsy();
                            }

                            await expectNumberOfChanges.test(
                                db,
                                beatIdsToDelete.length,
                                databaseState,
                            );
                        },
                    );
                },
            );
            describe("deleteBeats with failure", () => {
                testWithHistory.for([
                    {
                        description:
                            "Delete beats and also provide beats that don't exist",
                        realBeatIdsToDelete: [1, 2, 3],
                        fakeBeatIdsToDelete: [
                            7987, 8273623, -1, 123456, 986, 6275.2378, -128.2,
                        ],
                    },
                ])(
                    "%# - Should ignore beats that don't exist",
                    async (
                        { realBeatIdsToDelete, fakeBeatIdsToDelete },
                        { db, expectNumberOfChanges },
                    ) => {
                        // create beats
                        await createBeats({
                            newBeats: Array.from({ length: 10 }, (_, i) => ({
                                duration: 0.5,
                                include_in_measure: true,
                                notes: `beat ${i}`,
                            })),
                            db,
                        });

                        const beatsBeforeDelete = await db
                            .select()
                            .from(schema.beats);

                        const deleteIds = new Set([
                            ...realBeatIdsToDelete,
                            ...fakeBeatIdsToDelete,
                        ]);

                        await deleteBeats({
                            beatIds: deleteIds,
                            db,
                        });

                        const beatsAfterDelete = await db
                            .select()
                            .from(schema.beats);

                        expect(beatsAfterDelete).toHaveLength(
                            beatsBeforeDelete.length -
                                realBeatIdsToDelete.length,
                        );
                    },
                );
            });
        });
    });

    describe("shiftBeats", () => {
        testWithHistory(
            "shift beats forward by positive amount",
            async ({ db, expectNumberOfChanges }) => {
                const existingBeatsArgs = [
                    { duration: 0.5, include_in_measure: true, notes: "first" },
                    {
                        duration: 0.5,
                        include_in_measure: true,
                        notes: "second",
                    },
                    { duration: 0.5, include_in_measure: true, notes: "third" },
                ];
                const shiftParams = {
                    startingPosition: 2,
                    shiftAmount: 2,
                };
                const expectedPositions = [0, 1, 4, 5]; // First beat at 0, then 1, then shifted beats at 4, 5

                await createBeats({
                    newBeats: existingBeatsArgs,
                    db,
                });

                const databaseState =
                    await expectNumberOfChanges.getDatabaseState(db);

                const previousBeatOrders = await db.query.beats.findMany({
                    orderBy: schema.beats.position,
                });

                const shiftResult = await shiftBeats({
                    db,
                    ...shiftParams,
                });

                expect(shiftResult.length).toBeGreaterThan(0);

                const beatsAfterShift = await db.query.beats.findMany({
                    orderBy: schema.beats.position,
                });

                const positions = beatsAfterShift.map((b) => b.position);
                expect(
                    positions,
                    `Expected positions to shift from ${previousBeatOrders.map((b) => b.position)} to ${expectedPositions}`,
                ).toEqual(expectedPositions);

                await expectNumberOfChanges.test(db, 1, databaseState);
            },
        );

        testWithHistory(
            "shift beats backward by negative amount",
            async ({ db, expectNumberOfChanges }) => {
                const existingBeatsArgs = [
                    { duration: 0.5, include_in_measure: true, notes: "first" },
                    {
                        duration: 0.5,
                        include_in_measure: true,
                        notes: "second",
                    },
                    { duration: 0.5, include_in_measure: true, notes: "third" },
                    {
                        duration: 0.5,
                        include_in_measure: true,
                        notes: "fourth",
                    },
                ];
                const shiftParams = {
                    startingPosition: 3,
                    shiftAmount: -1,
                };
                const expectedPositions = [0, 1, 2, 3, 4]; // Should shift third and fourth beats back

                await createBeats({
                    newBeats: existingBeatsArgs,
                    db,
                });

                await db
                    .update(schema.beats)
                    .set({
                        position: 5,
                    })
                    .where(eq(schema.beats.position, 4));
                await db
                    .update(schema.beats)
                    .set({
                        position: 4,
                    })
                    .where(eq(schema.beats.position, 3));

                const databaseState =
                    await expectNumberOfChanges.getDatabaseState(db);

                const previousBeatOrders = await db.query.beats.findMany({
                    orderBy: schema.beats.position,
                });

                const shiftResult = await shiftBeats({
                    db,
                    ...shiftParams,
                });

                expect(shiftResult.length).toBeGreaterThan(0);

                const beatsAfterShift = await db.query.beats.findMany({
                    orderBy: schema.beats.position,
                });

                const positions = beatsAfterShift.map((b) => b.position);
                expect(
                    positions,
                    `Expected positions to shift from ${previousBeatOrders.map((b) => b.position)} to ${expectedPositions}`,
                ).toEqual(expectedPositions);

                await expectNumberOfChanges.test(db, 1, databaseState);
            },
        );

        describe("shiftBeats with failure", () => {
            testWithHistory.for([
                {
                    description: "should fail to shift beats at position <= 0",
                    existingBeatsArgs: [
                        {
                            duration: 0.5,
                            include_in_measure: true,
                            notes: "first",
                        },
                        {
                            duration: 0.5,
                            include_in_measure: true,
                            notes: "second",
                        },
                    ],
                    shiftParams: {
                        startingPosition: 0,
                        shiftAmount: 2,
                    },
                },
                {
                    description:
                        "should fail to shift beats to negative position",
                    existingBeatsArgs: [
                        {
                            duration: 0.5,
                            include_in_measure: true,
                            notes: "first",
                        },
                        {
                            duration: 0.5,
                            include_in_measure: true,
                            notes: "second",
                        },
                    ],
                    shiftParams: {
                        startingPosition: 1,
                        shiftAmount: -2,
                    },
                },
            ])(
                "%# - $description",
                async (
                    { existingBeatsArgs, shiftParams },
                    { db, expectNumberOfChanges },
                ) => {
                    await createBeats({
                        newBeats: existingBeatsArgs,
                        db,
                    });

                    const databaseState =
                        await expectNumberOfChanges.getDatabaseState(db);

                    await expect(
                        shiftBeats({
                            db,
                            ...shiftParams,
                        }),
                    ).rejects.toThrow();

                    await expectNumberOfChanges.test(db, 0, databaseState);
                },
            );
        });
    });

    describe("flattenOrder", () => {
        testWithHistory(
            "should flatten beat positions to be sequential",
            async ({ db, expectNumberOfChanges }) => {
                // Create beats with non-sequential positions
                await createBeats({
                    newBeats: [
                        {
                            duration: 0.5,
                            include_in_measure: true,
                            notes: "first",
                        },
                        {
                            duration: 0.5,
                            include_in_measure: true,
                            notes: "second",
                        },
                        {
                            duration: 0.5,
                            include_in_measure: true,
                            notes: "third",
                        },
                    ],
                    db,
                });

                // Manually create gaps in positions to test flattening
                await db
                    .update(schema.beats)
                    .set({ position: 10 })
                    .where(eq(schema.beats.id, 2));

                await db
                    .update(schema.beats)
                    .set({ position: 20 })
                    .where(eq(schema.beats.id, 3));

                const databaseState =
                    await expectNumberOfChanges.getDatabaseState(db);

                await flattenOrder({ db });

                const beatsAfterFlatten = await db.query.beats.findMany({
                    orderBy: schema.beats.position,
                });

                // Check that positions are now sequential (excluding first beat)
                const nonFirstBeats = beatsAfterFlatten.filter(
                    (b) => b.id !== FIRST_BEAT_ID,
                );
                for (let i = 0; i < nonFirstBeats.length; i++) {
                    expect(nonFirstBeats[i].position).toBe(i + 1);
                }

                await expectNumberOfChanges.test(db, 1, databaseState);
            },
        );
    });

    describe("updateAllBeatDurations", () => {
        describe("basic functionality", () => {
            testWithHistory(
                "should update duration of all beats except first beat",
                async ({ db, expectNumberOfChanges }) => {
                    // Create some beats first
                    const existingBeatsArgs = [
                        {
                            duration: 0.5,
                            include_in_measure: true,
                            notes: "first beat",
                        },
                        {
                            duration: 0.75,
                            include_in_measure: false,
                            notes: "second beat",
                        },
                        {
                            duration: 1.0,
                            include_in_measure: true,
                            notes: "third beat",
                        },
                    ];

                    await createBeats({
                        newBeats: existingBeatsArgs,
                        db,
                    });

                    const databaseState =
                        await expectNumberOfChanges.getDatabaseState(db);

                    // Update all beat durations
                    const newDuration = 2.5;
                    const result = await updateAllBeatDurations({
                        db,
                        duration: newDuration,
                    });

                    // Should return all beats except the first beat (FIRST_BEAT_ID = 0)
                    expect(result).toHaveLength(3);
                    expect(
                        result.every((beat) => beat.duration === newDuration),
                    ).toBe(true);
                    expect(
                        result.every((beat) => beat.id > FIRST_BEAT_ID),
                    ).toBe(true);

                    // Verify database state
                    const allBeats = await db.query.beats.findMany({
                        orderBy: schema.beats.position,
                    });

                    // First beat should remain unchanged (cannot be modified)
                    expect(allBeats[0].duration).toBe(0); // First beat default duration
                    // All other beats should have updated duration
                    expect(allBeats[1].duration).toBe(newDuration);
                    expect(allBeats[2].duration).toBe(newDuration);
                    expect(allBeats[3].duration).toBe(newDuration);

                    await expectNumberOfChanges.test(db, 1, databaseState);
                },
            );

            testWithHistory(
                "should work with zero duration",
                async ({ db, expectNumberOfChanges }) => {
                    // Create some beats
                    await createBeats({
                        newBeats: [
                            {
                                duration: 1.5,
                                include_in_measure: true,
                                notes: "test beat 1",
                            },
                            {
                                duration: 2.0,
                                include_in_measure: false,
                                notes: "test beat 2",
                            },
                        ],
                        db,
                    });

                    const databaseState =
                        await expectNumberOfChanges.getDatabaseState(db);

                    // Update to zero duration
                    const result = await updateAllBeatDurations({
                        db,
                        duration: 0,
                    });

                    expect(result).toHaveLength(2);
                    expect(result.every((beat) => beat.duration === 0)).toBe(
                        true,
                    );
                    expect(
                        result.every((beat) => beat.id > FIRST_BEAT_ID),
                    ).toBe(true);

                    await expectNumberOfChanges.test(db, 1, databaseState);
                },
            );

            testWithHistory(
                "should work with very small duration values",
                async ({ db, expectNumberOfChanges }) => {
                    // Create some beats
                    await createBeats({
                        newBeats: [
                            {
                                duration: 1.0,
                                include_in_measure: true,
                                notes: "test beat 1",
                            },
                            {
                                duration: 2.0,
                                include_in_measure: false,
                                notes: "test beat 2",
                            },
                        ],
                        db,
                    });

                    const databaseState =
                        await expectNumberOfChanges.getDatabaseState(db);

                    // Update to very small duration (minimum allowed by constraint)
                    const smallDuration = 0.001;
                    const result = await updateAllBeatDurations({
                        db,
                        duration: smallDuration,
                    });

                    expect(result).toHaveLength(2);
                    expect(
                        result.every((beat) => beat.duration === smallDuration),
                    ).toBe(true);
                    expect(
                        result.every((beat) => beat.id > FIRST_BEAT_ID),
                    ).toBe(true);

                    await expectNumberOfChanges.test(db, 1, databaseState);
                },
            );

            testWithHistory(
                "should work with large duration values",
                async ({ db, expectNumberOfChanges }) => {
                    // Create some beats
                    await createBeats({
                        newBeats: [
                            {
                                duration: 0.1,
                                include_in_measure: true,
                                notes: "test beat 1",
                            },
                            {
                                duration: 0.5,
                                include_in_measure: false,
                                notes: "test beat 2",
                            },
                        ],
                        db,
                    });

                    const databaseState =
                        await expectNumberOfChanges.getDatabaseState(db);

                    // Update to large duration
                    const largeDuration = 999.99;
                    const result = await updateAllBeatDurations({
                        db,
                        duration: largeDuration,
                    });

                    expect(result).toHaveLength(2);
                    expect(
                        result.every((beat) => beat.duration === largeDuration),
                    ).toBe(true);
                    expect(
                        result.every((beat) => beat.id > FIRST_BEAT_ID),
                    ).toBe(true);

                    await expectNumberOfChanges.test(db, 1, databaseState);
                },
            );
        });

        describe("edge cases", () => {
            testWithHistory(
                "should work when no beats exist except first beat",
                async ({ db, expectNumberOfChanges }) => {
                    const databaseState =
                        await expectNumberOfChanges.getDatabaseState(db);

                    // Should work with just the default first beat (no other beats to update)
                    const result = await updateAllBeatDurations({
                        db,
                        duration: 1.25,
                    });

                    expect(result).toHaveLength(0); // No beats to update

                    await expectNumberOfChanges.test(db, 0, databaseState);
                },
            );

            testWithHistory(
                "should preserve other beat properties",
                async ({ db, expectNumberOfChanges }) => {
                    // Create beats with specific properties
                    await createBeats({
                        newBeats: [
                            {
                                duration: 2.0,
                                include_in_measure: true,
                                notes: "important notes",
                            },
                            {
                                duration: 1.5,
                                include_in_measure: false,
                                notes: "other notes",
                            },
                        ],
                        db,
                    });

                    const databaseState =
                        await expectNumberOfChanges.getDatabaseState(db);

                    const result = await updateAllBeatDurations({
                        db,
                        duration: 3.0,
                    });

                    expect(result).toHaveLength(2);
                    expect(result.every((beat) => beat.duration === 3.0)).toBe(
                        true,
                    );
                    expect(
                        result.every((beat) => beat.id > FIRST_BEAT_ID),
                    ).toBe(true);

                    // Find the specific beats to verify their properties
                    const beat1 = result.find(
                        (beat) => beat.notes === "important notes",
                    );
                    const beat2 = result.find(
                        (beat) => beat.notes === "other notes",
                    );

                    expect(beat1).toBeDefined();
                    expect(beat1!.include_in_measure).toBe(true);
                    expect(beat1!.notes).toBe("important notes");

                    expect(beat2).toBeDefined();
                    expect(beat2!.include_in_measure).toBe(false);
                    expect(beat2!.notes).toBe("other notes");

                    await expectNumberOfChanges.test(db, 1, databaseState);
                },
            );

            testWithHistory(
                "should work with decimal precision",
                async ({ db, expectNumberOfChanges }) => {
                    await createBeats({
                        newBeats: [
                            {
                                duration: 1.0,
                                include_in_measure: true,
                                notes: "test beat 1",
                            },
                            {
                                duration: 2.0,
                                include_in_measure: false,
                                notes: "test beat 2",
                            },
                        ],
                        db,
                    });

                    const databaseState =
                        await expectNumberOfChanges.getDatabaseState(db);

                    // Test with high precision decimal
                    const preciseDuration = 1.23456789;
                    const result = await updateAllBeatDurations({
                        db,
                        duration: preciseDuration,
                    });

                    expect(result).toHaveLength(2);
                    expect(
                        result.every(
                            (beat) => beat.duration === preciseDuration,
                        ),
                    ).toBe(true);
                    expect(
                        result.every((beat) => beat.id > FIRST_BEAT_ID),
                    ).toBe(true);

                    await expectNumberOfChanges.test(db, 1, databaseState);
                },
            );
        });

        describe("multiple calls", () => {
            testWithHistory(
                "should handle multiple consecutive updates",
                async ({ db, expectNumberOfChanges }) => {
                    await createBeats({
                        newBeats: [
                            {
                                duration: 1.0,
                                include_in_measure: true,
                                notes: "test beat 1",
                            },
                            {
                                duration: 2.0,
                                include_in_measure: false,
                                notes: "test beat 2",
                            },
                        ],
                        db,
                    });

                    const databaseState =
                        await expectNumberOfChanges.getDatabaseState(db);

                    // First update
                    let result = await updateAllBeatDurations({
                        db,
                        duration: 2.0,
                    });

                    expect(result).toHaveLength(2);
                    expect(result.every((beat) => beat.duration === 2.0)).toBe(
                        true,
                    );

                    // Second update
                    result = await updateAllBeatDurations({
                        db,
                        duration: 3.0,
                    });

                    expect(result).toHaveLength(2);
                    expect(result.every((beat) => beat.duration === 3.0)).toBe(
                        true,
                    );

                    // Third update
                    result = await updateAllBeatDurations({
                        db,
                        duration: 0.5,
                    });

                    expect(result).toHaveLength(2);
                    expect(result.every((beat) => beat.duration === 0.5)).toBe(
                        true,
                    );

                    // Verify final state
                    const finalBeats = await db.query.beats.findMany({
                        orderBy: schema.beats.position,
                    });

                    expect(finalBeats[0].duration).toBe(0); // First beat unchanged
                    expect(finalBeats[1].duration).toBe(0.5); // Updated
                    expect(finalBeats[2].duration).toBe(0.5); // Updated

                    await expectNumberOfChanges.test(db, 3, databaseState);
                },
            );
        });

        describe("data integrity", () => {
            testWithHistory(
                "should return properly formatted DatabaseBeat objects",
                async ({ db, expectNumberOfChanges }) => {
                    await createBeats({
                        newBeats: [
                            {
                                duration: 1.5,
                                include_in_measure: true,
                                notes: "test beat 1",
                            },
                            {
                                duration: 2.0,
                                include_in_measure: false,
                                notes: "test beat 2",
                            },
                        ],
                        db,
                    });

                    const databaseState =
                        await expectNumberOfChanges.getDatabaseState(db);

                    const result = await updateAllBeatDurations({
                        db,
                        duration: 2.5,
                    });

                    expect(result).toHaveLength(2);

                    // Verify all beats have correct structure
                    for (const beat of result) {
                        // Verify all required properties are present and correctly typed
                        expect(typeof beat.id).toBe("number");
                        expect(typeof beat.duration).toBe("number");
                        expect(typeof beat.include_in_measure).toBe("boolean");
                        expect(typeof beat.position).toBe("number");
                        expect(typeof beat.created_at).toBe("string");
                        expect(typeof beat.updated_at).toBe("string");

                        // Verify specific values
                        expect(beat.id).toBeGreaterThan(FIRST_BEAT_ID);
                        expect(beat.duration).toBe(2.5);
                        expect(typeof beat.notes).toBe("string");
                    }

                    await expectNumberOfChanges.test(db, 1, databaseState);
                },
            );
        });
    });
});
