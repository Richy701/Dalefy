import Svg, { Path } from "react-native-svg";

interface LogoProps {
  size?: number;
  color?: string;
}

export function Logo({ size = 14, color = "currentColor" }: LogoProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 32 32">
      <Path
        fill={color}
        fillRule="evenodd"
        clipRule="evenodd"
        d="M5 4.5C5 3.67 5.67 3 6.5 3H15.5C22.4 3 28 8.82 28 16C28 23.18 22.4 29 15.5 29H6.5C5.67 29 5 28.33 5 27.5V4.5ZM11 9.5L22.5 16L11 22.5L13.5 16L11 9.5Z"
      />
    </Svg>
  );
}
