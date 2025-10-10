import {
    TempoGroup,
    getStrongBeatIndexesFromPattern,
    splitPatternString,
    useCreateFromTempoGroup,
    useCreateWithoutMeasuresTempo,
    useCreateWithoutMeasuresSeconds,
} from "@/components/music/TempoGroup/TempoGroup";
import {
    Input,
    Button,
    UnitInput,
    TooltipClassName,
    ToggleGroup,
    ToggleGroupItem,
} from "@openmarch/ui";
import { InfoIcon } from "@phosphor-icons/react";
import { Form, FormField, Label } from "@radix-ui/react-form";
import * as Tooltip from "@radix-ui/react-tooltip";
import clsx from "clsx";
import React, { useEffect, useMemo } from "react";
import { mixedMeterPermutations } from "./TempoUtils";
import { T, useTolgee } from "@tolgee/react";
import { useQuery } from "@tanstack/react-query";
import { getUtilityQueryOptions } from "@/hooks/queries";
export const maxMixedMeterBeats = 30;

interface NewTempoGroupFormProps {
    startingPosition?: number;
    setSelfHidden?: () => void;
    scrollFunc?: () => void;
}

const NewTempoGroupForm = React.forwardRef<
    HTMLDivElement,
    NewTempoGroupFormProps
>((props, ref) => {
    const { data: utilityData } = useQuery(getUtilityQueryOptions());

    const [tempo, setTempo] = React.useState(
        (60 / (utilityData?.default_beat_duration ?? 0.5)).toString(),
    );

    useEffect(() => {
        if (utilityData?.default_beat_duration) {
            setTempo((60 / utilityData.default_beat_duration).toString());
        }
    }, [utilityData]);

    const callback = React.useCallback(() => {
        setName("");
        if (props.scrollFunc) {
            props.scrollFunc();
        }
        if (props.setSelfHidden) {
            props.setSelfHidden();
        }
    }, [props]);

    const { mutate: createFromTempoGroup } = useCreateFromTempoGroup(callback);
    const { mutate: createWithoutMeasuresTempo } =
        useCreateWithoutMeasuresTempo(callback);
    const { mutate: createWithoutMeasuresSeconds } =
        useCreateWithoutMeasuresSeconds(callback);
    const subTextClass = clsx("text-text-subtitle text-sub ");

    // Main mode selection
    const [mode, setMode] = React.useState<
        "with-measures" | "without-measures"
    >("with-measures");

    // Without measures sub-mode
    const [withoutMeasuresMode, setWithoutMeasuresMode] = React.useState<
        "tempo" | "seconds"
    >("tempo");

    // With measures state (existing)
    const [isMixedMeter, setIsMixedMeter] = React.useState(false);
    const [beatsPerMeasure, setBeatsPerMeasure] = React.useState(4);
    const [selectedPattern, setSelectedPattern] = React.useState<string>("");
    const [endTempo, setEndTempo] = React.useState("");
    const [repeats, setRepeats] = React.useState("4");

    // Without measures state
    const [numberOfBeats, setNumberOfBeats] = React.useState("4");
    const [totalDurationSeconds, setTotalDurationSeconds] = React.useState("");

    // Common state
    const [name, setName] = React.useState("");
    const { t } = useTolgee();

    const isDisabled = useMemo(() => {
        if (mode === "with-measures") {
            return (
                !tempo ||
                !beatsPerMeasure ||
                !repeats.trim() ||
                (isMixedMeter && !selectedPattern) ||
                (isMixedMeter && beatsPerMeasure < 5)
            );
        } else {
            // without-measures mode
            if (withoutMeasuresMode === "tempo") {
                return !tempo || !numberOfBeats.trim();
            } else {
                // seconds mode
                return !totalDurationSeconds.trim() || !numberOfBeats.trim();
            }
        }
    }, [
        mode,
        tempo,
        beatsPerMeasure,
        repeats,
        isMixedMeter,
        selectedPattern,
        withoutMeasuresMode,
        numberOfBeats,
        totalDurationSeconds,
    ]);

    const tooManyMixedMeterBeats = useMemo(
        () => beatsPerMeasure > maxMixedMeterBeats && isMixedMeter,
        [beatsPerMeasure, isMixedMeter],
    );

    const handleBeatsChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const value = parseInt(e.target.value) || 0;
        setBeatsPerMeasure(value);
        // If mixed meter is enabled and the beats change, we might need to update available patterns
        if (isMixedMeter) {
            // Reset selected pattern when beats change
            setSelectedPattern("");
        }
    };

    const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();

        const nameToUse = name.trim();
        const startingPosition = props.startingPosition || 0;

        if (mode === "with-measures") {
            const tempoValue = parseInt(tempo) || 120;
            const endTempoValue =
                endTempo && !isMixedMeter ? parseInt(endTempo) : undefined;
            const repeatsValue = parseInt(repeats) || 4;

            let newTempoGroup: TempoGroup;
            if (isMixedMeter) {
                const strongBeatIndexes =
                    getStrongBeatIndexesFromPattern(selectedPattern);
                newTempoGroup = {
                    name: nameToUse,
                    tempo: tempoValue,
                    ...(endTempoValue && { endTempo: endTempoValue }),
                    bigBeatsPerMeasure:
                        splitPatternString(selectedPattern).length,
                    numOfRepeats: repeatsValue,
                    strongBeatIndexes,
                };
            } else {
                newTempoGroup = {
                    name: nameToUse,
                    tempo: tempoValue,
                    ...(endTempoValue && { endTempo: endTempoValue }),
                    bigBeatsPerMeasure: beatsPerMeasure,
                    numOfRepeats: repeatsValue,
                };
            }

            void createFromTempoGroup({
                tempoGroup: newTempoGroup,
                endTempo: endTempoValue,
                startingPosition,
            });
        } else {
            // without-measures mode
            const beatsValue = parseInt(numberOfBeats) || 4;

            if (withoutMeasuresMode === "tempo") {
                const tempoValue = parseInt(tempo) || 120;
                void createWithoutMeasuresTempo({
                    startingPosition,
                    totalNumberOfBeats: beatsValue,
                    tempoBpm: tempoValue,
                    name: nameToUse || undefined,
                });
            } else {
                // seconds mode
                const secondsValue = parseFloat(totalDurationSeconds) || 4;
                void createWithoutMeasuresSeconds({
                    startingPosition,
                    numberOfBeats: beatsValue,
                    name: nameToUse || undefined,
                    totalDurationSeconds: secondsValue,
                });
            }
        }
    };

    return (
        <div
            className={`bg-fg-2 border-accent rounded-tr-6 rounded-b-6 rounded-6 flex justify-between border p-16`}
        >
            <Form className="grid grid-cols-6 gap-16" onSubmit={handleSubmit}>
                {/* Name field - always visible */}
                <FormField
                    name="name"
                    className="col-span-2 flex flex-col gap-2"
                >
                    <Label className="text-sm select-all">
                        <T keyName="music.name" />
                    </Label>
                    <Input
                        id="name-input"
                        name="name"
                        placeholder={t("music.tempoGroupNamePlaceholder")}
                        type="text"
                        className="select-all"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        onBlur={(e) => {
                            setName(e.target.value.trim());
                        }}
                    />
                    <p className={subTextClass}>
                        <T keyName="music.rehearsalLetterOrIdentifier" />
                    </p>
                </FormField>

                {/* Mode selector */}
                <FormField
                    name="mode"
                    className="col-span-3 flex flex-col gap-2"
                >
                    <Label className="text-sm">
                        <T keyName="music.mode" />
                    </Label>
                    <ToggleGroup
                        type="single"
                        value={mode}
                        onValueChange={(value) => {
                            if (value)
                                setMode(
                                    value as
                                        | "with-measures"
                                        | "without-measures",
                                );
                        }}
                        className="h-[2rem] w-full"
                    >
                        <ToggleGroupItem
                            value="with-measures"
                            className="px-3 text-sm"
                        >
                            <T keyName="music.withMeasures" />
                        </ToggleGroupItem>
                        <ToggleGroupItem
                            value="without-measures"
                            className="px-3 text-sm"
                        >
                            <T keyName="music.withoutMeasures" />
                        </ToggleGroupItem>
                    </ToggleGroup>
                </FormField>

                {/* Without measures sub-mode selector */}
                {mode === "without-measures" && (
                    <FormField
                        name="withoutMeasuresMode"
                        className="col-span-3 flex flex-col gap-2"
                    >
                        <Label className="text-sm">
                            <T keyName="music.withoutMeasuresMode" />
                        </Label>
                        <ToggleGroup
                            type="single"
                            value={withoutMeasuresMode}
                            onValueChange={(value) => {
                                if (value)
                                    setWithoutMeasuresMode(
                                        value as "tempo" | "seconds",
                                    );
                            }}
                            className="h-[2rem] w-full"
                        >
                            <ToggleGroupItem
                                value="tempo"
                                className="px-3 text-sm"
                            >
                                <T keyName="music.byTempo" />
                            </ToggleGroupItem>
                            <ToggleGroupItem
                                value="seconds"
                                className="px-3 text-sm"
                            >
                                <T keyName="music.bySeconds" />
                            </ToggleGroupItem>
                        </ToggleGroup>
                    </FormField>
                )}

                {/* Tempo field - always visible */}
                <FormField
                    name="tempo"
                    className={clsx(
                        "flex flex-col gap-2",
                        mode === "without-measures"
                            ? "col-span-2"
                            : "col-span-3",
                    )}
                >
                    <Label className="text-sm">
                        {mode === "with-measures" ? (
                            <T keyName="music.startTempo" />
                        ) : withoutMeasuresMode === "tempo" ? (
                            <T keyName="music.tempo" />
                        ) : (
                            <T keyName="music.tempoOptional" />
                        )}
                    </Label>
                    <UnitInput
                        id="start-tempo-input"
                        name="tempo"
                        type="number"
                        unit="bpm"
                        min={1}
                        value={tempo}
                        onChange={(e) => setTempo(e.target.value)}
                        required={
                            mode === "with-measures" ||
                            withoutMeasuresMode === "tempo"
                        }
                        disabled={
                            mode === "without-measures" &&
                            withoutMeasuresMode === "seconds"
                        }
                    />
                </FormField>

                {/* Without measures mode specific fields */}
                {mode === "without-measures" && (
                    <>
                        {/* Number of beats */}
                        <FormField
                            name="numberOfBeats"
                            className="col-span-2 flex flex-col gap-2"
                        >
                            <Label className="text-sm">
                                <T keyName="music.numberOfBeats" />
                            </Label>
                            <Input
                                id="number-of-beats-input"
                                name="numberOfBeats"
                                type="number"
                                min={1}
                                value={numberOfBeats}
                                onChange={(e) =>
                                    setNumberOfBeats(e.target.value)
                                }
                                required
                            />
                            <p className={subTextClass}>
                                <T keyName="music.totalBeatsToCreate" />
                            </p>
                        </FormField>

                        {/* Total duration seconds (only for seconds mode) */}
                        {withoutMeasuresMode === "seconds" && (
                            <FormField
                                name="totalDurationSeconds"
                                className="col-span-2 flex flex-col gap-2"
                            >
                                <Label className="text-sm">
                                    <T keyName="music.totalDuration" />
                                </Label>
                                <UnitInput
                                    id="total-duration-input"
                                    name="totalDurationSeconds"
                                    type="number"
                                    unit="sec"
                                    min={0.1}
                                    step={0.1}
                                    value={totalDurationSeconds}
                                    onChange={(e) =>
                                        setTotalDurationSeconds(e.target.value)
                                    }
                                    required
                                />
                                <p className={subTextClass}>
                                    <T keyName="music.totalTimeForAllBeats" />
                                </p>
                            </FormField>
                        )}
                    </>
                )}

                {/* With measures mode specific fields */}
                {mode === "with-measures" && (
                    <>
                        {/* Beat pattern or end tempo */}
                        {isMixedMeter ? (
                            <FormField
                                name="beatPattern"
                                className="col-span-2 flex flex-col gap-2"
                            >
                                <Label className="text-sm">
                                    <T keyName="music.beatPattern" />
                                </Label>
                                <select
                                    className="bg-bg-1 border-stroke rounded-4 border px-8 py-4"
                                    required
                                    disabled={tooManyMixedMeterBeats}
                                    value={selectedPattern}
                                    onChange={(e) =>
                                        setSelectedPattern(e.target.value)
                                    }
                                >
                                    <option value="">
                                        <T keyName="music.selectPattern" />
                                    </option>
                                    {!tooManyMixedMeterBeats &&
                                        mixedMeterPermutations(
                                            beatsPerMeasure,
                                        ).map(
                                            (
                                                pattern: number[],
                                                index: number,
                                            ) => (
                                                <option
                                                    key={index}
                                                    value={pattern.join(",")}
                                                >
                                                    {pattern.join("+")}
                                                </option>
                                            ),
                                        )}
                                </select>
                            </FormField>
                        ) : (
                            <FormField
                                name="endTempo"
                                className="col-span-2 flex flex-col gap-2"
                            >
                                <Label className="text-sm">
                                    <T keyName="music.endTempo" />
                                    <Tooltip.Root>
                                        <Tooltip.Trigger type="button">
                                            <InfoIcon
                                                size={18}
                                                className="text-text/60"
                                            />
                                        </Tooltip.Trigger>
                                        <Tooltip.Portal>
                                            <Tooltip.Content
                                                className={TooltipClassName}
                                                side="top"
                                            >
                                                <T keyName="music.endTempoTooltip" />
                                            </Tooltip.Content>
                                        </Tooltip.Portal>
                                    </Tooltip.Root>
                                </Label>
                                <UnitInput
                                    id="end-tempo-input"
                                    name="endTempo"
                                    type="number"
                                    min={1}
                                    unit="bpm"
                                    placeholder={t("music.endTempoPlaceholder")}
                                    value={endTempo}
                                    onChange={(e) =>
                                        setEndTempo(e.target.value)
                                    }
                                />
                            </FormField>
                        )}

                        {/* Beats per measure */}
                        <FormField
                            name="beatsPerMeasure"
                            className="col-span-3 flex flex-col gap-2"
                        >
                            <Label
                                className={clsx(
                                    "text-sm",
                                    tooManyMixedMeterBeats ? "text-red" : "",
                                )}
                            >
                                <T keyName="music.beatsPerMeasure" />
                            </Label>
                            <Input
                                id="bpm-input"
                                name="beatsPerMeasure"
                                type="number"
                                min={isMixedMeter ? 5 : 1}
                                max={isMixedMeter ? 30 : undefined}
                                value={
                                    beatsPerMeasure === 0 ? "" : beatsPerMeasure
                                }
                                onChange={handleBeatsChange}
                                required
                                className={
                                    tooManyMixedMeterBeats ? "border-red" : ""
                                }
                            />
                            {tooManyMixedMeterBeats ? (
                                <p className={clsx("text-red text-sub")}>
                                    {t("music.mixedMeterTooManyBeats", {
                                        maxBeats: maxMixedMeterBeats,
                                        beatsPerMeasure,
                                    })}
                                </p>
                            ) : (
                                <p className={subTextClass}>
                                    {t("music.timeSignature", {
                                        timeSignature: `${beatsPerMeasure}/${
                                            isMixedMeter ? "8" : "4"
                                        }`,
                                    })}
                                </p>
                            )}
                        </FormField>

                        {/* Number of measures */}
                        <FormField
                            name="repeats"
                            className="col-span-3 flex flex-col gap-2"
                        >
                            <Label className="text-sm">
                                <T keyName="music.numberOfMeasures" />
                            </Label>
                            <Input
                                id="repeats-input"
                                name="repeats"
                                type="number"
                                min={1}
                                value={repeats}
                                onChange={(e) => setRepeats(e.target.value)}
                                required
                            />
                        </FormField>

                        {/* Mixed meter toggle */}
                        <div className="col-span-6 flex gap-4">
                            <Button
                                type="button"
                                variant="secondary"
                                onClick={() => setIsMixedMeter(!isMixedMeter)}
                                disabled={!isMixedMeter && beatsPerMeasure < 5}
                            >
                                {isMixedMeter ? (
                                    <T keyName="music.makeSimpleMeter" />
                                ) : (
                                    <T keyName="music.makeMixedMeter" />
                                )}
                            </Button>
                        </div>
                    </>
                )}

                {/* Action buttons */}
                <div className="col-span-6 flex gap-4">
                    <div className="flex-grow" />
                    {props.setSelfHidden && (
                        <Button
                            type="button"
                            variant="secondary"
                            onClick={props.setSelfHidden}
                        >
                            <T keyName="music.cancel" />
                        </Button>
                    )}
                    <Button type="submit" disabled={isDisabled}>
                        <T keyName="music.create" />
                    </Button>
                </div>
            </Form>
        </div>
    );
});

export default NewTempoGroupForm;
