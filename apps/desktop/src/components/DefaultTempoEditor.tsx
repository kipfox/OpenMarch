import React, { useEffect, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { UnitInput } from "@openmarch/ui";
import { T, useTolgee } from "@tolgee/react";
import FormField, { StaticFormField } from "@/components/ui/FormField";
import {
    getUtilityQueryOptions,
    updateUtilityMutationOptions,
} from "@/hooks/queries/useUtility";
import { queryClient } from "@/App";

/**
 * Component for editing the default tempo (beat duration) setting.
 * The default beat duration is stored in the utility table and represents
 * the duration in seconds between beats (0.5 = 120 BPM).
 */
export const DefaultTempoEditor: React.FC = () => {
    const [localValue, setLocalValue] = useState<string>("");
    const { t } = useTolgee();

    // Query for the current utility settings
    const {
        data: utility,
        isLoading,
        error,
    } = useQuery(getUtilityQueryOptions());

    // Mutation for updating utility settings
    const updateUtilityMutation = useMutation(updateUtilityMutationOptions());

    // Convert beat duration to BPM for display
    const beatDurationToBPM = (duration: number): number => {
        return Math.round(60 / duration);
    };

    // Convert BPM to beat duration
    const bpmToBeatDuration = (bpm: number): number => {
        return 60 / bpm;
    };

    // Update local value when utility data loads
    useEffect(() => {
        if (utility?.default_beat_duration) {
            const bpm = beatDurationToBPM(utility.default_beat_duration);
            setLocalValue(bpm.toString());
        }
    }, [utility]);

    const handleValueChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        setLocalValue(event.target.value);
    };

    const handleBlur = async () => {
        const bpm = parseFloat(localValue);

        // Validate input
        if (isNaN(bpm) || bpm <= 0 || bpm > 300) {
            // Reset to current value if invalid
            if (utility?.default_beat_duration) {
                const currentBPM = beatDurationToBPM(
                    utility.default_beat_duration,
                );
                setLocalValue(currentBPM.toString());
            }
            return;
        }

        const newBeatDuration = bpmToBeatDuration(bpm);

        // Only update if the value has actually changed
        if (
            utility &&
            Math.abs(utility.default_beat_duration - newBeatDuration) > 0.001
        ) {
            try {
                await updateUtilityMutation.mutateAsync({
                    default_beat_duration: newBeatDuration,
                });

                // Invalidate related queries to refresh data
                await queryClient.invalidateQueries({
                    queryKey: getUtilityQueryOptions().queryKey,
                });
            } catch (error) {
                console.error("Failed to update default tempo:", error);
                // Reset to current value on error
                if (utility?.default_beat_duration) {
                    const currentBPM = beatDurationToBPM(
                        utility.default_beat_duration,
                    );
                    setLocalValue(currentBPM.toString());
                }
            }
        }
    };

    const handleKeyPress = (event: React.KeyboardEvent<HTMLInputElement>) => {
        if (event.key === "Enter") {
            event.currentTarget.blur();
        }
    };

    if (isLoading) {
        return (
            <StaticFormField
                label={t("music.defaultTempo")}
                tooltip={t("music.defaultTempoTooltip")}
            >
                <div className="bg-fg-2 h-8 w-24 animate-pulse rounded" />
            </StaticFormField>
        );
    }

    if (error) {
        return (
            <StaticFormField
                label={t("music.defaultTempo")}
                tooltip={t("music.defaultTempoTooltip")}
            >
                <span className="text-error">
                    <T keyName="general.errorLoading" />
                </span>
            </StaticFormField>
        );
    }

    return (
        <StaticFormField
            label={t("music.defaultTempo")}
            tooltip={t("music.defaultTempoTooltip")}
        >
            <UnitInput
                type="number"
                value={localValue}
                onChange={handleValueChange}
                onBlur={handleBlur}
                onKeyUp={handleKeyPress}
                unit="BPM"
                min={30}
                max={300}
                step={1}
                className="w-[8rem]"
                disabled={updateUtilityMutation.isPending}
            />
        </StaticFormField>
    );
};

export default DefaultTempoEditor;
