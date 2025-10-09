import { count, eq, inArray } from "drizzle-orm";
import {
    DbConnection,
    DbTransaction,
    transactionWithHistory,
} from "@/db-functions";
import { schema, SqliteBoolean } from "@/global/database/db";

/** How a measure is represented in the database */
export type DatabaseMeasure = typeof schema.measures.$inferSelect;

export interface NewMeasureArgs {
    start_beat: number;
    rehearsal_mark?: string | null;
    notes?: string | null;
    is_ghost?: SqliteBoolean;
}

export interface ModifiedMeasureArgs {
    id: number;
    start_beat?: number;
    rehearsal_mark?: string | null;
    notes?: string | null;
    is_ghost?: SqliteBoolean;
}

/**
 * Gets all measures from the database.
 */
export async function getMeasures({
    db,
}: {
    db: DbConnection;
}): Promise<DatabaseMeasure[]> {
    const result = await db.query.measures.findMany();
    return result;
}

/**
 * Gets a single measure by ID.
 */
export async function getMeasureById({
    db,
    id,
}: {
    db: DbConnection;
    id: number;
}): Promise<DatabaseMeasure | undefined> {
    const result = await db.query.measures.findFirst({
        where: eq(schema.measures.id, id),
    });
    return result ? result : undefined;
}

/**
 * Gets measures by start beat.
 */
export async function getMeasuresByStartBeat({
    db,
    startBeat,
}: {
    db: DbConnection;
    startBeat: number;
}): Promise<DatabaseMeasure[]> {
    const result = await db.query.measures.findMany({
        where: eq(schema.measures.start_beat, startBeat),
    });
    return result;
}

/**
 * Creates new measures in the database.
 */
export async function createMeasures({
    newItems,
    db,
}: {
    newItems: NewMeasureArgs[];
    db: DbConnection;
}): Promise<DatabaseMeasure[]> {
    if (newItems.length === 0) {
        console.log("No new measures to create");
        return [];
    }

    const transactionResult = await transactionWithHistory(
        db,
        "createMeasures",
        async (tx) => {
            return await createMeasuresInTransaction({
                newItems,
                tx,
            });
        },
    );
    return transactionResult;
}

export const createMeasuresInTransaction = async ({
    newItems,
    tx,
}: {
    newItems: NewMeasureArgs[];
    tx: DbTransaction;
}): Promise<DatabaseMeasure[]> => {
    const createdItems = await tx
        .insert(schema.measures)
        .values(newItems)
        .returning();

    return createdItems;
};

/**
 * Updates existing measures in the database.
 */
export async function updateMeasures({
    db,
    modifiedItems,
}: {
    db: DbConnection;
    modifiedItems: ModifiedMeasureArgs[];
}): Promise<DatabaseMeasure[]> {
    const transactionResult = await transactionWithHistory(
        db,
        "updateMeasures",
        async (tx) => {
            const result = await updateMeasuresInTransaction({
                modifiedItems,
                tx,
            });
            return result;
        },
    );
    return transactionResult;
}

export const updateMeasuresInTransaction = async ({
    modifiedItems,
    tx,
}: {
    modifiedItems: ModifiedMeasureArgs[];
    tx: DbTransaction;
}): Promise<DatabaseMeasure[]> => {
    const updatedItems: DatabaseMeasure[] = [];

    for (const modifiedItem of modifiedItems) {
        const { id, ...updateData } = modifiedItem;
        const updatedItem = await tx
            .update(schema.measures)
            .set(updateData)
            .where(eq(schema.measures.id, id))
            .returning();
        updatedItems.push(updatedItem[0]);
    }

    return updatedItems;
};

/**
 * Deletes measures from the database.
 */
export async function deleteMeasures({
    itemIds,
    db,
}: {
    itemIds: Set<number>;
    db: DbConnection;
}): Promise<DatabaseMeasure[]> {
    if (itemIds.size === 0) return [];

    const response = await transactionWithHistory(
        db,
        "deleteMeasures",
        async (tx) => {
            return await deleteMeasuresInTransaction({
                itemIds,
                tx,
            });
        },
    );
    return response;
}

export const deleteMeasuresInTransaction = async ({
    itemIds,
    tx,
}: {
    itemIds: Set<number>;
    tx: DbTransaction;
}): Promise<DatabaseMeasure[]> => {
    const deletedItems = await tx
        .delete(schema.measures)
        .where(inArray(schema.measures.id, Array.from(itemIds)))
        .returning();

    return deletedItems;
};

export const anyMeasuresExist = async ({
    db,
}: {
    db: DbConnection | DbTransaction;
}): Promise<boolean> => {
    const result = await db
        .select({ count: count() })
        .from(schema.measures)
        .get();
    return !!result && result.count > 0;
};
