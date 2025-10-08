import { eq } from "drizzle-orm";
import { DbConnection, DbTransaction } from "./types";
import { schema } from "@/global/database/db";
import { transactionWithHistory } from "./history";
import { anyMeasuresExist, updateAllBeatDurations } from "@/db-functions";

export type DatabaseUtility = typeof schema.utility.$inferSelect;

/**
 * Defines the editable fields of the utility record.
 */
export interface ModifiedUtilityArgs {
    last_page_counts?: number;
    default_beat_duration?: number;
}

/**
 * Gets the utility record from the database.
 * Since there's only ever one utility record, this returns the single record or undefined.
 */
export async function getUtility({
    db,
}: {
    db: DbConnection;
}): Promise<DatabaseUtility | undefined> {
    // Initialize the utility record if it doesn't exist
    await initializeUtility({ db });

    return await db.query.utility.findFirst();
}

export async function _updateAllBeatsIfNoMeasuresExist({
    tx,
    newBeatDuration,
}: {
    tx: DbTransaction;
    newBeatDuration: number;
}) {
    const anyMeasuresExistResult = await anyMeasuresExist({
        db: tx,
    });
    if (!anyMeasuresExistResult) {
        return await updateAllBeatDurations({
            db: tx,
            duration: newBeatDuration,
        });
    }
    return;
}

/**
 * Updates the utility record in the database.
 * Since there's only ever one utility record, this updates the record with id = 0.
 */
export async function updateUtility({
    db,
    args,
}: {
    db: DbConnection;
    args: ModifiedUtilityArgs;
}): Promise<DatabaseUtility> {
    // Initialize the utility record if it doesn't exist
    await initializeUtility({ db });

    return await transactionWithHistory(
        db,
        "updateUtility",
        async (tx: DbTransaction) => {
            await tx
                .update(schema.utility)
                .set({
                    ...args,
                    updated_at: new Date().toISOString(),
                })
                .where(eq(schema.utility.id, 0));

            if (args.default_beat_duration)
                await _updateAllBeatsIfNoMeasuresExist({
                    tx,
                    newBeatDuration: args.default_beat_duration,
                });

            const updatedUtility = await tx.query.utility.findFirst();
            if (!updatedUtility) {
                throw new Error("Utility record not found after update");
            }
            return updatedUtility;
        },
    );
}

/**
 * Initializes the utility record if it doesn't exist.
 * This should be called during database setup/migration.
 */
export async function initializeUtility({
    db,
}: {
    db: DbConnection;
}): Promise<DatabaseUtility> {
    // Check if utility record already exists
    const existingUtility = await db.select().from(schema.utility).get();
    if (existingUtility) {
        return existingUtility;
    }

    // Create the utility record with default values
    const [newUtility] = await db
        .insert(schema.utility)
        .values({
            id: 0,
            last_page_counts: 8,
            default_beat_duration: 0.5, // 120 bpm
        })
        .returning();

    return newUtility;
}
