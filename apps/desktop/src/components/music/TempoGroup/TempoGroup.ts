import Measure from "../../../global/classes/Measure";
import Beat, {
    durationToTempo,
    fromDatabaseBeat,
} from "../../../global/classes/Beat";
import type { NewMeasureArgs } from "@/global/classes/Measure";
import { toast } from "sonner";
import tolgee from "@/global/singletons/Tolgee";
import {
    createBeatsInTransaction,
    createMeasuresInTransaction,
    DatabaseBeat,
    DbConnection,
    flattenOrder,
    flattenOrderInTransaction,
    ModifiedBeatArgs,
    ModifiedMeasureArgs,
    NewBeatArgs,
    realDatabaseBeatToDatabaseBeat,
    transactionWithHistory,
    updateBeatsInTransaction,
    updateMeasuresInTransaction,
} from "@/db-functions";
import { db } from "@/global/database/db";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { measureKeys } from "@/hooks/queries/useMeasures";
import { beatKeys } from "@/hooks/queries";
import { assert, conToastError } from "@/utilities/utils";

type BaseTempoGroup = {
    /**
     * Denotes the first measure's rehearsal mark, or a default name if there is no rehearsal mark.
     *
     * These names are not unique.
     */
    name: string;
    /**
     * The starting tempo of the group in BPM.
     * This is always defined as we can always determine the initial tempo.
     */
    tempo: number;
    /**
     * If defined, the tempo changes over the course of the group.
     * The array contains the tempo for each beat in the group.
     */
    manualTempos?: number[];
    bigBeatsPerMeasure: number;
    /**
     * Index of the long beats in mixed meter groups.
     * "Long beats" are defined as the beats that are 1.5 times the duration of the short beats.
     *
     * For example, in 7/8 (2+2+3), the long beat indexes would be [2]. 7/8 (3+2+2) would be [0].
     *
     * In 10/8 (3+2+3+2), the long beat indexes would be [0, 2].
     * In 8/8 (3+3+2), the long beat indexes would be [0, 1].
     *
     * If the group is not a mixed meter, this is undefined.
     */
    strongBeatIndexes?: number[];
    type: string;
};
export type RealTempoGroup = BaseTempoGroup & {
    /**
     * The number of times the group is repeated.
     */
    numOfRepeats: number;
    /**
     * A string that describes the range of measures that the group spans.
     * This is used to identify the group in the UI.
     *
     * E.g. "m 1-4"
     */
    measureRangeString: string;
    /**
     * The measures in this group.
     */
    measures?: Measure[];
    type: "real";
};

/**
 * A tempo group made up of a single ghost measure. This is useful to create chunks of time that aren't actually in the music.
 */
export type GhostTempoGroup = BaseTempoGroup & {
    numOfRepeats: 1;
    measureRangeString: null;
    measures: [Measure];
    type: "ghost";
};

export type TempoGroup = RealTempoGroup | GhostTempoGroup;

/**
 * The values of a tempo group that are needed to create one.
 */
export type TempoGroupCreateArgs = Omit<
    TempoGroup,
    "measureRangeString" | "measures"
>;

/**
 * Array of both measures and beats only with the properties needed for tempo groups
 */
export type ExistingItems = {
    measures: Pick<Measure, "id" | "isGhost" | "startBeat">[];
    beats: Pick<Beat, "id" | "position">[];
};

const aboutEqual = (a: number, b: number, epsilon = 0.00001): boolean => {
    return Math.abs(a - b) < epsilon;
};

/**
 * Checks if all beats in a measure have the same duration.
 */
export const measureHasOneTempo = (measure: Measure) => {
    return measure.beats.every(
        (beat) => beat.duration === measure.beats[0].duration,
    );
};

const getTempoFromBeat = (beat: { duration: number }) => {
    return Math.round((60 / beat.duration) * 100) / 100;
};

/**
 * Checks if two measures have the same tempo.
 * Returns false if either measure has varying tempos within it or if either measure is empty.
 */
export const measureIsSameTempo = (measure1: Measure, measure2: Measure) => {
    if (!measure1.beats.length || !measure2.beats.length) return false;
    if (measureHasOneTempo(measure1) && measureHasOneTempo(measure2)) {
        const measure1Tempo = getTempoFromBeat(measure1.beats[0]);
        const measure2Tempo = getTempoFromBeat(measure2.beats[0]);
        return aboutEqual(measure1Tempo, measure2Tempo);
    } else if (measureIsMixedMeter(measure1) && measureIsMixedMeter(measure2)) {
        const {
            shortestDuration: measure1ShortestDuration,
            longestDuration: measure1LongestDuration,
        } = getShortestAndLongestDurations(measure1);
        const {
            shortestDuration: measure2ShortestDuration,
            longestDuration: measure2LongestDuration,
        } = getShortestAndLongestDurations(measure2);
        const measure1StrongBeatIndexes = getStrongBeatIndexes(measure1);
        const measure2StrongBeatIndexes = getStrongBeatIndexes(measure2);
        return (
            aboutEqual(measure1ShortestDuration, measure2ShortestDuration) &&
            aboutEqual(measure1LongestDuration, measure2LongestDuration) &&
            measure1StrongBeatIndexes.length ===
                measure2StrongBeatIndexes.length &&
            measure1StrongBeatIndexes.every(
                (index, i) => index === measure2StrongBeatIndexes[i],
            )
        );
    }
    return false;
};

const getShortestAndLongestDurations = (measure: Measure) => {
    const durations = new Set<number>(
        measure.beats.map((beat) => beat.duration),
    );
    return {
        shortestDuration: Math.min(...durations),
        longestDuration: Math.max(...durations),
    };
};

/**
 * Checks if a measure is a mixed meter.
 * A measure is considered mixed meter if it has two different beat durations that are in the ratio of 3:2.
 * This is a very common time signature for brass and percussion sections.
 */
export const measureIsMixedMeter = (measure: Measure) => {
    const durations = new Set<number>(
        measure.beats.map((beat) => beat.duration),
    );

    let output = false;
    if (durations.size === 2) {
        const { shortestDuration, longestDuration } =
            getShortestAndLongestDurations(measure);
        const ratio = longestDuration / shortestDuration;
        output = aboutEqual(ratio, 1.5);
    }

    return output;
};

const measureRangeString = (startMeasure: Measure, endMeasure?: Measure) => {
    if (!endMeasure || startMeasure.number === endMeasure.number) {
        return `m ${startMeasure.number}`;
    }
    return `m ${startMeasure.number}-${endMeasure.number}`;
};

/**
 * Gets the indexes of long beats in a mixed meter measure.
 * Long beats are defined as beats that are 1.5 times the duration of short beats.
 * Returns an empty array if the measure is not a valid mixed meter.
 */
export const getStrongBeatIndexes = (measure: Measure): number[] => {
    const durations = new Set<number>(
        measure.beats.map((beat) => beat.duration),
    );
    if (durations.size !== 2) {
        console.error("Measure is not a mixed meter", measure);
        return [];
    }
    const strongBeatDuration = Math.max(...durations);

    const strongBeatIndexes: number[] = [];
    for (let i = 0; i < measure.beats.length; i++) {
        if (measure.beats[i].duration === strongBeatDuration)
            strongBeatIndexes.push(i);
    }
    return strongBeatIndexes;
};

const getMeasureTempo = (measure: Measure) => {
    let output: number;
    if (measure.beats.length === 0) {
        throw new Error("Measure has no beats");
    }

    // When mixed meter always return the tempo of the shortest beat. Otherwise, return the tempo of the first beat.
    if (measureIsMixedMeter(measure)) {
        const { shortestDuration } = getShortestAndLongestDurations(measure);
        return durationToTempo(shortestDuration);
    } else {
        output = durationToTempo(measure.beats[0].duration);
    }
    return output;
};

/**
 * Creates a tempo group from a set of measures
 */
const _createTempoGroupFromMeasures = (
    measures: Measure[],
    tempo: number,
    beatsPerMeasure: number,
    numOfRepeats: number,
): TempoGroup => {
    const hasGhost = measures.some((m) => m.isGhost);
    const name = measures[0].rehearsalMark || "";

    if (hasGhost) {
        assert(
            measures.length === 1,
            `Ghost measure should have exactly one measure. Actual length: ${measures.length}`,
        );
        return {
            type: "ghost",
            name,
            tempo,
            bigBeatsPerMeasure: beatsPerMeasure,
            numOfRepeats: 1,
            measureRangeString: null,
            strongBeatIndexes: undefined,
            measures: [measures[0]],
        };
    }

    return {
        type: "real",
        name,
        tempo,
        bigBeatsPerMeasure: beatsPerMeasure,
        numOfRepeats,
        measureRangeString: measureRangeString(
            measures[0],
            measures[measures.length - 1],
        ),
        strongBeatIndexes: measureIsMixedMeter(measures[0])
            ? getStrongBeatIndexes(measures[0])
            : undefined,
        measures,
    };
};

export const TempoGroupsFromMeasures = (measures: Measure[]): TempoGroup[] => {
    if (!measures.length) return [];

    const groups: TempoGroup[] = [];
    let currentGroup: Measure[] = [measures[0]];

    const initialTempo = getMeasureTempo(measures[0]);
    let currentTempo = initialTempo;
    let currentBeatsPerMeasure = measures[0].beats.length;
    let currentNumberOfRepeats = 1;

    for (let i = 1; i < measures.length; i++) {
        const measure = measures[i];
        const measureBeats = measure.beats.length;
        const measureTempo = getMeasureTempo(measure);

        // Create a new group if:
        // 0. The measure is a ghost measure
        // 1. The previous measure was a ghost measure
        // 2. The measure has a rehearsal mark
        // 3. The number of beats changes (time signature change)
        // 4. The tempo changes or varies within the measure

        /**
         * Keep track of whether the previous measure was a ghost measures.
         * This is because a ghost measure should always be its own group.
         */
        const groupHasGhost = currentGroup.some((measure) => measure.isGhost);
        // Add the current group to groups
        if (
            measure.isGhost ||
            groupHasGhost ||
            measure.rehearsalMark ||
            measureBeats !== currentBeatsPerMeasure ||
            !measureIsSameTempo(measure, measures[i - 1])
        ) {
            groups.push(
                _createTempoGroupFromMeasures(
                    currentGroup,
                    currentTempo,
                    currentBeatsPerMeasure,
                    currentNumberOfRepeats,
                ),
            );

            if (
                !measureHasOneTempo(measures[i - 1]) &&
                !measureIsMixedMeter(measures[i - 1])
            )
                groups[groups.length - 1].manualTempos =
                    measures[i - 1].beats.map(getTempoFromBeat);

            // Start a new group
            currentGroup = [measure];
            currentTempo = measureTempo;
            currentBeatsPerMeasure = measureBeats;
            currentNumberOfRepeats = 1;
        } else {
            currentGroup.push(measure);
            currentNumberOfRepeats++;
        }
    }

    // Add the last group
    if (currentGroup.length > 0) {
        groups.push(
            _createTempoGroupFromMeasures(
                currentGroup,
                currentTempo,
                currentBeatsPerMeasure,
                currentNumberOfRepeats,
            ),
        );

        if (
            !measureHasOneTempo(measures[measures.length - 1]) &&
            !measureIsMixedMeter(measures[measures.length - 1])
        )
            groups[groups.length - 1].manualTempos =
                measures[measures.length - 1].beats.map(getTempoFromBeat);
    }

    return groups;
};

export const splitPatternString = (pattern: string): number[] => {
    return pattern.split(",").map(Number);
};

export const getStrongBeatIndexesFromPattern = (pattern: string): number[] => {
    const patternList = splitPatternString(pattern);
    return patternList
        .map((val, index) => (val === 3 ? index : undefined))
        .filter((index): index is number => index !== undefined)
        .sort((a, b) => a - b);
};

const _processConstantTempo = ({
    tempo,
    numRepeats,
    bigBeatsPerMeasure,
    strongBeatIndexes,
    shouldUpdate,
    beatsAtAndAfterStartingPosition,
}: {
    tempo: number;
    numRepeats: number;
    bigBeatsPerMeasure: number;
    strongBeatIndexes?: number[];
    shouldUpdate: boolean;
    beatsAtAndAfterStartingPosition: Pick<Beat, "id" | "position">[];
}): {
    newBeats: NewBeatArgs[];
    modifiedBeats: ModifiedBeatArgs[];
    beatIndex: number;
} => {
    const newBeats: NewBeatArgs[] = [];
    const modifiedBeats: ModifiedBeatArgs[] = [];
    let beatIndex = 0;

    const duration = 60 / tempo;
    const strongBeatDuration = duration * 1.5;
    for (let i = 0; i < numRepeats; i++) {
        for (let j = 0; j < bigBeatsPerMeasure; j++) {
            const beatDuration = strongBeatIndexes?.includes(j)
                ? strongBeatDuration
                : duration;
            if (
                shouldUpdate &&
                beatIndex < beatsAtAndAfterStartingPosition.length
            ) {
                modifiedBeats.push({
                    id: beatsAtAndAfterStartingPosition[beatIndex].id,
                    duration: beatDuration,
                    include_in_measure: true,
                });
                beatIndex++;
            } else {
                newBeats.push({
                    duration: beatDuration,
                    include_in_measure: true,
                });
            }
        }
    }
    return { newBeats, modifiedBeats, beatIndex };
};

const _processChangingTempo = ({
    tempo,
    endTempo,
    numRepeats,
    bigBeatsPerMeasure,
    shouldUpdate,
    beatsAtAndAfterStartingPosition,
}: {
    tempo: number;
    endTempo: number;
    numRepeats: number;
    bigBeatsPerMeasure: number;
    shouldUpdate: boolean;
    beatsAtAndAfterStartingPosition: Pick<Beat, "id" | "position">[];
}): {
    newBeats: NewBeatArgs[];
    modifiedBeats: ModifiedBeatArgs[];
    beatIndex: number;
} => {
    const newBeats: NewBeatArgs[] = [];
    const modifiedBeats: ModifiedBeatArgs[] = [];
    let beatIndex = 0;

    let currentTempo = tempo;
    const tempoDelta = (endTempo - tempo) / (bigBeatsPerMeasure * numRepeats);
    for (let i = 0; i < numRepeats; i++) {
        for (let j = 0; j < bigBeatsPerMeasure; j++) {
            if (
                shouldUpdate &&
                beatIndex < beatsAtAndAfterStartingPosition.length
            ) {
                modifiedBeats.push({
                    id: beatsAtAndAfterStartingPosition[beatIndex].id,
                    duration: 60 / currentTempo,
                    include_in_measure: true,
                });
                beatIndex++;
            } else {
                newBeats.push({
                    duration: 60 / currentTempo,
                    include_in_measure: true,
                });
            }
            currentTempo += tempoDelta;
        }
    }
    return { newBeats, modifiedBeats, beatIndex };
};

/**
 * Creates new beats and/or updates existing beats with duration based on the tempo.
 *
 * If the end tempo is provided and is different from the start tempo,
 * the beats will have a duration that changes linearly from the start tempo to right before.
 *
 * This is to match how tempo changes in music occur.
 * E.g. 4 beats for 120 -> 80:
 * [120, 110, 100, 90]
 * This sets up the next beat to be 80.
 *
 * It will also create a +1 beat at the end to attach a ghost measure.
 * This will be at the endTempo if provided, otherwise it will be at the startTempo.
 *
 * @param existingItems - Optional. If provided, will update existing beats and create new ones as needed.
 *                        If not provided or empty, will only create new beats.
 */
export const _newAndUpdatedBeatsFromTempoGroup = (args: {
    tempo: number;
    numRepeats: number;
    bigBeatsPerMeasure: number;
    strongBeatIndexes?: number[];
    endTempo?: number;
    startingPosition?: number;
    fromCreate: boolean;
    existingItems?: {
        beats: Pick<Beat, "id" | "position">[];
    };
    shouldUpdate: boolean;
}): { newBeats: NewBeatArgs[]; modifiedBeats: ModifiedBeatArgs[] } => {
    const {
        tempo,
        numRepeats,
        bigBeatsPerMeasure,
        strongBeatIndexes,
        endTempo,
        fromCreate,
        existingItems = { beats: [] },
        shouldUpdate,
    } = args;
    // If the starting position is undefined, use the last beat position
    const startingPosition = args.startingPosition ?? 1;
    const beatsAtAndAfterStartingPosition = existingItems.beats
        .filter((b) => b.position >= startingPosition)
        .sort((a, b) => a.position - b.position);

    const { newBeats, modifiedBeats, beatIndex } =
        !endTempo || endTempo === tempo
            ? _processConstantTempo({
                  tempo,
                  numRepeats,
                  bigBeatsPerMeasure,
                  strongBeatIndexes,
                  shouldUpdate,
                  beatsAtAndAfterStartingPosition,
              })
            : _processChangingTempo({
                  tempo,
                  endTempo,
                  numRepeats,
                  bigBeatsPerMeasure,
                  shouldUpdate,
                  beatsAtAndAfterStartingPosition,
              });

    // If this is a new tempo group, include a last beat
    if (fromCreate && beatIndex >= beatsAtAndAfterStartingPosition.length)
        newBeats.push({
            duration: 60 / (endTempo ?? tempo),
            include_in_measure: true,
        });
    return { newBeats, modifiedBeats };
};

/**
 * Converts database beats to Beat objects with calculated timestamps
 *
 * @param databaseBeats - The database beats to convert
 * @returns An array of Beat objects with calculated timestamps
 */
const convertDatabaseBeatsToBeats = (databaseBeats: DatabaseBeat[]): Beat[] => {
    let timeStamp = 0;
    return databaseBeats.map((dbBeat: DatabaseBeat, i: number) => {
        const newBeat = fromDatabaseBeat(dbBeat, i, timeStamp);
        timeStamp += dbBeat.duration;
        return newBeat;
    });
};

/**
 * Generates new measure argument objects from a sequence of created beats.
 *
 * This function is used after creating beats for a new tempo group. It generates the arguments
 * needed to add new measures to the database, including a ghost measure at the end.
 *
 * @param createdBeats - An array of Beat objects, from which the measures will be defined.
 * @param numOfRepeats - The number of non-ghost measures to create (excluding the ghost).
 * @param bigBeatsPerMeasure - The number of beats in each measure.
 * @param rehearsalMark - (Optional) The rehearsal mark to assign to the first measure.
 * @returns An object consisting of:
 *   - newMeasureArgs: Array of NewMeasureArgs for new measures, including a ghost measure at the end.
 *   - modifiedMeasureArgs: Array of ModifiedMeasureArgs (always empty from this function).
 */
export const getNewMeasuresFromCreatedBeats = ({
    createdBeats,
    numOfRepeats,
    bigBeatsPerMeasure,
    rehearsalMark,
    existingItems,
}: {
    createdBeats: Beat[];
    numOfRepeats: number;
    bigBeatsPerMeasure: number;
    rehearsalMark?: string;
    existingItems: ExistingItems;
}): {
    newMeasureArgs: NewMeasureArgs[];
    modifiedMeasureArgs: ModifiedMeasureArgs[];
} => {
    const newMeasures: NewMeasureArgs[] = [];
    const modifiedMeasures: ModifiedMeasureArgs[] = [];

    const lastMeasurePosition = Math.max(
        ...existingItems.measures.map((m) => m.startBeat.position),
    );
    if (rehearsalMark?.trim() === "") rehearsalMark = undefined;

    // If the last existing measure is a ghost, update it to a real measure
    // This is because ghost measures at the end are placeholders to show the end of the defined tempo.
    // So, we want to overwrite them rather than appending after them
    let startingIndex = 0;
    const lastMeasureIsGhost = _lastMeasureIsGhost({ existingItems });
    const lastMeasure = _getLastMeasure({ existingItems });
    if (
        lastMeasureIsGhost &&
        lastMeasure &&
        lastMeasurePosition === createdBeats[0].position
    ) {
        modifiedMeasures.push({
            id: lastMeasure.id,
            is_ghost: 0,
        });
        startingIndex += 1;
    }
    const newBeatPositions: number[] = [];
    for (let i = startingIndex; i < numOfRepeats; i++) {
        const beatObj = createdBeats[i * bigBeatsPerMeasure];
        newMeasures.push({
            start_beat: beatObj.id,
            rehearsal_mark: i === 0 ? rehearsalMark : undefined,
        });
        newBeatPositions.push(beatObj.position);
    }

    // Create a new ghost measure if there are no measures after
    const maxNewPosition = Math.max(...newBeatPositions);
    if (maxNewPosition > lastMeasurePosition) {
        newMeasures.push({
            start_beat: createdBeats[createdBeats.length - 1].id,

            is_ghost: 1,
        });
    }
    return {
        newMeasureArgs: newMeasures,
        modifiedMeasureArgs: modifiedMeasures,
    };
};

/**
 * Generic custom hook for tempo group mutations
 * Handles common success/error patterns and query invalidation
 */
const useTempoGroupMutation = <TArgs>(
    mutationFn: (args: TArgs) => Promise<void>,
    errorKey: string,
    successKey?: string,
    callback?: () => void,
) => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn,
        onSuccess: async () => {
            if (successKey) toast.success(tolgee.t(successKey));
        },
        onSettled: () => {
            // Invalidate all relevant queries
            // BEATS MUST BE INVALIDATED FIRST - if not, the measures will be incorrect
            void queryClient
                .invalidateQueries({
                    queryKey: beatKeys.all(),
                })
                .then(() => {
                    void queryClient.invalidateQueries({
                        queryKey: measureKeys.all(),
                    });
                });
            if (callback) callback();
        },
        onError: (error) => {
            conToastError(tolgee.t(errorKey), error);
        },
    });
};

export const useCreateFromTempoGroup = (callback?: () => void) => {
    return useTempoGroupMutation(
        _createFromTempoGroup,
        "tempoGroup.createNewBeatsError",
        "music.tempoGroupCreated",
        callback,
    );
};

export const _shouldUpdate = ({
    startingPosition,
    existingItems,
}: {
    startingPosition?: number;
    existingItems?: ExistingItems;
}) => {
    let shouldUpdate = false;
    if (existingItems && existingItems.beats) {
        // Either use the provided starting position, or if it is undefined use the last one
        const startingPositionToUse =
            startingPosition != null
                ? startingPosition
                : Math.max(...existingItems.beats.map((b) => b.position));
        const measureAtStartBeat = existingItems.measures.find(
            (m) => m.startBeat.position === startingPositionToUse,
        );
        if (measureAtStartBeat && measureAtStartBeat.isGhost) {
            const currentMeasurePosition =
                measureAtStartBeat.startBeat.position;
            const isLastMeasure = !existingItems.measures.some(
                (m) => m.startBeat.position > currentMeasurePosition,
            );
            // Only trigger edit if the ghost measure is the last measure
            shouldUpdate = isLastMeasure;
        } else if (!measureAtStartBeat) {
            const measureExistsAfterStartingPosition =
                existingItems.measures.some(
                    (m) => m.startBeat.position > startingPositionToUse,
                );
            // Only trigger update if measures do not exist after starting position
            shouldUpdate = !measureExistsAfterStartingPosition;
        }
    }
    return shouldUpdate;
};

export const _lastMeasureIsGhost = ({
    existingItems,
}: {
    existingItems: ExistingItems;
}) => {
    const lastMeasure = _getLastMeasure({ existingItems });
    return lastMeasure?.isGhost ?? false;
};
export const _getLastMeasure = ({
    existingItems,
}: {
    existingItems: ExistingItems;
}) => {
    if (existingItems.measures.length === 0) {
        return undefined;
    }

    const lastMeasure = existingItems.measures.reduce(
        (lastMeasure, currentMeasure, index) => {
            if (
                currentMeasure.startBeat.position >
                lastMeasure.startBeat.position
            ) {
                return currentMeasure;
            } else if (
                currentMeasure.startBeat.position ===
                lastMeasure.startBeat.position
            ) {
                // When positions are equal, prefer the one that appears later in the array
                return currentMeasure;
            } else {
                return lastMeasure;
            }
        },
        existingItems.measures[0],
    );
    return lastMeasure;
};

/**
 * Shared logic for creating and updating beats in a transaction.
 * Returns the Beat objects that were created or updated.
 *
 * @param tx - The transaction object
 * @param beatsToCreate - Array of new beats to create
 * @param beatsToModify - Array of existing beats to modify
 * @param startingPosition - The starting position for new beats
 * @returns Array of Beat objects that were created or updated
 */
const _createAndUpdateBeatsInTransaction = async (
    tx: Parameters<Parameters<typeof transactionWithHistory>[2]>[0],
    {
        beatsToCreate,
        beatsToModify,
        startingPosition,
    }: {
        beatsToCreate: NewBeatArgs[];
        beatsToModify: ModifiedBeatArgs[];
        startingPosition: number;
    },
): Promise<Beat[]> => {
    const updateBeatsResponse =
        beatsToModify.length > 0
            ? await updateBeatsInTransaction({
                  tx,
                  modifiedBeats: beatsToModify,
              })
            : [];

    const nextPosition =
        updateBeatsResponse.length > 0
            ? Math.max(...updateBeatsResponse.map((b) => b.position))
            : startingPosition;

    const createBeatsResponse =
        beatsToCreate.length > 0
            ? await createBeatsInTransaction({
                  tx,
                  newBeats: beatsToCreate,
                  startingPosition: nextPosition,
              })
            : [];

    const beatIds = [
        ...updateBeatsResponse.map((b) => b.id),
        ...createBeatsResponse.map((b) => b.id),
    ];

    const beatsCreatedOrUpdated = (
        await tx.query.beats.findMany({
            where: (table, { inArray }) => inArray(table.id, beatIds),
            orderBy: (table) => table.position,
        })
    ).map(realDatabaseBeatToDatabaseBeat);

    return convertDatabaseBeatsToBeats(beatsCreatedOrUpdated);
};

const _executeCreateTempoGroupTransaction = async (
    tx: Parameters<Parameters<typeof transactionWithHistory>[2]>[0],
    {
        beatsToCreate,
        beatsToModify,
        startingPosition,
        tempoGroup,
        existingItems,
    }: {
        beatsToCreate: NewBeatArgs[];
        beatsToModify: ModifiedBeatArgs[];
        startingPosition: number;
        tempoGroup: TempoGroupCreateArgs;

        existingItems: ExistingItems;
    },
) => {
    const beatsToUse = await _createAndUpdateBeatsInTransaction(tx, {
        beatsToCreate,
        beatsToModify,
        startingPosition,
    });

    const { newMeasureArgs, modifiedMeasureArgs } =
        getNewMeasuresFromCreatedBeats({
            createdBeats: beatsToUse,
            numOfRepeats: tempoGroup.numOfRepeats,
            bigBeatsPerMeasure: tempoGroup.bigBeatsPerMeasure,
            rehearsalMark: tempoGroup.name,
            existingItems,
        });

    await updateMeasuresInTransaction({
        tx,
        modifiedItems: modifiedMeasureArgs,
    });

    await createMeasuresInTransaction({
        tx,
        newItems: newMeasureArgs,
    });
    await flattenOrderInTransaction({ tx });
};

/**
 * Creates new beats and measures in the database from a tempo group
 *
 * If the starting position is undefined, it will be put at the end.
 */
export const _createFromTempoGroup = async ({
    tempoGroup,
    endTempo,
    startingPosition,
    existingItems,
    dbParam,
}: {
    tempoGroup: TempoGroupCreateArgs;
    endTempo?: number;
    startingPosition?: number;
    existingItems: ExistingItems;
    dbParam?: DbConnection;
}) => {
    // if (startingPosition === 0) {
    //     console.warn(
    //         "startingPosition is 0, cannot update first beat. Setting to 1",
    //     );
    //     startingPosition = 1;
    // }

    const shouldUpdate = _shouldUpdate({ startingPosition, existingItems });

    const { newBeats: beatsToCreate, modifiedBeats } =
        _newAndUpdatedBeatsFromTempoGroup({
            tempo: tempoGroup.tempo,
            numRepeats: tempoGroup.numOfRepeats,
            bigBeatsPerMeasure: tempoGroup.bigBeatsPerMeasure,
            endTempo,
            strongBeatIndexes: tempoGroup.strongBeatIndexes,
            startingPosition,
            fromCreate: true,
            shouldUpdate,
            existingItems,
        });

    await transactionWithHistory(
        dbParam ?? db,
        "createFromTempoGroup",
        async (tx) =>
            _executeCreateTempoGroupTransaction(tx, {
                beatsToCreate,
                beatsToModify: modifiedBeats,
                startingPosition: startingPosition!,
                tempoGroup,
                existingItems,
            }),
    );
};

/**
 * Generates the TempoGroupCreateArgs for a tempo group not associated with actual measures,
 * based on either total duration (seconds) or fixed tempo (BPM).
 *
 * This is used for 'ghost' groups such as count-ins or time notated between sections.
 *
 * There are two variants for the configuration object:
 *
 * - BySecondsArgs:
 *     - numberOfBeats: The number of beats to create. The duration is determined by `numberOfBeats / totalDurationSeconds`.
 *     - name: (Optional) The name for this group.
 *     - totalDurationSeconds: The total duration for all beats, in seconds.
 *
 * - ByTempoArgs:
 *     - numberOfBeats: The number of beats to create with the provided tempo.
 *     - name: (Optional) The name for this group.
 *     - tempoBpm: The tempo in beats per minute.
 *
 * @param args - The configuration object (either BySecondsArgs or ByTempoArgs).
 * @returns TempoGroupCreateArgs for creation of a ghost tempo group.
 */
export const tempoGroupForNoMeasures = (
    args:
        | {
              numberOfBeats: number;
              name?: string;
              totalDurationSeconds: number;
          }
        | {
              numberOfBeats: number;
              name?: string;
              tempoBpm: number;
          },
): TempoGroupCreateArgs => {
    // Calculate tempo based on which parameter was provided
    const tempo =
        "totalDurationSeconds" in args
            ? (args.numberOfBeats / args.totalDurationSeconds) * 60
            : args.tempoBpm;

    return {
        name: args.name ?? "",
        tempo,
        numOfRepeats: 1,
        bigBeatsPerMeasure: args.numberOfBeats,
        type: "ghost",
    };
};

export const useUpdateTempoGroup = () => {
    return useTempoGroupMutation(
        _updateTempoGroup,
        "tempoGroup.errorUpdatingTempoGroup",
        "music.tempoGroupUpdated",
    );
};

export const _updateTempoGroup = async ({
    tempoGroup,
    newTempo,
    newName,
    newStrongBeatIndexes,
}: {
    tempoGroup: TempoGroup;
    newTempo: number;
    newName: string;
    newStrongBeatIndexes?: number[];
}) => {
    if (!tempoGroup.measures || !tempoGroup.measures.length) {
        throw new Error("Tempo group has no measures");
    }

    const oldBeats = tempoGroup.measures.flatMap((measure) => measure.beats);
    const startingPosition = tempoGroup.measures[0].startBeat.position;

    const { newBeats, modifiedBeats } = _newAndUpdatedBeatsFromTempoGroup({
        tempo: newTempo,
        numRepeats: tempoGroup.numOfRepeats,
        bigBeatsPerMeasure: tempoGroup.bigBeatsPerMeasure,
        strongBeatIndexes: newStrongBeatIndexes,
        startingPosition,
        fromCreate: false,
        existingItems: {
            beats: oldBeats,
        },
        shouldUpdate: true,
    });

    if (newBeats.length > 0) {
        throw new Error(
            "Tempo group update should not create new beats. This should not happen. Please reach out to us!",
        );
    }

    await transactionWithHistory(db, "updateTempoGroup", async (tx) => {
        await updateBeatsInTransaction({
            tx,
            modifiedBeats,
        });

        if (
            tempoGroup.measures &&
            newName !== tempoGroup.measures[0].rehearsalMark
        ) {
            await updateMeasuresInTransaction({
                tx,
                modifiedItems: [
                    {
                        id: tempoGroup.measures![0].id,
                        rehearsal_mark: newName.trim() === "" ? null : newName,
                    },
                ],
            });
        }
    });
};

export const useUpdateManualTempos = () => {
    return useTempoGroupMutation(
        _updateManualTempos,
        "tempoGroup.differentBeatsError",
        "music.tempoGroupUpdated",
    );
};

export const _updateManualTempos = async ({
    tempoGroup,
    newManualTempos,
}: {
    tempoGroup: TempoGroup;
    newManualTempos: number[];
}) => {
    const oldBeats = tempoGroup.measures?.flatMap((measure) => measure.beats);
    if (!oldBeats || oldBeats.length !== newManualTempos.length) {
        throw new Error(
            "Tempo group has different number of beats. This should not happen.",
        );
    }

    const updatedBeats: ModifiedBeatArgs[] = [];
    for (let i = 0; i < oldBeats.length; i++) {
        updatedBeats.push({
            id: oldBeats[i].id,
            duration: 60 / newManualTempos[i],
        });
    }

    transactionWithHistory(db, "updateManualTempos", async (tx) => {
        await updateBeatsInTransaction({
            tx,
            modifiedBeats: updatedBeats,
        });
    });
};

/**
 * Gets the last beat of a tempo group.
 *
 * @param tempoGroup - The tempo group to get the last beat of.
 * @returns The last beat of the tempo group.
 */
export const getLastBeatOfTempoGroup = (
    tempoGroup: TempoGroup,
): Beat | undefined => {
    if (!tempoGroup.measures || !tempoGroup.measures.length) {
        return undefined;
    }
    return tempoGroup.measures[tempoGroup.measures.length - 1].beats[
        tempoGroup.measures[tempoGroup.measures.length - 1].beats.length - 1
    ];
};

export const isMixedMeterTempoGroup = (tempoGroup: TempoGroup) => {
    return (
        tempoGroup.strongBeatIndexes && tempoGroup.strongBeatIndexes.length > 0
    );
};

/**
 * Gets the real big beats per measure of a tempo group.
 * This is the number of beats per measure that is used to calculate the beats per measure.
 *
 * For mixed meter tempo groups, this is the number of strong beats plus the number of big beats per measure times 2.
 * For non-mixed meter tempo groups, this is the number of big beats per measure.
 *
 * @param tempoGroup - The tempo group to get the real big beats per measure of.
 * @returns The real big beats per measure of the tempo group.
 */
export const getRealBigBeatsPerMeasure = (tempoGroup: TempoGroup) => {
    return isMixedMeterTempoGroup(tempoGroup)
        ? (tempoGroup.strongBeatIndexes?.length ?? 0) +
              tempoGroup.bigBeatsPerMeasure * 2
        : tempoGroup.bigBeatsPerMeasure;
};

export const patternStringToLongBeatIndexes = (pattern: string) => {
    const splitString = pattern.includes("+") ? "+" : ",";
    return pattern
        .split(splitString)
        .map((val, index) => (val === "3" ? index : undefined))
        .filter((index): index is number => index !== undefined)
        .sort((a, b) => a - b);
};
