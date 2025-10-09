import Beat, { beatsDuration, compareBeats } from "./Beat";
import { db, schema } from "../database/db";
import {
    allDatabasePagesQueryOptions,
    beatKeys,
    measureKeys,
    pageKeys,
} from "@/hooks/queries";
import { queryClient } from "@/App";
import { useMutation } from "@tanstack/react-query";
import { conToastError } from "@/utilities/utils";
import tolgee from "../singletons/Tolgee";
import { toast } from "sonner";
import { deleteMeasuresInTransaction } from "@/db-functions/measures";
import {
    deleteBeatsInTransaction,
    deletePagesInTransaction,
    transactionWithHistory,
} from "@/db-functions";

const { measures } = schema;

interface BaseMeasure {
    /** ID of the measure in the database */
    readonly id: number;
    /** The beat this measure starts on */
    readonly startBeat: Beat;
    /** Optional rehearsal mark for the measure */
    readonly rehearsalMark: string | null;
    /** Human readable notes about the measure */
    readonly notes: string | null;
    /** The duration of the measure in seconds */
    readonly duration: number;
    /** The number of counts (or beats) in this measure */
    readonly counts: number;
    /** The beats that belong to this measure */
    readonly beats: Beat[];
    /** The timestamp of the first beat in the measure */
    readonly timestamp: number;
}
type GhostMeasure = BaseMeasure & {
    /** A ghost measure is just a marker to show that the beats/counts are not part of the real music */
    readonly isGhost: true;
    /** The measure's number in the piece */
    readonly number: null;
};
type RealMeasure = BaseMeasure & {
    /** A ghost measure is just a marker to show that the beats/counts are not part of the real music */
    readonly isGhost?: false;
    /** The measure's number in the piece */
    readonly number: number;
};
export type Measure = GhostMeasure | RealMeasure;
// Default export for backwards compatibility
export default Measure;

// Database types and interfaces
export type DatabaseMeasure = typeof measures.$inferSelect;

export type NewMeasureArgs = Omit<
    typeof measures.$inferInsert,
    "id" | "created_at" | "updated_at"
>;

export type ModifiedMeasureArgs = Partial<typeof measures.$inferInsert> & {
    id: number;
};

/** A type that stores a beat with the index that it occurs in a list with all beats */
type BeatWithIndex = Beat & { index: number };

/**
 * Converts an array of `DatabaseMeasure` and `Beat` objects into an array of `Measure` objects.
 *
 * This function takes in the complete set of measures and beats from the database, sorts the beats,
 * and then groups the beats into individual measures based on the start beat ID stored in the
 * `DatabaseMeasure` objects.
 *
 * @param args An object containing the arrays of `DatabaseMeasure` and `Beat` objects.
 * @returns A sorted array of `Measure` objects representing the measures in the piece.
 */
export const fromDatabaseMeasures = (args: {
    databaseMeasures: DatabaseMeasure[];
    allBeats: Beat[];
}): Measure[] => {
    const sortedBeats = args.allBeats.sort(compareBeats);
    let currentMeasureNumber = 1;
    const beatMap = new Map<number, BeatWithIndex>(
        sortedBeats.map((beat, i) => [beat.id, { ...beat, index: i }]),
    );
    const sortedDbMeasures = args.databaseMeasures.sort((a, b) => {
        const aBeat = beatMap.get(a.start_beat);
        const bBeat = beatMap.get(b.start_beat);
        if (!aBeat || !bBeat) {
            console.log("aBeat", a.start_beat, aBeat);
            console.log("bBeat", b.start_beat, bBeat);
            throw new Error(
                `Beat not found: ${a.start_beat} ${aBeat} - ${b.start_beat} ${bBeat}`,
            );
        }
        return aBeat.position - bBeat.position;
    });
    const createdMeasures = sortedDbMeasures.map((measure, i) => {
        const startBeat = beatMap.get(measure.start_beat);
        if (!startBeat) {
            throw new Error(`Beat not found: ${measure.start_beat}`);
        }
        const nextMeasure = sortedDbMeasures[i + 1] || null;
        const nextBeat = nextMeasure
            ? beatMap.get(nextMeasure.start_beat)
            : null;
        if (!nextBeat && nextMeasure) {
            throw new Error(`Beat not found: ${nextMeasure.start_beat}`);
        }
        const beats = nextBeat
            ? sortedBeats.slice(startBeat.index, nextBeat.index)
            : sortedBeats.slice(startBeat.index);
        const baseOutput = {
            id: measure.id,
            notes: measure.notes,
            startBeat: startBeat,
            beats,
            rehearsalMark: measure.rehearsal_mark,
            duration: beatsDuration(beats),
            counts: beats.length,
            timestamp: startBeat.timestamp,
        } satisfies BaseMeasure;
        const isGhost = measure.is_ghost === 1;
        const output: Measure = isGhost
            ? {
                  ...baseOutput,
                  isGhost,
                  number: null,
              }
            : {
                  ...baseOutput,
                  isGhost,
                  number: currentMeasureNumber++,
              };
        return output;
    });
    return createdMeasures;
};

/** Deletes all measures, beats, and pages associated with the measures */
export const _cascadeDeleteMeasures = async (measures: Measure[]) => {
    const beatIdsToDelete = new Set(
        measures.flatMap((m) => m.beats.map((b) => b.id)),
    );
    const pages = await queryClient.ensureQueryData(
        allDatabasePagesQueryOptions(),
    );
    const pageIdsToDelete = new Set(
        pages.filter((p) => beatIdsToDelete.has(p.start_beat)).map((p) => p.id),
    );

    await transactionWithHistory(db, "cascadeDeleteMeasures", async (tx) => {
        await deleteMeasuresInTransaction({
            tx,
            itemIds: new Set(measures.map((m) => m.id)),
        });
        await deletePagesInTransaction({
            tx,
            pageIds: pageIdsToDelete,
        });
        await deleteBeatsInTransaction({
            tx,
            beatIds: beatIdsToDelete,
        });
    });
};

export const useCascadeDeleteMeasures = () => {
    return useMutation({
        mutationFn: (measuresToDelete: Measure[]) =>
            _cascadeDeleteMeasures(measuresToDelete),
        onSuccess: async () => {
            toast.success(tolgee.t("tempoGroup.deletedSuccessfully"));
            await queryClient.invalidateQueries({ queryKey: beatKeys.all() });
            void queryClient.invalidateQueries({ queryKey: pageKeys.all() });
            void queryClient.invalidateQueries({ queryKey: measureKeys.all() });
        },
        onError: (error: Error, variables: Measure[]) => {
            conToastError(tolgee.t("tempoGroup.deleteFailed"));
            return;
        },
    });
};
