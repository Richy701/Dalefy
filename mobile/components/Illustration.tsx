import { SvgXml } from "react-native-svg";
import {
  ILLUS_RIDING,
  ILLUS_SITTING,
  ILLUS_TOGETHER,
  ILLUS_MOVEMENT,
  ILLUS_WAVY,
} from "@/constants/illustrations";

export type IllustrationName = "riding" | "sitting" | "together" | "movement" | "wavy";

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
  return <SvgXml xml={MAP[name]} width={width} height={height} />;
}
