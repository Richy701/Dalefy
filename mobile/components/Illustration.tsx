import { useMemo } from "react";
import { SvgXml } from "react-native-svg";
import { useTheme } from "@/context/ThemeContext";
import {
  ILLUS_RIDING,
  ILLUS_SITTING,
  ILLUS_TOGETHER,
  ILLUS_MOVEMENT,
  ILLUS_WAVY,
} from "@/constants/illustrations";

export type IllustrationName = "riding" | "sitting" | "together" | "movement" | "wavy";

const DEFAULT_ACCENT = "#0bd2b5";

const MAP: Record<IllustrationName, string> = {
  riding:   ILLUS_RIDING,
  sitting:  ILLUS_SITTING,
  together: ILLUS_TOGETHER,
  movement: ILLUS_MOVEMENT,
  wavy:     ILLUS_WAVY,
};

interface Props {
  name: IllustrationName;
  width?: number;
  height?: number;
}

export function Illustration({ name, width = 240, height = 240 }: Props) {
  const { C } = useTheme();
  const xml = useMemo(() => {
    const raw = MAP[name];
    if (C.teal.toLowerCase() === DEFAULT_ACCENT) return raw;
    return raw.replaceAll(DEFAULT_ACCENT, C.teal);
  }, [name, C.teal]);

  return <SvgXml xml={xml} width={width} height={height} />;
}
